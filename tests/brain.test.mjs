import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { sandbox, run, jobIdOf, agyCalls, promptOf, jobLog } from './helpers.mjs';

const carbon = 'gemini-4-carbon-medium';
const argon = 'gemini-4-argon-medium';
const hydrogen = 'gemini-4-hydrogen-medium';

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

  const explicitHydrogenBrain = complete(sb, ['staffer', '--brain', '--model', 'hydrogen', '--effort', 'xhigh', '--prompt', 'Hydrogen route']);
  checkFreshBrain(explicitHydrogenBrain, 'gemini-4-hydrogen-xhigh', 'Hydrogen route');

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

test('automatic 3-step fallback steps Carbon -> Argon -> Hydrogen when both Carbon and Argon fail', () => {
  const sb = sandbox('brain-fallback-hydrogen');
  const env = {
    FAKE_AGY_FAIL_MODELS: `${carbon}:quota,${argon}:unsupported`,
  };
  const first = complete(sb, ['staffer', '--brain', '--prompt', 'Three step fallback'], env);

  const calls = agyCalls(sb);
  assert.equal(calls.length, 3);
  assert.deepEqual(
    calls.map((c) => c[c.indexOf('--model') + 1]),
    [carbon, argon, hydrogen]
  );

  const state = readState(sb);
  const jobRecord = state.jobs.find((j) => j.id === first.id);
  assert.equal(jobRecord.model, hydrogen);
  assert.equal(jobRecord.fallback_from, carbon);
  assert.equal(jobRecord.conversation_id, 'conv-1');

  const log = jobLog(sb, first.id);
  assert.match(log, /brain model fallback: gemini-4-carbon-medium -> gemini-4-argon-medium/);
  assert.match(log, /brain model fallback: gemini-4-argon-medium -> gemini-4-hydrogen-medium/);
});

test('explicit --model carbon, --model argon, or --model hydrogen on staffer --brain never falls back on error', () => {
  for (const [alias, fullId] of [['carbon', carbon], ['argon', argon], ['hydrogen', hydrogen]]) {
    const sb = sandbox(`brain-explicit-no-fallback-${alias}`);
    const env = { FAKE_AGY_FAIL_MODELS: `${fullId}:quota` };
    const started = run(sb, ['staffer', '--brain', '--model', alias, '--prompt', 'Explicit model'], env);
    assert.equal(started.code, 0, started.stderr);
    const id = jobIdOf(started.stdout);

    const waited = run(sb, ['wait', id], env);
    assert.equal(waited.code, 3, 'explicit model quota error must fail with exit 3');
    assert.equal(agyCalls(sb).length, 1, 'explicit model must never fall back');
    assert.equal(agyCalls(sb)[0][agyCalls(sb)[0].indexOf('--model') + 1], fullId);
  }
});

test('non-model errors (sandbox EPERM, UNAUTHENTICATED, generic 403 workspace/token, and context-window INVALID_ARGUMENT) fail immediately without fallback', () => {
  for (const kind of ['sandbox', 'auth', '403_workspace', 'token_revoked', 'context_window']) {
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

test('restart after Carbon -> Argon fallback starts directly on Argon, while full chain exhaustion preserves Carbon as job.model', () => {
  const sb = sandbox('brain-restart-after-fallback');
  const env = { FAKE_AGY_FAIL_MODELS: `${carbon}:quota` };
  const first = complete(sb, ['staffer', '--brain', '--prompt', 'Design schema'], env);
  assert.equal(agyCalls(sb).length, 2);

  // Restarting `first.id` must start directly on the recorded winning model (`argon`),
  // never calling dead Carbon again, while still retaining Argon -> Hydrogen fallback tail.
  const restarted = complete(sb, ['restart', first.id], env);
  assert.equal(agyCalls(sb).length, 3, 'restart after fallback must invoke Argon directly without calling Carbon');
  checkFreshBrain(restarted, argon, 'Design schema');

  // If Argon ALSO runs out of quota on a subsequent restart of `restarted.id`, its
  // preserved tail `['gemini-4-argon-medium', 'gemini-4-hydrogen-medium']` steps down to Hydrogen.
  const envBothDown = { FAKE_AGY_FAIL_MODELS: `${carbon}:quota,${argon}:quota` };
  const restartedToHydrogen = complete(sb, ['restart', restarted.id], envBothDown);
  assert.equal(agyCalls(sb).length, 5);
  assert.equal(restartedToHydrogen.argv[restartedToHydrogen.argv.indexOf('--model') + 1], hydrogen);

  // When ALL candidates in the fallback chain fail on quota/unsupported, job.model
  // stays restored to `carbon` (no stale `hydrogen` mutation) and restart retries from `carbon`.
  const sbAllFail = sandbox('brain-all-candidates-fail');
  const allFailEnv = { FAKE_AGY_FAIL_MODELS: `${carbon}:quota,${argon}:quota,${hydrogen}:quota` };
  const startedFail = run(sbAllFail, ['staffer', '--brain', '--prompt', 'All exhausted'], allFailEnv);
  assert.equal(startedFail.code, 0, startedFail.stderr);
  const failId = jobIdOf(startedFail.stdout);
  const waitedFail = run(sbAllFail, ['wait', failId], allFailEnv);
  assert.equal(waitedFail.code, 3);
  assert.equal(agyCalls(sbAllFail).length, 3);

  const failedJob = readState(sbAllFail).jobs.find((j) => j.id === failId);
  assert.equal(failedJob.model, carbon, 'exhausted chain must restore requested model (carbon)');
  assert.equal(failedJob.fallback_from, undefined);
  assert.deepEqual(failedJob.attempted_models, [carbon, argon, hydrogen]);

  // Once Carbon quota recovers, restarting `failId` starts on Carbon!
  const recovered = complete(sbAllFail, ['restart', failId]);
  checkFreshBrain(recovered, carbon, 'All exhausted');
});

test('mid-stream tool or text progress before a 429 error blocks fallback and preserves raw events', () => {
  for (const [label, stepEvent] of [
    [
      'tool',
      {
        event: 'step_update',
        step_update: {
          step_index: 1,
          step_type: 'tool',
          state: 'DONE',
          tool_name: 'read_file',
          tool_info: { parameters: { Path: 'README.md' }, output: 'ok' },
        },
      },
    ],
    [
      'text',
      {
        event: 'step_update',
        step_update: {
          step_index: 1,
          step_type: 'agent_response',
          state: 'ACTIVE',
          text_delta: 'Partial proposal draft before rate limit...',
        },
      },
    ],
  ]) {
    const sb = sandbox(`brain-midstream-progress-${label}`);
    const env = {
      FAKE_AGY_FAIL_MODELS: `${carbon}:quota`,
      FAKE_AGY_EVENTS: JSON.stringify([stepEvent]),
    };
    const started = run(sb, ['staffer', '--brain', '--prompt', 'Mid-stream 429'], env);
    assert.equal(started.code, 0, started.stderr);
    const id = jobIdOf(started.stdout);

    const waited = run(sb, ['wait', id], env);
    assert.equal(waited.code, 3, `mid-stream ${label} progress followed by 429 must fail with exit 3`);
    const calls = agyCalls(sb);
    assert.equal(calls.length, 1, `mid-stream ${label} progress must NOT fall back to Argon`);
    assert.equal(calls[0][calls[0].indexOf('--model') + 1], carbon);

    const jobRecord = readState(sb).jobs.find((j) => j.id === id);
    assert.equal(jobRecord.model, carbon);
    assert.ok(fs.existsSync(jobRecord.events_file), 'events_file must remain preserved on mid-stream failure');
    assert.ok(fs.readFileSync(jobRecord.events_file, 'utf8').length > 0, 'events_file must not be wiped');
  }
});

test('Pro-account Carbon gating (agy 1.5.4 unlisted model, Ultra 403/FAILED_PRECONDITION, UUID digit substrings) falls back to Argon and caches unavailability without caching 429', () => {
  for (const kind of ['pro_unlisted', 'ultra_only_403', 'ultra_precondition', 'unsupported_uuid_digits']) {
    const sb = sandbox(`brain-pro-tier-${kind}`);
    const env = { FAKE_AGY_FAIL_MODELS: `${carbon}:${kind}` };

    // 1st brain call: optimistically tries Carbon, steps down to Argon, and caches Carbon unavailability.
    const first = complete(sb, ['staffer', '--brain', '--prompt', 'First Pro brain run'], env);
    assert.equal(agyCalls(sb).length, 2, `1st run for ${kind} should try Carbon then Argon`);
    assert.equal(agyCalls(sb)[0][agyCalls(sb)[0].indexOf('--model') + 1], carbon);
    assert.equal(agyCalls(sb)[1][agyCalls(sb)[1].indexOf('--model') + 1], argon);
    assert.equal(readState(sb).jobs.find((j) => j.id === first.id).model, argon);

    // 2nd independent brain call in the same HOME: warm negative cache skips Carbon immediately at dispatch!
    const secondStart = run(sb, ['staffer', '--brain', '--prompt', 'Second Pro brain run'], env);
    assert.equal(secondStart.code, 0, secondStart.stderr);
    assert.match(secondStart.stdout, /model:\s+gemini-4-argon-medium/, 'dispatch stdout must report Argon immediately when Carbon is cached unavailable');
    const secondId = jobIdOf(secondStart.stdout);
    const secondWait = run(sb, ['wait', secondId], env);
    assert.equal(secondWait.code, 0, secondWait.stdout + secondWait.stderr);
    assert.equal(agyCalls(sb).length, 3, `2nd run for ${kind} must spawn only Argon (0 wasted Carbon spawns)`);
    assert.equal(agyCalls(sb)[2][agyCalls(sb)[2].indexOf('--model') + 1], argon);

    // If user upgrades to Ultra and explicitly runs `--model carbon`, it bypasses and clears the negative cache!
    const upgraded = complete(sb, ['staffer', '--brain', '--model', 'carbon', '--prompt', 'Explicit Carbon after Ultra upgrade']);
    assert.equal(upgraded.argv[upgraded.argv.indexOf('--model') + 1], carbon);

    const third = complete(sb, ['staffer', '--brain', '--prompt', 'Third brain run after Ultra upgrade']);
    assert.equal(third.argv[third.argv.indexOf('--model') + 1], carbon, 'successful Carbon run must clear negative cache');
  }

  // Transient 429 quota exhaustion is NEVER cached: next fresh brain job tries Carbon again!
  const sbQuota = sandbox('brain-quota-never-cached');
  const quotaEnv = { FAKE_AGY_FAIL_MODELS: `${carbon}:quota` };
  complete(sbQuota, ['staffer', '--brain', '--prompt', 'Quota hit run 1'], quotaEnv);
  assert.equal(agyCalls(sbQuota).length, 2);
  const afterQuotaRecovery = complete(sbQuota, ['staffer', '--brain', '--prompt', 'Quota recovered run 2']);
  assert.equal(afterQuotaRecovery.argv[afterQuotaRecovery.argv.indexOf('--model') + 1], carbon, '429 quota fallback must never cache Carbon as unavailable');

  // Available models list in agy error skips missing Argon directly to Hydrogen in 2 calls instead of 3!
  const sbHydrogenOnly = sandbox('brain-available-models-skip');
  const hydrogenOnlyEnv = { FAKE_AGY_FAIL_MODELS: `${carbon}:hydrogen_only_unlisted,${argon}:hydrogen_only_unlisted` };
  const skipped = complete(sbHydrogenOnly, ['staffer', '--brain', '--prompt', 'Direct skip to Hydrogen'], hydrogenOnlyEnv);
  assert.equal(agyCalls(sbHydrogenOnly).length, 2, 'Available models parser should jump directly Carbon -> Hydrogen');
  assert.deepEqual(
    agyCalls(sbHydrogenOnly).map((c) => c[c.indexOf('--model') + 1]),
    [carbon, hydrogen]
  );
  assert.equal(readState(sbHydrogenOnly).jobs.find((j) => j.id === skipped.id).model, hydrogen);
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
