import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { sandbox, run, jobIdOf, waitForCalls, COMPANION } from './helpers.mjs';
const body = 'FULL_REPORT_ONLY_IN_DELIVERY\n' + '\u62a5\u544a\u5185\u5bb9😀'.repeat(4500);
function storedJob(status, extra = {}) {
  const sb = sandbox(`terminal-${status}`);
  const dir = path.join(sb.repo, '.agy-staff');
  fs.mkdirSync(dir, { recursive: true });
  const job = { id: 'example-job', mode: 'research', status, pid: 99999999,
    started_at: '2026-09-07T00:00:00Z', finished_at: '2026-09-07T00:02:00Z',
    result_file: path.join(dir, 'example.result.md'), log_file: path.join(dir, 'example.log'),
    conversation_id: 'original-conversation', model: 'original-model', profile: 'restricted', ...extra };
  fs.writeFileSync(job.result_file, body);
  fs.writeFileSync(path.join(dir, 'state.json'), JSON.stringify({ jobs: [job] }));
  return { sb, job, stateFile: path.join(dir, 'state.json') };
}
function observation(sb, id, code) {
  const r = run(sb, ['observe', id]);
  assert.equal(r.code, code, r.stdout + r.stderr);
  assert.equal(r.stderr, '');
  assert.ok(Buffer.byteLength(r.stdout) <= 8192);
  assert.doesNotMatch(r.stdout, /FULL_REPORT_ONLY_IN_DELIVERY|\u62a5\u544a\u5185\u5bb9/);
  return JSON.parse(r.stdout);
}

test('observe stays bounded after legacy completion; independent reads never consume the full result', () => {
  const { sb, job, stateFile } = storedJob('done', { warnings: true });
  fs.writeFileSync(job.log_file, 'OLD_DIAGNOSTIC\n' + 'x'.repeat(16000) + '\nNATIVE_DIAGNOSTIC\n');
  const before = fs.readFileSync(stateFile, 'utf8');
  for (let i = 0; i < 2; i++) {
    const s = observation(sb, job.id, 0);
    assert.equal(s.status, 'done'); assert.equal(s.result_available, true);
    assert.equal(s.result_file, job.result_file);
    assert.equal(s.elapsed_seconds, 120);
    assert.equal(s.collection.command, `result ${job.id}`);
    assert.equal(s.warnings, undefined, 'internal tool warnings are not promoted into successful delivery');
  }
  assert.equal(fs.readFileSync(stateFile, 'utf8'), before);
  for (const command of ['wait', 'result']) {
    const r = run(sb, [command, job.id]);
    assert.equal(r.code, 0); assert.equal(r.stdout, `# Job ${job.id} (research, done)\n\n` + body);
    assert.match(r.stderr, /NATIVE_DIAGNOSTIC/);
    assert.doesNotMatch(r.stderr, /OLD_DIAGNOSTIC/);
    assert.ok(Buffer.byteLength(r.stderr) < 10000);
  }
});

test('error, attention and cancellation return terminal metadata/recovery rather than full failure reports', () => {
  for (const [status, code] of [['error', 3], ['attention', 5], ['canceled', 4]]) {
    const { sb, job } = storedJob(status, { reason: status === 'canceled' ? 'canceled' : 'hard_timeout' });
    const s = observation(sb, job.id, code);
    assert.equal(s.reason, job.reason);
    assert.equal(s.conversation_id, 'original-conversation');
    assert.equal(s.model, 'original-model'); assert.equal(s.profile, 'restricted');
    assert.match(s.recovery.continue, /continue --job example-job/);
    assert.equal(s.recovery.restart, status === 'canceled' ? 'restart example-job' : 'restart example-job --timeout 120m');
    const result = run(sb, ['wait', job.id]);
    assert.equal(result.code, code); assert.ok(result.stdout.endsWith(body));
  }
});

test('terminal sidecar race and a crash without a result still produce inspectable bounded JSON', () => {
  const { sb, job, stateFile } = storedJob('running', { spec_file: '/stored.spec', finished_at: null });
  fs.writeFileSync(job.log_file, 'SIDECAR_WARNING');
  fs.writeFileSync(job.result_file + '.status.json', JSON.stringify({ status: 'done', warnings: true }));
  for (const command of ['wait', 'result']) assert.match(run(sb, [command, job.id]).stderr, /SIDECAR_WARNING/);
  fs.writeFileSync(job.result_file + '.status.json', JSON.stringify({ status: 'error', reason: 'hard_timeout', finished_at: '2026-09-07T00:02:00Z' }));
  const s = observation(sb, job.id, 3);
  assert.equal(s.status, 'error'); assert.equal(s.reason, 'hard_timeout'); assert.equal(s.elapsed_seconds, 120);
  fs.writeFileSync(job.result_file + '.status.json', JSON.stringify({ status: 'attention', reason: 'response_timeout', finished_at: '2026-09-07T00:02:00Z' }));
  const attention = observation(sb, job.id, 5);
  assert.equal(attention.status, 'attention'); assert.equal(attention.reason, 'response_timeout');
  assert.equal(attention.recovery.requires_user_confirmation, true);
  assert.equal(attention.recovery.suggested_timeout, '120m');
  assert.equal(run(sb, ['result', job.id]).code, 5);
  fs.unlinkSync(job.result_file + '.status.json'); fs.unlinkSync(job.result_file); fs.unlinkSync(job.log_file);
  const crashed = observation(sb, job.id, 3);
  assert.equal(crashed.status, 'crashed'); assert.equal(crashed.result_available, false);
  assert.equal(crashed.log_state, 'missing'); assert.match(crashed.liveness_note, /permission or sandbox context/);
  assert.equal(JSON.parse(fs.readFileSync(stateFile, 'utf8')).jobs[0].status, 'running', 'observation is read-only');
  assert.equal(run(sb, ['observe', 'missing-job']).code, 1);
});

test('nested recovery metadata obeys the same 8 KiB ceiling and marks shortening', () => {
  const long = '\u8def\u5f84😀'.repeat(2000);
  const { sb, job } = storedJob('error', { conversation_id: long, model: long, profile: long, spec_file: long });
  const s = observation(sb, job.id, 3);
  assert.equal(s.status, 'error'); assert.equal(s.truncated, true); assert.equal(s.details_truncated, true);
  assert.doesNotMatch(JSON.stringify(s), /�/);
});

test('observe during a pending wait never duplicates its large final report', async t => {
  const sb = sandbox('observe-with-wait');
  const release = path.join(sb.root, 'release');
  t.after(() => fs.writeFileSync(release, 'finish'));
  const id = jobIdOf(run(sb, ['staffer', '--prompt', 'report'], { FAKE_AGY_RELEASE_FILE: release, FAKE_AGY_RESPONSE: body }).stdout);
  await waitForCalls(sb, 1);
  const waiter = spawn(process.execPath, [COMPANION, 'wait', id], { cwd: sb.repo, stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = '', stderr = '';
  waiter.stdout.on('data', data => { stdout += data; }); waiter.stderr.on('data', data => { stderr += data; });
  const done = new Promise(resolve => waiter.on('close', resolve));
  const running = run(sb, ['observe', id]);
  assert.equal(running.code, 2);
  assert.ok(Buffer.byteLength(running.stdout) <= 8192);
  assert.doesNotMatch(running.stdout, /FULL_REPORT_ONLY_IN_DELIVERY/);
  fs.writeFileSync(release, 'finish');
  assert.equal(await done, 0); assert.equal(stderr, '');
  const terminal = observation(sb, id, 0);
  assert.ok(terminal.result_available);
  assert.equal(stdout, `# Job ${id} (staffer, done)\n\n` + body + '\n');
});
