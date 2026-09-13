import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { sandbox, run, jobIdOf, agyCalls, waitForCalls, COMPANION, FAKE_AGY } from './helpers.mjs';

const stateFile = sb => path.join(sb.repo, '.agy-staff/state.json');
const state = sb => JSON.parse(fs.readFileSync(stateFile(sb), 'utf8'));
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(predicate) {
  const deadline = Date.now() + 5000;
  while (!predicate() && Date.now() < deadline) await pause(20);
  assert.ok(predicate(), 'test checkpoint not reached');
}
function refused(result, active) {
  assert.equal(result.code, 1, result.stdout + result.stderr);
  assert.ok(result.stderr.includes(`job ${active} is still running (status: running)`));
  assert.match(result.stderr, /not accepted or queued/);
  assert.ok(result.stderr.includes(`wait ${active}`));
  assert.ok(result.stderr.includes(`cancel ${active}`));
  assert.equal(result.stdout, '');
}

test('initializing jobs reject follow-ups before a conversation or PID is available', () => {
  const sb = sandbox('continue-initializing');
  fs.mkdirSync(path.dirname(stateFile(sb)));
  const original = { jobs: [{ id: 'starting', mode: 'staffer', status: 'running', pid: null, conversation_id: null }] };
  fs.writeFileSync(stateFile(sb), JSON.stringify(original));
  refused(run(sb, ['continue', '--job', 'starting', '--prompt', 'next']), 'starting');
  assert.deepEqual(state(sb), original);
  assert.equal(agyCalls(sb).length, 0);
});

test('all follow-up entrypoints reject an active successor while other conversations remain usable', async t => {
  const sb = sandbox('continue-successor');
  const release = path.join(sb.root, 'release');
  t.after(() => { for (const j of state(sb).jobs) run(sb, ['cancel', j.id]); });
  const first = jobIdOf(run(sb, ['research', '--prompt', 'first']).stdout);
  assert.equal(run(sb, ['wait', first]).code, 0);
  const conversation = state(sb).jobs.find(j => j.id === first).conversation_id;
  const active = jobIdOf(run(sb, ['continue', '--job', first, '--prompt', 'active'], { FAKE_AGY_RELEASE_FILE: release }).stdout);
  await waitForCalls(sb, 2);
  const requests = [
    ['continue', '--job', first], ['continue', '--job', active],
    ['continue', '--conversation', conversation], ['continue'], ['research', '--continue'],
    ...['staffer', 'research', 'review', 'implement', 'ask'].map(mode => [mode, '--conversation', conversation]),
  ];
  const filesBefore = fs.readdirSync(path.join(sb.repo, '.agy-staff/jobs')).sort();
  for (const request of requests) refused(run(sb, [...request, '--prompt', 'must not run']), active);
  assert.equal(agyCalls(sb).length, 2);
  assert.equal(state(sb).jobs.length, 2);
  assert.deepEqual(fs.readdirSync(path.join(sb.repo, '.agy-staff/jobs')).sort(), filesBefore);
  assert.equal(state(sb).jobs.find(j => j.id === active).cancel_requested_at, undefined);
  const unrelated = jobIdOf(run(sb, ['staffer', '--prompt', 'independent'], { FAKE_AGY_CONVERSATION_ID: 'independent' }).stdout);
  assert.equal(run(sb, ['wait', unrelated]).code, 0);
  fs.writeFileSync(release, 'finish');
  assert.equal(run(sb, ['wait', active]).code, 0);
  const next = jobIdOf(run(sb, ['continue', '--job', first, '--prompt', 'now allowed']).stdout);
  assert.equal(run(sb, ['wait', next]).code, 0);
  assert.equal(state(sb).jobs.find(j => j.id === next).conversation_id, conversation);
});

test('simultaneous follow-ups recheck occupancy inside registration and leave no rejected spec', async t => {
  const sb = sandbox('continue-registration-race');
  const release = path.join(sb.root, 'release');
  const dir = path.join(sb.repo, '.agy-staff');
  const lock = path.join(dir, 'state.json.lock');
  const owner = `owner-${process.pid}-${randomUUID()}`;
  let pending = [];
  t.after(async () => {
    if (fs.existsSync(path.join(lock, owner))) { fs.unlinkSync(path.join(lock, owner)); fs.rmdirSync(lock); }
    await Promise.allSettled(pending);
    fs.writeFileSync(release, 'finish');
    for (const j of state(sb).jobs) run(sb, ['cancel', j.id]);
  });
  const first = jobIdOf(run(sb, ['staffer', '--prompt', 'seed']).stdout);
  assert.equal(run(sb, ['wait', first]).code, 0);
  await until(() => state(sb).jobs[0].status === 'done' && !fs.existsSync(lock));
  const conversation = state(sb).jobs[0].conversation_id;
  fs.mkdirSync(lock); fs.writeFileSync(path.join(lock, owner), '');
  const invoke = () => new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [COMPANION, 'continue', '--conversation', conversation, '--prompt', 'contender'], {
      cwd: sb.repo, env: { ...process.env, HOME: sb.home, USERPROFILE: sb.home, AGY_BIN: FAKE_AGY,
        FAKE_AGY_ARGV_FILE: sb.argvFile, FAKE_AGY_RELEASE_FILE: release },
    });
    let stdout = '', stderr = '';
    child.stdout.on('data', c => stdout += c); child.stderr.on('data', c => stderr += c);
    child.on('error', reject); child.on('close', code => resolve({ code, stdout, stderr }));
  });
  pending = [invoke(), invoke()];
  // Both callers have passed the first guard and are waiting for this lock.
  await until(() => fs.readdirSync(dir).filter(n => n.startsWith('state.json.lock.owner-')).length === 2);
  fs.unlinkSync(path.join(lock, owner)); fs.rmdirSync(lock);
  const results = await Promise.all(pending);
  assert.deepEqual(results.map(r => r.code).sort(), [0, 1]);
  const active = jobIdOf(results.find(r => r.code === 0).stdout);
  refused(results.find(r => r.code === 1), active);
  assert.equal(state(sb).jobs.length, 2);
  assert.equal(fs.readdirSync(path.join(dir, 'jobs')).filter(n => n.endsWith('.spec.json')).length, 2);
  await waitForCalls(sb, 2);
  assert.equal(agyCalls(sb).length, 2);
  fs.writeFileSync(release, 'finish');
  assert.equal(run(sb, ['wait', active]).code, 0);
});
