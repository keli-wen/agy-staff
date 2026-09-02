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
import { sandbox, run, jobIdOf, jobLog, waitForJob, agyCalls } from './helpers.mjs';

const CATALOG_WITHOUT_38 = [
  'Fetching available models...',
  'gemini-3.7-flash-high\tGemini 3.7 Flash (High)',
  'gemini-3.7-flash-medium\tGemini 3.7 Flash (Medium)',
  'gemini-3.7-flash-low\tGemini 3.7 Flash (Low)',
  'gemini-3.6-flash-high\tGemini 3.6 Flash (High)',
  'gemini-3.6-flash-medium\tGemini 3.6 Flash (Medium)',
  'gemini-3.6-flash-low\tGemini 3.6 Flash (Low)',
  'gemini-3.1-pro-high\tGemini 3.1 Pro (High)',
  'gemini-3.1-pro-low\tGemini 3.1 Pro (Low)',
].join('\n');

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
      FAKE_AGY_ERROR: '--model gemini-3.8-flash requires --effort',
    });
    assert.notEqual(r.code, 0);
    assert.match(r.stderr, /Likely cause: invalid model id/);
    assert.doesNotMatch(r.stderr, /expired auth|exhausted quota/);
  });
});

describe('unsupported model error handling without silent fallback', () => {
  test('foreground (ask) fails clearly on catalog without 3.8 Flash, reports models, recommends same-effort 3.7-flash-low, and does not retry', () => {
    const sb = sandbox('unsupported-ask');
    const r = run(sb, ['ask', '--prompt', 'hello'], {
      FAKE_AGY_STATUS: 'ERROR',
      FAKE_AGY_RESPONSE: '',
      FAKE_AGY_ERROR: 'invalid model selection (--model "gemini-3.8-flash-low" --effort ""): model gemini-3.8-flash-low is not recognized as a known model or custom model in settings',
      FAKE_AGY_MODELS_OUTPUT: CATALOG_WITHOUT_38,
    });
    assert.notEqual(r.code, 0);
    // Actionable failure behavior
    assert.match(r.stderr, /requested model "gemini-3\.8-flash-low"/);
    assert.match(r.stderr, /Available models \(from `agy models`\):/);
    assert.match(r.stderr, /gemini-3\.7-flash-low/);
    assert.match(r.stderr, /Best same-effort compatible recommendation: --model gemini-3\.7-flash-low/);
    assert.match(r.stderr, /Updating agy is preferred to use the latest default/);

    // No automatic retry or silent fallback
    const calls = agyCalls(sb);
    const taskRuns = calls.filter((args) => args.includes('-p'));
    assert.equal(taskRuns.length, 1, 'must only run agy once for the task, no retry');
    assert.ok(!calls.some((args) => args.includes('gemini-3.7-flash-low')), 'must not silently fall back to 3.7');
  });

  test('background job (implement) fails clearly on catalog without 3.8 Flash, recommending same-effort 3.7-flash-high', async () => {
    const sb = sandbox('unsupported-implement');
    const started = run(sb, ['implement', '--prompt', 'a task'], {
      FAKE_AGY_STATUS: 'ERROR',
      FAKE_AGY_RESPONSE: '',
      FAKE_AGY_ERROR: 'model gemini-3.8-flash-high is not recognized as a known model',
      FAKE_AGY_MODELS_OUTPUT: CATALOG_WITHOUT_38,
    });
    assert.equal(started.code, 0, started.stderr);
    const id = jobIdOf(started.stdout);
    assert.equal(await waitForJob(sb, id), 'error');

    const res = run(sb, ['result', id]);
    assert.match(res.stdout, /requested model "gemini-3\.8-flash-high"/);
    assert.match(res.stdout, /Available models \(from `agy models`\):/);
    assert.match(res.stdout, /gemini-3\.7-flash-high/);
    assert.match(res.stdout, /Best same-effort compatible recommendation: --model gemini-3\.7-flash-high/);
    assert.match(res.stdout, /Updating agy is preferred to use the latest default/);

    // Verify wait exit code 3
    const w = run(sb, ['wait', id]);
    assert.equal(w.code, 3);
    assert.match(w.stdout, /Best same-effort compatible recommendation: --model gemini-3\.7-flash-high/);

    // No automatic retry or silent fallback in background execution
    const calls = agyCalls(sb);
    const taskRuns = calls.filter((args) => args.includes('-p'));
    assert.equal(taskRuns.length, 1, 'worker must not automatically retry with another model');
    assert.ok(!calls.some((args) => args.includes('gemini-3.7-flash-high')), 'must not silently fall back to 3.7');
  });

  test('background job (staffer) recommends medium effort gemini-3.7-flash-medium on catalog without 3.8 Flash', async () => {
    const sb = sandbox('unsupported-staffer');
    const started = run(sb, ['staffer', '--prompt', 'a general task'], {
      FAKE_AGY_STATUS: 'ERROR',
      FAKE_AGY_RESPONSE: '',
      FAKE_AGY_ERROR: 'unknown model: gemini-3.8-flash-medium',
      FAKE_AGY_MODELS_OUTPUT: CATALOG_WITHOUT_38,
    });
    assert.equal(started.code, 0, started.stderr);
    const id = jobIdOf(started.stdout);
    assert.equal(await waitForJob(sb, id), 'error');

    const res = run(sb, ['result', id]);
    assert.match(res.stdout, /requested model "gemini-3\.8-flash-medium"/);
    assert.match(res.stdout, /Best same-effort compatible recommendation: --model gemini-3\.7-flash-medium/);
  });

  test('preserves original error and advises running agy models when model discovery fails', () => {
    const sb = sandbox('unsupported-discovery-fail');
    const r = run(sb, ['ask', '--prompt', 'hello'], {
      FAKE_AGY_STATUS: 'ERROR',
      FAKE_AGY_RESPONSE: '',
      FAKE_AGY_ERROR: 'model gemini-3.8-flash-low is not recognized as a known model',
      FAKE_AGY_MODELS_ERROR: 'daemon disconnected: unable to reach model service',
    });
    assert.notEqual(r.code, 0);
    // Original error preserved
    assert.match(r.stderr, /model gemini-3\.8-flash-low is not recognized as a known model/);
    assert.match(r.stderr, /daemon disconnected/);
    // Advise running agy models and updating agy
    assert.match(r.stderr, /run `agy models`/i);
    assert.match(r.stderr, /Updating agy is preferred/);
  });

  test('does not misclassify auth, quota, network, or unrelated errors', () => {
    const sb = sandbox('no-misclassify');

    // Auth error
    const rAuth = run(sb, ['ask', '--prompt', 'hello'], {
      FAKE_AGY_STATUS: 'ERROR',
      FAKE_AGY_RESPONSE: '',
      FAKE_AGY_ERROR: '401 Unauthorized: Invalid credentials',
    });
    assert.notEqual(rAuth.code, 0);
    assert.match(rAuth.stderr, /expired auth/);
    assert.doesNotMatch(rAuth.stderr, /Best same-effort compatible recommendation/);
    assert.doesNotMatch(rAuth.stderr, /Available models/);

    // Quota error
    const rQuota = run(sb, ['ask', '--prompt', 'hello'], {
      FAKE_AGY_STATUS: 'ERROR',
      FAKE_AGY_RESPONSE: '',
      FAKE_AGY_ERROR: '429 ResourceExhausted: Quota exceeded for project',
    });
    assert.notEqual(rQuota.code, 0);
    assert.match(rQuota.stderr, /exhausted quota/);
    assert.doesNotMatch(rQuota.stderr, /Best same-effort compatible recommendation/);

    // Unrelated error
    const rUnrelated = run(sb, ['ask', '--prompt', 'hello'], {
      FAKE_AGY_STATUS: 'ERROR',
      FAKE_AGY_RESPONSE: '',
      FAKE_AGY_STDERR: 'fatal error: memory allocation failed in subshell',
    });
    assert.notEqual(rUnrelated.code, 0);
    assert.doesNotMatch(rUnrelated.stderr, /Best same-effort compatible recommendation/);
    assert.doesNotMatch(rUnrelated.stderr, /Available models/);
  });
});
