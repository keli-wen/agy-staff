/**
 * Regression tests for the state-file robustness fixes layered on 0.2.0:
 *  - loadState no longer silently resets a corrupt state.json (which every
 *    caller would then persist, wiping all job records and conversation ids)
 *  - background jobs are registered in state.json before the worker spawns,
 *    so an instant worker cannot clobber the record
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { sandbox, run, waitForJob, jobIdOf } from './helpers.mjs';

test('corrupt state.json makes commands die instead of wiping state', () => {
  const sb = sandbox('corrupt-state');
  const dir = path.join(sb.repo, '.agy-staff');
  fs.mkdirSync(dir, { recursive: true });
  const stateFile = path.join(dir, 'state.json');
  const truncated = '{"conversations":{"research":"conv-9"},"jobs":[{"id":"resea';
  fs.writeFileSync(stateFile, truncated);

  const r = run(sb, ['status']);
  assert.notEqual(r.code, 0);
  assert.match(r.stderr, /state file is corrupt/);
  assert.equal(fs.readFileSync(stateFile, 'utf8'), truncated, 'file must be left untouched');
});

test('background job survives an instant worker (registered before spawn)', async () => {
  const sb = sandbox('instant-worker');
  // No latency floor: with post-spawn registration this made the job record
  // vanish from state.json (~30% of runs); pre-spawn registration must hold.
  const r = run(sb, ['research', '--prompt', 'quick task'], { FAKE_AGY_SLEEP_MS: '0' });
  assert.equal(r.code, 0);
  const id = jobIdOf(r.stdout);
  const status = await waitForJob(sb, id);
  assert.equal(status, 'done');
  const res = run(sb, ['result', id]);
  assert.equal(res.code, 0);
  assert.match(res.stdout, /fake answer|# Job/);
});
