import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { sandbox, run, jobIdOf, agyCalls, promptOf, waitForCalls, COMPANION, FAKE_AGY } from './helpers.mjs';

const statePath = sb => path.join(sb.repo, '.agy-staff/state.json');
const state = sb => JSON.parse(fs.readFileSync(statePath(sb), 'utf8'));
async function conversationOf(sb, id) {
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    const conversation = state(sb).jobs.find(job => job.id === id)?.conversation_id;
    if (conversation) return conversation;
    await new Promise(resolve => setTimeout(resolve, 25));
  }
  assert.fail('worker did not record its conversation');
}
function assertBusy(result, id, conversation) {
  assert.equal(result.code, 2, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), {
    status: 'running', reason: 'conversation_running', job_id: id,
    conversation_id: conversation, prompt_accepted: false,
  });
}

test('continuation returns busy even before a selected job has a conversation ID', () => {
  const sb = sandbox('continue-initializing');
  const dir = path.join(sb.repo, '.agy-staff'); fs.mkdirSync(dir);
  const original = { jobs: [{ id: 'initializing', mode: 'research', status: 'running', pid: process.pid, conversation_id: null }] };
  fs.writeFileSync(statePath(sb), JSON.stringify(original));
  assertBusy(run(sb, ['continue', '--job', 'initializing', '--prompt', 'new scope']), 'initializing', null);
  assert.deepEqual(state(sb), original);
  assert.equal(agyCalls(sb).length, 0);
});

test('all continuation entrypoints reject the active successor of an older job without waiting or queueing', async t => {
  const sb = sandbox('continue-busy');
  const first = jobIdOf(run(sb, ['research', '--prompt', 'original']).stdout);
  assert.equal(run(sb, ['wait', first]).code, 0);
  const conversation = await conversationOf(sb, first);
  const active = jobIdOf(run(sb, ['continue', '--job', first, '--prompt', 'second turn'], {
    FAKE_AGY_RELEASE_FILE: path.join(sb.root, 'release'),
  }).stdout);
  t.after(() => run(sb, ['cancel', active]));
  await waitForCalls(sb, 2);
  const requests = [
    ['continue', '--job', active], ['continue', '--job', first],
    ['continue', '--conversation', conversation], ['continue'],
    ['research', '--continue'], ['research', '--conversation', conversation],
    ['review', '--conversation', conversation], ['ask', '--conversation', conversation],
  ];
  const specs = () => fs.readdirSync(path.join(sb.repo, '.agy-staff/jobs')).filter(file => file.endsWith('.spec.json')).sort();
  const files = specs();
  for (const request of requests) {
    const start = Date.now();
    assertBusy(run(sb, [...request, '--prompt', 'not accepted']), active, conversation);
    assert.ok(Date.now() - start < 5000, 'busy response must not wait for the held worker');
  }
  assert.equal(state(sb).jobs.length, 2);
  assert.equal(agyCalls(sb).length, 2);
  assert.equal(state(sb).jobs.find(job => job.id === active).cancel_requested_at, undefined);
  assert.deepEqual(specs(), files);
  // A genuinely different conversation remains independently runnable.
  const unrelated = jobIdOf(run(sb, ['staffer', '--prompt', 'independent work'], { FAKE_AGY_CONVERSATION_ID: 'other-conversation' }).stdout);
  assert.equal(run(sb, ['wait', unrelated]).code, 0);
});

test('cancel then continue preserves the conversation, partial artifacts and updated brief', async t => {
  const sb = sandbox('cancel-continue');
  const original = jobIdOf(run(sb, ['staffer', '--prompt', 'original scope'], {
    FAKE_AGY_TOUCH_FILE: 'partial.txt', FAKE_AGY_RELEASE_FILE: path.join(sb.root, 'release'),
  }).stdout);
  t.after(() => run(sb, ['cancel', original]));
  const conversation = await conversationOf(sb, original);
  assert.equal(run(sb, ['cancel', original]).code, 0);
  assert.equal(run(sb, ['wait', original]).code, 4);
  const updated = 'Scope changed: use the partial artifact and only investigate local deployment.';
  const next = jobIdOf(run(sb, ['continue', '--job', original, '--prompt', updated]).stdout);
  assert.equal(run(sb, ['wait', next]).code, 0);
  const record = state(sb).jobs.find(job => job.id === next);
  assert.equal(record.conversation_id, conversation);
  assert.equal(record.parent_job_id, original);
  const call = agyCalls(sb).at(-1);
  assert.equal(call[call.indexOf('--conversation') + 1], conversation);
  assert.ok(promptOf(call).includes(updated));
  assert.equal(fs.readFileSync(path.join(sb.repo, 'partial.txt'), 'utf8'), 'written by fake agy\n');
});

test('competing background continuations register only one new turn', async t => {
  const sb = sandbox('continue-race');
  const first = jobIdOf(run(sb, ['research', '--prompt', 'original']).stdout);
  assert.equal(run(sb, ['wait', first]).code, 0);
  const conversation = await conversationOf(sb, first);
  t.after(() => {
    for (const job of state(sb).jobs) run(sb, ['cancel', job.id]);
  });
  const invoke = () => new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [COMPANION, 'continue', '--job', first, '--prompt', 'next turn'], {
      cwd: sb.repo, env: { ...process.env, HOME: sb.home, AGY_BIN: FAKE_AGY,
        FAKE_AGY_ARGV_FILE: sb.argvFile, FAKE_AGY_RELEASE_FILE: path.join(sb.root, 'release') },
    });
    let stdout = '', stderr = '';
    child.stdout.on('data', chunk => { stdout += chunk; });
    child.stderr.on('data', chunk => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', code => resolve({ code, stdout, stderr }));
  });
  const results = await Promise.all([invoke(), invoke()]);
  assert.deepEqual(results.map(result => result.code).sort(), [0, 2]);
  const active = jobIdOf(results.find(result => result.code === 0).stdout);
  assertBusy(results.find(result => result.code === 2), active, conversation);
  assert.equal(state(sb).jobs.length, 2);
  assert.equal(fs.readdirSync(path.join(sb.repo, '.agy-staff/jobs')).filter(file => file.endsWith('.spec.json')).length, 2);
});
