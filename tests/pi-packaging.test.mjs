import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { generatePiSkills, piFiles, ROOT, COMPATIBILITY_CONTEXT } from '../scripts/generate-pi-skills.mjs';
import { sandbox, FAKE_AGY, jobIdOf } from './helpers.mjs';
import { pack } from './pi-pack-helpers.mjs';

const json = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const names = ['ask', 'implementer', 'jobs', 'researcher', 'reviewer', 'staffer'];

test('Pi adapters are current; canonical names and all relative resources remain valid', () => {
  assert.deepEqual(generatePiSkills({ check: true }).changed, []);
  for (const name of names) {
    const canonical = fs.readFileSync(path.join(ROOT, 'skills', name, 'SKILL.md'), 'utf8');
    const generated = fs.readFileSync(path.join(ROOT, 'pi-skills', `agy-${name}`, 'SKILL.md'), 'utf8');
    assert.match(canonical, new RegExp(`^name: ${name}$`, 'm'));
    assert.match(generated, new RegExp(`^name: agy-${name}$`, 'm'));
    assert.doesNotMatch(generated, /^(?:allowed-tools|argument-hint|user-invocable):/m);
    assert.doesNotMatch(generated, /\/agy:|\$agy:/);
    const skillDir = path.join(ROOT, 'pi-skills', `agy-${name}`);
    for (const match of generated.matchAll(/`((?:\.\.\/|references\/)[^`]*\.md)`/g)) {
      assert.ok(fs.existsSync(path.resolve(skillDir, match[1])), `${name}: broken reference ${match[1]}`);
    }
    assert.ok(fs.existsSync(path.resolve(skillDir, '../../companion/agy-companion.mjs')));
  }
});

test('generation is deterministic, copies assets, detects drift and rejects stale/symlink output', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agy-pi-generator-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.cpSync(path.join(ROOT, 'skills'), path.join(root, 'skills'), { recursive: true });
  const asset = path.join(root, 'skills', 'ask', 'asset.bin');
  fs.writeFileSync(asset, Buffer.from([0, 128, 255]));
  generatePiSkills({ root });
  assert.deepEqual(generatePiSkills({ root }).changed, []);
  assert.deepEqual(fs.readFileSync(path.join(root, 'pi-skills', 'agy-ask', 'asset.bin')), fs.readFileSync(asset));
  const source = path.join(root, 'skills', 'ask', 'SKILL.md');
  fs.appendFileSync(source, '\nNew canonical guidance.\n');
  assert.throws(() => generatePiSkills({ root, check: true }), /Stale Pi skills/);
  assert.deepEqual(generatePiSkills({ root }).changed, [path.join('pi-skills', 'agy-ask', 'SKILL.md')]);
  const unexpected = path.join(root, 'pi-skills', 'obsolete.md');
  fs.writeFileSync(unexpected, 'user edit');
  assert.throws(() => generatePiSkills({ root }), /Unexpected generated files/);
  assert.equal(fs.readFileSync(unexpected, 'utf8'), 'user edit');
  fs.unlinkSync(unexpected);
  fs.symlinkSync(source, unexpected);
  assert.throws(() => generatePiSkills({ root }), /symlinks/);
});

test('Pi manifest exposes only branded skills and stays aligned with plugin versions', () => {
  const manifest = json(path.join(ROOT, 'package.json'));
  assert.deepEqual(manifest.pi, { skills: ['./pi-skills'] });
  for (const host of ['.claude-plugin', '.codex-plugin']) {
    const plugin = json(path.join(ROOT, host, 'plugin.json'));
    assert.equal(plugin.name, 'agy');
    assert.equal(manifest.version, plugin.version);
  }
});

test('generation preserves canonical prose and adds only shared compatibility context', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agy-pi-policy-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.cpSync(path.join(ROOT, 'skills'), path.join(root, 'skills'), { recursive: true });
  const before = new Map(names.map(name => [name, fs.readFileSync(path.join(root, 'skills', name, 'SKILL.md'))]));
  generatePiSkills({ root });
  for (const [name, original] of before) {
    assert.deepEqual(fs.readFileSync(path.join(root, 'skills', name, 'SKILL.md')), original);
    const rendered = fs.readFileSync(path.join(root, 'pi-skills', `agy-${name}`, 'SKILL.md'), 'utf8');
    let body = original.toString().replace(/^---\n[\s\S]*?\n---\n/, '');
    for (const peer of names) {
      body = body.replaceAll(`/agy:${peer}`, `/skill:agy-${peer}`)
        .replaceAll(`$agy:${peer}`, `/skill:agy-${peer}`)
        .replaceAll(`../${peer}/`, `../agy-${peer}/`)
        .replaceAll(`<plugin-root>/skills/${peer}/`, `<plugin-root>/pi-skills/agy-${peer}/`);
    }
    const renderedBody = rendered.replace(/^---\n[\s\S]*?\n---\n\n<!-- Generated[^\n]+-->\n/, '');
    assert.equal(renderedBody, body + '\n' + COMPATIBILITY_CONTEXT);
    assert.equal(rendered.split(COMPATIBILITY_CONTEXT).length, 2, 'append context exactly once');
  }
  const setup = fs.readFileSync(path.join(root, 'pi-skills', 'agy-jobs', 'references', 'setup.md'), 'utf8');
  assert.equal(setup, fs.readFileSync(path.join(root, 'skills', 'jobs', 'references', 'setup.md'), 'utf8'));
  const source = path.join(root, 'skills', 'staffer', 'SKILL.md');
  const newBody = fs.readFileSync(source, 'utf8').replace('## Collecting the result', '## Entirely revised workflow') + '\nUse FutureTool to do a new operation; ask for permission first.\n';
  fs.writeFileSync(source, newBody);
  assert.throws(() => generatePiSkills({ root, check: true }), /Stale Pi skills/);
  generatePiSkills({ root });
  const updated = fs.readFileSync(path.join(root, 'pi-skills', 'agy-staffer', 'SKILL.md'), 'utf8');
  assert.match(updated, /## Entirely revised workflow/);
  assert.match(updated, /Use FutureTool to do a new operation; ask for permission first\./);
  assert.ok(updated.endsWith(COMPATIBILITY_CONTEXT));
});

test('new personas need no mapping table and prefix-related names do not corrupt invocation rewrites', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agy-pi-new-persona-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  for (const name of ['ask', 'ask-more']) {
    const dir = path.join(root, 'skills', name);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'SKILL.md'), `---\nname: ${name}\ndescription: Test /agy:ask-more and $agy:ask.\n---\nRead ../ask/SKILL.md; run node companion.mjs ask --prompt hello.\n`);
  }
  generatePiSkills({ root });
  const more = fs.readFileSync(path.join(root, 'pi-skills', 'agy-ask-more', 'SKILL.md'), 'utf8');
  assert.match(more, /name: agy-ask-more/);
  assert.match(more, /Test \/skill:agy-ask-more and \/skill:agy-ask\./);
  assert.match(more, /\.\.\/agy-ask\/SKILL.md/);
  assert.match(more, /companion.mjs ask --prompt hello/);
});

test('actual npm archive contains resources and runs ask + detached job collection outside checkout', async t => {
  const sb = sandbox('pi-pack');
  t.after(() => fs.rmSync(sb.root, { recursive: true, force: true }));
  const { metadata, dir } = pack(sb.root);
  const packed = new Set(metadata.files.map(file => file.path));
  for (const file of piFiles().keys()) assert.ok(packed.has(file), `not packed: ${file}`);
  for (const file of ['companion/agy-companion.mjs', 'templates/ask.md', 'templates/staffer.md', 'adapters/harness-compatibility.md', 'docs/PI.md', 'LICENSE']) {
    assert.ok(packed.has(file), `not packed: ${file}`);
  }
  assert.equal([...packed].some(file => /^(tests|assets|\.agy-staff|\.github)\//.test(file)), false);
  // Read the same command template the host sees, resolve from the installed
  // skill directory, then execute that installed companion from another cwd.
  function invoke(skill, args, extraEnv = {}) {
    const skillDir = path.join(dir, 'pi-skills', `agy-${skill}`);
    const text = fs.readFileSync(path.join(skillDir, 'SKILL.md'), 'utf8');
    const match = /node "<skill-dir>\/([^"\n]+)"/.exec(text);
    assert.ok(match, `missing companion command in ${skill}`);
    const result = spawnSync(process.execPath, [path.resolve(skillDir, match[1]), ...args], {
      cwd: sb.repo, encoding: 'utf8', timeout: 60_000,
      env: { ...process.env, AGY_BIN: FAKE_AGY, FAKE_AGY_RESPONSE: 'packaged OK', FAKE_AGY_SLEEP_MS: '150', ...extraEnv },
    });
    if (result.error) throw result.error;
    return result;
  }
  const ask = invoke('ask', ['ask', '--prompt', 'reply with OK']);
  assert.equal(ask.status, 0, ask.stderr);
  assert.match(ask.stdout, /packaged OK/);
  const start = invoke('staffer', ['staffer', '--prompt', 'read-only test'], { FAKE_AGY_SLEEP_MS: '1200' });
  assert.equal(start.status, 0, start.stderr);
  const id = jobIdOf(start.stdout);
  const brief = invoke('jobs', ['wait', id, '--timeout', '1ms']);
  assert.equal(brief.status, 2, brief.stderr);
  const done = invoke('jobs', ['wait', id, '--timeout', '5s']);
  assert.equal(done.status, 0, done.stderr);
  assert.match(done.stdout, /packaged OK/);
});
