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
  let lastError = null;
  try {
    for (;;) {
      try { fs.renameSync(candidate, lock); acquired = true; break; } catch (error) {
        // Windows reports EPERM (not EEXIST/ENOTEMPTY) when renaming a
        // non-empty directory onto an existing one, and EBUSY while a
        // scanner holds it. Both are transient here: the holder releases
        // the lock momentarily, so retry instead of failing the job.
        if (!['EEXIST', 'ENOTEMPTY', 'EPERM', 'EBUSY', 'EACCES'].includes(error.code)) throw error;
        lastError = error;
      }
      let entries = [];
      try { entries = fs.readdirSync(lock); } catch (error) { if (error.code !== 'ENOENT') throw error; }
      if (entries.length === 1) {
        const match = /^owner-(\d+)-[a-f0-9-]+$/.exec(entries[0]);
        if (match && Number(match[1]) > 1 && !alive(Number(match[1]))) {
          try {
            fs.unlinkSync(path.join(lock, entries[0]));
            fs.rmdirSync(lock);
          } catch (error) { if (!['ENOENT', 'ENOTEMPTY', 'EEXIST', 'EPERM', 'EBUSY', 'EACCES'].includes(error.code)) throw error; }
        }
      }
      if (Date.now() - start > 10000) {
        const detail = lastError?.code ? ` (last error: ${lastError.code})` : '';
        throw new Error(`Timed out acquiring job state lock${detail}: ${lock}. If no companion process is running, inspect and remove the stale lock.`);
      }
      pause();
    }
    return change();
  } finally {
    if (acquired) {
      const marker = path.join(lock, owner);
      // A concurrent reaper may already have removed our marker (it judges the
      // holder dead once the dispatch process exits, resulting in ENOENT).
      // On Windows, open handles or scanners can cause transient EPERM/EBUSY/EACCES;
      // retry briefly before giving up, and only ignore if the marker no longer exists.
      for (let attempt = 0; attempt < 5; attempt++) {
        try {
          fs.unlinkSync(marker);
          break;
        } catch (error) {
          if (error.code === 'ENOENT') break;
          if (['EPERM', 'EBUSY', 'EACCES'].includes(error.code)) {
            if (attempt < 4) {
              pause();
              continue;
            }
            if (!fs.existsSync(marker)) break;
          }
          throw error;
        }
      }
      try { fs.rmdirSync(lock); } catch (error) { if (!['ENOENT', 'ENOTEMPTY', 'EEXIST', 'EPERM', 'EBUSY', 'EACCES'].includes(error.code)) throw error; }
    } else fs.rmSync(candidate, { recursive: true, force: true });
  }
}
