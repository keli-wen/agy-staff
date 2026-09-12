import fs from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import { createParser, createProjection, excerpt, boundSnapshot } from './observation.mjs';

export function atomicJSON(file, value) {
  const tmp = `${file}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, JSON.stringify(value) + '\n');
  fs.renameSync(tmp, file);
}

export function signalGroup(pid, signal, runner = spawnSync, platform = process.platform) {
  if (!Number.isInteger(pid) || pid <= 1) return;
  if (platform === 'win32') {
    try {
      const res = runner('taskkill', ['/PID', String(pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
      if (res?.error || (res?.status != null && res.status !== 0)) {
        try { process.kill(pid); } catch { /* already exited */ }
      }
    } catch {
      try { process.kill(pid); } catch { /* already exited */ }
    }
    return;
  }
  try { process.kill(-pid, signal); } catch { /* already exited */ }
}
export const terminateProcessGroup = signalGroup;

export function parseWindowsProcessTable(stdout) {
  if (!stdout || typeof stdout !== 'string') return [];
  const lines = stdout.trim().split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) return [];

  let format = 'powershell';
  const firstLine = lines[0];
  if (/^CreationDate/i.test(firstLine)) {
    format = 'wmic';
  }

  const rows = [];
  for (const line of lines) {
    if (/^(ProcessId|ParentProcessId|CreationDate|--+)/i.test(line)) continue;
    if (format === 'wmic') {
      const match = /^(\S+)\s+(\d+)\s+(\d+)$/.exec(line);
      if (match) {
        const born = match[1];
        const parent = Number(match[2]);
        const pid = Number(match[3]);
        rows.push({ pid, parent, group: pid, born });
      }
    } else {
      const match = /^(\d+)\s+(\d+)\s*(.*)$/.exec(line);
      if (match) {
        const pid = Number(match[1]);
        const parent = Number(match[2]);
        const born = match[3].trim() || 'unknown';
        rows.push({ pid, parent, group: pid, born });
      }
    }
  }
  return rows;
}

export function windowsProcessTable(runner = spawnSync) {
  let res;
  try {
    res = runner('powershell', [
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      'Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,CreationDate',
    ], { encoding: 'utf8', timeout: 3000, windowsHide: true });
  } catch (err) {
    res = { error: err };
  }

  if (res?.error || res?.status !== 0) {
    try {
      res = runner('wmic', [
        'process',
        'get',
        'ProcessId,ParentProcessId,CreationDate',
      ], { encoding: 'utf8', timeout: 3000, windowsHide: true });
    } catch (err) {
      res = { error: err };
    }
  }

  if (res?.error || res?.status !== 0 || !res?.stdout) {
    return null;
  }
  return parseWindowsProcessTable(res.stdout);
}

// Track process birth stamps so a previously observed PID cannot cause cleanup
// to kill an unrelated process after PID reuse. Tool shells may create groups.
let inspectionUnavailable = false;
export function processTable() {
  if (process.platform === 'win32') {
    const table = windowsProcessTable();
    if (!table) {
      if (!inspectionUnavailable) process.stderr.write('agy-staff warning: process-tree inspection unavailable; run unsandboxed to verify descendant cleanup.\n');
      inspectionUnavailable = true;
      return null;
    }
    return table;
  }
  const ps = spawnSync('ps', ['-axo', 'pid=,ppid=,pgid=,lstart='], {
    encoding: 'utf8',
    timeout: 1000,
    windowsHide: true,
    env: { ...process.env, LC_ALL: 'C', TZ: 'UTC' },
  });
  if (ps.error || ps.status !== 0) {
    if (!inspectionUnavailable) process.stderr.write('agy-staff warning: process-tree inspection unavailable; run unsandboxed to verify descendant cleanup.\n');
    inspectionUnavailable = true;
    return null;
  }
  return (ps.stdout || '').trim().split('\n').flatMap((line) => {
    const match = /^\s*(\d+)\s+(\d+)\s+(\d+)\s+(.+)$/.exec(line);
    return match ? [{ pid: Number(match[1]), parent: Number(match[2]), group: Number(match[3]), born: match[4].trim() }] : [];
  });
}
function tree(pid, rows = processTable()) {
  if (!rows || !pid) return [];
  const found = new Set([pid]);
  for (let changed = true; changed;) {
    changed = false;
    for (const row of rows) if (found.has(row.parent) && !found.has(row.pid)) { found.add(row.pid); changed = true; }
  }
  return rows.filter((row) => row.pid !== pid && found.has(row.pid));
}
export function descendants(pid) { return tree(pid).map((row) => row.pid); }

export function processIdentity(pid) {
  if (!Number.isInteger(pid) || pid <= 1) return null;
  return processTable()?.find((row) => row.pid === pid) || null;
}
const matches = (rows, identity) => !!identity && !!rows?.some((row) => row.pid === identity.pid && row.born === identity.born);

export async function stopExecution(root, known = []) {
  if (!root) return;
  const current = processTable();
  if (!current) return;
  const children = new Map(known.filter((old) => matches(current, old)).map((row) => [row.pid, row]));
  if (matches(current, root)) {
    children.set(root.pid, root);
    for (const row of tree(root.pid, current)) children.set(row.pid, row);
  }
  const signal = (rows, kind) => {
    // A surviving, identified member proves this is still our execution group.
    const reusedLeader = rows?.some((row) => row.pid === root.pid && row.born !== root.born);
    const ownedMember = rows?.some((row) => row.group === root.pid && children.get(row.pid)?.born === row.born);
    if (!reusedLeader && ownedMember) signalGroup(root.pid, kind);
    for (const child of [...children.values()].reverse()) {
      if (matches(rows, child)) { try { process.kill(child.pid, kind); } catch {} }
    }
  };
  signal(current, 'SIGTERM');
  await new Promise((resolve) => setTimeout(resolve, 500));
  signal(processTable(), 'SIGKILL');
}

export async function runStreaming({ binary, args, job, budget, signal, update, conversation }) {
  const hardDeadline = Date.now() + Math.max(0, budget);
  const rawFd = fs.openSync(job.events_file, 'a');
  const projection = createProjection(conversation);
  let payload = null, stderr = '', stdoutTail = '', lastPublish = 0, child, root, deadline, publishTimer, trackingTimer;
  let stopping = null, reason = null, spawnError = null, streamError = null;
  const tracked = new Map();
  const track = () => {
    const rows = processTable();
    if (!rows) return; // An unavailable inspection is not evidence of exit.
    for (const [pid, old] of tracked) if (!rows.some((row) => row.pid === pid && row.born === old.born)) tracked.delete(pid);
    if (!root) root = rows.find((row) => row.pid === child?.pid);
    if (matches(rows, root)) for (const row of tree(root.pid, rows)) tracked.set(row.pid, row);
    // A detached child owns its group until exit; collect orphaned members at
    // the exit/result boundary too, unless the leader PID has been reused.
    if (root && !rows.some((row) => row.pid === root.pid && row.born !== root.born)) {
      for (const row of rows) if (row.pid !== root.pid && row.group === root.pid) tracked.set(row.pid, row);
    }
  };
  const publish = () => {
    lastPublish = Date.now();
    atomicJSON(job.progress_file, boundSnapshot({ job_id: job.id, ...projection.snapshot() }));
  };
  const stop = (why) => {
    if (why === 'canceled') reason = why;
    if (stopping) return;
    reason = why;
    // Latch the stop reason before cleanup. The terminal record is published
    // only after the report is durable; canceled records stay canceled.
    clearInterval(trackingTimer);
    track();
    stopping = cleanup();
  };
  const cleanup = async () => {
    // ChildProcess.kill only targets our still-running direct child. Stored
    // numeric PIDs are never sufficient authority for a signal.
    if (!root && child?.exitCode === null && child.signalCode === null) child.kill('SIGTERM');
    await stopExecution(root, [...tracked.values()]);
    if (child?.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
  };
  const abort = () => stop('canceled');
  const safely = (action) => {
    try { action(); } catch (error) { streamError ||= error; stop('stream_error'); }
  };
  try {
    publish();
    // On Windows, detached: true creates a new console window; piped stdio keeps the
    // process stream connected. On POSIX, detached: true creates a new process group.
    child = spawn(binary, args, {
      detached: process.platform !== 'win32',
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const exited = new Promise((resolve) => {
      child.once('error', (error) => { spawnError = error; resolve({ exit: null, killedSignal: null }); });
      child.once('exit', (exit, killedSignal) => resolve({ exit, killedSignal }));
    });
    const closed = new Promise((resolve) => child.once('close', resolve));
    track();
    trackingTimer = setInterval(track, 1000);
    update({ agy_pid: child.pid, execution_started_at: new Date().toISOString(), hard_deadline_at: new Date(hardDeadline).toISOString() });
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) abort();
    deadline = setTimeout(() => stop('hard_timeout'), Math.max(0, hardDeadline - Date.now()));
    const parser = createParser((event) => {
      projection.accept(event);
      if (event.event === 'result' && event.result && typeof event.result === 'object') { payload = event.result; track(); }
      if (Date.now() - lastPublish >= 100) publish();
      else if (!publishTimer) publishTimer = setTimeout(() => { publishTimer = null; safely(publish); }, 100);
    }, projection.warn, 64 * 1024 * 1024);
    child.stdout.on('data', (chunk) => safely(() => {
      fs.writeSync(rawFd, chunk);
      stdoutTail = excerpt(stdoutTail + chunk.toString('utf8'), 8192, true).text;
      parser.write(chunk);
    }));
    child.stderr.on('data', (chunk) => safely(() => {
      process.stderr.write(chunk);
      stderr = excerpt(stderr + chunk.toString('utf8'), 8192, true).text;
    }));
    const outcome = await exited;
    clearTimeout(deadline); clearInterval(trackingTimer);
    if (stopping) await stopping;
    // Kill remaining members even if the CLI itself already exited.
    else { track(); stopping = cleanup(); await stopping; }
    // Drain buffered result bytes, but do not wait indefinitely for a tool
    // process that inherited stdout/stderr and escaped cleanup.
    let drainTimer;
    const drained = await Promise.race([closed.then(() => true), new Promise((resolve) => { drainTimer = setTimeout(() => resolve(false), 500); })]);
    clearTimeout(drainTimer);
    if (!drained) {
      projection.warn('AGY exited but inherited output pipes did not close; output drain was bounded.');
      child.stdout.destroy(); child.stderr.destroy();
    }
    safely(() => parser.end());
    clearTimeout(publishTimer);
    if (inspectionUnavailable) projection.warn('Process-tree inspection unavailable; verify descendant cleanup from the original unsandboxed context.');
    publish();
    if (streamError) throw Object.assign(streamError, { reason: 'stream_error' });
    if (reason === 'hard_timeout' && typeof payload?.response === 'string' && payload.response.trim()) {
      const warning = 'Worker hard execution limit reached after a response was received; delivering the response with a cleanup warning.';
      projection.warn(warning);
      stderr = `${stderr}\n${warning}`.trim();
      process.stderr.write(`agy-staff warning: ${warning}\n`);
    } else if (reason) throw Object.assign(new Error(reason === 'hard_timeout' ? 'Worker hard execution limit reached.' : 'Execution canceled.'), { reason });
    if (spawnError) throw Object.assign(new Error(`failed to launch agy (${binary}): ${spawnError.message}`), { reason: 'launch_error' });
    if (!payload) {
      let message = `agy did not return parseable JSON result (exit ${outcome.exit}, signal ${outcome.killedSignal || 'none'}). stdout: see ${job.events_file}\nstderr: ${stderr || '(empty)'}`;
      if (/operation not permitted/i.test(stderr)) message += '\nThis looks like a harness command sandbox blocking agy. Run this companion command unsandboxed (escalated permissions).';
      throw Object.assign(new Error(message), { reason: 'missing_result', diagnosticText: `${stdoutTail}\n${stderr}` });
    }
    return { payload, stderr, exit: outcome.exit ?? 1, observationWarnings: projection.snapshot().warnings };
  } catch (error) {
    if (!stopping && child?.pid) await cleanup();
    throw error;
  } finally {
    clearInterval(trackingTimer);
    clearTimeout(deadline); clearTimeout(publishTimer);
    signal.removeEventListener('abort', abort);
    fs.closeSync(rawFd);
  }
}
