/**
 * Speed probe: the measurement is deterministic (injected clock), the command
 * reports facts only, writes no state, and never grants more than ask does.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createSpeedMeter, formatSpeed, SPEED_PROMPT } from '../companion/speed.mjs';
import { sandbox, run, agyCalls, promptOf } from './helpers.mjs';

/** Feed a scripted timeline [ms, event] into a meter with a fake clock. */
function measure(timeline, { spawnAt = 0 } = {}) {
  let clock = spawnAt;
  const meter = createSpeedMeter(() => clock);
  meter.start();
  for (const [at, event] of timeline) { clock = at; meter.accept(event); }
  return meter.report();
}
const init = { event: 'init', init: { model: 'm' } };
const delta = (text = 'word ') => ({ event: 'step_update', step_update: { step_index: 1, state: 'ACTIVE', step_type: 'agent_response', text_delta: text } });
const result = (output_tokens, status = 'SUCCESS') => ({ event: 'result', result: { status, usage: { output_tokens } } });

describe('speed meter', () => {
  test('separates start-up, first text, streaming and total, and derives tokens per second', () => {
    const report = measure([[7000, init], [11000, delta()], [12000, delta()], [15000, delta()], [15100, result(300)]]);
    assert.equal(report.startup, 7);
    assert.equal(report.ttft, 4);
    assert.equal(report.stream, 4);
    assert.equal(report.total, 15.1);
    assert.equal(report.outputTokens, 300);
    assert.equal(report.tokensPerSecond, 75);
  });

  test('ignores steps that are not answer text', () => {
    const tool = { event: 'step_update', step_update: { step_index: 0, state: 'ACTIVE', step_type: 'tool', text_delta: 'x' } };
    const empty = delta('');
    const report = measure([[1000, init], [2000, tool], [2500, empty], [3000, delta()], [5000, delta()], [5100, result(200)]]);
    assert.equal(report.ttft, 2);
    assert.equal(report.stream, 2);
    assert.equal(report.tokensPerSecond, 100);
  });

  test('reports no rate when the answer is too short or arrived in one burst', () => {
    assert.equal(measure([[100, init], [200, delta()], [1500, delta()], [1600, result(10)]]).tokensPerSecond, null);
    assert.equal(measure([[100, init], [200, delta()], [300, delta()], [400, result(500)]]).tokensPerSecond, null);
    assert.equal(measure([[100, init], [200, delta()], [1500, delta()]]).tokensPerSecond, null);
  });

  test('a fast answer that streams in about half a second is still measurable', () => {
    const report = measure([[100, init], [200, delta()], [800, delta()], [900, result(100)]]);
    assert.equal(Math.round(report.tokensPerSecond), 167);
  });

  test('formatSpeed prints one bounded line of facts and no verdict', () => {
    const line = formatSpeed(measure([[7000, init], [11000, delta()], [15000, delta()], [15100, result(300)]]), 'gemini-3.8-flash-low');
    assert.match(line, /^\[agy-staff speed\] model=gemini-3\.8-flash-low samples=1 tokens_per_second=75 ttft=4\.0s startup=7\.0s stream=4\.0s output_tokens=300 total=15\.1s$/);
    assert.doesNotMatch(line, /slow|fast|too/i);
    const short = formatSpeed(measure([[100, init], [200, delta()], [300, delta()], [400, result(500)]]), 'm');
    assert.match(short, /tokens_per_second=n\/a \(needs >=50 output tokens over >=0\.5s of streaming\)/);
  });
});

describe('speed command', () => {
  const deltas = JSON.stringify({ count: 12, interval_ms: 120, first_delay_ms: 200 });

  test('measures a streamed answer and prints one line on stdout', () => {
    const sb = sandbox('speed');
    const r = run(sb, ['speed'], { FAKE_AGY_DELTAS: deltas, FAKE_AGY_OUTPUT_TOKENS: '300' });
    assert.equal(r.code, 0, r.stderr);
    assert.equal(r.stdout.trim().split('\n').length, 1);
    assert.match(r.stdout, /^\[agy-staff speed\] model=gemini-3\.8-flash-low samples=1 tokens_per_second=\d+ ttft=\d+\.\ds startup=\d+\.\ds stream=\d+\.\ds output_tokens=300 total=\d+\.\ds\n$/);
    const ttft = Number(/ttft=([\d.]+)s/.exec(r.stdout)[1]);
    assert.ok(ttft >= 0.1, `ttft ${ttft} should include the 200ms first-text delay`);
  });

  test('sends the fixed probe prompt, streaming, restricted and without conversation', () => {
    const sb = sandbox('speed-argv');
    const r = run(sb, ['speed'], { FAKE_AGY_DELTAS: deltas });
    assert.equal(r.code, 0, r.stderr);
    const [argv] = agyCalls(sb);
    assert.equal(promptOf(argv), SPEED_PROMPT);
    assert.equal(argv[argv.indexOf('--output-format') + 1], 'stream-json');
    assert.equal(argv[argv.indexOf('--model') + 1], 'gemini-3.8-flash-low');
    assert.ok(!argv.includes('--dangerously-skip-permissions'));
    assert.ok(!argv.includes('--conversation'));
  });

  test('does not touch job or conversation state', () => {
    const sb = sandbox('speed-state');
    const r = run(sb, ['speed'], { FAKE_AGY_DELTAS: deltas });
    assert.equal(r.code, 0, r.stderr);
    assert.equal(fs.existsSync(path.join(sb.repo, '.agy-staff')), false);
  });

  test('honors --model and --effort like ask', () => {
    const sb = sandbox('speed-model');
    assert.equal(run(sb, ['speed', '--effort', 'high']).code, 0);
    assert.equal(run(sb, ['speed', '--model', 'pro', '--effort', 'low']).code, 0);
    const models = agyCalls(sb).map((argv) => argv[argv.indexOf('--model') + 1]);
    assert.deepEqual(models, ['gemini-3.8-flash-high', 'gemini-3.1-pro-low']);
  });

  test('reports an unmeasurable rate instead of inventing one for a short answer', () => {
    const sb = sandbox('speed-short');
    const r = run(sb, ['speed']);
    assert.equal(r.code, 0, r.stderr);
    assert.match(r.stdout, /tokens_per_second=n\/a/);
  });

  test('rejects task and mode flags: the probe prompt is fixed', () => {
    const sb = sandbox('speed-flags');
    for (const args of [['--prompt', 'hi'], ['--restricted'], ['--continue'], ['extra']]) {
      const r = run(sb, ['speed', ...args]);
      assert.equal(r.code, 1, args.join(' '));
      assert.match(r.stderr, /speed takes only --model, --effort and --timeout/);
    }
    assert.equal(agyCalls(sb).length, 0);
  });

  test('an agy error is reported with its message and exit 1', () => {
    const sb = sandbox('speed-error');
    const r = run(sb, ['speed'], { FAKE_AGY_STATUS: 'ERROR', FAKE_AGY_ERROR: 'quota exhausted' });
    assert.equal(r.code, 1);
    assert.match(r.stderr, /speed probe \(status ERROR\)/);
    assert.match(r.stderr, /quota exhausted/);
  });

  test('no result within the timeout is a failure that carries the facts so far', () => {
    const sb = sandbox('speed-timeout');
    const r = run(sb, ['speed', '--timeout', '1s'], { FAKE_AGY_DELTAS: JSON.stringify({ count: 1, first_delay_ms: 100 }), FAKE_AGY_SLEEP_MS: '6000' });
    assert.equal(r.code, 1);
    assert.match(r.stderr, /no result within 1s/);
    assert.match(r.stderr, /\[agy-staff speed\].*ttft=\d/);
  });

  test('a launch crash before any result explains itself and hints at sandboxes', () => {
    const sb = sandbox('speed-crash');
    const r = run(sb, ['speed'], { FAKE_AGY_NO_JSON: '1', FAKE_AGY_STDERR: 'operation not permitted' });
    assert.equal(r.code, 1);
    assert.match(r.stderr, /did not return a parseable result/);
    assert.match(r.stderr, /unsandboxed/);
  });
});
