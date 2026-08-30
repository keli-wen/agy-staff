/**
 * triageResult: a non-SUCCESS status must never discard a finished answer,
 * and cause hints are appended only when the error text actually matches.
 *
 * The motivating incident: jobs whose final tool call timed out were marked
 * exit 3 even though the complete answer was already in payload.response, and
 * the caller's failure protocol ("quote the error, stop") threw the answer
 * away. Non-SUCCESS + non-empty response is now done_with_warnings: exit 0,
 * response on stdout, warning on stderr.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { sandbox, run, jobIdOf, jobLog, waitForJob } from './helpers.mjs';

describe('done_with_warnings: non-SUCCESS status with a complete response', () => {
  test('foreground (ask): exit 0, response intact on stdout, warning on stderr', () => {
    const sb = sandbox('triage-warn-fg');
    const r = run(sb, ['ask', '--prompt', 'a question'], {
      FAKE_AGY_STATUS: 'ERROR',
      FAKE_AGY_RESPONSE: 'the full answer, produced before the failure',
    });
    assert.equal(r.code, 0, `${r.stdout}${r.stderr}`);
    assert.match(r.stdout, /the full answer, produced before the failure/);
    assert.match(r.stderr, /agy-staff warning: agy reported status ERROR/);
    assert.doesNotMatch(r.stdout, /agy-staff warning/, 'the warning must not pollute the deliverable');
  });

  test('background (research): job ends done, wait exits 0 and prints the response', async () => {
    const sb = sandbox('triage-warn-bg');
    const started = run(sb, ['research', '--prompt', 'a topic'], {
      FAKE_AGY_STATUS: 'ERROR',
      FAKE_AGY_RESPONSE: 'survey results',
    });
    const id = jobIdOf(started.stdout);
    assert.equal(await waitForJob(sb, id), 'done');

    const r = run(sb, ['wait', id]);
    assert.equal(r.code, 0, `${r.stdout}${r.stderr}`);
    assert.match(r.stdout, /survey results/);
    assert.match(jobLog(sb, id), /agy-staff warning: agy reported status ERROR/);
  });
});

describe('cause hints are conditional on the error text', () => {
  test('an unrelated error (tool timeout) gets no model/auth/quota hint', () => {
    const sb = sandbox('triage-hint-none');
    const r = run(sb, ['ask', '--prompt', 'a question'], {
      FAKE_AGY_STATUS: 'ERROR',
      FAKE_AGY_RESPONSE: '',
      FAKE_AGY_STDERR: 'grep: process timed out after 30s',
    });
    assert.notEqual(r.code, 0);
    assert.match(r.stderr, /grep: process timed out after 30s/, 'the real error must be quoted');
    assert.doesNotMatch(r.stderr, /Likely cause/);
  });

  test('a model-id error gets exactly the model hint', () => {
    const sb = sandbox('triage-hint-model');
    const r = run(sb, ['ask', '--prompt', 'a question'], {
      FAKE_AGY_STATUS: 'ERROR',
      FAKE_AGY_RESPONSE: '',
      FAKE_AGY_ERROR: '--model gemini-3.7-flash requires --effort',
    });
    assert.notEqual(r.code, 0);
    assert.match(r.stderr, /Likely cause: invalid model id/);
    assert.doesNotMatch(r.stderr, /expired auth|exhausted quota/);
  });
});
