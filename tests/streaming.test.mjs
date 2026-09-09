import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { sandbox, run, jobIdOf, waitForCalls, agyCalls, COMPANION, FAKE_AGY } from './helpers.mjs';
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
const state = (sb) => JSON.parse(fs.readFileSync(path.join(sb.repo, '.agy-staff/state.json'), 'utf8'));
const job = (sb, id) => state(sb).jobs.find((j) => j.id === id);
const alive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };
const events = [{ event: 'step_update', step_update: { conversation_id: 'conv-1', step_index: 2, step_type: 'tool', state: 'DONE', tool_name: 'shell', tool_info: { parameters: { command: 'hello' }, output: 'world' } } }, { event: 'step_update', step_update: { conversation_id: 'conv-1', step_index: 3, step_type: 'agent_response', state: 'ACTIVE', text_delta: 'Working…' } }];

test('soft expiry includes observation; independent observers and interrupted wait leave execution alive', async t => {
  const sb = sandbox('observers');
  const release = path.join(sb.root, 'release');
  t.after(() => fs.writeFileSync(release, 'finish'));
  const id = jobIdOf(run(sb, ['staffer', '--prompt', 'test'], { FAKE_AGY_EVENTS: JSON.stringify(events), FAKE_AGY_RELEASE_FILE: release }).stdout);
  await waitForCalls(sb, 1);
  // Dispatch/argv recording precedes stream consumption and publication.
  const progress = job(sb, id).progress_file;
  const deadline = Date.now() + 10000;
  let published;
  while (Date.now() < deadline) {
    try { published = JSON.parse(fs.readFileSync(progress, 'utf8')); } catch {}
    if (published?.recent_activities?.length) break;
    await pause(25);
  }
  assert.ok(published?.recent_activities?.length, 'the tool snapshot must be published before observation assertions');
  const waiter = spawn(process.execPath, [COMPANION, 'wait', id], { cwd: sb.repo, stdio: 'ignore' });
  waiter.kill('SIGTERM');
  const early = run(sb, ['wait', id, '--timeout', '150ms']);
  assert.equal(early.code, 2, early.stdout + early.stderr);
  const first = JSON.parse(early.stdout);
  assert.equal(first.recent_activities[0].output_preview, 'world');
  assert.equal(first.latest_text.text, 'Working…');
  assert.equal(first.latest_text.incomplete, true);
  const second = JSON.parse(run(sb, ['observe', id]).stdout);
  assert.deepEqual(second.recent_activities, first.recent_activities);
  assert.ok(alive(job(sb, id).agy_pid));
  assert.ok(fs.existsSync(first.details.raw_output));
  fs.writeFileSync(release, 'finish');
  assert.equal(run(sb, ['wait', id]).code, 0);
  for (let i = 0; i < 20 && fs.existsSync(first.details.raw_output); i++) await pause(50);
  assert.equal(fs.existsSync(first.details.raw_output), false);
  assert.equal(fs.existsSync(job(sb, id).progress_file), false);
  assert.equal(JSON.parse(run(sb, ['observe', id]).stdout).status, 'done');
});

test('hard deadline keeps init metadata and recovery configuration despite unrelated state.last', async () => {
  const sb = sandbox('hard-deadline');
  const id = jobIdOf(run(sb, ['review', '--restricted', '--model', 'gemini-3.8-flash-high', '--timeout', '800ms', '--prompt', 'review this'], { FAKE_AGY_SLEEP_MS: '5000' }).stdout);
  const result = run(sb, ['wait', id]);
  assert.equal(result.code, 5, result.stdout + result.stderr);
  assert.match(result.stdout, /hard_timeout/);
  const old = job(sb, id);
  assert.equal(old.reason, 'hard_timeout');
  assert.equal(old.conversation_id, 'conv-1');
  assert.ok(fs.existsSync(old.events_file));
  assert.equal(alive(old.agy_pid), false);
  run(sb, ['ask', '--prompt', 'unrelated'], { FAKE_AGY_CONVERSATION_ID: 'unrelated' });
  const next = jobIdOf(run(sb, ['continue', '--job', id, '--prompt', 'finish it']).stdout);
  assert.equal(run(sb, ['wait', next]).code, 0);
  const resumed = job(sb, next);
  assert.equal(resumed.parent_job_id, id);
  assert.equal(resumed.mode, 'review');
  assert.equal(resumed.model, old.model);
  assert.equal(resumed.profile, 'restricted');
  assert.equal(resumed.timeout, '60m');
  assert.equal(job(sb, id).reason, 'hard_timeout');
  const argv = agyCalls(sb).at(-1);
  assert.equal(argv[argv.indexOf('--conversation') + 1], 'conv-1');
  assert.equal(argv[argv.indexOf('--print-timeout') + 1], '60m');
});

test('cancel stops execution and late completion cannot overwrite its record', async () => {
  const sb = sandbox('stream-cancel');
  const id = jobIdOf(run(sb, ['research', '--prompt', 'test'], { FAKE_AGY_SLEEP_MS: '5000' }).stdout);
  await waitForCalls(sb, 1);
  const pid = job(sb, id).agy_pid;
  assert.equal(run(sb, ['cancel', id]).code, 0);
  await pause(700);
  assert.equal(alive(pid), false);
  assert.equal(run(sb, ['observe', id]).code, 4);
  assert.equal(job(sb, id).status, 'canceled');
  assert.ok(fs.existsSync(job(sb, id).events_file));
});

test('warning results and ERROR timeout payloads retain streams and conversations', () => {
  for (const [response, expected] of [['deliverable', 0], ['', 5]]) {
    const sb = sandbox('stream-error');
    const id = jobIdOf(run(sb, ['research', '--prompt', 'test'], { FAKE_AGY_RESPONSE: response, FAKE_AGY_STATUS: 'ERROR', FAKE_AGY_ERROR: 'timeout waiting for response', FAKE_AGY_EXIT: '1' }).stdout);
    const result = run(sb, ['wait', id]);
    assert.equal(result.code, expected, result.stdout + result.stderr);
    assert.equal(job(sb, id).conversation_id, 'conv-1');
    assert.ok(fs.existsSync(job(sb, id).events_file));
    if (response) assert.match(result.stdout, /deliverable/);
    else assert.match(result.stdout, /timeout waiting for response/);
  }
});

test('parallel dispatch and completion never lose registry entries or cross streams', async () => {
  const sb = sandbox('parallel-stream');
  const dispatch = (i) => new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [COMPANION, 'staffer', '--prompt', `task ${i}`], { cwd: sb.repo, env: { ...process.env, AGY_BIN: FAKE_AGY, FAKE_AGY_CONVERSATION_ID: `conv-${i}`, FAKE_AGY_RESPONSE: `result-${i}`, FAKE_AGY_SLEEP_MS: '700' } });
    let output = '', stderr = '';
    child.stdout.on('data', (c) => { output += c; }); child.stderr.on('data', (c) => { stderr += c; });
    child.on('close', (code) => code === 0 ? resolve(jobIdOf(output)) : reject(new Error(stderr)));
  });
  const ids = await Promise.all([0, 1, 2].map(dispatch));
  for (const [i, id] of ids.entries()) {
    const result = run(sb, ['wait', id]);
    assert.equal(result.code, 0, result.stdout + result.stderr);
    assert.match(result.stdout, new RegExp(`result-${i}`));
    assert.equal(job(sb, id).conversation_id, `conv-${i}`);
  }
  assert.equal(state(sb).jobs.length, 3);
});

test('crash reports distinguish missing logs and restart links a fresh job', () => {
  const sb = sandbox('crash-packet');
  const dir = path.join(sb.repo, '.agy-staff'); fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'state.json'), JSON.stringify({ jobs: [{ id: 'legacy', mode: 'research', status: 'running', pid: 99999999, started_at: new Date().toISOString(), log_file: path.join(dir, 'missing.log'), result_file: path.join(dir, 'missing.result') }] }));
  const report = run(sb, ['observe', 'legacy']);
  assert.equal(report.code, 3);
  assert.equal(JSON.parse(report.stdout).log_state, 'missing');
  assert.equal(JSON.parse(report.stdout).worker_started_at, null);
  const id = jobIdOf(run(sb, ['staffer', '--prompt', 'test'], { FAKE_AGY_NO_JSON: '1' }).stdout);
  assert.equal(run(sb, ['wait', id]).code, 3);
  assert.ok(JSON.parse(run(sb, ['observe', id]).stdout).worker_started_at);
  const restarted = jobIdOf(run(sb, ['restart', id]).stdout);
  assert.equal(run(sb, ['wait', restarted]).code, 0);
  assert.equal(job(sb, restarted).parent_job_id, id);
});

test('hard stop escalates for a SIGTERM-resistant CLI and detached descendant', async () => {
  const sb = sandbox('resistant-process');
  const pidFile = path.join(sb.root, 'descendant.pid');
  const id = jobIdOf(run(sb, ['staffer', '--timeout', '1500ms', '--prompt', 'test'], { FAKE_AGY_SLEEP_MS: '9000', FAKE_AGY_IGNORE_TERM: '1', FAKE_AGY_CHILD_PID_FILE: pidFile }).stdout);
  await waitForCalls(sb, 1);
  const result = run(sb, ['wait', id]);
  assert.equal(result.code, 5, result.stdout + result.stderr);
  assert.match(result.stdout, /hard_timeout/);
  assert.equal(alive(job(sb, id).agy_pid), false);
  const pid = Number(fs.readFileSync(pidFile, 'utf8'));
  await pause(100);
  assert.equal(alive(pid), false);
});

test('observe racing success cleanup always yields a bounded JSON snapshot', async () => {
  const sb = sandbox('cleanup-race');
  const id = jobIdOf(run(sb, ['staffer', '--prompt', 'test'], { FAKE_AGY_SLEEP_MS: '200' }).stdout);
  let done = false;
  for (let i = 0; i < 30; i++) {
    const result = run(sb, ['observe', id]);
    if (result.code === 0) {
      assert.equal(JSON.parse(result.stdout).status, 'done');
      assert.doesNotMatch(result.stdout, /fake answer/);
      done = true; break;
    }
    assert.equal(result.code, 2, result.stdout + result.stderr);
    assert.equal(JSON.parse(result.stdout).job_id, id);
    await pause(20);
  }
  assert.ok(done);
  for (let i = 0; i < 20 && fs.existsSync(job(sb, id).events_file); i++) await pause(50);
  assert.equal(fs.existsSync(job(sb, id).events_file), false);
});

test('mode --continue also preserves original configuration and links the job', () => {
  const sb = sandbox('mode-continue');
  const id = jobIdOf(run(sb, ['research', '--model', 'gemini-3.8-flash-low', '--restricted', '--prompt', 'first']).stdout);
  assert.equal(run(sb, ['wait', id]).code, 0);
  const next = jobIdOf(run(sb, ['research', '--continue', '--prompt', 'second']).stdout);
  assert.equal(run(sb, ['wait', next]).code, 0);
  assert.equal(job(sb, next).parent_job_id, id);
  assert.equal(job(sb, next).model, 'gemini-3.8-flash-low');
  assert.equal(job(sb, next).profile, 'restricted');
});


test('native SUCCESS and background-cleanup diagnostics are delivered without task-completion inference', () => {
  const sb = sandbox('native-response-delivery');
  const response = 'Command launched. Waiting for completion.';
  const diagnostics = 'root agent idle; waiting for 1 background task(s) (bounded by --print-timeout)\nterminating 1 background task(s) on exit';
  const id = jobIdOf(run(sb, ['staffer', '--prompt', 'test'], { FAKE_AGY_RESPONSE: response, FAKE_AGY_STDERR: diagnostics }).stdout);
  for (const command of ['wait', 'result']) {
    const r = run(sb, [command, id]);
    assert.equal(r.code, 0, r.stdout + r.stderr);
    assert.ok(r.stdout.endsWith(response + '\n'));
    assert.ok(r.stderr.includes(diagnostics));
    assert.match(r.stderr, /agy_status=SUCCESS agy_exit=0/);
  }
  assert.equal(job(sb, id).status, 'done');
  assert.ok(fs.existsSync(job(sb, id).events_file));
});
