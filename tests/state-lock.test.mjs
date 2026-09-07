import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { sandbox } from './helpers.mjs';

test('competing stale-lock reapers cannot remove the next owner or lose updates', async () => {
  const sb = sandbox('lock-reapers');
  const lock = path.join(sb.root, 'state.lock');
  const count = path.join(sb.root, 'count');
  fs.writeFileSync(count, '0'); fs.mkdirSync(lock);
  const oldOwner = 'owner-99999999-dead';
  fs.writeFileSync(path.join(lock, oldOwner), '');
  const module = new URL('../companion/state-lock.mjs', import.meta.url).href;
  const workers = Array.from({ length: 4 }, (_, index) => new Promise((resolve, reject) => {
    // Hold each reaper just before unlink, so several have inspected the same
    // stale owner. Later unlinks occur after a successor acquired the lock.
    const script = `import fs from 'node:fs'; import { withStateLock } from ${JSON.stringify(module)};
      const unlink = fs.unlinkSync; let intercepted = false;
      fs.unlinkSync = file => { if (file === ${JSON.stringify(path.join(lock, oldOwner))} && !intercepted) { intercepted = true; Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ${100 + index * 100}); } return unlink(file); };
      for (let i = 0; i < 12; i++) withStateLock(${JSON.stringify(lock)}, () => {
        const value = Number(fs.readFileSync(${JSON.stringify(count)}, 'utf8'));
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 15);
        fs.writeFileSync(${JSON.stringify(count)}, String(value + 1));
      });`;
    const child = spawn(process.execPath, ['--input-type=module', '-e', script]);
    let stderr = ''; child.stderr.on('data', chunk => { stderr += chunk; });
    child.on('close', code => code === 0 ? resolve() : reject(new Error(stderr)));
  }));
  await Promise.all(workers);
  assert.equal(fs.readFileSync(count, 'utf8'), '48');
  assert.equal(fs.existsSync(lock), false);
});
