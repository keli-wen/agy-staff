// Opt-in real OpenCode V1 package/skill/command discovery. No model calls.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { sandbox } from './helpers.mjs';
import { exec, pack } from './pi-pack-helpers.mjs';

const names = ['agy-ask', 'agy-implementer', 'agy-jobs', 'agy-lead', 'agy-researcher', 'agy-reviewer', 'agy-staffer'];

test('OpenCode V1: native package install registers seven skills and same-named commands', { timeout: 180_000 }, async t => {
  const binary = process.env.AGY_OPENCODE_BIN || 'opencode';
  const sb = sandbox('opencode-host');
  t.after(() => fs.rmSync(sb.root, { recursive: true, force: true }));
  const env = {
    ...process.env, HOME: sb.home, USERPROFILE: sb.home, OPENCODE_TEST_HOME: sb.home,
    XDG_CONFIG_HOME: path.join(sb.root, 'config'), XDG_CACHE_HOME: path.join(sb.root, 'cache'),
    XDG_DATA_HOME: path.join(sb.root, 'data'), XDG_STATE_HOME: path.join(sb.root, 'state'),
    OPENCODE_DISABLE_DEFAULT_PLUGINS: '1', OPENCODE_DISABLE_EXTERNAL_SKILLS: '1',
    OPENCODE_DISABLE_MODELS_FETCH: '1', OPENCODE_DISABLE_AUTOUPDATE: '1',
  };
  // Do not inherit host config, auth, server credentials, or inline overrides.
  for (const key of Object.keys(env)) {
    if (/^(OPENCODE_CONFIG|OPENCODE_AUTH|OPENCODE_SERVER_|OPENCODE_EXPERIMENTAL|OPENCODE_CLIENT|AGY_.*TOKEN)/.test(key)) delete env[key];
    if (/(?:API_KEY|AUTH_TOKEN|ACCESS_TOKEN)$/.test(key)) delete env[key];
  }
  const version = exec(binary, ['--version'], { cwd: sb.repo, env }).trim();
  assert.equal(version, '1.18.34', 'This integration contract is pinned; set AGY_OPENCODE_BIN to OpenCode 1.18.34.');
  t.diagnostic(`OpenCode ${version}`);
  const unrelated = path.join(sb.repo, '.opencode/skills/reviewer');
  fs.mkdirSync(unrelated, { recursive: true });
  fs.writeFileSync(path.join(unrelated, 'SKILL.md'), '---\nname: reviewer\ndescription: An unrelated review workflow.\n---\nNot agy.\n');
  const { metadata, dir: fixture } = pack(sb.root);
  const spec = `agy-staff@file:${path.join(sb.root, metadata.filename)}`;
  exec(binary, ['plugin', spec, '--global'], { cwd: sb.repo, env, timeout: 120_000 });
  // Exercise the separate Git preparation path too. A prepack/prepare hook
  // makes pacote spawn npm inside OpenCode's compiled runtime and breaks
  // Git installs even when the same package works as a tarball.
  exec('git', ['init', '-q'], { cwd: fixture, env });
  exec('git', ['add', '.'], { cwd: fixture, env });
  exec('git', ['-c', 'user.name=AGY Test', '-c', 'user.email=agy-test@example.invalid', '-c', 'commit.gpgsign=false', 'commit', '-qm', 'Packed fixture'], { cwd: fixture, env });
  const revision = exec('git', ['rev-parse', 'HEAD'], { cwd: fixture, env }).trim();
  const gitSpec = `agy-staff@git+${pathToFileURL(fixture).href}#${revision}`;
  exec(binary, ['plugin', gitSpec, '--global', '--force'], { cwd: sb.repo, env, timeout: 120_000 });
  const configured = JSON.parse(exec(binary, ['debug', 'config'], { cwd: sb.repo, env, timeout: 120_000 }));
  assert.ok(configured.plugin.some(entry => (Array.isArray(entry) ? entry[0] : entry) === gitSpec), 'Git install must replace the tarball entry');
  const discovered = JSON.parse(exec(binary, ['debug', 'skill'], { cwd: sb.repo, env, timeout: 120_000 }));
  // OpenCode also ships its own built-in skills.
  const skills = discovered.filter(skill => skill.name.startsWith('agy-'));
  assert.deepEqual(skills.map(skill => skill.name).sort(), names);
  assert.ok(discovered.some(skill => skill.name === 'reviewer'), 'unrelated reviewer skill survives');
  for (const skill of skills) {
    assert.ok(skill.location.includes('opencode-skills'), skill.location);
    assert.ok(fs.existsSync(path.resolve(path.dirname(skill.location), '../../companion/agy-companion.mjs')));
  }
  // Native skill -> slash-command mapping is exposed by the real server.
  const server = spawn(binary, ['serve', '--hostname', '127.0.0.1', '--port', '0'], { cwd: sb.repo, env, stdio: ['ignore', 'pipe', 'pipe'] });
  let logs = '';
  t.after(async () => {
    if (server.exitCode !== null) return;
    await new Promise(resolve => { server.once('exit', resolve); server.kill(); });
  });
  const url = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`OpenCode server startup timed out: ${logs}`)), 60_000);
    const collect = chunk => {
      logs += chunk.toString();
      const match = /https?:\/\/127\.0\.0\.1:\d+/.exec(logs);
      if (match) { clearTimeout(timer); resolve(match[0]); }
    };
    server.stdout.on('data', collect);
    server.stderr.on('data', collect);
    server.once('error', error => { clearTimeout(timer); reject(error); });
    server.once('exit', code => { clearTimeout(timer); reject(new Error(`OpenCode server exited ${code}: ${logs}`)); });
  });
  const response = await fetch(`${url}/command`, { signal: AbortSignal.timeout(60_000) });
  assert.equal(response.status, 200);
  const commands = await response.json();
  assert.deepEqual(commands.filter(command => command.name.startsWith('agy-')).map(command => command.name).sort(), names);
  assert.ok(commands.some(command => command.name === 'reviewer' && command.source === 'skill'), 'unrelated reviewer command survives');
  for (const name of names) {
    const command = commands.find(item => item.name === name);
    assert.equal(command.source, 'skill');
    assert.match(command.template, /<skill-dir>|companion/);
  }
});
