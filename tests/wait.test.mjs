/**
 * The job-wait contract: machine-readable exit codes on `status <id>` and the
 * blocking `wait` subcommand.
 *
 * Codes: 0 = done, 2 = running (for wait: its own timeout expired while the
 * job kept running — call it again), 3 = error/crashed, 4 = canceled, 1 =
 * generic companion error (unknown id). The point of the contract is that a
 * caller can loop on "exit code 2" with zero output parsing.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { sandbox, run, jobIdOf, jobLog, waitForJob } from './helpers.mjs';

describe('status <id> exit codes', () => {
  test('running → 2, done → 0', async () => {
    const sb = sandbox('waitc-status');
    const started = run(sb, ['research', '--prompt', 'a topic'], { FAKE_AGY_SLEEP_MS: '3000' });
    const id = jobIdOf(started.stdout);

    const running = run(sb, ['status', id]);
    assert.equal(running.code, 2, `expected running exit code 2\n${running.stdout}${running.stderr}`);

    await waitForJob(sb, id);
    const done = run(sb, ['status', id]);
    assert.equal(done.code, 0, done.stderr);
    assert.match(done.stdout, /"status": "done"/);
  });

  test('error → 3, unknown id → 1, list form stays 0', async () => {
    const sb = sandbox('waitc-status-err');
    // an ERROR with a response would be delivered (done_with_warnings); a real
    // failure has no response
    const started = run(sb, ['research', '--prompt', 'a topic'], { FAKE_AGY_STATUS: 'ERROR', FAKE_AGY_RESPONSE: '' });
    const id = jobIdOf(started.stdout);
    await waitForJob(sb, id);

    assert.equal(run(sb, ['status', id]).code, 3);
    assert.equal(run(sb, ['status', 'no-such-job']).code, 1);
    assert.equal(run(sb, ['status']).code, 0);
  });
});

describe('wait', () => {
  test('blocks until done, prints the result, exits 0', async () => {
    const sb = sandbox('wait-done');
    const started = run(sb, ['research', '--prompt', 'a topic']);
    const id = jobIdOf(started.stdout);

    const r = run(sb, ['wait', id]);
    assert.equal(r.code, 0, r.stderr);
    assert.match(r.stdout, new RegExp(`# Job ${id} \\(research, done\\)`));
    assert.match(r.stdout, /fake answer/);
  });

  test('the delivered result is the body only; telemetry stays in the job log', async () => {
    const sb = sandbox('wait-telemetry');
    const started = run(sb, ['research', '--prompt', 'a topic']);
    const id = jobIdOf(started.stdout);

    const r = run(sb, ['wait', id]);
    assert.equal(r.code, 0, r.stderr);
    assert.match(r.stdout, /fake answer/);
    assert.doesNotMatch(r.stdout, /\[agy-staff\]/);
    assert.doesNotMatch(r.stdout, /follow up with --continue/);

    const log = jobLog(sb, id);
    assert.match(log, /\[agy-staff\] mode=research profile=unrestricted model=\S+ /);
    assert.match(log, /^conversation: conv-1 \(follow up with --continue\)$/m);
  });

  test('own timeout while the job runs → exit 2, then a second wait succeeds', async () => {
    const sb = sandbox('wait-timeout');
    const started = run(sb, ['research', '--prompt', 'a topic'], { FAKE_AGY_SLEEP_MS: '5000' });
    const id = jobIdOf(started.stdout);

    const first = run(sb, ['wait', id, '--timeout', '1s']);
    assert.equal(first.code, 2, `${first.stdout}${first.stderr}`);
    assert.match(first.stdout, /still running after 1s/);
    assert.doesNotMatch(first.stdout, /fake answer/, 'a timed-out wait must not print a result');

    const second = run(sb, ['wait', id]);
    assert.equal(second.code, 0, second.stderr);
    assert.match(second.stdout, /fake answer/);
  });

  test('failed job → exit 3 with the stored error', async () => {
    const sb = sandbox('wait-error');
    const started = run(sb, ['research', '--prompt', 'a topic'], { FAKE_AGY_STATUS: 'ERROR', FAKE_AGY_RESPONSE: '' });
    const id = jobIdOf(started.stdout);

    const r = run(sb, ['wait', id]);
    assert.equal(r.code, 3, `${r.stdout}${r.stderr}`);
    assert.match(r.stdout, /Job failed:/);
  });

  test('canceled job → exit 4', async () => {
    const sb = sandbox('wait-cancel');
    const started = run(sb, ['research', '--prompt', 'a topic'], { FAKE_AGY_SLEEP_MS: '8000' });
    const id = jobIdOf(started.stdout);
    run(sb, ['cancel', id]);

    const r = run(sb, ['wait', id]);
    assert.equal(r.code, 4, `${r.stdout}${r.stderr}`);
  });

  test('no id defaults to the most recent job; unknown id → 1', async () => {
    const sb = sandbox('wait-default');
    assert.equal(run(sb, ['wait', 'no-such-job']).code, 1);

    const started = run(sb, ['research', '--prompt', 'a topic']);
    const id = jobIdOf(started.stdout);
    const r = run(sb, ['wait']);
    assert.equal(r.code, 0, r.stderr);
    assert.match(r.stdout, new RegExp(`# Job ${id} `));
  });
});
