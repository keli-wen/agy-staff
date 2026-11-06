import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { sandbox, run, jobIdOf, agyCalls, waitForCalls, COMPANION, FAKE_AGY } from './helpers.mjs';

const stateFile = sb => path.join(sb.repo, '.agy-staff/state.json');
const state = sb => JSON.parse(fs.readFileSync(stateFile(sb), 'utf8'));
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(predicate) {
  const deadline = Date.now() + 5000;
  while (!predicate() && Date.now() < deadline) await pause(20);
  assert.ok(predicate(), 'test checkpoint not reached');
}
function refused(result, active) {
  assert.equal(result.code, 1, result.stdout + result.stderr);
  assert.ok(result.stderr.includes(`job ${active} is still running (status: running)`), result.stderr);
  assert.match(result.stderr, /not accepted or queued/, result.stderr);
  assert.ok(result.stderr.includes(`wait ${active}`), result.stderr);
  assert.ok(result.stderr.includes(`cancel ${active}`), result.stderr);
  assert.equal(result.stdout, '');
}

test('initializing jobs reject follow-ups before a conversation or PID is available', () => {
  const sb = sandbox('continue-initializing');
  fs.mkdirSync(path.dirname(stateFile(sb)));
  const original = { jobs: [{ id: 'starting', mode: 'staffer', status: 'running', pid: null, conversation_id: null }] };
  fs.writeFileSync(stateFile(sb), JSON.stringify(original));
  refused(run(sb, ['continue', '--job', 'starting', '--prompt', 'next']), 'starting');
  assert.deepEqual(state(sb), original);
  assert.equal(agyCalls(sb).length, 0);
});

test('continue --job rejects an active successor while legacy continuation selectors fail with migration hints and other conversations remain usable', async t => {
  const sb = sandbox('continue-successor');
  const release = path.join(sb.root, 'release');
  t.after(() => { for (const j of state(sb).jobs) run(sb, ['cancel', j.id]); });
  const first = jobIdOf(run(sb, ['research', '--prompt', 'first']).stdout);
  assert.equal(run(sb, ['wait', first]).code, 0);
  const conversation = state(sb).jobs.find(j => j.id === first).conversation_id;
  const active = jobIdOf(run(sb, ['continue', '--job', first, '--prompt', 'active'], { FAKE_AGY_RELEASE_FILE: release }).stdout);
  await waitForCalls(sb, 2);
  const filesBefore = fs.readdirSync(path.join(sb.repo, '.agy-staff/jobs')).sort();
  for (const jobTarget of [first, active]) {
    refused(run(sb, ['continue', '--job', jobTarget, '--prompt', 'must not run']), active);
  }
  const legacyRequests = [
    ['continue', '--conversation', conversation],
    ['continue'],
    ['research', '--continue'],
    ['research', '--job', first],
    ...['staffer', 'research', 'review', 'implement', 'ask'].map(mode => [mode, '--conversation', conversation]),
  ];
  for (const request of legacyRequests) {
    const res = run(sb, [...request, '--prompt', 'must not run']);
    assert.equal(res.code, 1, res.stdout + res.stderr);
    assert.equal(res.stdout, '');
    assert.match(res.stderr, /continue --job/);
  }
  assert.equal(agyCalls(sb).length, 2);
  assert.equal(state(sb).jobs.length, 2);
  assert.deepEqual(fs.readdirSync(path.join(sb.repo, '.agy-staff/jobs')).sort(), filesBefore);
  assert.equal(state(sb).jobs.find(j => j.id === active).cancel_requested_at, undefined);
  const unrelated = jobIdOf(run(sb, ['staffer', '--prompt', 'independent'], { FAKE_AGY_CONVERSATION_ID: 'independent' }).stdout);
  assert.equal(run(sb, ['wait', unrelated]).code, 0);
  fs.writeFileSync(release, 'finish');
  assert.equal(run(sb, ['wait', active]).code, 0);
  const next = jobIdOf(run(sb, ['continue', '--job', first, '--prompt', 'now allowed']).stdout);
  assert.equal(run(sb, ['wait', next]).code, 0);
  assert.equal(state(sb).jobs.find(j => j.id === next).conversation_id, conversation);
});

test('simultaneous follow-ups recheck occupancy inside registration and leave no rejected spec', async t => {
  const sb = sandbox('continue-registration-race');
  const release = path.join(sb.root, 'release');
  const dir = path.join(sb.repo, '.agy-staff');
  const lock = path.join(dir, 'state.json.lock');
  const owner = `owner-${process.pid}-${randomUUID()}`;
  let pending = [];
  t.after(async () => {
    if (fs.existsSync(path.join(lock, owner))) { fs.unlinkSync(path.join(lock, owner)); fs.rmdirSync(lock); }
    await Promise.allSettled(pending);
    fs.writeFileSync(release, 'finish');
    for (const j of state(sb).jobs) run(sb, ['cancel', j.id]);
  });
  const first = jobIdOf(run(sb, ['staffer', '--prompt', 'seed']).stdout);
  assert.equal(run(sb, ['wait', first]).code, 0);
  await until(() => state(sb).jobs[0].status === 'done' && !fs.existsSync(lock));
  fs.mkdirSync(lock); fs.writeFileSync(path.join(lock, owner), '');
  const invoke = () => new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [COMPANION, 'continue', '--job', first, '--prompt', 'contender'], {
      cwd: sb.repo, env: { ...process.env, HOME: sb.home, USERPROFILE: sb.home, AGY_BIN: FAKE_AGY,
        FAKE_AGY_ARGV_FILE: sb.argvFile, FAKE_AGY_RELEASE_FILE: release },
    });
    let stdout = '', stderr = '';
    child.stdout.on('data', c => stdout += c); child.stderr.on('data', c => stderr += c);
    child.on('error', reject); child.on('close', code => resolve({ code, stdout, stderr }));
  });
  pending = [invoke(), invoke()];
  // Both callers have passed the first guard and are waiting for this lock.
  await until(() => fs.readdirSync(dir).filter(n => n.startsWith('state.json.lock.owner-')).length === 2);
  fs.unlinkSync(path.join(lock, owner)); fs.rmdirSync(lock);
  const results = await Promise.all(pending);
  assert.deepEqual(results.map(r => r.code).sort(), [0, 1]);
  const active = jobIdOf(results.find(r => r.code === 0).stdout);
  refused(results.find(r => r.code === 1), active);
  assert.equal(state(sb).jobs.length, 2);
  assert.equal(fs.readdirSync(path.join(dir, 'jobs')).filter(n => n.endsWith('.spec.json')).length, 2);
  await waitForCalls(sb, 2);
  assert.equal(agyCalls(sb).length, 2);
  fs.writeFileSync(release, 'finish');
  assert.equal(run(sb, ['wait', active]).code, 0);
});

test('synchronous ask records a job ID and supports job-ID-only continuation without hijacking default background wait/result', () => {
  const sb = sandbox('ask-job-record');
  const bg = jobIdOf(run(sb, ['research', '--prompt', 'background research'], { FAKE_AGY_CONVERSATION_ID: 'conv-bg' }).stdout);
  assert.equal(run(sb, ['wait', bg]).code, 0);

  const ask1 = run(sb, ['ask', '--model', 'gemini-3.8-flash-medium', '--prompt', 'first question'], {
    FAKE_AGY_CONVERSATION_ID: 'conv-ask',
    FAKE_AGY_RESPONSE: 'first answer',
  });
  assert.equal(ask1.code, 0, ask1.stderr);
  assert.equal(ask1.stdout, 'first answer\n');
  const askJob1 = jobIdOf(ask1.stderr);
  assert.match(askJob1, /^ask-/);
  assert.match(ask1.stderr, new RegExp(`conversation: conv-ask \\(follow up with continue --job ${askJob1}\\)`));

  // Bare wait/result still default to the latest background job, while explicit askJob1 works.
  assert.match(run(sb, ['result']).stdout, new RegExp(`# Job ${bg} \\(research, done\\)`));
  assert.match(run(sb, ['result', askJob1]).stdout, new RegExp(`# Job ${askJob1} \\(ask, done\\)[\\s\\S]*first answer`));

  const ask2 = run(sb, ['continue', '--job', askJob1, '--prompt', 'follow-up question'], {
    FAKE_AGY_CONVERSATION_ID: 'conv-ask',
    FAKE_AGY_RESPONSE: 'second answer',
  });
  assert.equal(ask2.code, 0, ask2.stderr);
  assert.equal(ask2.stdout, 'second answer\n');
  const askJob2 = jobIdOf(ask2.stderr);
  assert.notEqual(askJob2, askJob1);
  const record2 = state(sb).jobs.find(j => j.id === askJob2);
  assert.equal(record2.mode, 'ask');
  assert.equal(record2.parent_job_id, askJob1);
  assert.equal(record2.model, 'gemini-3.8-flash-medium');
  assert.equal(record2.profile, 'restricted');
  assert.equal(record2.conversation_id, 'conv-ask');
});

test('removed continuation flags, bare continue, persona --job, and legacy jobless ask records fail clearly without calling AGY', () => {
  const sb = sandbox('legacy-continuation-migration');
  const jobId = jobIdOf(run(sb, ['staffer', '--prompt', 'initial task'], { FAKE_AGY_CONVERSATION_ID: 'conv-staffer' }).stdout);
  assert.equal(run(sb, ['wait', jobId]).code, 0);
  const callsBefore = agyCalls(sb).length;

  // 1. Persona with --job <id> (cannot switch persona or silently ignore --job)
  const personaJob = run(sb, ['review', '--job', jobId, '--prompt', 'try switching to review']);
  assert.equal(personaJob.code, 1);
  assert.match(personaJob.stderr, /--job cannot be used with `review`: continuation is job-ID-only and inherits the job's original persona/);
  assert.match(personaJob.stderr, new RegExp(`continue --job ${jobId} --prompt`));

  // 2. Persona with --continue
  const personaCont = run(sb, ['staffer', '--continue', '--prompt', 'follow up']);
  assert.equal(personaCont.code, 1);
  assert.match(personaCont.stderr, /--continue was removed: continuation is job-ID-only/);
  assert.match(personaCont.stderr, new RegExp(`continue --job ${jobId} --prompt`));

  // 3. Persona or continue with --conversation <conv>
  for (const cmd of ['staffer', 'continue']) {
    const convFlag = run(sb, [cmd, '--conversation', 'conv-staffer', '--prompt', 'follow up']);
    assert.equal(convFlag.code, 1);
    assert.match(convFlag.stderr, /--conversation was removed: continuation is job-ID-only/);
    assert.match(convFlag.stderr, new RegExp(`Conversation conv-staffer belongs to job ${jobId}; run \`continue --job ${jobId} --prompt`));
  }

  // 4. Bare continue without --job
  const bareCont = run(sb, ['continue', '--prompt', 'follow up']);
  assert.equal(bareCont.code, 1);
  assert.match(bareCont.stderr, /continue requires --job <id>/);
  assert.match(bareCont.stderr, new RegExp(`Latest recorded job in this repository is ${jobId} \\(staffer\\); run \`continue --job ${jobId} --prompt`));

  // 5. Passing conversation ID to continue --job <conv-id>
  const convAsJob = run(sb, ['continue', '--job', 'conv-staffer', '--prompt', 'follow up']);
  assert.equal(convAsJob.code, 1);
  assert.match(convAsJob.stderr, new RegExp(`no job conv-staffer in this repository \\(conv-staffer is the conversation ID for job ${jobId}; run \`continue --job ${jobId} --prompt`));

  assert.equal(agyCalls(sb).length, callsBefore, 'rejected continuation selectors must never invoke AGY');

  // 6. Pre-0.8.1 legacy jobless ask conversation record
  const legacySb = sandbox('legacy-jobless-ask');
  fs.mkdirSync(path.dirname(stateFile(legacySb)), { recursive: true });
  fs.writeFileSync(stateFile(legacySb), JSON.stringify({
    conversations: { ask: 'legacy-ask-conv' },
    last: { mode: 'ask', id: 'legacy-ask-conv', model: 'gemini-3.8-flash-low', profile: 'restricted' },
    conversation_configs: { 'legacy-ask-conv': { mode: 'ask', model: 'gemini-3.8-flash-low', profile: 'restricted', cwd: legacySb.repo } },
    jobs: [],
  }));
  for (const args of [
    ['ask', '--continue', '--prompt', 'follow up'],
    ['continue', '--conversation', 'legacy-ask-conv', '--prompt', 'follow up'],
    ['continue', '--prompt', 'follow up'],
    ['continue', '--job', 'legacy-ask-conv', '--prompt', 'follow up'],
  ]) {
    const res = run(legacySb, args);
    assert.equal(res.code, 1, args.join(' '));
    assert.match(res.stderr, /legacy conversation|pre-0\.8\.1 `ask` run/);
  }
  assert.equal(agyCalls(legacySb).length, 0);
});
