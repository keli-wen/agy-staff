// Opt-in, billed AGY smoke test. Runs only in disposable directories; never
// changes settings, supplies credentials, or edits this checkout.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { descendants } from '../companion/stream-worker.mjs';
if (process.env.AGY_REAL_SMOKE !== '1') { console.log('Set AGY_REAL_SMOKE=1 to run real AGY lifecycle smoke tests.'); process.exit(0); }
const companion = fileURLToPath(new URL('../companion/agy-companion.mjs', import.meta.url));
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agy-lifecycle-real-'));
const summary = { root, version: spawnSync(process.env.AGY_BIN || 'agy', ['--version'], { encoding: 'utf8' }).stdout.trim(), cases: [] };
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
function run(cwd, args) {
  const r = spawnSync(process.execPath, [companion, ...args], { cwd, encoding: 'utf8', timeout: 120000 });
  if (r.error) throw r.error;
  return { code: r.status, stdout: r.stdout, stderr: r.stderr };
}
const getJob = (cwd, id) => JSON.parse(fs.readFileSync(path.join(cwd, '.agy-staff/state.json'), 'utf8')).jobs.find((j) => j.id === id);
const isAlive = (pid) => {
  const r = spawnSync('ps', ['-p', String(pid), '-o', 'stat='], { encoding: 'utf8' });
  return !!r.stdout.trim() && !r.stdout.trim().startsWith('Z');
};
try {
  for (const kind of ['normal', 'structured', 'cancel', 'hard_timeout']) {
    const cwd = path.join(root, kind); fs.mkdirSync(cwd);
    const stop = kind === 'cancel' || kind === 'hard_timeout';
    const prompt = kind === 'structured'
      ? 'Review the following harmless plan without tools: print HELLO once. Return an approve verdict, a one-sentence summary, no findings and no could_not_verify items in the required JSON schema.'
      : stop
        ? 'Execute exactly one shell command: sh -c \'echo $$ > smoke-tool.pid; sleep 90; echo SHOULD_NOT_FINISH > smoke-completed\'. Wait for it to finish. Do not run any other command, read files, access the network, or modify any other file.'
        : 'Execute exactly one shell command: sh -c \'sleep 3; printf "STREAM_SMOKE_OK\\n"; exit 7\'. Then report STREAM_SMOKE_OK and the command exit code. Do not run any other command, read files, access the network, or modify files.';
    const args = [kind === 'structured' ? 'review' : 'staffer', '--model', 'gemini-3.8-flash-low', '--prompt', prompt];
    if (kind === 'structured') args.push('--json');
    if (kind === 'hard_timeout') args.push('--timeout', '35s');
    const startTime = Date.now();
    const start = run(cwd, args); assert.equal(start.code, 0, start.stderr);
    const id = /job id:\s*(\S+)/.exec(start.stdout)[1];
    const samples = []; let observed = [], canceled = false, result;
    for (let i = 0; i < 110; i++) {
      result = run(cwd, ['observe', id]);
      const job = getJob(cwd, id);
      if (job.agy_pid) observed = [...new Set([...observed, job.agy_pid, ...descendants(job.agy_pid)])];
      if (result.code !== 2) break;
      samples.push(JSON.parse(result.stdout));
      if (kind === 'cancel' && fs.existsSync(path.join(cwd, 'smoke-tool.pid'))) {
        assert.equal(run(cwd, ['cancel', id]).code, 0); canceled = true;
      }
      await pause(1000);
    }
    await pause(1200);
    result = run(cwd, ['observe', id]);
    const terminalObservation = JSON.parse(result.stdout);
    assert.ok(Buffer.byteLength(result.stdout) <= 8192);
    assert.notEqual(terminalObservation.status, 'running');
    const delivery = run(cwd, ['wait', id]);
    assert.equal(delivery.code, result.code);
    const job = getJob(cwd, id);
    if (fs.existsSync(path.join(cwd, 'smoke-tool.pid'))) observed.push(Number(fs.readFileSync(path.join(cwd, 'smoke-tool.pid'), 'utf8').trim()));
    const survivors = [...new Set(observed)].filter(isAlive);
    const record = { kind, job_id: id, code: result.code, elapsed_ms: Date.now() - startTime, observed_processes: [...new Set(observed)], survivors, tool_seen: samples.some((s) => s.recent_activities.length), sample_count: samples.length, conversation_id: job.conversation_id, status: job.status, reason: job.reason, warnings: job.warnings };
    summary.cases.push(record);
    fs.writeFileSync(path.join(cwd, 'observations.json'), JSON.stringify(samples, null, 2));
    fs.writeFileSync(path.join(cwd, 'terminal-observation.json'), JSON.stringify(terminalObservation, null, 2));
    fs.writeFileSync(path.join(cwd, 'delivery.txt'), delivery.stdout);
    console.log(JSON.stringify(record));
    assert.equal(result.code, kind === 'cancel' ? 4 : kind === 'hard_timeout' ? 3 : 0, result.stdout + result.stderr);
    assert.equal(survivors.length, 0, `surviving execution processes: ${survivors}`);
    assert.ok(job.conversation_id);
    if (stop) {
      assert.equal(fs.existsSync(path.join(cwd, 'smoke-completed')), false);
      assert.ok(fs.existsSync(job.events_file));
      assert.ok(fs.existsSync(path.join(cwd, 'smoke-tool.pid')), 'a real tool must have started before stopping');
      if (kind === 'cancel') assert.ok(canceled);
      else assert.equal(job.reason, 'hard_timeout');
    } else if (kind === 'normal') assert.match(delivery.stdout, /STREAM_SMOKE_OK/);
    else assert.match(delivery.stdout, /"verdict"\s*:\s*"approve"/);
  }
} finally {
  fs.writeFileSync(path.join(root, 'summary.json'), JSON.stringify(summary, null, 2));
  console.log(`Evidence: ${root}`);
  for (const kind of ['normal', 'structured', 'cancel', 'hard_timeout']) {
    const cwd = path.join(root, kind);
    try {
      for (const job of JSON.parse(fs.readFileSync(path.join(cwd, '.agy-staff/state.json'), 'utf8')).jobs) if (job.status === 'running') run(cwd, ['cancel', job.id]);
    } catch {}
  }
}
