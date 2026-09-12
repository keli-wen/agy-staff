import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { sandbox, run, jobIdOf, waitForCalls, agyCalls, promptOf, COMPANION } from './helpers.mjs';
import { processIdentity, stopExecution } from '../companion/stream-worker.mjs';

const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const stateFile = sb => path.join(sb.repo, '.agy-staff/state.json');
const state = sb => JSON.parse(fs.readFileSync(stateFile(sb), 'utf8'));
const job = (sb, id) => {
  const record = state(sb).jobs.find(j => j.id === id);
  // Terminal metadata is published before the shared registry commit, and
  // wait is allowed to return as soon as that durable sidecar is available.
  try { return { ...record, ...JSON.parse(fs.readFileSync(record.result_file + '.status.json', 'utf8')) }; }
  catch { return record; }
};
const alive = pid => { try { process.kill(pid, 0); return true; } catch { return false; } };
async function waitForFile(file) {
  const deadline = Date.now() + 10000;
  while (!fs.existsSync(file) && Date.now() < deadline) await pause(25);
  assert.ok(fs.existsSync(file), `missing ${file}`);
}
function waiter(sb, id) {
  const child = spawn(process.execPath, [COMPANION, 'wait', id, '--timeout', '10s'], { cwd: sb.repo });
  let stdout = '', stderr = '';
  child.stdout.on('data', chunk => { stdout += chunk; });
  child.stderr.on('data', chunk => { stderr += chunk; });
  return new Promise(resolve => child.on('close', code => resolve({ code, stdout, stderr })));
}

test('cancel preserves crash diagnostics and never signals an unrelated execution group', async t => {
  const sb = sandbox('cancel-crash');
  const unrelated = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { detached: true, stdio: 'ignore' });
  t.after(() => unrelated.kill('SIGKILL'));
  const dir = path.join(sb.repo, '.agy-staff'); fs.mkdirSync(dir);
  const record = { id: 'crashed', mode: 'research', status: 'running', pid: 99999999, agy_pid: unrelated.pid,
    result_file: path.join(dir, 'result'), log_file: path.join(dir, 'log') };
  fs.writeFileSync(stateFile(sb), JSON.stringify({ jobs: [record] }));
  const canceled = run(sb, ['cancel', record.id]);
  assert.equal(canceled.code, 0); assert.match(canceled.stdout, /not running.*crashed/);
  assert.deepEqual(state(sb).jobs, [record]);
  assert.ok(alive(unrelated.pid));
  assert.equal(run(sb, ['observe', record.id]).code, 3);
});

test('cancel rejects a mismatched worker identity without signaling that PID', async t => {
  const sb = sandbox('cancel-identity');
  const unrelated = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { detached: true, stdio: 'ignore' });
  t.after(() => unrelated.kill('SIGKILL'));
  const dir = path.join(sb.repo, '.agy-staff'); fs.mkdirSync(dir);
  const record = { id: 'reused', status: 'running', pid: unrelated.pid, agy_pid: unrelated.pid,
    worker_identity: { pid: unrelated.pid, born: 'an earlier process' }, spec_file: path.join(dir, 'spec'), result_file: path.join(dir, 'result') };
  fs.writeFileSync(stateFile(sb), JSON.stringify({ jobs: [record] }));
  const r = run(sb, ['cancel', record.id]);
  assert.equal(r.code, 1); assert.match(r.stderr, /identity no longer matches/);
  assert.ok(alive(unrelated.pid)); assert.deepEqual(state(sb).jobs, [record]);
  await stopExecution({ pid: unrelated.pid, born: 'an earlier process' });
  assert.ok(alive(unrelated.pid), 'cleanup also verifies the group leader identity');
});

test('cleanup checks current group membership when a recorded descendant moved groups', async t => {
  const unrelated = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { detached: true, stdio: 'ignore' });
  const descendant = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { detached: true, stdio: 'ignore' });
  t.after(() => { unrelated.kill('SIGKILL'); descendant.kill('SIGKILL'); });
  const identity = processIdentity(descendant.pid);
  assert.ok(identity);
  await stopExecution({ pid: unrelated.pid, born: 'an earlier execution group' }, [{ ...identity, group: unrelated.pid }]);
  assert.ok(alive(unrelated.pid), 'a descendant\'s historical group is not signal authority');
  assert.equal(alive(descendant.pid), false);
});

test('cancel accepts the same worker across locale and timezone changes', async t => {
  for (const cancelEnv of [{ LC_ALL: 'zh_CN.UTF-8', TZ: 'UTC' }, { LC_ALL: 'C', TZ: 'Pacific/Honolulu' }]) {
    const sb = sandbox('cancel-environment');
    const workerEnv = { LC_ALL: 'C', TZ: 'UTC' };
    const id = jobIdOf(run(sb, ['staffer', '--timeout', '15s', '--prompt', 'task'], {
      ...workerEnv, FAKE_AGY_SLEEP_MS: '20000',
    }).stdout);
    t.after(() => run(sb, ['cancel', id], workerEnv));
    await waitForCalls(sb, 1);
    assert.ok(job(sb, id).worker_identity, 'process inspection must be available for this regression');
    const canceled = run(sb, ['cancel', id], cancelEnv);
    assert.equal(canceled.code, 0, canceled.stderr);
    assert.equal(job(sb, id).status, 'canceled');
    assert.equal(run(sb, ['wait', id]).code, 4);
  }
});

test('pending wait receives a durable canceled report immediately, including after a result event', async () => {
  const sb = sandbox('cancel-durable');
  const sent = path.join(sb.root, 'sent');
  const id = jobIdOf(run(sb, ['research', '--prompt', 'task'], { FAKE_AGY_RESULT_FILE: sent, FAKE_AGY_AFTER_RESULT_MS: '10000' }).stdout);
  await waitForFile(sent);
  const waiting = waiter(sb, id);
  const r = run(sb, ['cancel', id]);
  assert.equal(r.code, 0, r.stderr);
  const result = await waiting;
  assert.equal(result.code, 4); assert.match(result.stdout, /Execution canceled/);
  assert.doesNotMatch(result.stdout + result.stderr, /no stored result/);
  const packet = JSON.parse(result.stdout.slice(result.stdout.indexOf('{')));
  assert.equal(packet.status, 'canceled'); assert.equal(packet.finished_at, job(sb, id).finished_at);
  assert.equal(packet.result_exists, true);
  assert.equal(run(sb, ['result', id]).stdout, result.stdout);
});

test('a complete result survives hard expiry; an empty result needs attention', () => {
  for (const response of ['complete answer', '']) {
    const sb = sandbox('result-at-deadline');
    const id = jobIdOf(run(sb, ['research', '--timeout', '2s', '--prompt', 'task'], {
      FAKE_AGY_SLEEP_MS: '0', FAKE_AGY_RESPONSE: response, FAKE_AGY_AFTER_RESULT_MS: '10000', FAKE_AGY_IGNORE_TERM: '1',
    }).stdout);
    const r = run(sb, ['wait', id]);
    assert.equal(r.code, response ? 0 : 5, r.stdout + r.stderr);
    assert.ok(fs.existsSync(job(sb, id).events_file));
    if (response) { assert.match(r.stdout, /complete answer/); assert.equal(job(sb, id).warnings, true); }
    else {
      const packet = JSON.parse(r.stdout.slice(r.stdout.indexOf('{')));
      assert.equal(packet.reason, 'hard_timeout'); assert.equal(packet.status, 'attention');
      assert.equal(packet.finished_at, job(sb, id).finished_at); assert.equal(packet.result_exists, true);
    }
  }
});

test('CLI exit cleans inherited output pipes before the hard deadline', async () => {
  const sb = sandbox('inherited-pipes');
  const pidFile = path.join(sb.root, 'descendant.pid');
  const id = jobIdOf(run(sb, ['staffer', '--timeout', '6s', '--prompt', 'task'], {
    FAKE_AGY_SLEEP_MS: '1500', FAKE_AGY_CHILD_PID_FILE: pidFile, FAKE_AGY_INHERIT_STDIO: '1',
  }).stdout);
  const r = run(sb, ['wait', id]);
  assert.equal(r.code, 0, r.stdout + r.stderr);
  assert.equal(job(sb, id).warnings, false, 'must finish without reaching the hard deadline');
  const pid = Number(fs.readFileSync(pidFile, 'utf8'));
  for (let i = 0; i < 20 && alive(pid); i++) await pause(50);
  assert.equal(alive(pid), false);
});

test('one failed process inspection preserves tracked descendants after reparenting', { skip: process.platform === 'win32' && 'shims POSIX ps; Windows inspects via PowerShell' }, async t => {
  const sb = sandbox('inspection-retry');
  const pidFile = path.join(sb.root, 'descendant.pid');
  const release = path.join(sb.root, 'orphan');
  const seen = path.join(sb.root, 'seen');
  const fail = path.join(sb.root, 'fail-next');
  const failed = path.join(sb.root, 'failed');
  const bin = path.join(sb.root, 'bin'); fs.mkdirSync(bin);
  fs.writeFileSync(path.join(bin, 'ps'), `#!${process.execPath}\nconst fs = require('fs');
    if (fs.existsSync(${JSON.stringify(fail)})) { fs.unlinkSync(${JSON.stringify(fail)}); fs.writeFileSync(${JSON.stringify(failed)}, 'failed'); process.exit(1); }
    const r = require('child_process').spawnSync('/bin/ps', process.argv.slice(2), { encoding: 'utf8' });
    if (fs.existsSync(${JSON.stringify(pidFile)}) && (r.stdout || '').split('\\n').some(line => Number(line.trim().split(/\\s+/)[0]) === Number(fs.readFileSync(${JSON.stringify(pidFile)}, 'utf8')))) fs.writeFileSync(${JSON.stringify(seen)}, 'seen');
    process.stdout.write(r.stdout || ''); process.exit(r.status ?? 1);\n`, { mode: 0o755 });
  const id = jobIdOf(run(sb, ['staffer', '--timeout', '15s', '--prompt', 'task'], {
    PATH: `${bin}:${process.env.PATH}`, FAKE_AGY_CHILD_PID_FILE: pidFile, FAKE_AGY_ORPHAN_RELEASE_FILE: release, FAKE_AGY_SLEEP_MS: '20000',
  }).stdout);
  await waitForFile(seen);
  const pid = Number(fs.readFileSync(pidFile, 'utf8'));
  const identity = processIdentity(pid);
  t.after(async () => { if (alive(pid)) await stopExecution(identity); });
  fs.writeFileSync(release, 'orphan now');
  fs.writeFileSync(fail, 'fail next inspection');
  await waitForFile(failed);
  const r = run(sb, ['cancel', id]);
  assert.equal(r.code, 0, r.stderr);
  for (let i = 0; i < 20 && alive(pid); i++) await pause(50);
  assert.equal(alive(pid), false, 'the orphan must remain tracked across inspection failure');
});

test('missing JSON retains unsupported-model discovery from stdout or stderr', () => {
  for (const channel of ['FAKE_AGY_STDERR', 'FAKE_AGY_STDOUT']) {
    const sb = sandbox('missing-model');
    const id = jobIdOf(run(sb, ['research', '--prompt', 'task'], {
      FAKE_AGY_NO_JSON: '1', [channel]: 'invalid model selection: unknown model gemini-3.8-flash-high',
      FAKE_AGY_MODELS_OUTPUT: 'gemini-3.7-flash-high\tFlash High',
    }).stdout);
    const r = run(sb, ['wait', id]);
    assert.equal(r.code, 3); assert.match(r.stdout, /Available models/);
    assert.match(r.stdout, /Best same-effort compatible recommendation: --model gemini-3.7-flash-high/);
  }
});

test('background timeout defaults to 60m and accepts up to 120m, including AGY arguments', () => {
  const sb = sandbox('timeout-range');
  for (const timeout of [null, '120m', '2h']) {
    const id = jobIdOf(run(sb, ['staffer', ...(timeout ? ['--timeout', timeout] : []), '--prompt', 'task']).stdout);
    assert.equal(run(sb, ['wait', id]).code, 0);
    assert.equal(job(sb, id).timeout, timeout || '60m');
    const argv = agyCalls(sb).at(-1);
    assert.equal(argv[argv.indexOf('--print-timeout') + 1], timeout || '60m');
  }
  const before = agyCalls(sb).length;
  for (const timeout of ['121m', '0m', '-1m']) assert.equal(run(sb, ['staffer', '--timeout', timeout, '--prompt', 'task']).code, 1);
  assert.equal(agyCalls(sb).length, before);
});

test('continue and restart return to the original cwd within a worktree and refresh implement context', () => {
  const sb = sandbox('recovery-cwd');
  const subdir = path.join(sb.repo, 'sub'); fs.mkdirSync(subdir);
  const caller = path.join(sb.repo, 'caller'); fs.mkdirSync(caller);
  const cwdFile = path.join(sb.root, 'cwd');
  const id = jobIdOf(run({ ...sb, repo: subdir }, ['implement', '--restricted', '--model', 'gemini-3.8-flash-low', '--prompt', 'preserve the task'], { FAKE_AGY_CWD_FILE: cwdFile }).stdout);
  assert.equal(run(sb, ['wait', id]).code, 0);
  fs.writeFileSync(path.join(subdir, 'partial.txt'), 'keep this work');
  fs.writeFileSync(path.join(caller, 'followup.txt'), 'finish the task');
  const next = jobIdOf(run({ ...sb, repo: caller }, ['continue', '--job', id, '--prompt-file', 'followup.txt'], { FAKE_AGY_CWD_FILE: cwdFile }).stdout);
  assert.equal(run(sb, ['wait', next]).code, 0);
  assert.equal(fs.readFileSync(cwdFile, 'utf8'), subdir);
  assert.equal(job(sb, next).profile, 'restricted'); assert.equal(job(sb, next).profileSource, 'inherited');
  assert.equal(job(sb, next).model, 'gemini-3.8-flash-low');
  assert.match(promptOf(agyCalls(sb).at(-1)), /finish the task/);
  const restarted = jobIdOf(run(sb, ['restart', id], { FAKE_AGY_CWD_FILE: cwdFile }).stdout);
  assert.equal(run(sb, ['wait', restarted]).code, 0);
  assert.equal(fs.readFileSync(cwdFile, 'utf8'), subdir);
  assert.match(promptOf(agyCalls(sb).at(-1)), /Existing workspace changes/);
  assert.match(promptOf(agyCalls(sb).at(-1)), /sub\//);
  assert.match(promptOf(agyCalls(sb).at(-1)), /preserve the task/);
  assert.equal(fs.readFileSync(path.join(subdir, 'partial.txt'), 'utf8'), 'keep this work');
  // The mode-specific entry point also resolves caller-relative prompt files.
  const resumed = jobIdOf(run({ ...sb, repo: caller }, ['implement', '--continue', '--prompt-file', 'followup.txt']).stdout);
  assert.equal(run(sb, ['wait', resumed]).code, 0); assert.equal(job(sb, resumed).cwd, subdir);
});

test('unknown conversations and jobs from another worktree fail without launching AGY', () => {
  const sb = sandbox('unknown-conversation');
  const id = jobIdOf(run(sb, ['research', '--prompt', 'task']).stdout);
  assert.equal(run(sb, ['wait', id]).code, 0);
  const count = agyCalls(sb).length;
  assert.equal(run(sb, ['continue', '--conversation', 'unknown', '--prompt', 'follow up']).code, 1);
  assert.equal(agyCalls(sb).length, count);
  const commit = spawnSync('git', ['-c', 'user.name=Test', '-c', 'user.email=test@example.com', 'commit', '--allow-empty', '-qm', 'initial'], { cwd: sb.repo });
  assert.equal(commit.status, 0);
  const other = path.join(sb.root, 'other-worktree');
  assert.equal(spawnSync('git', ['worktree', 'add', '--detach', other], { cwd: sb.repo }).status, 0);
  const r = run({ ...sb, repo: other }, ['continue', '--conversation', job(sb, id).conversation_id, '--prompt', 'follow up']);
  assert.equal(r.code, 1); assert.match(r.stderr, /no previous agy-staff conversation/);
  assert.equal(agyCalls(sb).length, count);
});

test('continuing a conversation whose job is still running is refused without queueing a follow-up', async () => {
  const sb = sandbox('continue-running');
  const id = jobIdOf(run(sb, ['research', '--prompt', 'slow task'], { FAKE_AGY_SLEEP_MS: '4000' }).stdout);
  await waitForCalls(sb, 1);
  const count = agyCalls(sb).length;
  const generic = run(sb, ['continue', '--job', id, '--prompt', 'change direction']);
  assert.equal(generic.code, 1);
  assert.match(generic.stderr, new RegExp(`job ${id} is still running \\(status: running\\)`));
  assert.match(generic.stderr, /not accepted or queued/);
  assert.match(generic.stderr, new RegExp(`wait ${id}`)); assert.match(generic.stderr, new RegExp(`cancel ${id}`));
  assert.equal(agyCalls(sb).length, count);
  // The mode entry point's --continue resolves the same running job once its conversation id is recorded.
  const deadline = Date.now() + 5000;
  while (!job(sb, id).conversation_id && Date.now() < deadline) await pause(25);
  assert.ok(job(sb, id).conversation_id, 'conversation id recorded while running');
  const modeContinue = run(sb, ['research', '--continue', '--prompt', 'change direction']);
  assert.equal(modeContinue.code, 1); assert.match(modeContinue.stderr, /still running/);
  assert.equal(agyCalls(sb).length, count);
  // After cancel, the follow-up is accepted on the same conversation.
  assert.equal(run(sb, ['cancel', id]).code, 0);
  const next = jobIdOf(run(sb, ['continue', '--job', id, '--prompt', 'change direction']).stdout);
  assert.equal(run(sb, ['wait', next]).code, 0);
  assert.equal(job(sb, next).parent_job_id, id);
  assert.match(promptOf(agyCalls(sb).at(-1)), /change direction/);
});

test('continue --job preserves the selected job configuration after later turns change it', () => {
  const sb = sandbox('selected-job-config');
  const first = jobIdOf(run(sb, ['review', '--restricted', '--model', 'gemini-3.8-flash-low', '--json', '--prompt', 'review']).stdout);
  assert.equal(run(sb, ['wait', first]).code, 0);
  const second = jobIdOf(run(sb, ['continue', '--job', first, '--unrestricted', '--model', 'gemini-3.8-flash-high', '--prompt', 'another turn']).stdout);
  assert.equal(run(sb, ['wait', second]).code, 0);
  const third = jobIdOf(run(sb, ['continue', '--job', first, '--prompt', 'use the first configuration']).stdout);
  assert.equal(run(sb, ['wait', third]).code, 0);
  assert.equal(job(sb, third).parent_job_id, first);
  assert.equal(job(sb, third).model, 'gemini-3.8-flash-low');
  assert.equal(job(sb, third).profile, 'restricted');
  assert.ok(agyCalls(sb).at(-1).includes('--json-schema'));
  const empty = jobIdOf(run(sb, ['continue', '--job', first, '--prompt', 'follow up'], { FAKE_AGY_RESPONSE: '' }).stdout);
  const error = run(sb, ['wait', empty]);
  assert.equal(error.code, 3);
  assert.match(error.stdout, /inherited the restricted profile/);
  assert.match(error.stdout, /pass `--unrestricted` explicitly/);
  assert.doesNotMatch(error.stdout, /drop `--restricted`/);
});
