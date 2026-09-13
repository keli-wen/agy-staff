// Opt-in real continuation regression test. Uses authenticated real AGY and model
// quota; all jobs, tool writes, and evidence stay in disposable repositories.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { processIdentity } from '../companion/stream-worker.mjs';

if (process.env.AGY_REAL_CONTINUATION !== '1') {
  console.log('Set AGY_REAL_CONTINUATION=1 to verify real AGY continuation rejection (uses model quota).');
  process.exit(0);
}
const companion = fileURLToPath(new URL('../companion/agy-companion.mjs', import.meta.url));
const model = process.env.AGY_REAL_MODEL || 'gemini-3.8-flash-low';
const cases = ['running-guards', 'simultaneous', 'cancel-continue'];
const selected = process.env.AGY_REAL_CONTINUATION_CASE;
if (selected && !cases.includes(selected)) throw new Error(`Unknown case: ${selected}`);
const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'agy-continuation-real-')));
const env = { ...process.env };
for (const key of Object.keys(env)) if (key.startsWith('FAKE_AGY_')) delete env[key];
const version = () => {
  const r = spawnSync(env.AGY_BIN || 'agy', ['--version'], { encoding: 'utf8', env, timeout: 10000 });
  if (r.error) throw r.error;
  assert.equal(r.status, 0, r.stderr);
  return r.stdout.trim();
};
const summary = {
  root, model, started_at: new Date().toISOString(),
  version: version(),
  companion_sha256: createHash('sha256').update(fs.readFileSync(companion)).digest('hex'),
  cases: [],
};
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const save = () => fs.writeFileSync(path.join(root, 'summary.json'), JSON.stringify(summary, null, 2));
function run(cwd, args) {
  const r = spawnSync(process.execPath, [companion, ...args], { cwd, env, encoding: 'utf8', timeout: 20000 });
  if (r.error) throw r.error;
  return { code: r.status, stdout: r.stdout, stderr: r.stderr };
}
function launchAsync(cwd, args) {
  return new Promise((resolve, reject) => {
    const p = spawn(process.execPath, [companion, ...args], { cwd, env });
    let stdout = '', stderr = '';
    p.stdout.on('data', c => stdout += c); p.stderr.on('data', c => stderr += c);
    p.on('error', reject); p.on('close', code => resolve({ code, stdout, stderr }));
  });
}
function jobs(cwd) {
  try { return JSON.parse(fs.readFileSync(path.join(cwd, '.agy-staff/state.json'), 'utf8')).jobs || []; }
  catch (error) { if (error.code === 'ENOENT') return []; throw error; }
}
function job(cwd, id) {
  const j = jobs(cwd).find(j => j.id === id);
  if (!j) return null;
  try { return { ...j, ...JSON.parse(fs.readFileSync(j.result_file + '.status.json', 'utf8')) }; }
  catch (error) { if (error.code !== 'ENOENT') throw error; return j; }
}
const terminal = j => j && ['done', 'error', 'attention', 'canceled'].includes(j.status);
function events(cwd) {
  const file = path.join(cwd, 'tool-events.jsonl');
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, 'utf8').trim().split('\n').filter(Boolean).flatMap(line => {
    try { return [JSON.parse(line)]; } catch { return []; } // An append may still be in flight.
  });
}
function capture(cwd) {
  for (const j of jobs(cwd)) {
    if (j.events_file && fs.existsSync(j.events_file)) {
      try { fs.copyFileSync(j.events_file, path.join(cwd, '.agy-staff', `${j.id}.captured-events.jsonl`)); }
      catch (error) { if (error.code !== 'ENOENT') throw error; }
    }
  }
}
async function until(cwd, condition, budget, message) {
  const deadline = Date.now() + budget;
  while (Date.now() < deadline) {
    capture(cwd);
    if (condition()) return;
    await pause(250);
  }
  throw new Error(message);
}
function start(cwd, args, record, label) {
  const result = run(cwd, args);
  record.launches.push({ label, at: Date.now(), ...result }); save();
  const id = /job id:\s*(\S+)/.exec(result.stdout)?.[1];
  assert.equal(result.code, 0, result.stderr);
  assert.ok(id, result.stdout);
  return id;
}
async function collect(cwd, id, record) {
  await until(cwd, () => terminal(job(cwd, id)), 130000, `No terminal report for ${id}`);
  const result = run(cwd, ['wait', id, '--timeout', '1s']);
  const j = job(cwd, id);
  fs.writeFileSync(path.join(cwd, '.agy-staff', `${id}.delivery.txt`), result.stdout);
  fs.writeFileSync(path.join(cwd, '.agy-staff', `${id}.delivery.stderr.txt`), result.stderr);
  const log = fs.existsSync(j.log_file) ? fs.readFileSync(j.log_file, 'utf8') : '';
  record.results.push({ id, status: j.status, reason: j.reason, conversation_id: j.conversation_id,
    wait_exit: result.code, finished_at: j.finished_at, response: result.stdout.slice(0, 3000),
    native_telemetry: log.split('\n').filter(line => /agy_status=|agy_exit=/.test(line)) });
  save();
  return { result, j };
}
function toolPrompt(label, hold) {
  return `This is an authorized integration test in this disposable repository. Execute exactly this shell command: node probe-gate.mjs ${label} ${hold ? 'hold' : 'once'}. Wait for that command to finish before replying ${label.toUpperCase()}_DONE. Do not put it in the background; if the tool returns a command handle, poll that handle until completion. Do not run any other shell command, read other files, use the network, or modify any other file. The supplied script only records timestamps and waits for a local release file, with a 65-second maximum. Its writes are explicitly authorized.`;
}
function createCase(kind) {
  const cwd = path.join(root, kind); fs.mkdirSync(cwd);
  const init = spawnSync('git', ['init', '-q'], { cwd, encoding: 'utf8' });
  assert.equal(init.status, 0, init.stderr);
  fs.writeFileSync(path.join(cwd, 'probe-gate.mjs'), `import fs from 'node:fs';
const [label, mode] = process.argv.slice(2);
const emit = phase => fs.appendFileSync('tool-events.jsonl', JSON.stringify({label, phase, at:Date.now(), pid:process.pid})+'\\n');
emit('entered');
const deadline=Date.now()+65000;
if(mode==='hold') while(!fs.existsSync('release') && Date.now()<deadline) await new Promise(r=>setTimeout(r,100));
emit(fs.existsSync('release') || mode!=='hold' ? 'completed' : 'gate_timeout');
console.log(label.toUpperCase()+'_TOOL_DONE');
`);
  return cwd;
}
function assertRefused(result, active) {
  assert.equal(result.code, 1, result.stdout + result.stderr);
  assert.equal(result.stdout, '');
  assert.ok(result.stderr.includes(`job ${active} is still running (status: running)`), result.stderr);
  assert.match(result.stderr, /not accepted or queued/);
  assert.ok(result.stderr.includes(`wait ${active}`) && result.stderr.includes(`cancel ${active}`));
}
async function successful(cwd, id, record, marker) {
  const { result, j } = await collect(cwd, id, record);
  assert.equal(result.code, 0, result.stdout + result.stderr);
  assert.ok(result.stdout.includes(marker), result.stdout);
  return j;
}
async function toolStarted(cwd, id, label) {
  await until(cwd, () => events(cwd).some(e => e.label === label && e.phase === 'entered') || terminal(job(cwd, id)), 60000, `Tool ${label} never started`);
  assert.ok(events(cwd).some(e => e.label === label && e.phase === 'entered'), `AGY did not execute ${label}`);
  assert.ok(!terminal(job(cwd, id)), 'Invocation ended before the rejection check');
}
const jobFiles = cwd => fs.readdirSync(path.join(cwd, '.agy-staff/jobs')).sort();
console.log(`Evidence: ${root}`); save();
for (const kind of selected ? [selected] : cases) {
  const cwd = createCase(kind);
  const record = { kind, cwd, version_before: version(), launches: [], results: [] }; summary.cases.push(record); save();
  let lockOwner, lock, pending = [];
  try {
    console.log(`${kind}: establishing a fresh real conversation`);
    const token = `MEMORY_${randomUUID().replaceAll('-', '')}`;
    const seed = start(cwd, ['staffer', '--model', model, '--timeout', '120s', '--prompt', `Remember this test token for a later turn: ${token}. Reply exactly READY. Do not use tools.`], record, 'seed');
    const first = await successful(cwd, seed, record, 'READY');
    const conversation = first.conversation_id; assert.ok(conversation);
    record.conversation_id = conversation;
    if (kind === 'simultaneous') {
      lock = path.join(cwd, '.agy-staff/state.json.lock');
      await until(cwd, () => !fs.existsSync(lock) && jobs(cwd).find(j => j.id === seed).status === 'done', 5000, 'Seed registry not settled');
      lockOwner = `owner-${process.pid}-${randomUUID()}`;
      fs.mkdirSync(lock); fs.writeFileSync(path.join(lock, lockOwner), '');
      const labels = ['left', 'right'];
      const args = label => ['continue', '--conversation', conversation, '--timeout', '120s', '--prompt', toolPrompt(label, true)];
      pending = labels.map(label => launchAsync(cwd, args(label)));
      // Wait for both state-lock candidates, not spec files: a rejected
      // request must never create a spec in the fixed runtime.
      await until(cwd, () => fs.readdirSync(path.dirname(lock)).filter(n => n.startsWith('state.json.lock.owner-')).length === 2, 4000, 'Both callers did not reach the registration lock');
      fs.unlinkSync(path.join(lock, lockOwner)); fs.rmdirSync(lock); lockOwner = null;
      const outcomes = await Promise.all(pending);
      outcomes.forEach((result, i) => record.launches.push({ label: labels[i], at: Date.now(), ...result })); save();
      assert.deepEqual(outcomes.map(r => r.code).sort(), [0, 1]);
      const winner = outcomes.findIndex(r => r.code === 0), loser = 1 - winner;
      const id = /job id:\s*(\S+)/.exec(outcomes[winner].stdout)?.[1]; assert.ok(id);
      assertRefused(outcomes[loser], id);
      assert.equal(jobs(cwd).length, 2);
      assert.equal(jobFiles(cwd).filter(n => n.endsWith('.spec.json')).length, 2);
      await toolStarted(cwd, id, labels[winner]);
      record.released_at = Date.now(); fs.writeFileSync(path.join(cwd, 'release'), 'finish');
      await successful(cwd, id, record, labels[winner].toUpperCase() + '_DONE');
      assert.ok(!events(cwd).some(e => e.label === labels[loser]), 'Rejected request executed without being resubmitted');
      // Resubmitting explicitly after completion must still work.
      const resend = start(cwd, args(labels[loser]), record, 'resubmit-rejected');
      await successful(cwd, resend, record, labels[loser].toUpperCase() + '_DONE');
      const end = events(cwd).find(e => e.label === labels[winner] && e.phase === 'completed');
      const next = events(cwd).find(e => e.label === labels[loser] && e.phase === 'entered');
      assert.ok(end && next && next.at >= end.at, 'Resubmitted tool overlapped its predecessor');
    } else {
      const active = start(cwd, ['continue', '--job', seed, '--timeout', '120s', '--prompt', toolPrompt('active', true)], record, 'active');
      await toolStarted(cwd, active, 'active');
      if (kind === 'running-guards') {
        const requests = [
          ['continue', '--job', seed], ['continue', '--job', active],
          ['continue', '--conversation', conversation], ['continue'], ['staffer', '--continue'],
          ...['staffer', 'research', 'review', 'implement', 'ask'].map(mode => [mode, '--conversation', conversation]),
        ];
        const before = jobFiles(cwd);
        record.rejections = [];
        for (const request of requests) {
          const began = Date.now();
          const result = run(cwd, [...request, '--prompt', toolPrompt('blocked', false)]);
          record.rejections.push({ request, elapsed_ms: Date.now() - began, ...result }); save();
          assertRefused(result, active);
        }
        assert.equal(jobs(cwd).length, 2);
        assert.deepEqual(jobFiles(cwd), before, 'A rejected request left job artifacts');
        console.log(`${kind}: all 10 entrypoints rejected; checking another conversation`);
        const independent = start(cwd, ['staffer', '--model', model, '--timeout', '120s', '--prompt', 'Reply exactly INDEPENDENT_OK. Do not use tools.'], record, 'independent');
        const other = await successful(cwd, independent, record, 'INDEPENDENT_OK');
        assert.notEqual(other.conversation_id, conversation);
        assert.ok(!terminal(job(cwd, active)), 'The independent job did not finish while the first conversation was occupied');
        record.released_at = Date.now(); fs.writeFileSync(path.join(cwd, 'release'), 'finish');
        await successful(cwd, active, record, 'ACTIVE_DONE');
        assert.ok(events(cwd).some(e => e.label === 'active' && e.phase === 'completed'));
        assert.ok(!events(cwd).some(e => e.label === 'blocked'), 'Rejected work was queued');
        const memory = start(cwd, ['continue', '--job', seed, '--timeout', '120s', '--prompt', 'Without using tools, return the test token from the first request and the exact completion marker requested by the later shell-command task.'], record, 'resume-after-completion');
        const resumed = await successful(cwd, memory, record, token);
        assert.ok(record.results.at(-1).response.includes('ACTIVE_DONE'));
        assert.equal(resumed.conversation_id, conversation);
        assert.equal(resumed.model, first.model); assert.equal(resumed.profile, first.profile);
      } else {
        const pid = events(cwd).find(e => e.label === 'active' && e.phase === 'entered').pid;
        const identity = processIdentity(pid); assert.ok(identity);
        record.cancel = run(cwd, ['cancel', active]); save();
        assert.equal(record.cancel.code, 0, record.cancel.stderr);
        const canceled = await collect(cwd, active, record);
        assert.equal(canceled.result.code, 4); assert.equal(canceled.j.status, 'canceled');
        await until(cwd, () => processIdentity(pid)?.born !== identity.born, 5000, 'Canceled shell survived');
        assert.ok(!events(cwd).some(e => e.label === 'active' && e.phase === 'completed'));
        const next = start(cwd, ['continue', '--job', active, '--timeout', '120s', '--prompt', 'The previous shell was deliberately canceled. Do not restart it. ' + toolPrompt('followup', false)], record, 'resume-after-cancel');
        const resumed = await successful(cwd, next, record, 'FOLLOWUP_DONE');
        assert.equal(resumed.conversation_id, conversation);
        assert.equal(events(cwd).filter(e => e.label === 'active' && e.phase === 'entered').length, 1);
        assert.ok(events(cwd).some(e => e.label === 'followup' && e.phase === 'completed'));
      }
    }
    record.tool_events = events(cwd);
    assert.ok(!record.tool_events.some(e => e.phase === 'gate_timeout'), 'Tool gate expired instead of being released');
    record.outcome = 'passed';
    console.log(JSON.stringify({ kind, outcome: record.outcome, rejections: record.rejections?.length,
      launches: record.launches.map(r => ({ label: r.label, exit: r.code })), results: record.results.map(r => ({ status: r.status, wait_exit: r.wait_exit })) }));
  } catch (error) {
    record.outcome = 'failed'; record.error = error.stack; process.exitCode = 1;
    console.error(`${kind}: ${error.message}`);
  } finally {
    if (lockOwner && fs.existsSync(path.join(lock, lockOwner))) { fs.unlinkSync(path.join(lock, lockOwner)); fs.rmdirSync(lock); }
    await Promise.allSettled(pending);
    fs.writeFileSync(path.join(cwd, 'release'), 'cleanup');
    capture(cwd);
    record.cleanup = [];
    for (const j of jobs(cwd)) if (!terminal(job(cwd, j.id))) {
      try { record.cleanup.push({ id: j.id, ...run(cwd, ['cancel', j.id]) }); }
      catch (error) { record.cleanup.push({ id: j.id, error: error.message }); process.exitCode = 1; }
    }
    record.remaining_running = jobs(cwd).filter(j => !terminal(job(cwd, j.id))).map(j => j.id);
    if (record.remaining_running.length) process.exitCode = 1;
    record.version_after = version();
    if (record.version_after !== record.version_before) {
      record.version_warning = 'AGY CLI version changed during this case; do not attribute it to one version.';
    }
    save();
  }
  if (record.outcome === 'failed') break;
}
summary.finished_at = new Date().toISOString(); save();
console.log(`Evidence: ${root}`);
