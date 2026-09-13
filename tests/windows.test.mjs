import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { sandbox, run, jobIdOf } from './helpers.mjs';
import {
  parseWindowsProcessTable,
  windowsProcessTable,
  terminateProcessGroup,
  signalGroup,
  parseBorn,
  bornAfterParent,
  tree,
  processTable,
  processIdentity,
  stopExecution,
} from '../companion/stream-worker.mjs';

const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const alive = (pid) => { try { process.kill(pid, 0); return true; } catch (error) { return error.code === 'EPERM'; } };

const HERE = path.dirname(fileURLToPath(import.meta.url));

test('every spawn and spawnSync in companion/*.mjs passes windowsHide: true', () => {
  const companionDir = path.join(HERE, '..', 'companion');
  const files = fs.readdirSync(companionDir).filter((f) => f.endsWith('.mjs'));
  assert.ok(files.length > 0, 'companion directory should contain .mjs files');

  for (const file of files) {
    const content = fs.readFileSync(path.join(companionDir, file), 'utf8');
    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (/import\s+.*spawn/.test(line)) continue;
      if (/\b(spawnSync|spawn)\s*\(/.test(line)) {
        // Collect following lines until closing options block
        const block = lines.slice(i, Math.min(lines.length, i + 15)).join('\n');
        assert.match(
          block,
          /windowsHide:\s*true/,
          `Expected windowsHide: true for spawn call in ${file}:${i + 1}:\n${block}`
        );
      }
    }
  }
});

test('repoRoot() memoization: wait invokes git rev-parse at most a constant number of times', () => {
  const sb = sandbox('memo-reporoot');
  const bin = path.join(sb.root, 'bin');
  fs.mkdirSync(bin);
  const countFile = path.join(sb.root, 'git-count');
  fs.writeFileSync(countFile, '0');

  // Dispatch a background job that takes ~1000ms so wait performs multiple poll cycles
  const dispatch = run(sb, ['staffer', '--timeout', '15s', '--prompt', 'task'], {
    FAKE_AGY_SLEEP_MS: '1000',
  });
  const id = jobIdOf(dispatch.stdout);

  // Fake git wrapper: increments counter on rev-parse --show-toplevel and returns sb.repo
  const realGit = spawnSync('which', ['git'], { encoding: 'utf8' }).stdout.trim() || 'git';
  const fakeGit = path.join(bin, 'git');
  fs.writeFileSync(
    fakeGit,
    `#!${process.execPath}
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
const args = process.argv.slice(2);
if (args.includes('rev-parse') && args.includes('--show-toplevel')) {
  const c = Number(fs.readFileSync(${JSON.stringify(countFile)}, 'utf8') || '0');
  fs.writeFileSync(${JSON.stringify(countFile)}, String(c + 1));
  process.stdout.write(${JSON.stringify(sb.repo + '\n')});
  process.exit(0);
}
const res = spawnSync(${JSON.stringify(realGit)}, args, { encoding: 'utf8' });
if (res.stdout) process.stdout.write(res.stdout);
if (res.stderr) process.stderr.write(res.stderr);
process.exit(res.status ?? 0);
`,
    { mode: 0o755 }
  );

  const waitRes = run(sb, ['wait', id], {
    PATH: `${bin}:${process.env.PATH}`,
  });
  assert.equal(waitRes.code, 0, waitRes.stderr);

  const count = Number(fs.readFileSync(countFile, 'utf8'));
  // With memoization, git rev-parse is called once on initial load/resolution instead of on every poll
  assert.ok(count <= 2, `expected at most 2 git rev-parse calls, got ${count}`);
});

test('parseWindowsProcessTable: parses PowerShell table output into process rows', () => {
  const sample = `
ProcessId ParentProcessId CreationDate
--------- --------------- ------------
        0               0 
        4               0 9/12/2026 1:00:00 PM
     1234               4 9/12/2026 1:05:00 PM
     5678            1234 9/12/2026 1:05:01 PM
     9999            5678 9/12/2026 1:05:02 PM
`;
  const rows = parseWindowsProcessTable(sample);
  assert.equal(rows.length, 5);
  assert.deepEqual(rows[1], { pid: 4, parent: 0, group: 4, born: '9/12/2026 1:00:00 PM' });
  assert.deepEqual(rows[2], { pid: 1234, parent: 4, group: 1234, born: '9/12/2026 1:05:00 PM' });
  assert.deepEqual(rows[3], { pid: 5678, parent: 1234, group: 5678, born: '9/12/2026 1:05:01 PM' });
  assert.deepEqual(rows[4], { pid: 9999, parent: 5678, group: 9999, born: '9/12/2026 1:05:02 PM' });
});

test('parseWindowsProcessTable: parses wmic process output into process rows', () => {
  const sample = `
CreationDate               ParentProcessId  ProcessId
20260912130500.000000+000  4                1234
20260912130501.000000+000  1234             5678
`;
  const rows = parseWindowsProcessTable(sample);
  assert.equal(rows.length, 2);
  assert.deepEqual(rows[0], { pid: 1234, parent: 4, group: 1234, born: '20260912130500.000000+000' });
  assert.deepEqual(rows[1], { pid: 5678, parent: 1234, group: 5678, born: '20260912130501.000000+000' });
});

test('parseWindowsProcessTable: handles empty and malformed output gracefully', () => {
  assert.deepEqual(parseWindowsProcessTable(''), []);
  assert.deepEqual(parseWindowsProcessTable(null), []);
  assert.deepEqual(parseWindowsProcessTable('random header\nno numbers here'), []);
});

test('windowsProcessTable: queries powershell first and falls back to wmic', () => {
  const calls = [];
  const fakeRunner = (cmd, args, opts) => {
    calls.push({ cmd, args, opts });
    if (cmd === 'powershell') {
      return { status: 1, error: new Error('command not found'), stdout: '' };
    }
    if (cmd === 'wmic') {
      return {
        status: 0,
        stdout: 'CreationDate               ParentProcessId  ProcessId\n20260912130500.000000+000  4                1234\n',
      };
    }
    return { status: 1, stdout: '' };
  };

  const rows = windowsProcessTable(fakeRunner);
  assert.equal(calls.length, 2);
  assert.equal(calls[0].cmd, 'powershell');
  assert.equal(calls[0].opts.windowsHide, true);
  assert.equal(calls[1].cmd, 'wmic');
  assert.equal(calls[1].opts.windowsHide, true);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].pid, 1234);
});

test('windowsProcessTable: returns null when both powershell and wmic fail', () => {
  const fakeRunner = () => ({ status: 1, stdout: '', error: new Error('failed') });
  const result = windowsProcessTable(fakeRunner);
  assert.equal(result, null);
});

test('terminateProcessGroup: on win32 invokes taskkill /PID <pid> /F (never /T) with windowsHide', () => {
  const calls = [];
  const fakeRunner = (cmd, args, opts) => {
    calls.push({ cmd, args, opts });
    return { status: 0 };
  };

  terminateProcessGroup(4321, 'SIGTERM', fakeRunner, 'win32');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].cmd, 'taskkill');
  // /T would let taskkill walk stale ParentProcessId links into unrelated
  // orphans (a reused PID); descendants are killed individually instead.
  assert.deepEqual(calls[0].args, ['/PID', '4321', '/F']);
  assert.equal(calls[0].opts.windowsHide, true);
  assert.equal(calls[0].opts.stdio, 'ignore');
});

test('terminateProcessGroup: on win32 falls back to process.kill when taskkill fails', () => {
  const fakeRunner = () => ({ status: 1 });
  const origKill = process.kill;
  let killed = null;
  process.kill = (pid) => { killed = pid; };
  try {
    terminateProcessGroup(4321, 'SIGTERM', fakeRunner, 'win32');
    assert.equal(killed, 4321);
  } finally {
    process.kill = origKill;
  }
});

test('terminateProcessGroup / signalGroup: on POSIX uses negative PID for group signaling', () => {
  const origKill = process.kill;
  let killTarget = null;
  let killSignal = null;
  process.kill = (pid, sig) => { killTarget = pid; killSignal = sig; };
  try {
    signalGroup(4321, 'SIGTERM', spawnSync, 'darwin');
    assert.equal(killTarget, -4321);
    assert.equal(killSignal, 'SIGTERM');
  } finally {
    process.kill = origKill;
  }
});

test('parseWindowsProcessTable: keeps the round-trip CreationDate and tolerates a missing one', () => {
  const sample = `
ProcessId ParentProcessId CreationDate
--------- --------------- ------------
        0               0
        4               0 2026-09-13T11:00:00.0000000+00:00
     3616            2468 2026-09-13T11:33:32.5460000+00:00
`;
  const rows = parseWindowsProcessTable(sample);
  assert.deepEqual(rows, [
    { pid: 0, parent: 0, group: 0, born: 'unknown' },
    { pid: 4, parent: 0, group: 4, born: '2026-09-13T11:00:00.0000000+00:00' },
    { pid: 3616, parent: 2468, group: 3616, born: '2026-09-13T11:33:32.5460000+00:00' },
  ]);
});

test('windowsProcessTable: asks PowerShell for CreationDate in round-trip (100 ns) precision', () => {
  const calls = [];
  windowsProcessTable((cmd, args) => { calls.push({ cmd, args }); return { status: 0, stdout: 'ProcessId ParentProcessId CreationDate\n' }; });
  assert.equal(calls[0].cmd, 'powershell');
  const command = calls[0].args.at(-1);
  assert.match(command, /Get-CimInstance Win32_Process/);
  assert.match(command, /CreationDate\.ToString\('o'\)/, 'default locale formatting is second-granular');
});

test('parseBorn: orders ISO-8601, WMIC and legacy stamps on one 100 ns scale', () => {
  const utc = parseBorn('2026-09-13T11:33:32.5460000+00:00');
  assert.equal(utc, 17892992125460000n);
  assert.equal(parseBorn('2026-09-13T19:33:32.5460000+08:00'), utc, 'zone offsets are normalized');
  assert.equal(parseBorn('2026-09-13T11:33:32.5460000Z'), utc);
  assert.equal(parseBorn('2026-09-13T11:33:32.5460001+00:00'), utc + 1n, 'the seventh fractional digit survives');
  assert.equal(parseBorn('20260913113332.546000+000'), utc, 'WMIC format');
  assert.equal(parseBorn('20260913193332.546000+480'), utc, 'WMIC zone offset in minutes');
  assert.equal(parseBorn('9/13/2026 11:33:32 AM'), BigInt(Date.parse('9/13/2026 11:33:32 AM')) * 10_000n, 'legacy locale rendering');
  assert.equal(parseBorn('unknown'), null);
  assert.equal(parseBorn(''), null);
  assert.equal(parseBorn(undefined), null);
  assert.equal(bornAfterParent({ born: 'unknown' }, { born: utc.toString() }), true, 'unreadable stamps keep the edge');
});

test('tree: a row born before its recorded parent is an orphan behind a reused PID, not a descendant', () => {
  // The recycler R received the PID of a dispatch process that had already
  // exited; the orphan worker W still records that PID as its parent.
  const R = { pid: 100, parent: 1, group: 100, born: '2026-09-13T11:33:34.0000000+00:00' };
  const W = { pid: 200, parent: 100, group: 200, born: '2026-09-13T11:33:33.9999999+00:00' };
  const WC = { pid: 500, parent: 200, group: 500, born: '2026-09-13T11:33:36.0000000+00:00' };
  const C = { pid: 300, parent: 100, group: 300, born: '2026-09-13T11:33:34.0000000+00:00' };
  const GC = { pid: 400, parent: 300, group: 400, born: '2026-09-13T11:33:35.0000000+00:00' };
  assert.deepEqual(tree(100, [R, W, WC, C, GC]).map((row) => row.pid), [300, 400]);
  assert.deepEqual(tree(100, [R, W, WC, C, GC].map((row) => ({ ...row, born: 'unknown' }))).map((row) => row.pid), [200, 500, 300, 400],
    'without birth stamps every link is trusted, as before');
  assert.deepEqual(tree(999, [R, C]), [], 'an absent root has no tree');
});

test('stopExecution: a real orphan whose parent PID a live root reuses survives the root\'s cleanup', { timeout: 60000 }, async (t) => {
  // Real processes and real signals; the only synthetic element is one
  // ParentProcessId in the table, because no kernel lets a test choose which
  // PID it hands out next (and POSIX reparents orphans to init anyway).
  const orphan = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { detached: true, stdio: 'ignore', windowsHide: true });
  orphan.unref();
  t.after(() => { try { orphan.kill('SIGKILL'); } catch {} });
  let orphanIdentity = null;
  for (let i = 0; i < 100 && !orphanIdentity; i++) { orphanIdentity = processIdentity(orphan.pid); if (!orphanIdentity) await pause(100); }
  assert.ok(orphanIdentity, 'orphan must be visible in the process table');
  // POSIX ps reports birth at second granularity; make the root strictly younger.
  await pause(1100);
  const root = spawn(process.execPath, ['-e',
    "require('child_process').spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore', windowsHide: true }); setInterval(() => {}, 1000)"],
    { stdio: 'ignore', windowsHide: true });
  t.after(() => { try { root.kill('SIGKILL'); } catch {} });
  let rootIdentity = null, child = null;
  for (let i = 0; i < 100 && !(rootIdentity && child); i++) {
    const rows = processTable();
    rootIdentity ||= rows?.find((row) => row.pid === root.pid) || null;
    child = rows?.find((row) => row.parent === root.pid) || null;
    if (!(rootIdentity && child)) await pause(100);
  }
  assert.ok(rootIdentity && child, 'root and its real child must be visible in the process table');
  assert.ok(bornAfterParent(child, rootIdentity), 'a real child is born after its parent');
  t.after(() => { try { process.kill(child.pid, 'SIGKILL'); } catch {} });
  // The stale link: the orphan's parent PID is the root's PID, but the orphan
  // was born earlier, so the root cannot be its parent.
  const staleLink = (rows) => rows?.map((row) => row.pid === orphan.pid ? { ...row, parent: root.pid } : row) ?? null;
  // Windows adds conhost.exe and similar helpers under the root, so the tree
  // is checked for membership, not equality.
  const members = tree(root.pid, staleLink(processTable())).map((row) => row.pid);
  assert.ok(members.includes(child.pid), `the real child ${child.pid} is a descendant: ${members}`);
  assert.ok(!members.includes(orphan.pid), `the orphan ${orphan.pid} is not a descendant: ${members}`);
  await stopExecution(rootIdentity, [], () => staleLink(processTable()));
  for (let i = 0; i < 50 && (alive(root.pid) || alive(child.pid)); i++) await pause(100);
  assert.equal(alive(root.pid), false, 'the root is stopped');
  assert.equal(alive(child.pid), false, 'the real descendant is stopped');
  assert.equal(alive(orphan.pid), true, 'the unrelated orphan survives');
});
