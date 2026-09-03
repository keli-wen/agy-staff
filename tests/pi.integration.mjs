// Opt-in integration test: real installed Pi, no model/provider credentials.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { ROOT } from '../scripts/generate-pi-skills.mjs';
import { sandbox, FAKE_AGY, jobIdOf } from './helpers.mjs';
import { exec, pack } from './pi-pack-helpers.mjs';

function installedPi() {
  if (process.env.AGY_PI_PACKAGE_ROOT) return path.resolve(process.env.AGY_PI_PACKAGE_ROOT);
  for (const dir of (process.env.PATH || '').split(path.delimiter)) {
    const binary = path.join(dir, 'pi');
    if (!fs.existsSync(binary)) continue;
    let candidate = path.dirname(fs.realpathSync(binary));
    while (candidate !== path.dirname(candidate)) {
      const manifest = path.join(candidate, 'package.json');
      if (fs.existsSync(manifest) && JSON.parse(fs.readFileSync(manifest, 'utf8')).name?.endsWith('/pi-coding-agent')) return candidate;
      candidate = path.dirname(candidate);
    }
  }
  throw new Error('Install Pi or set AGY_PI_PACKAGE_ROOT to its npm package directory.');
}

test('Pi: isolated local install, real discovery/expansion, collision coexistence, and packaged Bash jobs', async t => {
  const sb = sandbox('pi-harness');
  t.after(() => fs.rmSync(sb.root, { recursive: true, force: true }));
  const piRoot = installedPi();
  const manifest = JSON.parse(fs.readFileSync(path.join(piRoot, 'package.json'), 'utf8'));
  t.diagnostic(`Installed Pi: ${manifest.version}`);
  const agentDir = path.join(sb.root, 'pi-config');
  const env = { ...process.env, PI_CODING_AGENT_DIR: agentDir, PI_OFFLINE: '1', PI_TELEMETRY: '0' };
  // Set Pi's documented config override before importing its modules, which
  // cache some configuration at module load. Never read normal user auth.
  const saved = Object.fromEntries(['PI_CODING_AGENT_DIR', 'PI_OFFLINE', 'PI_TELEMETRY'].map(key => [key, process.env[key]]));
  Object.assign(process.env, { PI_CODING_AGENT_DIR: agentDir, PI_OFFLINE: '1', PI_TELEMETRY: '0' });
  t.after(() => { for (const [key, value] of Object.entries(saved)) value === undefined ? delete process.env[key] : process.env[key] = value; });
  const cli = path.join(piRoot, typeof manifest.bin === 'string' ? manifest.bin : manifest.bin.pi);
  exec(process.execPath, [cli, 'install', ROOT], { cwd: sb.repo, env });
  const installed = JSON.parse(fs.readFileSync(path.join(agentDir, 'settings.json'), 'utf8'));
  const isCheckout = entry => fs.realpathSync(path.resolve(agentDir, typeof entry === 'string' ? entry : entry.source)) === fs.realpathSync(ROOT);
  assert.ok(installed.packages.some(isCheckout), `local install must register the checkout path: ${JSON.stringify(installed.packages)}`);
  const { DefaultResourceLoader } = await import(pathToFileURL(path.join(piRoot, 'dist/core/resource-loader.js')));
  const { AgentSession } = await import(pathToFileURL(path.join(piRoot, 'dist/core/agent-session.js')));
  const { createBashTool } = await import(pathToFileURL(path.join(piRoot, 'dist/core/tools/bash.js')));
  const { dir: packed } = pack(sb.root);
  const unrelated = path.join(sb.root, 'unrelated');
  fs.mkdirSync(path.join(unrelated, 'reviewer'), { recursive: true });
  fs.writeFileSync(path.join(unrelated, 'reviewer', 'SKILL.md'), '---\nname: reviewer\ndescription: An unrelated review workflow.\n---\nNot agy.\n');
  const expected = ['agy-ask', 'agy-implementer', 'agy-jobs', 'agy-researcher', 'agy-reviewer', 'agy-staffer'];
  for (const packageDir of [ROOT, packed]) {
    // This is Pi's -e local-package route. Disable ambient resource discovery
    // so global/shared skills cannot influence this test.
    const loader = new DefaultResourceLoader({
      cwd: sb.repo, agentDir, additionalExtensionPaths: [packageDir], additionalSkillPaths: [unrelated],
      noExtensions: true, noSkills: true, noPromptTemplates: true, noThemes: true, noContextFiles: true,
    });
    await loader.reload();
    assert.deepEqual(loader.getExtensions().errors, []);
    const { skills, diagnostics } = loader.getSkills();
    assert.deepEqual(diagnostics, []);
    assert.deepEqual(skills.map(skill => skill.name).sort(), [...expected, 'reviewer'].sort());
    for (const name of expected) {
      const skill = skills.find(item => item.name === name);
      assert.ok(skill.filePath.startsWith(packageDir + path.sep));
      // Pi currently has no public standalone expansion export; exercise the
      // actual session method without constructing a provider-backed session.
      const expanded = AgentSession.prototype._expandSkillCommand.call({ resourceLoader: loader }, `/skill:${name} explicit task`);
      assert.ok(expanded.startsWith(`<skill name="${name}"`));
      assert.ok(expanded.includes(`References are relative to ${skill.baseDir}.`));
      assert.ok(expanded.endsWith('explicit task'));
    }
    assert.equal(AgentSession.prototype._expandSkillCommand.call({ resourceLoader: loader }, '/skill:reviewer test').includes('Not agy.'), true);
  }
  const bash = createBashTool(sb.repo, {
    spawnHook: context => ({ ...context, env: { ...context.env, AGY_BIN: FAKE_AGY, FAKE_AGY_RESPONSE: 'Pi integration OK', FAKE_AGY_SLEEP_MS: '1000' } }),
  });
  const quote = value => `'${value.replaceAll("'", "'\\''")}'`;
  const command = `${quote(process.execPath)} ${quote(path.join(packed, 'companion/agy-companion.mjs'))}`;
  const output = result => result.content.filter(item => item.type === 'text').map(item => item.text).join('\n');
  const ask = await bash.execute('ask', { command: `${command} ask --prompt 'reply with OK'`, timeout: 60 });
  assert.match(output(ask), /Pi integration OK/);
  const start = await bash.execute('start', { command: `FAKE_AGY_SLEEP_MS=4000 ${command} staffer --prompt 'read-only slow test'`, timeout: 60 });
  const id = jobIdOf(output(start));
  const second = await bash.execute('second', { command: `FAKE_AGY_SLEEP_MS=300 ${command} staffer --prompt 'read-only fast test'`, timeout: 60 });
  const secondId = jobIdOf(output(second));
  await assert.rejects(bash.execute('brief', { command: `${command} wait ${quote(id)} --timeout 1ms`, timeout: 60 }), /code 2/);
  const fast = await bash.execute('collect-fast', { command: `${command} wait ${quote(secondId)} --timeout 5s`, timeout: 60 });
  assert.match(output(fast), /Pi integration OK/);
  // Deliver the second result before collecting the first; avoid asserting
  // wall-clock ordering, which varies with the host's shell startup time.
  const done = await bash.execute('collect', { command: `${command} wait ${quote(id)} --timeout 5s`, timeout: 60 });
  assert.match(output(done), /Pi integration OK/);
  exec(process.execPath, [cli, 'remove', ROOT], { cwd: sb.repo, env });
  assert.equal(JSON.parse(fs.readFileSync(path.join(agentDir, 'settings.json'), 'utf8')).packages?.some(isCheckout) ?? false, false);
});
