import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { generateSkills, skillFiles, ROOT, COMPATIBILITY_CONTEXT } from '../scripts/generate-pi-skills.mjs';
import { sandbox, FAKE_AGY, jobIdOf } from './helpers.mjs';
import { pack } from './pi-pack-helpers.mjs';

const names = ['ask', 'implementer', 'jobs', 'lead', 'researcher', 'reviewer', 'staffer'];

test('OpenCode output preserves canonical policy, rewrites invocations, and resolves every resource', () => {
  assert.deepEqual(generateSkills({ target: 'opencode', check: true }).changed, []);
  assert.deepEqual(fs.readdirSync(path.join(ROOT, 'opencode-skills')).sort(), names.map(name => `agy-${name}`));
  for (const name of names) {
    const skillDir = path.join(ROOT, 'opencode-skills', `agy-${name}`);
    const canonical = fs.readFileSync(path.join(ROOT, 'skills', name, 'SKILL.md'), 'utf8');
    const generated = fs.readFileSync(path.join(skillDir, 'SKILL.md'), 'utf8');
    assert.match(generated, new RegExp(`^name: agy-${name}$`, 'm'));
    assert.doesNotMatch(generated, /^(?:allowed-tools|argument-hint|user-invocable):/m);
    assert.doesNotMatch(generated, /\/agy:|\$agy:|\/skill:agy-/);
    let body = canonical.replace(/^---\n[\s\S]*?\n---\n/, '');
    for (const peer of names) {
      body = body.replaceAll(`/agy:${peer}`, `/agy-${peer}`).replaceAll(`$agy:${peer}`, `/agy-${peer}`)
        .replaceAll(`../${peer}/`, `../agy-${peer}/`)
        .replaceAll(`<plugin-root>/skills/${peer}/`, `<plugin-root>/opencode-skills/agy-${peer}/`);
    }
    assert.equal(generated.replace(/^---\n[\s\S]*?\n---\n\n<!-- Generated[^\n]+-->\n/, ''), body + '\n' + COMPATIBILITY_CONTEXT);
    for (const match of generated.matchAll(/`((?:\.\.\/|references\/)[^`]*\.md)`/g)) {
      assert.ok(fs.existsSync(path.resolve(skillDir, match[1])), `${name}: ${match[1]}`);
    }
    assert.ok(fs.existsSync(path.resolve(skillDir, '../../companion/agy-companion.mjs')));
  }
});

test('OpenCode generation copies assets, detects drift and never overwrites in check mode', t => {
  const sb = sandbox('opencode-generation');
  t.after(() => fs.rmSync(sb.root, { recursive: true, force: true }));
  fs.cpSync(path.join(ROOT, 'skills'), path.join(sb.root, 'skills'), { recursive: true });
  const asset = Buffer.from([0, 128, 255]);
  fs.writeFileSync(path.join(sb.root, 'skills/ask/asset.bin'), asset);
  const options = { root: sb.root, target: 'opencode' };
  generateSkills(options);
  assert.deepEqual(generateSkills(options).changed, []);
  assert.deepEqual(fs.readFileSync(path.join(sb.root, 'opencode-skills/agy-ask/asset.bin')), asset);
  const output = path.join(sb.root, 'opencode-skills/agy-ask/SKILL.md');
  fs.appendFileSync(output, '\nhand edit\n');
  assert.throws(() => generateSkills({ ...options, check: true }), /Stale OpenCode skills/);
  assert.match(fs.readFileSync(output, 'utf8'), /hand edit/);
});

test('packed OpenCode plugin registers only bundled branded skills idempotently and runs jobs from another cwd', async t => {
  const sb = sandbox('opencode-pack');
  t.after(() => fs.rmSync(sb.root, { recursive: true, force: true }));
  const { metadata, dir } = pack(sb.root);
  const packed = new Set(metadata.files.map(file => file.path));
  for (const file of skillFiles(ROOT, 'opencode').keys()) assert.ok(packed.has(file.split(path.sep).join('/')), file);
  for (const file of ['opencode.mjs', 'templates/harness-compatibility.md', 'companion/agy-companion.mjs', 'docs/INSTALL_FOR_AGENTS.md']) assert.ok(packed.has(file), file);
  const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
  assert.equal(manifest.main, './opencode.mjs');
  assert.equal(manifest.exports, './opencode.mjs');
  // Pacote invokes npm to prepare Git dependencies when any of these hooks
  // exist, even with ignoreScripts. OpenCode's compiled runtime cannot run
  // that nested npm; checked packing and prepublishOnly keep release checks.
  for (const hook of ['prepack', 'prepare', 'preinstall', 'install', 'postinstall', 'build']) {
    assert.equal(manifest.scripts[hook], undefined, `${hook} breaks native Git installation`);
  }
  const output = path.join(dir, 'opencode-skills/agy-ask/SKILL.md');
  const original = fs.readFileSync(output);
  fs.appendFileSync(output, '\nstale generated content\n');
  const stalePack = spawnSync('npm', ['run', 'pack:checked'], {
    cwd: dir, encoding: 'utf8', timeout: 60_000, shell: process.platform === 'win32',
    env: { ...process.env, npm_config_cache: path.join(sb.root, 'npm-cache'), npm_config_update_notifier: 'false' },
  });
  assert.equal(stalePack.status, 1, stalePack.stderr);
  assert.match(stalePack.stderr, /Stale OpenCode skills/);
  assert.equal(fs.readdirSync(dir).some(file => file.endsWith('.tgz')), false, 'drift must fail before creating an archive');
  fs.writeFileSync(output, original);

  const plugin = await import(pathToFileURL(path.join(dir, manifest.main)));
  assert.deepEqual(Object.keys(plugin), ['AgyStaffPlugin']);
  const hooks = await plugin.AgyStaffPlugin({});
  const config = { skills: { paths: ['/existing/skills'], urls: ['https://example.invalid/skills'] }, permission: { skill: { '*': 'ask' } } };
  await hooks.config(config);
  await hooks.config(config);
  assert.deepEqual(config, { skills: { paths: ['/existing/skills', path.join(dir, 'opencode-skills')], urls: ['https://example.invalid/skills'] }, permission: { skill: { '*': 'ask' } } });
  const empty = {};
  await hooks.config(empty);
  assert.deepEqual(empty, { skills: { paths: [path.join(dir, 'opencode-skills')] } });
  const invoke = (skill, args, sleep = '150') => {
    const skillDir = path.join(empty.skills.paths[0], `agy-${skill}`);
    const command = /node "<skill-dir>\/([^"\n]+)"/.exec(fs.readFileSync(path.join(skillDir, 'SKILL.md'), 'utf8'));
    assert.ok(command, `companion command missing from ${skill}`);
    const result = spawnSync(process.execPath, [path.resolve(skillDir, command[1]), ...args], {
      cwd: sb.repo, encoding: 'utf8', timeout: 60_000,
      env: { ...process.env, HOME: sb.home, USERPROFILE: sb.home, AGY_BIN: FAKE_AGY, FAKE_AGY_RESPONSE: 'OpenCode package OK', FAKE_AGY_SLEEP_MS: sleep },
    });
    if (result.error) throw result.error;
    return result;
  };
  const ask = invoke('ask', ['ask', '--prompt', 'reply with OK']);
  assert.equal(ask.status, 0, ask.stderr);
  assert.match(ask.stdout, /OpenCode package OK/);
  const start = invoke('staffer', ['staffer', '--prompt', 'read-only test'], '1200');
  assert.equal(start.status, 0, start.stderr);
  const id = jobIdOf(start.stdout);
  const pending = invoke('jobs', ['wait', id, '--timeout', '1ms']);
  assert.equal(pending.status, 2, pending.stderr);
  const done = invoke('jobs', ['wait', id, '--timeout', process.platform === 'win32' ? '20s' : '5s']);
  assert.equal(done.status, 0, done.stderr);
  assert.match(done.stdout, /OpenCode package OK/);
});
