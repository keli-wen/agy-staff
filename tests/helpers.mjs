/**
 * Black-box harness for the companion CLI.
 *
 * Every test gets its own sandbox: a throwaway git repo under os.tmpdir() plus
 * a throwaway HOME, so `.agy-staff/` state and any `~/.gemini` writes can never
 * land in the real repo or the real home directory. `agy` is replaced with
 * tests/fake-agy.mjs via AGY_BIN — no test ever reaches the network.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const COMPANION = path.join(HERE, '..', 'companion', 'agy-companion.mjs');
export const FAKE_AGY = path.join(HERE, 'fake-agy.mjs');

/**
 * Create an isolated {repo, home, argvFile} sandbox.
 *
 * `{ git: false }` skips `git init`, so the workspace is a plain directory with
 * no repository anywhere above it (os.tmpdir() is not inside one) — the shape
 * the round-2 "implement outside a git repo warns and proceeds" rule needs.
 */
export function sandbox(label = 'case', { git = true } = {}) {
  const root = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), `agy-staff-test-${label}-`))
  );
  const repo = path.join(root, 'repo');
  const home = path.join(root, 'home');
  fs.mkdirSync(repo);
  fs.mkdirSync(home);

  if (git) {
    const init = spawnSync('git', ['init', '-q'], { cwd: repo, encoding: 'utf8' });
    if (init.status !== 0) throw new Error(`git init failed: ${init.stderr}`);

    // Calling-agent hygiene (spec ".agy-staff/ hygiene"): the companion never
    // git-ignores its own state, so the caller must. Without this the implement
    // clean-tree precondition would trip over `?? .agy-staff/` on the 2nd call,
    // and the review/research delta report would blame agy for it.
    fs.appendFileSync(path.join(repo, '.git', 'info', 'exclude'), '\n.agy-staff/\n');
  }

  return { root, repo, home, git, argvFile: path.join(root, 'agy-argv.jsonl') };
}

/** Run the companion CLI in a sandbox. Returns {code, stdout, stderr}. */
export function run(sb, args, extraEnv = {}) {
  const r = spawnSync(process.execPath, [COMPANION, ...args], {
    cwd: sb.repo,
    encoding: 'utf8',
    env: {
      ...process.env,
      HOME: sb.home,
      AGY_BIN: FAKE_AGY,
      FAKE_AGY_ARGV_FILE: sb.argvFile,
      // The fake agy answers in microseconds; a real one takes seconds. Keep a
      // realistic minimum latency so these suites measure the interface, not
      // concurrent read-modify-writes of state.json (a residual lost-update
      // window exists without file locking; see tests/README.md). The
      // zero-latency paths are pinned separately in state.test.mjs.
      FAKE_AGY_SLEEP_MS: '300',
      ...extraEnv,
    },
  });
  if (r.error) throw r.error;
  return { code: r.status, stdout: r.stdout || '', stderr: r.stderr || '' };
}

/** Every argv the fake agy has seen so far, oldest first. */
export function agyCalls(sb) {
  if (!fs.existsSync(sb.argvFile)) return [];
  return fs
    .readFileSync(sb.argvFile, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l));
}

/** The prompt (`-p <prompt>`) of one recorded agy call. */
export function promptOf(argv) {
  const i = argv.indexOf('-p');
  return i >= 0 ? argv[i + 1] : '';
}

/**
 * The worker's log file for a job. Both stdout and stderr of the detached
 * worker land here, so this is where a background run's `[agy-staff]`
 * telemetry lives (it is deliberately absent from the result file).
 */
export function jobLog(sb, jobId) {
  const logFile = path.join(sb.repo, '.agy-staff', 'jobs', `${jobId}.log`);
  return fs.existsSync(logFile) ? fs.readFileSync(logFile, 'utf8') : '';
}

/** The stored result file of a job, exactly as wait/result print it. */
export function jobResultFile(sb, jobId) {
  const f = path.join(sb.repo, '.agy-staff', 'jobs', `${jobId}.result.md`);
  return fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : '';
}

/** The `job id: <id>` printed by a background dispatch. */
export function jobIdOf(stdout) {
  const m = /job id:\s*(\S+)/.exec(stdout);
  if (!m) throw new Error(`no job id in output:\n${stdout}`);
  return m[1];
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Wait, read-only, until the detached worker has written the job's result file
 * (both the success and the failure path write it) and then settle briefly so
 * the worker's final state.json update lands.
 *
 * Why not just poll `status`: every companion command rewrites state.json, so
 * polling *while* the worker runs exercises the residual concurrent
 * read-modify-write window (lost updates) instead of the interface under test.
 * See tests/README.md ("State-file races").
 */
async function waitForWorker(sb, jobId, { tries = 200, delayMs = 50 } = {}) {
  const resultFile = path.join(sb.repo, '.agy-staff', 'jobs', `${jobId}.result.md`);
  for (let i = 0; i < tries; i++) {
    if (fs.existsSync(resultFile)) {
      await sleep(200);
      return;
    }
    await sleep(delayMs);
  }
  throw new Error(`worker for ${jobId} never produced ${resultFile}`);
}

/**
 * Poll `status <id>` until the job leaves "running". Returns the terminal
 * status string.
 */
export async function waitForJob(sb, jobId, { tries = 40, delayMs = 100 } = {}) {
  await waitForWorker(sb, jobId);
  let last = 'unknown';
  for (let i = 0; i < tries; i++) {
    const r = run(sb, ['status', jobId]);
    const m = /"status":\s*"([a-z]+)"/.exec(r.stdout);
    last = m ? m[1] : `unknown (${r.stdout.trim() || r.stderr.trim()})`;
    if (last === 'done' || last === 'error' || last === 'crashed' || last === 'canceled') return last;
    await sleep(delayMs);
  }
  throw new Error(`job ${jobId} never left "running" (last: ${last})`);
}

/** Wait until at least n agy calls have been recorded. */
export async function waitForCalls(sb, n, { tries = 150, delayMs = 50 } = {}) {
  for (let i = 0; i < tries; i++) {
    const calls = agyCalls(sb);
    if (calls.length >= n) return calls;
    await sleep(delayMs);
  }
  throw new Error(`only ${agyCalls(sb).length} agy call(s) recorded, wanted ${n}`);
}
