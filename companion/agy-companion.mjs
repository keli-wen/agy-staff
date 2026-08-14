#!/usr/bin/env node
/**
 * agy-companion — the single brain of the agy-staff plugin.
 *
 * Wraps Google's Antigravity CLI (`agy`) so Claude Code and OpenAI Codex can
 * delegate work to Gemini via three modes: research, review, implement.
 *
 * Subcommands:
 *   research | review | implement   run a task (see flags below)
 *   continue <text>                 continue the most recent conversation (any mode)
 *   status [job-id]                 list background jobs / show one job
 *   result [job-id]                 print the stored output of a finished job
 *   cancel <job-id>                 kill a running background job
 *   setup [--apply]                 install the read-only strict-profile allowlist
 *   _worker <job-id>                (internal) background job executor
 *
 * Uniform flags:
 *   --conversation <id>   resume a specific agy conversation
 *   --continue            reuse the last conversation id for this mode
 *   --model <id>          explicit agy model id (overrides --effort)
 *   --effort <l|m|h>      low|medium|high → gemini-3.7-flash-<effort>
 *   --strict / --loose    permission profile override (mode sets the default)
 *   --background / --wait execution style override (mode sets the default)
 *   --json                (review) ask agy for schema-enforced JSON findings
 *   --timeout <dur>       agy --print-timeout, e.g. 5m, 90s
 *   --diff-file <path>    (review) file whose contents are inlined into the prompt
 *   --pr <num>            (review) autonomous: agy fetches the PR itself via gh
 *   --target <ref>        (review) autonomous: agy diffs against this git ref
 *
 * No dependencies beyond the Node standard library.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const SELF = fileURLToPath(import.meta.url);
const TEMPLATES_DIR = path.join(path.dirname(SELF), '..', 'templates');
const AGY_BIN = process.env.AGY_BIN || 'agy';
const AGY_SETTINGS = path.join(os.homedir(), '.gemini', 'antigravity-cli', 'settings.json');

const MODES = ['research', 'review', 'implement'];

const DEFAULTS = {
  model: {
    research: 'gemini-3.7-flash-high',
    review: 'gemini-3.7-flash-medium',
    implement: 'gemini-3.7-flash-medium',
  },
  profile: { research: 'strict', review: 'strict', implement: 'loose' },
  timeout: { research: '10m', review: '5m', implement: '10m' },
  background: { research: false, review: false, implement: true },
};

// Read-only evidence-gathering allowlist installed by `setup`.
// agy command rules are prefix-matched on the command target
// ("command(git)" matches "git add" but not "github").
const STRICT_ALLOWLIST = [
  'command(git)',
  'command(gh)',
  'command(cat)',
  'command(head)',
  'command(ls)',
  'command(grep)',
  'command(find)',
  'command(rg)',
  'command(wc)',
];

// ~200KB inline-content ceiling; macOS ARG_MAX is ~1MB and the prompt
// travels as a single argv entry.
const MAX_INLINE_BYTES = 200 * 1024;

const REVIEW_JSON_SCHEMA = JSON.stringify({
  type: 'object',
  properties: {
    verdict: { type: 'string', enum: ['approve', 'request_changes', 'comment'] },
    summary: { type: 'string' },
    findings: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          severity: { type: 'string', enum: ['critical', 'high', 'medium', 'low', 'nit'] },
          file: { type: 'string' },
          line: { type: 'string' },
          title: { type: 'string' },
          detail: { type: 'string' },
        },
        required: ['severity', 'title', 'detail'],
      },
    },
    could_not_verify: { type: 'array', items: { type: 'string' } },
  },
  required: ['verdict', 'summary', 'findings', 'could_not_verify'],
});

// ---------------------------------------------------------------------------
// small utils
// ---------------------------------------------------------------------------

function die(msg, code = 1) {
  process.stderr.write(`agy-staff error: ${msg}\n`);
  process.exit(code);
}

function sh(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, ...opts });
  return { code: r.status ?? -1, out: (r.stdout || '').trim(), err: (r.stderr || '').trim() };
}

function repoRoot() {
  const r = sh('git', ['rev-parse', '--show-toplevel']);
  return r.code === 0 && r.out ? r.out : process.cwd();
}

function stateDir() {
  return path.join(repoRoot(), '.agy-staff');
}

function statePath() {
  return path.join(stateDir(), 'state.json');
}

function loadState() {
  try {
    return JSON.parse(fs.readFileSync(statePath(), 'utf8'));
  } catch {
    return { conversations: {}, last: null, jobs: [] };
  }
}

function saveState(state) {
  fs.mkdirSync(stateDir(), { recursive: true });
  fs.writeFileSync(statePath(), JSON.stringify(state, null, 2) + '\n');
}

function pidAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/** Shell-like tokenizer so `node companion.mjs review "$ARGUMENTS"` works
 *  whether the caller passes one big string or real argv entries. */
function tokenize(argv) {
  const tokens = [];
  for (const raw of argv) {
    if (!/\s/.test(raw)) {
      tokens.push(raw);
      continue;
    }
    let cur = '';
    let quote = null;
    let has = false;
    for (const ch of raw) {
      if (quote) {
        if (ch === quote) quote = null;
        else { cur += ch; }
      } else if (ch === '"' || ch === "'") {
        quote = ch;
        has = true;
      } else if (/\s/.test(ch)) {
        if (cur || has) tokens.push(cur);
        cur = '';
        has = false;
      } else {
        cur += ch;
      }
    }
    if (cur || has) tokens.push(cur);
  }
  return tokens.filter((t) => t !== '');
}

const VALUE_FLAGS = new Set(['conversation', 'model', 'effort', 'timeout', 'diff-file', 'pr', 'target']);
const BOOL_FLAGS = new Set(['continue', 'strict', 'loose', 'background', 'wait', 'json', 'apply', 'dry-run']);

function parseFlags(tokens) {
  const opts = { _: [] };
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.startsWith('--')) {
      const name = t.slice(2);
      if (VALUE_FLAGS.has(name)) {
        const v = tokens[++i];
        if (v === undefined) die(`flag --${name} needs a value`);
        opts[name] = v;
      } else if (BOOL_FLAGS.has(name)) {
        opts[name] = true;
      } else {
        die(`unknown flag --${name}`);
      }
    } else {
      opts._.push(t);
    }
  }
  return opts;
}

function fmtTokens(usage) {
  if (!usage) return 'n/a';
  const parts = [`in ${usage.input_tokens ?? '?'}`, `out ${usage.output_tokens ?? '?'}`];
  if (usage.thinking_tokens) parts.push(`think ${usage.thinking_tokens}`);
  if (usage.cache_read_tokens) parts.push(`cache ${usage.cache_read_tokens}`);
  return parts.join(', ');
}

// ---------------------------------------------------------------------------
// prompt building
// ---------------------------------------------------------------------------

function fillTemplate(mode, vars) {
  const file = path.join(TEMPLATES_DIR, `${mode}.md`);
  let text;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch {
    die(`template not found: ${file}`);
  }
  return text.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? '');
}

function gatherContext() {
  const branch = sh('git', ['branch', '--show-current']).out || '(no git branch)';
  return [
    `Working directory: ${process.cwd()}`,
    `Git branch: ${branch}`,
    `Date: ${new Date().toISOString().slice(0, 10)}`,
  ].join('\n');
}

function buildReviewDiffSection(opts) {
  if (opts['diff-file']) {
    let content;
    try {
      content = fs.readFileSync(opts['diff-file'], 'utf8');
    } catch (e) {
      die(`cannot read --diff-file ${opts['diff-file']}: ${e.message}`);
    }
    if (Buffer.byteLength(content) > MAX_INLINE_BYTES) {
      die(
        `inline content is ${Math.round(Buffer.byteLength(content) / 1024)}KB, over the ${MAX_INLINE_BYTES / 1024}KB limit ` +
          `(the prompt travels as a single argv entry; macOS ARG_MAX is ~1MB). ` +
          `Split the diff, or use autonomous review (--pr / --target) so agy fetches the evidence itself.`
      );
    }
    return 'The change under review is inlined below.\n\n```diff\n' + content + '\n```';
  }
  if (opts.pr) {
    return (
      `No diff is inlined. Gather the evidence yourself with your shell tool:\n` +
      `1. \`gh pr view ${opts.pr}\` for title, description, and discussion.\n` +
      `2. \`gh pr diff ${opts.pr}\` for the full diff.\n` +
      `3. Read surrounding source files with \`cat\`/\`grep\` where the diff alone is ambiguous.`
    );
  }
  if (opts.target) {
    return (
      `No diff is inlined. Gather the evidence yourself with your shell tool:\n` +
      `1. \`git diff ${opts.target}\` for the full diff against \`${opts.target}\`.\n` +
      `2. \`git log --oneline ${opts.target}..HEAD\` for the commit trail.\n` +
      `3. Read surrounding source files with \`cat\`/\`grep\` where the diff alone is ambiguous.`
    );
  }
  return null;
}

// ---------------------------------------------------------------------------
// agy invocation
// ---------------------------------------------------------------------------

function durationToMs(d) {
  const m = /^(\d+(?:\.\d+)?)(ms|s|m|h)$/.exec(d);
  if (!m) return null;
  const mult = { ms: 1, s: 1000, m: 60_000, h: 3_600_000 }[m[2]];
  return Math.round(parseFloat(m[1]) * mult);
}

function runAgy({ prompt, model, timeout, conversation, loose, jsonSchema }) {
  const args = ['-p', prompt, '--model', model, '--output-format', 'json', '--print-timeout', timeout];
  if (conversation) args.push('--conversation', conversation);
  if (loose) args.push('--dangerously-skip-permissions');
  if (jsonSchema) args.push('--json-schema', jsonSchema);

  const budget = (durationToMs(timeout) ?? 600_000) + 60_000; // grace over agy's own timeout
  const r = spawnSync(AGY_BIN, args, {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    timeout: budget,
  });
  if (r.error) die(`failed to launch agy (${AGY_BIN}): ${r.error.message}`);

  const stdout = (r.stdout || '').trim();
  const stderr = (r.stderr || '').trim();
  // agy prints a single-line JSON object; be defensive about leading noise.
  const start = stdout.indexOf('{');
  let payload = null;
  if (start >= 0) {
    try {
      payload = JSON.parse(stdout.slice(start));
    } catch {
      /* fall through */
    }
  }
  if (!payload) {
    die(
      `agy did not return parseable JSON (exit ${r.status}).\n` +
        `stdout: ${stdout.slice(0, 800) || '(empty)'}\n` +
        `stderr: ${stderr.slice(0, 800) || '(empty)'}`
    );
  }
  return { payload, stderr };
}

/** agy reports status:"SUCCESS" even when every tool call was denied; the
 *  response is then empty and stderr carries the permission note. */
function checkEmptyResponse(payload, stderr, profile) {
  const response = (payload.response || '').trim();
  if (response) return response;
  let msg =
    'agy returned an empty response (status was ' +
    `${payload.status || 'unknown'} but there is no content).`;
  if (profile === 'strict') {
    msg +=
      '\nUnder the strict profile every unlisted tool call is auto-denied, which is the usual cause.' +
      '\nFix: run `/agy:setup` once to install the read-only allowlist, or retry this command with `--loose`.' +
      '\nNote: some agy tools ignore allow-rules in headless mode and only work with `--loose`.';
  }
  if (stderr) msg += `\n\nagy stderr:\n${stderr}`;
  msg += `\n\nConversation id (you can still continue it): ${payload.conversation_id || 'unknown'}`;
  die(msg);
}

// ---------------------------------------------------------------------------
// run (research / review / implement / continue)
// ---------------------------------------------------------------------------

function resolveRun(mode, opts) {
  // model / effort
  let model = opts.model;
  if (!model) {
    if (opts.effort) {
      if (!['low', 'medium', 'high'].includes(opts.effort)) die('--effort must be low|medium|high');
      model = `gemini-3.7-flash-${opts.effort}`;
    } else {
      model = DEFAULTS.model[mode];
    }
  }

  // profile
  if (opts.strict && opts.loose) die('--strict and --loose are mutually exclusive');
  const profile = opts.strict ? 'strict' : opts.loose ? 'loose' : DEFAULTS.profile[mode];

  // execution style
  if (opts.background && opts.wait) die('--background and --wait are mutually exclusive');
  const background = opts.background ? true : opts.wait ? false : DEFAULTS.background[mode];

  const timeout = opts.timeout || DEFAULTS.timeout[mode];

  // conversation
  const state = loadState();
  let conversation = opts.conversation || null;
  if (!conversation && opts.continue) {
    conversation = state.conversations?.[mode] || null;
    if (!conversation) die(`--continue given but no previous ${mode} conversation is recorded in state.json`);
  }

  return { mode, model, profile, background, timeout, conversation };
}

function buildPrompt(mode, opts) {
  const task = opts._.join(' ').trim();
  const context = gatherContext();

  if (mode === 'review') {
    const diffSection = buildReviewDiffSection(opts);
    if (!diffSection) {
      die(
        'review needs a subject: pass --diff-file <path> (delegated context), or --pr <num> / --target <ref> (autonomous).'
      );
    }
    return fillTemplate('review', { TASK: task || 'General code review.', CONTEXT: context, DIFF: diffSection });
  }

  if (!task) die(`${mode} needs a task description`);
  if (Buffer.byteLength(task) > MAX_INLINE_BYTES) {
    die(`task text exceeds the ${MAX_INLINE_BYTES / 1024}KB inline limit`);
  }
  return fillTemplate(mode, { TASK: task, CONTEXT: context });
}

function loosePrecondition() {
  const r = sh('git', ['status', '--porcelain']);
  if (r.code !== 0) die('loose profile requires a git repository (git status failed)');
  if (r.out) {
    die(
      'loose profile refused: the working tree is not clean.\n' +
        'Commit or stash your changes first so agy edits are isolated and `git checkout .` can roll them back.\n\n' +
        r.out
    );
  }
}

function loosePostcondition() {
  const stat = sh('git', ['status', '--porcelain']).out;
  if (!stat) return '\n[loose] Working tree unchanged — agy made no file edits.';
  const diffStat = sh('git', ['diff', '--stat']).out;
  const untracked = stat
    .split('\n')
    .filter((l) => l.startsWith('??'))
    .map((l) => l.slice(3))
    .join(', ');
  let out = '\n[loose] agy modified the working tree. `git diff --stat`:\n' + (diffStat || '(only new files)');
  if (untracked) out += `\nNew untracked files: ${untracked}`;
  out +=
    '\nACTION FOR THE CALLING AGENT: show the user the full diff (`git diff`) and ask for confirmation before building on it. Rollback: `git checkout .` (plus deleting untracked files).';
  return out;
}

function executeRun(resolved, prompt, opts) {
  if (resolved.profile === 'loose') loosePrecondition();

  const { payload, stderr } = runAgy({
    prompt,
    model: resolved.model,
    timeout: resolved.timeout,
    conversation: resolved.conversation,
    loose: resolved.profile === 'loose',
    jsonSchema: opts.json && resolved.mode === 'review' ? REVIEW_JSON_SCHEMA : null,
  });

  const response = checkEmptyResponse(payload, stderr, resolved.profile);

  // persist conversation id
  const state = loadState();
  state.conversations = state.conversations || {};
  if (payload.conversation_id) {
    state.conversations[resolved.mode] = payload.conversation_id;
    state.last = { mode: resolved.mode, id: payload.conversation_id };
  }
  saveState(state);

  let footer =
    `\n---\n` +
    `[agy-staff] mode=${resolved.mode} profile=${resolved.profile} model=${resolved.model} ` +
    `duration=${payload.duration_seconds ?? '?'}s turns=${payload.num_turns ?? '?'} tokens(${fmtTokens(payload.usage)})\n` +
    `conversation: ${payload.conversation_id || 'unknown'} (follow up with --continue)`;

  if (resolved.profile === 'loose') footer += loosePostcondition();
  return response + footer;
}

function cmdRun(mode, opts) {
  const resolved = resolveRun(mode, opts);
  const prompt = buildPrompt(mode, opts);
  dispatch(resolved, prompt, opts);
}

function dispatch(resolved, prompt, opts) {
  const mode = resolved.mode;
  if (!resolved.background) {
    process.stdout.write(executeRun(resolved, prompt, opts) + '\n');
    return;
  }

  // fail fast in the foreground before detaching
  if (resolved.profile === 'loose') loosePrecondition();

  // background: write a job spec, spawn ourselves detached as _worker
  const jobId = `${mode}-${Date.now().toString(36)}${Math.floor(Math.random() * 36).toString(36)}`;
  const jobsDir = path.join(stateDir(), 'jobs');
  fs.mkdirSync(jobsDir, { recursive: true });
  const logFile = path.join(jobsDir, `${jobId}.log`);
  const specFile = path.join(jobsDir, `${jobId}.spec.json`);
  const resultFile = path.join(jobsDir, `${jobId}.result.md`);

  fs.writeFileSync(specFile, JSON.stringify({ resolved, prompt, opts: { json: !!opts.json } }, null, 2));

  const logFd = fs.openSync(logFile, 'a');
  const child = spawn(process.execPath, [SELF, '_worker', jobId], {
    cwd: process.cwd(),
    detached: true,
    stdio: ['ignore', logFd, logFd],
  });
  child.unref();
  fs.closeSync(logFd);

  const state = loadState();
  state.jobs = state.jobs || [];
  state.jobs.push({
    id: jobId,
    mode,
    pid: child.pid,
    status: 'running',
    started_at: new Date().toISOString(),
    log_file: logFile,
    result_file: resultFile,
  });
  saveState(state);

  process.stdout.write(
    `Started background ${mode} job.\n` +
      `job id: ${jobId} (pid ${child.pid})\n` +
      `model: ${resolved.model}  profile: ${resolved.profile}  timeout: ${resolved.timeout}\n` +
      `Check progress: /agy:status ${jobId}   Fetch output: /agy:result ${jobId}\n`
  );
}

function cmdWorker(jobId) {
  const jobsDir = path.join(stateDir(), 'jobs');
  const specFile = path.join(jobsDir, `${jobId}.spec.json`);
  const resultFile = path.join(jobsDir, `${jobId}.result.md`);
  const spec = JSON.parse(fs.readFileSync(specFile, 'utf8'));

  const output = executeRun(spec.resolved, spec.prompt, spec.opts);
  fs.writeFileSync(resultFile, output + '\n');
  const state = loadState();
  const job = (state.jobs || []).find((j) => j.id === jobId);
  if (job) {
    job.status = 'done';
    job.finished_at = new Date().toISOString();
  }
  saveState(state);
}

// die() exits the process, which would skip the worker's finish(); patch it
// inside the worker by converting exit into a throw.
function workerMain(jobId) {
  const realExit = process.exit.bind(process);
  let stderrBuf = '';
  const origWrite = process.stderr.write.bind(process.stderr);
  process.stderr.write = (chunk, ...rest) => {
    stderrBuf += chunk;
    return origWrite(chunk, ...rest);
  };
  process.exit = (code) => {
    if (code) throw new Error(stderrBuf.trim() || `exit ${code}`);
    realExit(0);
  };
  try {
    cmdWorker(jobId);
  } catch (e) {
    const jobsDir = path.join(stateDir(), 'jobs');
    const resultFile = path.join(jobsDir, `${jobId}.result.md`);
    try {
      fs.writeFileSync(resultFile, `Job failed:\n${e?.message || e}\n`);
    } catch {}
    const state = loadState();
    const job = (state.jobs || []).find((j) => j.id === jobId);
    if (job) {
      job.status = 'error';
      job.finished_at = new Date().toISOString();
    }
    saveState(state);
    realExit(1);
  }
}

// ---------------------------------------------------------------------------
// jobs: status / result / cancel
// ---------------------------------------------------------------------------

function refreshJobs(state) {
  for (const job of state.jobs || []) {
    if (job.status === 'running' && !pidAlive(job.pid)) {
      // worker exited without updating the record → crashed
      const hasResult = fs.existsSync(job.result_file);
      job.status = hasResult ? 'done' : 'crashed';
      job.finished_at = job.finished_at || new Date().toISOString();
    }
  }
  saveState(state);
}

function cmdStatus(opts) {
  const state = loadState();
  refreshJobs(state);
  const jobs = state.jobs || [];
  const id = opts._[0];

  if (id) {
    const job = jobs.find((j) => j.id === id);
    if (!job) die(`no job ${id} in this repository`);
    process.stdout.write(JSON.stringify(job, null, 2) + '\n');
    if (job.status === 'running') {
      process.stdout.write(`\nStill running. Log tail:\n`);
      const log = fs.existsSync(job.log_file) ? fs.readFileSync(job.log_file, 'utf8') : '';
      process.stdout.write(log.split('\n').slice(-10).join('\n') + '\n');
    }
    return;
  }

  if (!jobs.length) {
    process.stdout.write('No agy-staff jobs recorded in this repository.\n');
    return;
  }
  process.stdout.write('id | mode | status | started | finished\n');
  for (const j of jobs.slice(-20)) {
    process.stdout.write(`${j.id} | ${j.mode} | ${j.status} | ${j.started_at} | ${j.finished_at || '-'}\n`);
  }
  process.stdout.write('\nDetails: /agy:status <id>   Output: /agy:result <id>\n');
}

function cmdResult(opts) {
  const state = loadState();
  refreshJobs(state);
  const jobs = state.jobs || [];
  let job;
  if (opts._[0]) {
    job = jobs.find((j) => j.id === opts._[0]);
    if (!job) die(`no job ${opts._[0]} in this repository`);
  } else {
    job = [...jobs].reverse().find((j) => j.status !== 'running');
    if (!job) die('no finished jobs in this repository');
  }
  if (job.status === 'running') {
    die(`job ${job.id} is still running — check /agy:status ${job.id}`);
  }
  if (!fs.existsSync(job.result_file)) {
    die(`job ${job.id} (${job.status}) has no stored result. Log: ${job.log_file}`);
  }
  process.stdout.write(`# Job ${job.id} (${job.mode}, ${job.status})\n\n`);
  process.stdout.write(fs.readFileSync(job.result_file, 'utf8'));
}

function cmdCancel(opts) {
  const id = opts._[0];
  if (!id) die('cancel needs a job id (see /agy:status)');
  const state = loadState();
  const job = (state.jobs || []).find((j) => j.id === id);
  if (!job) die(`no job ${id} in this repository`);
  if (job.status !== 'running') {
    process.stdout.write(`Job ${id} is not running (status: ${job.status}).\n`);
    return;
  }
  try {
    process.kill(job.pid, 'SIGTERM');
  } catch {}
  job.status = 'canceled';
  job.finished_at = new Date().toISOString();
  saveState(state);
  process.stdout.write(`Canceled job ${id} (pid ${job.pid}).\n`);
}

// ---------------------------------------------------------------------------
// continue
// ---------------------------------------------------------------------------

function cmdContinue(opts) {
  const state = loadState();
  const last = state.last;
  if (!last?.id) die('no previous agy-staff conversation recorded in this repository');
  const mode = MODES.includes(last.mode) ? last.mode : 'research';

  const task = opts._.join(' ').trim();
  if (!task) die('continue needs follow-up text');

  const resolved = resolveRun(mode, { ...opts, conversation: opts.conversation || last.id });
  // continue defaults to waiting unless explicitly backgrounded
  if (!opts.background) resolved.background = false;

  const prompt = `Follow-up in the same conversation:\n\n${task}`;
  dispatch(resolved, prompt, opts);
}

// ---------------------------------------------------------------------------
// setup
// ---------------------------------------------------------------------------

function cmdSetup(opts) {
  // check agy availability
  const v = sh(AGY_BIN, ['--version']);
  if (v.code !== 0) {
    die(
      `agy CLI not found or not working (tried \`${AGY_BIN} --version\`).\n` +
        'Install Google Antigravity CLI and make sure `agy` is on PATH (expected at ~/.local/bin/agy).'
    );
  }

  let settings = {};
  let exists = false;
  try {
    settings = JSON.parse(fs.readFileSync(AGY_SETTINGS, 'utf8'));
    exists = true;
  } catch {}

  const current = settings.permissions?.allow || [];
  const missing = STRICT_ALLOWLIST.filter((r) => !current.includes(r));

  process.stdout.write(`agy CLI: OK (version ${v.out})\n`);
  process.stdout.write(`Global settings file: ${AGY_SETTINGS} ${exists ? '(exists)' : '(will be created)'}\n\n`);

  if (!missing.length) {
    process.stdout.write('Strict-profile allowlist is already installed. Nothing to do.\n');
    printSetupNotes();
    return;
  }

  process.stdout.write('The strict profile (research/review default) runs agy WITHOUT permission skipping.\n');
  process.stdout.write('For autonomous evidence gathering it needs these read-only allow-rules:\n\n');
  for (const r of STRICT_ALLOWLIST) {
    process.stdout.write(`  ${r}${current.includes(r) ? '  (already present)' : ''}\n`);
  }
  process.stdout.write(`\nThey will be appended to "permissions.allow" in ${AGY_SETTINGS}.\n`);

  if (!opts.apply) {
    process.stdout.write(
      '\nDRY RUN — nothing written. The settings file will be backed up first.\n' +
        'To apply: rerun with --apply after the user confirms.\n'
    );
    printSetupNotes();
    return;
  }

  if (exists) {
    const backup = `${AGY_SETTINGS}.bak-${new Date().toISOString().replace(/[:.]/g, '-')}`;
    fs.copyFileSync(AGY_SETTINGS, backup);
    process.stdout.write(`\nBacked up settings to ${backup}\n`);
  } else {
    fs.mkdirSync(path.dirname(AGY_SETTINGS), { recursive: true });
  }

  settings.permissions = settings.permissions || {};
  settings.permissions.allow = [...current, ...missing];
  fs.writeFileSync(AGY_SETTINGS, JSON.stringify(settings, null, 2) + '\n');
  process.stdout.write(`Wrote ${missing.length} allow-rule(s) to ${AGY_SETTINGS}. Setup complete.\n`);
  printSetupNotes();
}

function printSetupNotes() {
  process.stdout.write(
    '\nNotes:\n' +
      '- Command rules are prefix-matched: command(git) matches "git add" but not "github".\n' +
      '- agy also supports project-scoped permission rules (highest priority) tied to its --project system;\n' +
      '  the exact project-settings file path is undocumented/unverified, so this setup only edits the\n' +
      '  global file above. If a rule seems ignored, check agy interactively for project-level overrides.\n' +
      '- Some agy tools ignore allow-rules in headless mode entirely and only work with --loose\n' +
      '  (--dangerously-skip-permissions). If a strict run keeps coming back empty after setup, use --loose.\n'
  );
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------

function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  if (!cmd) {
    die(
      'usage: agy-companion.mjs <research|review|implement|continue|status|result|cancel|setup> [flags] [task]'
    );
  }
  const opts = parseFlags(tokenize(rest));

  if (MODES.includes(cmd)) return cmdRun(cmd, opts);
  switch (cmd) {
    case 'continue':
      return cmdContinue(opts);
    case 'status':
      return cmdStatus(opts);
    case 'result':
      return cmdResult(opts);
    case 'cancel':
      return cmdCancel(opts);
    case 'setup':
      return cmdSetup(opts);
    case '_worker':
      return workerMain(rest[0]);
    default:
      die(`unknown subcommand: ${cmd}`);
  }
}

main();
