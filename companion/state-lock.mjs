import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

const pause = () => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 10);
const alive = (pid) => { try { process.kill(pid, 0); return true; } catch (error) { return error.code === 'EPERM'; } };

// Publish a nonempty directory atomically. Reapers remove only the unique
// marker they inspected, then rmdir (never recursively delete a successor).
export function withStateLock(lock, change) {
  const owner = `owner-${process.pid}-${randomUUID()}`;
  const candidate = `${lock}.${owner}`;
  fs.mkdirSync(candidate);
  fs.writeFileSync(path.join(candidate, owner), '');
  const start = Date.now();
  let acquired = false;
  try {
    for (;;) {
      try { fs.renameSync(candidate, lock); acquired = true; break; } catch (error) {
        // Windows reports EPERM (not EEXIST/ENOTEMPTY) when renaming a
        // non-empty directory onto an existing one, and EBUSY while a
        // scanner holds it. Both are transient here: the holder releases
        // the lock momentarily, so retry instead of failing the job.
        if (!['EEXIST', 'ENOTEMPTY', 'EPERM', 'EBUSY'].includes(error.code)) throw error;
      }
      let entries = [];
      try { entries = fs.readdirSync(lock); } catch (error) { if (error.code !== 'ENOENT') throw error; }
      if (entries.length === 1) {
        const match = /^owner-(\d+)-[a-f0-9-]+$/.exec(entries[0]);
        if (match && Number(match[1]) > 1 && !alive(Number(match[1]))) {
          try {
            fs.unlinkSync(path.join(lock, entries[0]));
            fs.rmdirSync(lock);
          } catch (error) { if (!['ENOENT', 'ENOTEMPTY', 'EEXIST'].includes(error.code)) throw error; }
        }
      }
      if (Date.now() - start > 10000) throw new Error(`Timed out acquiring job state lock: ${lock}. If no companion process is running, inspect and remove the stale lock.`);
      pause();
    }
    return change();
  } finally {
    if (acquired) {
      // A concurrent reaper may already have removed our marker (it judges the
      // holder dead once the dispatch process exits). Losing the race is
      // harmless here — the lock is already free — so don't fail the run.
      try { fs.unlinkSync(path.join(lock, owner)); } catch (error) {
        if (!['ENOENT', 'EPERM'].includes(error.code)) throw error;
      }
      try { fs.rmdirSync(lock); } catch (error) { if (!['ENOENT', 'ENOTEMPTY', 'EEXIST', 'EPERM'].includes(error.code)) throw error; }
    } else fs.rmSync(candidate, { recursive: true, force: true });
  }
}
