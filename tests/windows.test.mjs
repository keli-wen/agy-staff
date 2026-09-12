import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { sandbox, run, jobIdOf } from './helpers.mjs';
import {
  parseWindowsProcessTable,
  windowsProcessTable,
  terminateProcessGroup,
  signalGroup,
} from '../companion/stream-worker.mjs';

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

test('terminateProcessGroup: on win32 invokes taskkill /PID <pid> /T /F with windowsHide', () => {
  const calls = [];
  const fakeRunner = (cmd, args, opts) => {
    calls.push({ cmd, args, opts });
    return { status: 0 };
  };

  terminateProcessGroup(4321, 'SIGTERM', fakeRunner, 'win32');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].cmd, 'taskkill');
  assert.deepEqual(calls[0].args, ['/PID', '4321', '/T', '/F']);
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
