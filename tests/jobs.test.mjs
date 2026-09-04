/**
 * Job lifecycle (status / result / cancel) and `continue` mode inheritance.
 * Spec sections "Execution style (background-first)".
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  sandbox,
  run,
  agyCalls,
  jobIdOf,
  jobLog,
  jobResultFile,
  waitForJob,
  waitForCalls,
} from './helpers.mjs';

describe('background job lifecycle', () => {
  test('status → result → cancel over one finished job', async () => {
    const sb = sandbox('lifecycle');
    const started = run(sb, ['research', '--prompt', 'a topic']);
    assert.equal(started.code, 0, started.stderr);
    const id = jobIdOf(started.stdout);

    const terminal = await waitForJob(sb, id);
    assert.equal(terminal, 'done', `job ended as ${terminal}`);

    const one = run(sb, ['status', id]);
    assert.equal(one.code, 0, one.stderr);
    assert.match(one.stdout, /"id": "research-/);
    assert.match(one.stdout, /"status": "done"/);
    assert.doesNotMatch(one.stdout, /Still running/);

    const list = run(sb, ['status']);
    assert.equal(list.code, 0, list.stderr);
    assert.match(list.stdout, /id \| mode \| status \| started \| finished/);
    assert.match(list.stdout, new RegExp(`${id} \\| research \\| done \\|`));

    const res = run(sb, ['result', id]);
    assert.equal(res.code, 0, res.stderr);
    assert.match(res.stdout, new RegExp(`# Job ${id} \\(research, done\\)`));
    assert.match(res.stdout, /fake answer/);
    // research is unrestricted by default in round 2 — the telemetry proving it
    // lives in the worker log, never in the delivered result
    assert.doesNotMatch(res.stdout, /\[agy-staff\]/);
    assert.doesNotMatch(jobResultFile(sb, id), /\[agy-staff\]/);
    assert.match(jobLog(sb, id), /\[agy-staff\] mode=research profile=unrestricted/);

    // result with no id falls back to the latest finished job
    const latest = run(sb, ['result']);
    assert.equal(latest.code, 0, latest.stderr);
    assert.match(latest.stdout, new RegExp(`# Job ${id}`));

    const cancel = run(sb, ['cancel', id]);
    assert.equal(cancel.code, 0, cancel.stderr);
    assert.match(cancel.stdout, new RegExp(`Job ${id} is not running \\(status: done\\)\\.`));
  });

  test('status/result/cancel reject unknown ids', () => {
    const sb = sandbox('unknown-job');
    for (const cmd of ['status', 'result', 'cancel']) {
      const r = run(sb, [cmd, 'research-nope']);
      assert.notEqual(r.code, 0, `${cmd} on an unknown id must fail`);
      assert.match(r.stderr, /no job research-nope in this repository/);
    }
  });
});

describe('continue inherits the resumed mode default', () => {
  test('after ask, continue runs in the foreground', () => {
    const sb = sandbox('continue-ask');
    const first = run(sb, ['ask', '--prompt', 'what is 2 plus 2?']);
    assert.equal(first.code, 0, first.stderr);

    const cont = run(sb, ['continue', '--prompt', 'and what about 3 plus 3?']);
    assert.equal(cont.code, 0, cont.stderr);
    assert.match(cont.stdout, /fake answer/);
    assert.doesNotMatch(cont.stdout, /\[agy-staff\]/);
    assert.match(cont.stderr, /\[agy-staff\] mode=ask profile=restricted/);
    assert.match(cont.stderr, /^conversation: conv-1 \(follow up with --continue\)$/m);
    assert.doesNotMatch(cont.stdout, /Started background/);

    const calls = agyCalls(sb);
    assert.equal(calls.length, 2);
    const argv = calls[1];
    assert.ok(argv.includes('--conversation'), JSON.stringify(argv));
    assert.equal(argv[argv.indexOf('--conversation') + 1], 'conv-1');
    assert.match(argv[argv.indexOf('-p') + 1], /and what about 3 plus 3\?/);
  });

  test('after research, continue starts a background job', async () => {
    const sb = sandbox('continue-research');
    const first = run(sb, ['research', '--prompt', 'a topic']);
    assert.equal(first.code, 0, first.stderr);
    await waitForJob(sb, jobIdOf(first.stdout));

    const cont = run(sb, ['continue', '--prompt', 'dig into the second part']);
    assert.equal(cont.code, 0, cont.stderr);
    assert.match(cont.stdout, /Started background research job\./);
    const secondId = jobIdOf(cont.stdout);
    assert.equal(await waitForJob(sb, secondId), 'done');

    const calls = await waitForCalls(sb, 2);
    assert.equal(calls[1][calls[1].indexOf('--conversation') + 1], 'conv-1');
    assert.match(calls[1][calls[1].indexOf('-p') + 1], /dig into the second part/);
  });

  test('continue with no follow-up text and no history fails', () => {
    const sb = sandbox('continue-empty');
    const none = run(sb, ['continue', '--prompt', 'text with no history']);
    assert.notEqual(none.code, 0);
    assert.match(none.stderr, /no previous agy-staff conversation recorded/);
  });
});

describe('cross-context liveness checks (issue #11)', () => {
  test('pidAlive=false without result warns of permission/sandbox context mismatch and recovers when pid is visible', () => {
    const sb = sandbox('simulated-pid-liveness');
    const started = run(sb, ['research', '--prompt', 'a topic'], { FAKE_AGY_SLEEP_MS: '15000' });
    assert.equal(started.code, 0, started.stderr);
    const id = jobIdOf(started.stdout);

    const stateFile = path.join(sb.repo, '.agy-staff', 'state.json');
    const state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
    const job = state.jobs.find((j) => j.id === id);
    const realPid = job.pid;

    try {
      // Simulate collector running in a sandbox/permission context where worker PID is not visible
      job.pid = 99999999;
      fs.writeFileSync(stateFile, JSON.stringify(state, null, 2));

      const expectedWarning =
        /The worker pid is not visible from this process\. If the job may have been started from a different harness permission or sandbox context, rerun wait\/status\/result from the same unsandboxed context before treating it as crashed\./;

      // 1. status <id>
      const statusRes = run(sb, ['status', id]);
      assert.equal(statusRes.code, 3);
      assert.match(statusRes.stdout, /"status": "crashed"/);
      assert.match(statusRes.stdout, expectedWarning);

      // 2. status (list form)
      const listRes = run(sb, ['status']);
      assert.equal(listRes.code, 0);
      assert.match(listRes.stdout, expectedWarning);

      // 3. wait <id>
      const waitRes = run(sb, ['wait', id]);
      assert.equal(waitRes.code, 3);
      assert.match(waitRes.stdout, /finished with status crashed and no stored result/);
      assert.match(waitRes.stdout, expectedWarning);

      // 4. result <id>
      const resultRes = run(sb, ['result', id]);
      assert.notEqual(resultRes.code, 0);
      assert.match(resultRes.stderr, /has no stored result/);
      assert.match(resultRes.stderr, expectedWarning);

      // 5. Recovery when rerun from unsandboxed context where worker PID is visible
      const stateAfter = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
      const rec = stateAfter.jobs.find((j) => j.id === id);
      rec.pid = process.pid; // test runner process is alive
      fs.writeFileSync(stateFile, JSON.stringify(stateAfter, null, 2));

      const recoveredStatus = run(sb, ['status', id]);
      assert.equal(recoveredStatus.code, 2, 'recovers to running when pid is visible');
      assert.match(recoveredStatus.stdout, /"status": "running"/);
      assert.match(recoveredStatus.stdout, /Still running/);
    } finally {
      if (realPid) {
        try {
          process.kill(realPid, 'SIGKILL');
        } catch {}
      }
    }
  });
});
