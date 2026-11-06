import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { sandbox, run, jobIdOf, agyCalls, promptOf } from './helpers.mjs';

const argon = 'gemini-4-argon-medium';

// Exercise the public job lifecycle and inspect what the worker actually sent to AGY.
function complete(sb, args) {
  const started = run(sb, args);
  assert.equal(started.code, 0, started.stderr);
  const id = jobIdOf(started.stdout);
  assert.match(id, /^staffer-/);
  const waited = run(sb, ['wait', id]);
  assert.equal(waited.code, 0, waited.stdout + waited.stderr);
  assert.match(waited.stdout, /fake answer/);
  return { id, argv: agyCalls(sb).at(-1) };
}

function checkFreshBrain({ argv }, model, task) {
  assert.equal(argv[argv.indexOf('--model') + 1], model);
  assert.ok(!argv.includes('--conversation'), 'restart must not reuse conversation history');
  const prompt = promptOf(argv);
  assert.match(prompt, /external reasoning lead/i);
  assert.ok(prompt.includes(task));
  assert.doesNotMatch(prompt, /Do not hand it to another agent/);
}

test('brain uses staffer policy, and both initial and follow-up restarts restore the brain instructions', () => {
  const sb = sandbox('brain-recovery');
  const setup = run(sb, ['setup', '--restrict', 'staffer']);
  assert.equal(setup.code, 0, setup.stderr);
  const first = complete(sb, ['staffer', '--brain', '--prompt', 'Propose a route']);
  checkFreshBrain(first, argon, 'Propose a route');
  assert.ok(!first.argv.includes('--dangerously-skip-permissions'));

  const next = complete(sb, ['continue', '--job', first.id, '--prompt', 'Reconsider the route']);
  assert.equal(next.argv[next.argv.indexOf('--conversation') + 1], 'conv-1');
  assert.equal(next.argv[next.argv.indexOf('--model') + 1], argon);
  assert.match(promptOf(next.argv), /Reconsider the route/);

  const restarted = complete(sb, ['restart', next.id]);
  checkFreshBrain(restarted, argon, 'Reconsider the route');
  assert.ok(!restarted.argv.includes('--dangerously-skip-permissions'));
  checkFreshBrain(complete(sb, ['restart', first.id]), argon, 'Propose a route');
});

test('explicit models override the brain default, but using Argon alone does not select brain', () => {
  const sb = sandbox('brain-overrides');
  const first = complete(sb, ['staffer', '--brain', '--model', 'flash', '--effort', 'low', '--prompt', 'Compare routes']);
  checkFreshBrain(first, 'gemini-3.8-flash-low', 'Compare routes');
  const next = complete(sb, ['continue', '--job', first.id, '--prompt', 'Check the cost']);
  assert.equal(next.argv[next.argv.indexOf('--model') + 1], 'gemini-3.8-flash-low');
  const plain = complete(sb, ['staffer', '--model', argon, '--prompt', 'Compare routes']);
  assert.match(promptOf(plain.argv), /Do not hand it to another agent/);
  assert.doesNotMatch(promptOf(plain.argv), /external reasoning lead/i);
});

test('brain rejects effort alone, including on an inherited follow-up', () => {
  const sb = sandbox('brain-effort');
  const first = complete(sb, ['staffer', '--brain', '--prompt', 'Assess the plan']);
  for (const command of [['staffer', '--brain'], ['continue', '--job', first.id]]) {
    const result = run(sb, [...command, '--effort', 'low', '--prompt', 'Invalid request']);
    assert.equal(result.code, 1);
    assert.match(result.stderr, /--effort.*requires --model/);
  }
  const restart = run(sb, ['restart', first.id, '--effort', 'low']);
  assert.equal(restart.code, 1);
  assert.match(restart.stderr, /restart uses the recorded brain model; omit --model and --effort/);
  assert.equal(agyCalls(sb).length, 1);
  assert.equal(JSON.parse(fs.readFileSync(path.join(sb.repo, '.agy-staff/state.json'))).jobs.length, 1);
});

test('brain is only a staffer launch flag, and an empty task never dispatches', () => {
  const sb = sandbox('brain-invalid');
  for (const cmd of ['ask', 'review', 'implement', 'research', 'continue', 'restart', 'setup', 'status', 'observe', 'wait', 'result', 'cancel']) {
    const result = run(sb, [cmd, '--brain']);
    assert.equal(result.code, 1);
    assert.match(result.stderr, /--brain is only valid with `staffer`/);
  }
  for (const args of [['--brain'], ['--brain', '--stdin'], ['--prompt', '   ']]) {
    const result = run(sb, ['staffer', ...args], {}, { input: '' });
    assert.equal(result.code, 1);
    assert.match(result.stderr, /staffer needs a task description/);
  }
  assert.equal(agyCalls(sb).length, 0);
  assert.ok(!fs.existsSync(path.join(sb.repo, '.agy-staff/state.json')));
});
