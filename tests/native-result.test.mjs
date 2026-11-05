import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createNativeErrorCollector, nativeResult, isResponseTimeout } from '../companion/native-result.mjs';
import { sandbox, run, jobIdOf, waitForJob, agyCalls } from './helpers.mjs';

// Field shape measured with real AGY 1.4.12 against a localhost HTTP 400 stub.
// Other status/code combinations below are synthetic, not live provider errors.
const apiError = { status: 'INVALID_ARGUMENT', error_code: 400, code_kind: 'http', retryable: false, error_id: 'fixture-error-1' };
const record = (value = apiError) => `AGY_ERROR: ${JSON.stringify(value)}`;
const nativeLine = (text) => JSON.parse(text.split('\n').find(line => line.startsWith('[agy-staff] native_result: ')).split('native_result: ')[1]);
function collect(text) {
  const collector = createNativeErrorCollector(); collector.write(text); collector.end(); return collector.snapshot();
}

test('native diagnostics survive byte-split Unicode, CRLF, a final unterminated record and noisy stderr', () => {
  const collector = createNativeErrorCollector();
  const error = { ...apiError, error_id: '诊断😀', short_error: 'not duplicated into metadata' };
  const data = Buffer.from(`ordinary stderr\r\n${record(error)}\r\n${record()}`);
  for (const byte of data) collector.write(Buffer.from([byte]));
  collector.end();
  assert.deepEqual(collector.snapshot().errors, [{ ...apiError, error_id: '诊断😀' }, apiError]);
  assert.equal(collector.snapshot().errors[0].short_error, undefined);
  collector.end();
  assert.equal(collector.snapshot().errors.length, 2, 'ending again must not duplicate records');
});

test('bad records, field types and oversized lines do not hide later native errors', () => {
  const out = collect(`AGY_ERROR: not JSON\nAGY_ERROR: null\nAGY_ERROR: []\n${record({ unknown: true })}\n` +
    `${record({ status: {}, error_code: '429', retryable: 'false', error_id: ['bad'] })}\n` +
    `AGY_ERROR: ${'x'.repeat(70000)}\n${record()}\n`);
  assert.deepEqual(out.errors, [apiError]);
  assert.ok(out.warnings.some(w => w.includes('Malformed')));
  assert.ok(out.warnings.some(w => w.includes('Invalid')));
  assert.ok(out.warnings.some(w => w.includes('Unrecognized')));
  assert.ok(out.warnings.some(w => w.includes('Oversized')));
});

test('diagnostics keep recent errors and bound UTF-8 fields without inventing missing values', () => {
  const errors = Array.from({ length: 10 }, (_, i) => record({ ...apiError, error_code: i, error_id: '中😀'.repeat(1000) }));
  const out = collect(errors.join('\n'));
  assert.deepEqual(out.errors.map(e => e.error_code), [7, 8, 9]);
  assert.ok(Buffer.byteLength(JSON.stringify(out)) < 3000);
  assert.deepEqual(collect(record({ status: 'NEW_SERVER_STATUS' })).errors, [{ status: 'NEW_SERVER_STATUS' }]);
});

test('explicit native reasons and API errors outrank legacy timeout prose; malformed reasons fall back', () => {
  const old = { status: 'ERROR', error: 'timeout waiting for response' };
  assert.equal(isResponseTimeout(old, nativeResult(old)), true);
  for (const finished_reason of ['error', 'interrupted', 'future_reason']) {
    assert.equal(isResponseTimeout(old, nativeResult({ ...old, finished_reason })), false);
  }
  assert.equal(isResponseTimeout(old, nativeResult(old, collect(record({ status: 'DEADLINE_EXCEEDED' })))), false);
  assert.equal(isResponseTimeout(old, nativeResult({ ...old, finished_reason: 'print_timeout' }, collect(record()))), true);
  const invalid = nativeResult({ ...old, finished_reason: { unexpected: true } });
  assert.equal(isResponseTimeout(old, invalid), true);
  assert.match(invalid.warnings[0], /Invalid/);
});

test('foreground preserves partial answers and distinguishes all native termination reasons', () => {
  const sb = sandbox('native-foreground');
  for (const reason of ['print_timeout', 'interrupted', 'error', 'future_reason']) {
    const r = run(sb, ['ask', '--prompt', 'test'], {
      FAKE_AGY_FINISHED_REASON: JSON.stringify(reason), FAKE_AGY_RESPONSE: 'PARTIAL_ANSWER',
      FAKE_AGY_STDERR: reason === 'error' ? record() : '',
    });
    assert.equal(r.code, 0, r.stderr);
    assert.equal(r.stdout, 'PARTIAL_ANSWER\n');
    assert.equal(nativeLine(r.stderr).finished_reason, reason);
    assert.match(r.stderr, /delivering it for assessment/);
  }
  const normal = run(sb, ['ask', '--prompt', 'test']);
  assert.deepEqual(nativeLine(normal.stderr), { exit_code: 0, status: 'SUCCESS', cli_version: '1.4.12-fake' });
  assert.doesNotMatch(normal.stderr, /agy-staff warning/);
  assert.equal(agyCalls(sb).filter(args => args.includes('-p')).length, 5);
});

test('empty native timeout needs attention; native error/interruption cannot be misclassified as timeout', () => {
  const sb = sandbox('native-empty');
  for (const [reason, expected] of [['print_timeout', 5], ['error', 1], ['interrupted', 1], ['future_reason', 1]]) {
    const r = run(sb, ['ask', '--prompt', 'test'], {
      FAKE_AGY_STATUS: 'ERROR', FAKE_AGY_RESPONSE: '', FAKE_AGY_ERROR: 'timeout waiting for response',
      FAKE_AGY_FINISHED_REASON: JSON.stringify(reason),
    });
    assert.equal(r.code, expected, r.stderr);
    assert.equal(nativeLine(r.stderr).finished_reason, reason);
    if (reason !== 'print_timeout') assert.doesNotMatch(r.stderr, /suggested_timeout/);
  }
});

test('structured auth/quota/network/model failures remain distinct even without a final JSON result', () => {
  const sb = sandbox('native-no-json');
  for (const [status, code] of [['UNAUTHENTICATED', 401], ['RESOURCE_EXHAUSTED', 429], ['UNAVAILABLE', 503], ['NOT_FOUND', 404]]) {
    const error = { ...apiError, status, error_code: code };
    const r = run(sb, ['ask', '--prompt', 'test'], {
      FAKE_AGY_NO_JSON: '1', FAKE_AGY_EXIT: '3', FAKE_AGY_STDERR: record(error),
    });
    assert.equal(r.code, 1, r.stderr);
    assert.deepEqual(nativeLine(r.stderr).errors, [error]);
    assert.doesNotMatch(r.stderr, /suggested_timeout|Best same-effort/);
  }
  assert.equal(agyCalls(sb).length, 4, 'no retry or model-discovery calls');
});

test('background partial timeout stays done, retains events and exposes metadata on every collection', async () => {
  const sb = sandbox('native-partial');
  const id = jobIdOf(run(sb, ['staffer', '--prompt', 'test'], {
    FAKE_AGY_FINISHED_REASON: '"print_timeout"', FAKE_AGY_RESPONSE: 'PARTIAL_ANSWER',
  }).stdout);
  assert.equal(await waitForJob(sb, id), 'done');
  const job = JSON.parse(run(sb, ['status', id]).stdout);
  assert.equal(job.agy.finished_reason, 'print_timeout');
  assert.equal(job.warnings, true);
  assert.ok(fs.existsSync(job.events_file));
  for (const command of ['wait', 'result']) {
    const r = run(sb, [command, id]);
    assert.equal(r.code, 0);
    assert.ok(r.stdout.endsWith('PARTIAL_ANSWER\n'));
    assert.doesNotMatch(r.stdout, /native_result|finished_reason/);
    assert.equal(nativeLine(r.stderr).finished_reason, 'print_timeout');
  }
  const observed = run(sb, ['observe', id]);
  assert.equal(observed.stderr, '');
  assert.equal(JSON.parse(observed.stdout).agy.finished_reason, 'print_timeout');
  assert.doesNotMatch(observed.stdout, /PARTIAL_ANSWER/);
  assert.ok(Buffer.byteLength(observed.stdout) <= 8192);
  // Publish-before-registry race: the terminal sidecar must carry the metadata.
  const stateFile = path.join(sb.repo, '.agy-staff', 'state.json');
  const state = JSON.parse(fs.readFileSync(stateFile));
  state.jobs[0].status = 'running'; delete state.jobs[0].agy;
  fs.writeFileSync(stateFile, JSON.stringify(state));
  assert.equal(JSON.parse(run(sb, ['observe', id]).stdout).agy.finished_reason, 'print_timeout');
  assert.equal(nativeLine(run(sb, ['result', id]).stderr).finished_reason, 'print_timeout');
});

test('background failure preserves early AGY_ERROR beyond the stderr tail and survives malformed later records', async () => {
  const sb = sandbox('native-error-tail');
  const id = jobIdOf(run(sb, ['staffer', '--prompt', 'test'], {
    FAKE_AGY_NO_JSON: '1', FAKE_AGY_EXIT: '3',
    FAKE_AGY_STDERR: `${record()}\n${'noise\n'.repeat(3000)}AGY_ERROR: broken\n`,
  }).stdout);
  assert.equal(await waitForJob(sb, id), 'error');
  const job = JSON.parse(run(sb, ['status', id]).stdout);
  assert.deepEqual(job.agy.errors, [apiError]);
  const observed = run(sb, ['observe', id]);
  assert.equal(observed.code, 3);
  assert.ok(Buffer.byteLength(observed.stdout) <= 8192);
  assert.deepEqual(JSON.parse(observed.stdout).agy.errors, [apiError]);
  const delivered = run(sb, ['wait', id]);
  assert.equal(delivered.code, 3);
  assert.match(delivered.stdout, /"retryable": false/);
  assert.deepEqual(nativeLine(delivered.stderr).errors, [apiError]);
  assert.equal(agyCalls(sb).length, 1);
});

test('background native print timeout without text preserves recovery configuration and explicit failure metadata', async () => {
  const sb = sandbox('native-attention');
  const id = jobIdOf(run(sb, ['staffer', '--prompt', 'test', '--restricted'], {
    FAKE_AGY_RESPONSE: '', FAKE_AGY_FINISHED_REASON: '"print_timeout"',
  }).stdout);
  assert.equal(await waitForJob(sb, id), 'attention');
  const obs = JSON.parse(run(sb, ['observe', id]).stdout);
  assert.equal(obs.agy.finished_reason, 'print_timeout');
  assert.equal(obs.reason, 'response_timeout');
  assert.equal(obs.profile, 'restricted');
  assert.match(obs.recovery.continue, new RegExp(`--job ${id}`));
  assert.equal(agyCalls(sb).length, 1);
});

test('background errors with partial text keep native API fields in done observations', async () => {
  const sb = sandbox('native-error-partial');
  const id = jobIdOf(run(sb, ['staffer', '--prompt', 'test'], {
    FAKE_AGY_RESPONSE: 'partial', FAKE_AGY_STATUS: 'ERROR', FAKE_AGY_EXIT: '3',
    FAKE_AGY_FINISHED_REASON: '"error"', FAKE_AGY_STDERR: record(),
  }).stdout);
  assert.equal(await waitForJob(sb, id), 'done');
  const obs = JSON.parse(run(sb, ['observe', id]).stdout);
  assert.equal(obs.agy.finished_reason, 'error');
  assert.equal(obs.agy.exit_code, 3);
  assert.deepEqual(obs.agy.errors, [apiError]);
});
