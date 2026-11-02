/**
 * Worker templates: every tool-using persona carries the shared working rules.
 * The worker does its assignment itself, reports confirmed conflicts with the
 * brief, and opens its final message with a status line (bench v1 findings).
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { sandbox, run, jobIdOf, waitForJob, waitForCalls, promptOf } from './helpers.mjs';

async function renderedPrompt(mode) {
  const sb = sandbox(`template-${mode}`);
  const r = run(sb, [mode, '--prompt', 'do the thing']);
  assert.equal(r.code, 0, r.stderr);
  await waitForJob(sb, jobIdOf(r.stdout));
  const [argv] = await waitForCalls(sb, 1);
  return promptOf(argv);
}

describe('worker templates: shared working rules', () => {
  for (const mode of ['staffer', 'research', 'implement']) {
    test(`${mode}: no further delegation, conflict reporting and a status line`, async () => {
      const prompt = await renderedPrompt(mode);
      assert.match(prompt, /Do not hand it to another agent or start agy-staff jobs/);
      assert.match(prompt, /## Conflicts with the task/);
      assert.match(prompt, /Status: DONE_WITH_CONCERNS/);
    });
  }

  test('review: no further delegation, without the implementation status contract', async () => {
    const prompt = await renderedPrompt('review');
    assert.match(prompt, /Do not hand it to another agent or start agy-staff jobs/);
    assert.doesNotMatch(prompt, /Status: DONE/);
  });
});
