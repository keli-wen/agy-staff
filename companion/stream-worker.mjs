import fs from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import { createParser, createProjection, excerpt, boundSnapshot } from './observation.mjs';

export function atomicJSON(file, value) {
  const tmp = `${file}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, JSON.stringify(value) + '\n');
  fs.renameSync(tmp, file);
}

export function signalGroup(pid, signal) {
  if (!Number.isInteger(pid) || pid <= 1) return;
  try { process.kill(-pid, signal); } catch { /* already exited */ }
}

// Track process birth stamps so a previously observed PID cannot cause cleanup
// to kill an unrelated process after PID reuse. Tool shells may create groups.
let inspectionUnavailable = false;
function processTable() {
  const ps = spawnSync('ps', ['-axo', 'pid=,ppid=,lstart='], { encoding: 'utf8', timeout: 1000 });
  if (ps.error || ps.status !== 0) {
    if (!inspectionUnavailable) process.stderr.write('agy-staff warning: process-tree inspection unavailable; run unsandboxed to verify descendant cleanup.\n');
    inspectionUnavailable = true;
  }
  return (ps.stdout || '').trim().split('\n').flatMap((line) => {
    const match = /^\s*(\d+)\s+(\d+)\s+(.+)$/.exec(line);
    return match ? [{ pid: Number(match[1]), parent: Number(match[2]), born: match[3].trim() }] : [];
  });
}
function tree(pid, rows = processTable()) {
  const found = new Set([pid]);
  for (let changed = true; changed;) {
    changed = false;
    for (const row of rows) if (found.has(row.parent) && !found.has(row.pid)) { found.add(row.pid); changed = true; }
  }
  return rows.filter((row) => row.pid !== pid && found.has(row.pid));
}
export function descendants(pid) { return tree(pid).map((row) => row.pid); }

export async function stopExecution(pid, known = []) {
  if (!pid) return;
  const current = processTable();
  const children = new Map(tree(pid, current).map((row) => [row.pid, row]));
  for (const old of known) if (current.some((row) => row.pid === old.pid && row.born === old.born)) children.set(old.pid, old);
  signalGroup(pid, 'SIGTERM');
  for (const child of [...children.values()].reverse()) { try { process.kill(child.pid, 'SIGTERM'); } catch {} }
  await new Promise((resolve) => setTimeout(resolve, 500));
  signalGroup(pid, 'SIGKILL');
  const remaining = processTable();
  for (const child of children.values()) {
    if (remaining.some((row) => row.pid === child.pid && row.born === child.born)) { try { process.kill(child.pid, 'SIGKILL'); } catch {} }
  }
}

export async function runStreaming({ binary, args, job, budget, signal, update, conversation }) {
  const rawFd = fs.openSync(job.events_file, 'a');
  const projection = createProjection(conversation);
  let payload = null, stderr = '', lastPublish = 0, child, deadline, publishTimer, trackingTimer;
  let stopping = null, reason = null, spawnError = null, streamError = null;
  const tracked = new Map();
  const track = () => {
    const rows = processTable();
    for (const [pid, old] of tracked) if (!rows.some((row) => row.pid === pid && row.born === old.born)) tracked.delete(pid);
    for (const row of tree(child?.pid, rows)) tracked.set(row.pid, row);
  };
  const publish = () => {
    lastPublish = Date.now();
    atomicJSON(job.progress_file, boundSnapshot({ job_id: job.id, ...projection.snapshot() }));
  };
  const stop = (why) => {
    if (stopping) return;
    reason = why;
    // Latch the stop reason before cleanup. The terminal record is published
    // only after the report is durable; canceled records stay canceled.
    clearInterval(trackingTimer);
    stopping = stopExecution(child?.pid, [...tracked.values()]).then(() => { child?.stdout.destroy(); child?.stderr.destroy(); });
  };
  const abort = () => stop('canceled');
  const safely = (action) => {
    try { action(); } catch (error) { streamError ||= error; stop('stream_error'); }
  };
  try {
    publish();
    child = spawn(binary, args, { detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
    child.on('error', (error) => { spawnError = error; });
    trackingTimer = setInterval(track, 1000);
    update({ agy_pid: child.pid, execution_started_at: new Date().toISOString(), hard_deadline_at: new Date(Date.now() + Math.max(0, budget)).toISOString() });
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) abort();
    deadline = setTimeout(() => stop('hard_timeout'), Math.max(0, budget));
    const parser = createParser((event) => {
      projection.accept(event);
      if (event.event === 'result' && event.result && typeof event.result === 'object') payload = event.result;
      if (Date.now() - lastPublish >= 100) publish();
      else if (!publishTimer) publishTimer = setTimeout(() => { publishTimer = null; safely(publish); }, 100);
    }, projection.warn, 64 * 1024 * 1024);
    child.stdout.on('data', (chunk) => safely(() => { fs.writeSync(rawFd, chunk); parser.write(chunk); }));
    child.stderr.on('data', (chunk) => safely(() => {
      process.stderr.write(chunk);
      stderr = excerpt(stderr + chunk.toString('utf8'), 8192, true).text;
    }));
    const outcome = await new Promise((resolve) => child.on('close', (exit, killedSignal) => resolve({ exit, killedSignal })));
    safely(() => parser.end());
    clearTimeout(deadline); clearInterval(trackingTimer);
    if (stopping) await stopping;
    // Kill remaining members even if the CLI itself already exited.
    else await stopExecution(child.pid, [...tracked.values()]);
    clearTimeout(publishTimer);
    if (inspectionUnavailable) projection.warn('Process-tree inspection unavailable; verify descendant cleanup from the original unsandboxed context.');
    publish();
    if (streamError) throw Object.assign(streamError, { reason: 'stream_error' });
    if (reason) throw Object.assign(new Error(reason === 'hard_timeout' ? 'Worker hard execution limit reached.' : 'Execution canceled.'), { reason });
    if (spawnError) throw Object.assign(new Error(`failed to launch agy (${binary}): ${spawnError.message}`), { reason: 'launch_error' });
    if (!payload) {
      let message = `agy did not return parseable JSON result (exit ${outcome.exit}, signal ${outcome.killedSignal || 'none'}). stdout: see ${job.events_file}\nstderr: ${stderr || '(empty)'}`;
      if (/operation not permitted/i.test(stderr)) message += '\nThis looks like a harness command sandbox blocking agy. Run this companion command unsandboxed (escalated permissions).';
      throw Object.assign(new Error(message), { reason: 'missing_result' });
    }
    return { payload, stderr, exit: outcome.exit ?? 1, observationWarnings: projection.snapshot().warnings };
  } catch (error) {
    if (!stopping && child?.pid) await stopExecution(child.pid, [...tracked.values()]);
    throw error;
  } finally {
    clearInterval(trackingTimer);
    clearTimeout(deadline); clearTimeout(publishTimer);
    signal.removeEventListener('abort', abort);
    fs.closeSync(rawFd);
  }
}
