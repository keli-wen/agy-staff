import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { sandbox, run, jobIdOf, agyCalls, promptOf, jobLog } from './helpers.mjs';

const carbon = 'gemini-4-carbon-medium';
const argon = 'gemini-4-argon-medium';
const flash = 'gemini-3.8-flash-medium';

// Exercise the public job lifecycle and inspect what the worker actually sent to AGY.
function complete(sb, args, extraEnv = {}) {
  const started = run(sb, args, extraEnv);
  assert.equal(started.code, 0, started.stderr);
  const id = jobIdOf(started.stdout);
  assert.match(id, /^staffer-/);
  const waited = run(sb, ['wait', id], extraEnv);
  assert.equal(waited.code, 0, waited.stdout + waited.stderr);
  assert.match(waited.stdout, /fake answer/);
  return { id, argv: agyCalls(sb).at(-1) };
}

function readState(sb) {
  return JSON.parse(fs.readFileSync(path.join(sb.repo, '.agy-staff/state.json'), 'utf8'));
}

function checkFreshBrain({ argv }, model, task) {
  assert.equal(argv[argv.indexOf('--model') + 1], model);
  assert.ok(!argv.includes('--conversation'), 'restart must not reuse conversation history');
  const prompt = promptOf(argv);
  assert.match(prompt, /external reasoning lead/i);
  assert.ok(prompt.includes(task));
  assert.doesNotMatch(prompt, /Do not hand it to another agent/);
}

test('brain defaults to gemini-4-carbon-medium, uses staffer policy, and both initial and follow-up restarts restore the brain instructions', () => {
  const sb = sandbox('brain-recovery');
  const setup = run(sb, ['setup', '--restrict', 'staffer']);
  assert.equal(setup.code, 0, setup.stderr);
  const first = complete(sb, ['staffer', '--brain', '--prompt', 'Propose a route']);
  checkFreshBrain(first, carbon, 'Propose a route');
  assert.ok(!first.argv.includes('--dangerously-skip-permissions'));

  const next = complete(sb, ['continue', '--job', first.id, '--prompt', 'Reconsider the route']);
  assert.equal(next.argv[next.argv.indexOf('--conversation') + 1], 'conv-1');
  assert.equal(next.argv[next.argv.indexOf('--model') + 1], carbon);
  assert.match(promptOf(next.argv), /Reconsider the route/);

  const restarted = complete(sb, ['restart', next.id]);
  checkFreshBrain(restarted, carbon, 'Reconsider the route');
  assert.ok(!restarted.argv.includes('--dangerously-skip-permissions'));
  checkFreshBrain(complete(sb, ['restart', first.id]), carbon, 'Propose a route');
});

test('explicit models and aliases override the brain default, and using Carbon or Argon alone does not select brain', () => {
  const sb = sandbox('brain-overrides');
  const first = complete(sb, ['staffer', '--brain', '--model', 'flash', '--effort', 'low', '--prompt', 'Compare routes']);
  checkFreshBrain(first, 'gemini-3.8-flash-low', 'Compare routes');
  const next = complete(sb, ['continue', '--job', first.id, '--prompt', 'Check the cost']);
  assert.equal(next.argv[next.argv.indexOf('--model') + 1], 'gemini-3.8-flash-low');

  const explicitArgonBrain = complete(sb, ['staffer', '--brain', '--model', 'argon', '--effort', 'high', '--prompt', 'Argon route']);
  checkFreshBrain(explicitArgonBrain, 'gemini-4-argon-high', 'Argon route');

  const plainCarbon = complete(sb, ['staffer', '--model', 'carbon', '--prompt', 'Compare routes']);
  assert.equal(plainCarbon.argv[plainCarbon.argv.indexOf('--model') + 1], carbon);
  assert.match(promptOf(plainCarbon.argv), /Do not hand it to another agent/);
  assert.doesNotMatch(promptOf(plainCarbon.argv), /external reasoning lead/i);

  const plainArgon = complete(sb, ['staffer', '--model', argon, '--prompt', 'Compare routes']);
  assert.match(promptOf(plainArgon.argv), /Do not hand it to another agent/);
  assert.doesNotMatch(promptOf(plainArgon.argv), /external reasoning lead/i);
});

test('automatic fallback steps Carbon -> Argon on unsupported model or RESOURCE_EXHAUSTED, records fallback_from, and continues on Argon', () => {
  for (const failureKind of ['unsupported', 'quota', 'entitlement']) {
    const sb = sandbox(`brain-fallback-argon-${failureKind}`);
    const env = { FAKE_AGY_FAIL_MODELS: `${carbon}:${failureKind}` };
    const first = complete(sb, ['staffer', '--brain', '--prompt', 'Frame the design'], env);

    const calls = agyCalls(sb);
    assert.equal(calls.length, 2, `expected Carbon then Argon call, got ${calls.length}`);
    assert.equal(calls[0][calls[0].indexOf('--model') + 1], carbon);
    assert.equal(calls[1][calls[1].indexOf('--model') + 1], argon);
    assert.ok(!calls[1].includes('--conversation'), 'fallback retry must not reuse dead turn-1 conversation id');

    const state = readState(sb);
    const jobRecord = state.jobs.find((j) => j.id === first.id);
    assert.equal(jobRecord.model, argon);
    assert.equal(jobRecord.fallback_from, carbon);
    assert.equal(jobRecord.conversation_id, 'conv-1');

    const log = jobLog(sb, first.id);
    assert.match(log, /\[agy-staff\] brain model fallback: gemini-4-carbon-medium -> gemini-4-argon-medium/);

    const followup = complete(sb, ['continue', '--job', first.id, '--prompt', 'Refine the design'], env);
    assert.equal(agyCalls(sb).length, 3, 'continuation must go straight to Argon without retrying Carbon');
    assert.equal(followup.argv[followup.argv.indexOf('--model') + 1], argon);
    assert.equal(followup.argv[followup.argv.indexOf('--conversation') + 1], 'conv-1');
  }
});

test('automatic 3-step fallback steps Carbon -> Argon -> Flash when both Carbon and Argon fail', () => {
  const sb = sandbox('brain-fallback-flash');
  const env = {
    FAKE_AGY_FAIL_MODELS: `${carbon}:quota,${argon}:unsupported`,
  };
  const first = complete(sb, ['staffer', '--brain', '--prompt', 'Three step fallback'], env);

  const calls = agyCalls(sb);
  assert.equal(calls.length, 3);
  assert.deepEqual(
    calls.map((c) => c[c.indexOf('--model') + 1]),
    [carbon, argon, flash]
  );

  const state = readState(sb);
  const jobRecord = state.jobs.find((j) => j.id === first.id);
  assert.equal(jobRecord.model, flash);
  assert.equal(jobRecord.fallback_from, carbon);
  assert.equal(jobRecord.conversation_id, 'conv-1');

  const log = jobLog(sb, first.id);
  assert.match(log, /brain model fallback: gemini-4-carbon-medium -> gemini-4-argon-medium/);
  assert.match(log, /brain model fallback: gemini-4-argon-medium -> gemini-3\.8-flash-medium/);
});

test('explicit --model carbon or --model argon on staffer --brain never falls back on error', () => {
  for (const [alias, fullId] of [['carbon', carbon], ['argon', argon]]) {
    const sb = sandbox(`brain-explicit-no-fallback-${alias}`);
    const env = { FAKE_AGY_FAIL_MODELS: `${fullId}:quota` };
    const started = run(sb, ['staffer', '--brain', '--model', alias, '--prompt', 'Explicit model'], env);
    assert.equal(started.code, 0, started.stderr);
    const id = jobIdOf(started.stdout);

    const waited = run(sb, ['wait', id], env);
    assert.equal(waited.code, 3, 'explicit model quota error must fail with exit 3');
    assert.equal(agyCalls(sb).length, 1, 'explicit model must never retry Argon or Flash');
    assert.equal(agyCalls(sb)[0][agyCalls(sb)[0].indexOf('--model') + 1], fullId);
  }
});

test('non-model errors (sandbox EPERM and UNAUTHENTICATED) on implicit brain fail immediately without retrying Argon or Flash', () => {
  for (const kind of ['sandbox', 'auth']) {
    const sb = sandbox(`brain-non-model-err-${kind}`);
    const env = { FAKE_AGY_FAIL_MODELS: `${carbon}:${kind}` };
    const started = run(sb, ['staffer', '--brain', '--prompt', 'Check non-model error'], env);
    assert.equal(started.code, 0, started.stderr);
    const id = jobIdOf(started.stdout);

    const waited = run(sb, ['wait', id], env);
    assert.equal(waited.code, 3, `expected exit 3 for ${kind}, got ${waited.code}`);
    const calls = agyCalls(sb);
    assert.equal(calls.length, 1, `${kind} failure must fail immediately on Carbon without fallback`);
    assert.equal(calls[0][calls[0].indexOf('--model') + 1], carbon);
  }
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
