#!/usr/bin/env node
/**
 * agy-companion — the single brain of the agy-staff plugin.
 *
 * Wraps Google's Antigravity CLI (`agy`) so Claude Code and OpenAI Codex can
 * delegate work to Gemini via five modes: staffer (general-purpose), research,
 * review, implement, ask.
 *
 * Subcommands:
 *   staffer | research | review | implement
 *                                   run a task as a background job (staffer is
 *                                   the general-purpose mode: a minimal prompt
 *                                   with no role or output-format framing)
 *   ask <question>                  cheap zero-tool one-shot Q&A (foreground)
 *   continue <text>                 continue the most recent conversation (any mode)
 *   status [job-id]                 list background jobs / show one job
 *   wait [job-id] [--timeout 100s]  block until the job finishes, then print
 *                                   its result (exit 2 = still running: call
 *                                   it again)
 *   result [job-id]                 print the stored output of a finished job
 *   cancel <job-id>                 kill a running background job
 *   setup [--apply]                 optional: install the evidence-gathering
 *                                   command allowlist used by restricted runs
 *   setup --restrict <modes|none>   optional: per-repo policy — make the listed
 *                                   modes default to the restricted profile in
 *                                   this repository (.agy-staff/config.json)
 *   _worker <job-id>                (internal) background job executor
 *
 * Uniform flags:
 *   --conversation <id>   resume a specific agy conversation
 *   --continue            reuse the last conversation id for this mode
 *   --model <id>          explicit agy model id (overrides --effort)
 *   --effort <l|m|h>      low|medium|high → gemini-3.7-flash-<effort>
 *   --restricted          hardening opt-in: keep agy's permission enforcement
 *                         on (wants setup's evidence-gathering allowlist)
 *   --unrestricted        pass --dangerously-skip-permissions (already the
 *                         default for research/review/implement)
 *   --json                (review) ask agy for schema-enforced JSON findings
 *   --delivery <mode>     (implement) diff|commit|pr
 *   --dirty continue      (implement) start from confirmed dirty state
 *   --include-baseline    (implement) allow dirty baseline in commit/pr
 *   --timeout <dur>       agy --print-timeout, e.g. 5m, 90s
 *   --prompt-file <path>  read the task text from a file (long prompts)
 *   --stdin               read the task text from stdin
 *
 * Permissions: all tool-using modes (staffer/research/review/implement) run
 * unrestricted by default, so they work out of the box with no setup;
 * --restricted is the hardening opt-in that relies on the evidence-gathering
 * allowlist installed by `setup`. ask is tool-free and always restricted.
 * Profile precedence: CLI flag > project policy (.agy-staff/config.json,
 * written by `setup --restrict`) > built-in default. The policy is a run
 * policy for per-repo consistency, not a security boundary.
 * The guardrails against irreversible side effects live in the prompt
 * templates, backed by tiered workspace checks here: implement records a task
 * snapshot, asks for a dirty-workspace decision when needed, and can deliver a
 * diff/commit/PR contract; staffer/review/research snapshot
 * `git status --porcelain` around the run and report any delta with the result
 * without ever blocking.
 *
 * Output split: stdout carries the deliverable — agy's response plus any guard
 * warning about the working tree. The `[agy-staff]` telemetry line (mode,
 * profile, model, duration, tokens, conversation id) goes to stderr, and for
 * background jobs into `jobs/<id>.log`; it is metadata for the calling agent,
 * never something to show the user.
 *
 * Execution style is fixed per mode and cannot be overridden: ask runs in the
 * foreground; staffer/research/review/implement run as detached background
 * jobs whose output is collected with wait/status/result/cancel.
 *
 * Job exit codes (`status <id>` and `wait`): 0 = done, 2 = running (for wait:
 * still running when its own timeout expired — call it again), 3 = error or
 * crashed, 4 = canceled. 1 stays the generic companion error (bad id, etc.),
 * so a caller can loop on "exit code 2" with zero output parsing.
 *
 * Review is prompt-based: the subject ("Review PR #730", "Review changes
 * against master") is described in the task text and agy gathers the evidence
 * itself with its own tools.
 *
 * No dependencies beyond the Node standard library.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const SELF = fileURLToPath(import.meta.url);
const TEMPLATES_DIR = path.join(path.dirname(SELF), '..', 'templates');
const AGY_BIN = process.env.AGY_BIN || 'agy';
const GH_BIN = process.env.AGY_STAFF_GH_BIN || 'gh';
const AGY_SETTINGS = path.join(os.homedir(), '.gemini', 'antigravity-cli', 'settings.json');

const MODES = ['staffer', 'research', 'review', 'implement', 'ask'];

const DEFAULTS = {
  model: {
    staffer: 'gemini-3.7-flash-medium',
    research: 'gemini-3.7-flash-high',
    review: 'gemini-3.7-flash-medium',
    implement: 'gemini-3.7-flash-medium',
    ask: 'gemini-3.7-flash-low',
  },
  // Every tool-using mode is unrestricted by default: headless agy denies
  // unlisted tool calls, so a restricted default made research/review come
  // back empty until the user ran `setup`. --restricted is the opt-in.
  // ask is tool-free, so its profile is irrelevant and stays restricted.
  profile: {
    staffer: 'unrestricted',
    research: 'unrestricted',
    review: 'unrestricted',
    implement: 'unrestricted',
    ask: 'restricted',
  },
  timeout: { staffer: '10m', research: '10m', review: '5m', implement: '10m', ask: '2m' },
  // Background-first: only ask (seconds-long, tool-free) stays in the foreground.
  // No flag overrides this; execution style is a property of the mode.
  background: { staffer: true, research: true, review: true, implement: true, ask: false },
};

// agy only accepts effort-suffixed model ids; bare family names are rejected
// with status ERROR ("--model gemini-3.7-flash requires --effort").
// Known ids from `agy models` (v1.1.13):
const KNOWN_MODELS = new Set([
  'gemini-3.7-flash-high', 'gemini-3.7-flash-medium', 'gemini-3.7-flash-low',
  'gemini-3.6-flash-high', 'gemini-3.6-flash-medium', 'gemini-3.6-flash-low',
  'gemini-3.5-flash-high', 'gemini-3.5-flash-medium', 'gemini-3.5-flash-low',
  'gemini-3.1-pro-high', 'gemini-3.1-pro-low',
  'claude-sonnet-4-6', 'claude-opus-4-6-thinking', 'gpt-oss-120b-medium',
]);
const MODEL_FAMILIES = {
  'gemini-3.7-flash': ['low', 'medium', 'high'],
  'gemini-3.6-flash': ['low', 'medium', 'high'],
  'gemini-3.5-flash': ['low', 'medium', 'high'],
  'gemini-3.1-pro': ['low', 'high'],
};
const MODEL_ALIASES = { flash: 'gemini-3.7-flash', pro: 'gemini-3.1-pro' };

/** Normalize a user-supplied --model value to an id agy accepts, or die
 *  pre-flight with a helpful message. Never lets a bare family reach agy. */
function normalizeModel(raw, effort) {
  const name = MODEL_ALIASES[raw] || raw;
  if (KNOWN_MODELS.has(name)) return name;
  const efforts = MODEL_FAMILIES[name];
  if (efforts) {
    let e = effort || 'medium';
    if (!efforts.includes(e)) {
      // e.g. gemini-3.1-pro has no medium: fall back to its highest tier
      const fallback = efforts[efforts.length - 1];
      process.stderr.write(`agy-staff: ${name} has no "${e}" effort; using ${name}-${fallback}\n`);
      e = fallback;
    }
    return `${name}-${e}`;
  }
  // future-tolerance: pass through anything already effort-suffixed
  if (/-(low|medium|high|thinking)$/.test(name)) return name;
  die(
    `unknown model id "${raw}". agy needs effort-suffixed ids, e.g. ` +
      `gemini-3.7-flash-low|medium|high, gemini-3.1-pro-low|high. ` +
      `Aliases accepted here: "flash" (gemini-3.7-flash), "pro" (gemini-3.1-pro), ` +
      `optionally combined with --effort. Run \`agy models\` for the full list.`
  );
}

// Evidence-gathering command allowlist installed by `setup` into the GLOBAL
// agy settings file. Not a read-only allowlist: agy command rules are
// prefix-matched on the command target, so "command(git)" matches "git log"
// but equally "git push", and "command(gh)" matches "gh pr merge".
const EVIDENCE_ALLOWLIST = [
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

// ~200KB task-text ceiling; macOS ARG_MAX is ~1MB and the prompt
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

function shBuffer(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { encoding: null, maxBuffer: 64 * 1024 * 1024, ...opts });
  return {
    code: r.status ?? -1,
    out: r.stdout || Buffer.alloc(0),
    err: (r.stderr || Buffer.alloc(0)).toString('utf8').trim(),
  };
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

function configPath() {
  return path.join(stateDir(), 'config.json');
}

// Modes whose default profile can be set per repo. ask is tool-free and
// always restricted, so it is not configurable.
const CONFIGURABLE_MODES = ['staffer', 'research', 'review', 'implement'];

/** Project policy (per-repo default profiles), written by `setup --restrict`.
 *  Missing file → null. Invalid file → die: a policy that is silently ignored
 *  is worse than an error. */
function loadProjectConfig() {
  let raw;
  try {
    raw = fs.readFileSync(configPath(), 'utf8');
  } catch {
    return null;
  }
  let cfg;
  try {
    cfg = JSON.parse(raw);
  } catch {
    die(`project config is corrupt: ${configPath()} — fix or delete it, then retry`);
  }
  for (const [m, p] of Object.entries(cfg.profiles || {})) {
    if (!CONFIGURABLE_MODES.includes(m)) {
      die(
        `project config: unknown mode "${m}" in ${configPath()} ` +
          `(configurable: ${CONFIGURABLE_MODES.join(', ')}; ask is always restricted)`
      );
    }
    if (p !== 'restricted' && p !== 'unrestricted') {
      die(`project config: profile for ${m} must be "restricted" or "unrestricted", got "${p}" (${configPath()})`);
    }
  }
  return cfg;
}

/** Create .agy-staff/ on first use and keep it out of `git status`.
 *  .git/info/exclude is repo-local and untracked — never the team's
 *  .gitignore. Best-effort: a read-only .git must not block a run. */
function ensureStateDir() {
  const dir = stateDir();
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    if (sh('git', ['check-ignore', '-q', dir]).code !== 0) {
      const p = sh('git', ['rev-parse', '--git-path', 'info/exclude']);
      if (p.code === 0 && p.out) {
        try {
          fs.appendFileSync(path.resolve(p.out), '.agy-staff/\n');
        } catch {}
      }
    }
  }
  return dir;
}

function loadState() {
  let raw;
  try {
    raw = fs.readFileSync(statePath(), 'utf8');
  } catch {
    return ensureStateShape({ conversations: {}, last: null, jobs: [] });
  }
  try {
    return ensureStateShape(JSON.parse(raw));
  } catch {
    // Never silently reset: every caller writes the state back, which would
    // wipe all job records and conversation ids.
    die(`state file is corrupt: ${statePath()} — fix or delete it, then retry`);
  }
}

function saveState(state) {
  ensureStateDir();
  // Atomic replace: a detached worker and a status/result call can read this
  // file at any moment; a plain truncate-then-write leaves a torn window.
  const tmp = statePath() + `.tmp-${process.pid}`;
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2) + '\n');
  fs.renameSync(tmp, statePath());
}

function pidAlive(pid) {
  if (pid == null) return true; // registered, pid backfill pending — treat as running
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/** Shell-like tokenizer for the single-string `$ARGUMENTS` shape. */
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

function normalizeArgv(argv) {
  return argv.length === 1 ? tokenize(argv) : argv;
}

const VALUE_FLAGS = new Set(['conversation', 'model', 'effort', 'timeout', 'restrict', 'prompt-file']);
for (const f of ['delivery', 'dirty', 'commit-message', 'pr-title', 'pr-body', 'base']) VALUE_FLAGS.add(f);
const BOOL_FLAGS = new Set([
  'continue',
  'restricted',
  'unrestricted',
  'json',
  'apply',
  'dry-run',
  'stdin',
  'include-baseline',
]);

// Flags dropped in 0.2. They get their own error instead of falling through to
// "unknown flag", so a 0.1 caller learns what replaced them.
const REMOVED_REVIEW_FLAGS = new Set(['diff-file', 'pr', 'target']);
const REMOVED_EXEC_FLAGS = new Set(['background', 'wait']);

// Deprecated 0.1 spellings, kept for one release and undocumented.
const FLAG_ALIASES = { strict: 'restricted', loose: 'unrestricted' };
const warnedAliases = new Set();

function migrationDie(name) {
  if (REMOVED_REVIEW_FLAGS.has(name)) {
    die(
      `--${name} was removed in 0.2: review is prompt-based now. Describe the subject in the prompt, ` +
        `e.g. \`review "Review PR #730"\` or \`review "Review changes against master"\`.`
    );
  }
  die(
    `--${name} was removed in 0.2: execution style is fixed per mode (ask runs in the foreground; ` +
      `research/review/implement run as background jobs). Use status/result/cancel to manage jobs.`
  );
}

function parseFlags(tokens, { stopAtFirstPositional = false } = {}) {
  const opts = { _: [] };
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t === '--') {
      opts._.push(...tokens.slice(i + 1));
      break;
    }
    if (t.startsWith('--')) {
      const eq = t.indexOf('=');
      let name = eq > 2 ? t.slice(2, eq) : t.slice(2);
      const inlineValue = eq > 2 ? t.slice(eq + 1) : null;
      if (REMOVED_REVIEW_FLAGS.has(name) || REMOVED_EXEC_FLAGS.has(name)) migrationDie(name);
      if (FLAG_ALIASES[name]) {
        if (!warnedAliases.has(name)) {
          warnedAliases.add(name);
          process.stderr.write(`agy-staff: --${name} is deprecated; use --${FLAG_ALIASES[name]}\n`);
        }
        name = FLAG_ALIASES[name];
      }
      if (VALUE_FLAGS.has(name)) {
        const v = inlineValue ?? tokens[++i];
        if (v === undefined) die(`flag --${name} needs a value`);
        opts[name] = v;
      } else if (BOOL_FLAGS.has(name)) {
        if (inlineValue != null) die(`flag --${name} does not take a value`);
        opts[name] = true;
      } else {
        die(`unknown flag --${name}`);
      }
    } else {
      opts._.push(t);
      if (stopAtFirstPositional) {
        opts._.push(...tokens.slice(i + 1));
        break;
      }
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

function oneLine(text, max = 80) {
  const s = String(text || '').replace(/\s+/g, ' ').trim();
  return s.length > max ? `${s.slice(0, max - 1).trimEnd()}…` : s;
}

function inferImplementDelivery(task) {
  if (/\b(?:open|create|raise|update|prepare)\s+(?:a\s+)?(?:pull request|PR)\b/i.test(task)) return 'pr';
  if (/\b(?:pull request|PR)\b/i.test(task) && /\b(?:push|branch|review)\b/i.test(task)) return 'pr';
  if (/\bcommit\b/i.test(task) && !/\b(?:do not|don't|without)\s+commit\b/i.test(task)) return 'commit';
  return 'diff';
}

function resolveDelivery(mode, opts, task) {
  if (opts.delivery && mode !== 'implement') die('--delivery applies only to implement');
  if (opts.dirty && mode !== 'implement') die('--dirty applies only to implement');
  if (opts['include-baseline'] && mode !== 'implement') die('--include-baseline applies only to implement');
  if (opts['commit-message'] && mode !== 'implement') die('--commit-message applies only to implement');
  if ((opts['pr-title'] || opts['pr-body'] || opts.base) && mode !== 'implement') {
    die('--pr-title, --pr-body, and --base apply only to implement');
  }
  if (mode !== 'implement') return null;

  const validDelivery = new Set(['diff', 'commit', 'pr']);
  const deliveryMode = opts.delivery || inferImplementDelivery(task);
  if (!validDelivery.has(deliveryMode)) die('--delivery must be diff|commit|pr');

  if (opts.dirty && opts.dirty !== 'continue') {
    die('--dirty currently supports only "continue"; stash, reset, and committing existing changes must be done explicitly outside the companion');
  }

  const summary = oneLine(task, 64);
  return {
    mode: deliveryMode,
    source: opts.delivery ? 'flag' : deliveryMode === 'diff' ? 'default' : 'task',
    dirty: opts.dirty || null,
    includeBaseline: !!opts['include-baseline'],
    commitMessage: opts['commit-message'] || `agy implement: ${summary || 'update'}`,
    prTitle: opts['pr-title'] || summary || 'agy implement update',
    prBody: opts['pr-body'] || `Automated implementation from agy-staff.\n\nTask: ${task}`,
    base: opts.base || null,
  };
}

function implementDeliveryPrompt(delivery) {
  if (!delivery) return '';
  const lines = [
    '## Delivery contract',
    '',
    `The agreed delivery mode is \`${delivery.mode}\` (${delivery.source}).`,
    'Implement the task and run safe local verification by default.',
    'Leave Git delivery to the companion. Do not commit, push, create a PR, rewrite history, stash, or reset from inside the model run.',
  ];
  if (delivery.mode === 'commit') {
    lines.push('After your run succeeds, the companion is authorized to commit the resulting task changes without a second confirmation.');
  } else if (delivery.mode === 'pr') {
    lines.push('After your run succeeds, the companion is authorized to commit, push the current branch, and create or update a draft pull request without a second confirmation.');
  } else {
    lines.push('After your run succeeds, the companion will leave a reviewable uncommitted diff.');
  }
  return lines.join('\n');
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

/** A `wait --timeout` that outlives the job itself: job timeout + agy's 60s
 *  grace + scheduling slack, rounded up to whole minutes. */
function collectTimeout(jobTimeout) {
  const ms = (durationToMs(jobTimeout) ?? 600_000) + 120_000;
  return `${Math.ceil(ms / 60_000)}m`;
}

function runAgy({ prompt, model, timeout, conversation, unrestricted, jsonSchema }) {
  const args = ['-p', prompt, '--model', model, '--output-format', 'json', '--print-timeout', timeout];
  if (conversation) args.push('--conversation', conversation);
  if (unrestricted) args.push('--dangerously-skip-permissions');
  if (jsonSchema) args.push('--json-schema', jsonSchema);

  const budget = (durationToMs(timeout) ?? 600_000) + 60_000; // grace over agy's own timeout
  const r = spawnSync(AGY_BIN, args, {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    timeout: budget,
  });
  if (r.error && r.error.code === 'ETIMEDOUT') {
    die(`agy timed out: no result within ${timeout} plus 60s grace. Retry with a larger --timeout, or narrow the task.`);
  }
  if (r.error) die(`failed to launch agy (${AGY_BIN}): ${r.error.message}`);
  if (r.signal) {
    die(`agy was killed by signal ${r.signal} before returning a result (companion budget: ${timeout} + 60s grace).`);
  }

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
    let msg =
      `agy did not return parseable JSON (exit ${r.status}).\n` +
      `stdout: ${stdout.slice(0, 800) || '(empty)'}\n` +
      `stderr: ${stderr.slice(0, 800) || '(empty)'}`;
    // EPERM on agy's own home files or on binding localhost is the signature of
    // a harness command sandbox (e.g. Codex workspace-write). agy cannot run
    // sandboxed: it binds a local port for its language server and reads its
    // OAuth token file, which sandbox secret-protection hides — no
    // writable_roots/network_access knob fixes the hidden token.
    if (/operation not permitted/i.test(stderr)) {
      msg +=
        '\n\nThis looks like a harness command sandbox blocking agy (EPERM on its log/state files or on binding 127.0.0.1). ' +
        'agy cannot run inside a sandbox — it needs a localhost port and its OAuth token file, which sandboxes typically hide. ' +
        'Run this companion command unsandboxed: in Codex, grant the workspace full access or approve the command with escalated permissions.';
    }
    die(msg);
  }
  return { payload, stderr, exit: r.status ?? 0 };
}

/** Triage the agy result into distinct classes with distinct guidance
 *  (never cross-suggested), or return the response text on success.
 *  1. status ERROR / nonzero exit, but a complete response came back
 *     → done_with_warnings: the deliverable exists, so return it (exit 0)
 *       and put the error on stderr. Discarding a finished answer because
 *       a late tool call failed loses data.
 *  2. status ERROR / nonzero exit, no response
 *     → agy's own error verbatim; NEVER suggest --unrestricted. Cause
 *       hints are appended only when the error text actually matches them.
 *  3. timeout                      → say so plainly.
 *  4. status SUCCESS, empty body   → permission fail-closed signature; only a
 *                                    --restricted run gets the setup hint
 *                                    (unrestricted runs have no rules to fix).
 */
function triageResult({ payload, stderr, exit }, mode, profile, profileSource) {
  const status = (payload.status || '').toUpperCase();
  const response = (payload.response || '').trim();
  const convNote = payload.conversation_id
    ? `\nConversation id (you can still continue it): ${payload.conversation_id}`
    : '';

  if (status.includes('TIMEOUT')) {
    die(
      `agy timed out (status ${payload.status}) before finishing.` +
        ` Retry with a larger --timeout, or narrow the task.${convNote}`
    );
  }

  if ((status && status !== 'SUCCESS') || exit !== 0) {
    if (response) {
      // done_with_warnings: the answer was produced before whatever failed
      // (e.g. one tool call timing out during wrap-up). Deliver it.
      process.stderr.write(
        `agy-staff warning: agy reported status ${payload.status || 'unknown'} (exit ${exit}) ` +
          'but returned a complete response — delivering it anyway.\n' +
          (payload.error ? `agy error: ${payload.error}\n` : '') +
          (stderr ? `agy stderr: ${stderr}\n` : '')
      );
      return response;
    }
    let msg = `agy reported an error (status ${payload.status || 'unknown'}, exit ${exit}).`;
    if (payload.error) msg += `\nagy error: ${payload.error}`;
    if (stderr) msg += `\nagy stderr: ${stderr}`;
    const errText = `${payload.error || ''}\n${stderr}`;
    const hints = [];
    if (/model|effort/i.test(errText)) {
      hints.push('invalid model id (agy needs effort-suffixed ids, e.g. gemini-3.7-flash-low — run `agy models`)');
    }
    if (/auth|login|credential|unauthorized|401|403/i.test(errText)) {
      hints.push('expired auth (run `agy` interactively once to re-login)');
    }
    if (/quota|rate.?limit|resource.?exhausted|429/i.test(errText)) {
      hints.push('exhausted quota');
    }
    if (hints.length) msg += `\nLikely cause: ${hints.join('; ')}.`;
    die(msg + convNote);
  }

  if (response) return response;

  // status SUCCESS but nothing came back
  if (mode === 'ask') {
    die(
      'unexpected: agy returned success with an empty answer, but ask uses no tools, so this cannot be a ' +
        'permission denial. Please report it (include the agy stderr below if any).' +
        (stderr ? `\n\nagy stderr:\n${stderr}` : '') +
        convNote
    );
  }
  let msg = 'agy returned an empty response (status SUCCESS but no content).';
  if (profile === 'restricted') {
    const cause =
      profileSource === 'project'
        ? 'This run was restricted by the project policy in .agy-staff/config.json'
        : 'This run used `--restricted`';
    const relax =
      profileSource === 'project'
        ? 'relax the policy (`setup --restrict none`) or pass `--unrestricted` for this run'
        : `drop \`--restricted\` — ${mode} runs unrestricted by default`;
    msg +=
      `\n${cause}, so agy kept its permission enforcement on: in headless mode every` +
      ' unlisted tool call is auto-denied, which is the usual cause of an empty response.' +
      `\nFix: run \`setup\` once to install the evidence-gathering command allowlist, or ${relax}.` +
      '\nNote: some agy tools ignore allow-rules in headless mode entirely, so even a complete allowlist cannot' +
      ' make them work; those need an unrestricted run.';
  }
  if (stderr) msg += `\n\nagy stderr:\n${stderr}`;
  die(msg + convNote);
}

// ---------------------------------------------------------------------------
// run (research / review / implement / continue)
// ---------------------------------------------------------------------------

function resolveRun(mode, opts, task = '') {
  // likely a typo for --restricted; --restrict (per-repo policy) belongs to setup
  if (opts.restrict !== undefined) {
    die(`--restrict is a setup flag (per-repo policy: \`setup --restrict <modes|none>\`). For a single ${mode} run use --restricted.`);
  }

  // model / effort
  if (opts.effort && !['low', 'medium', 'high'].includes(opts.effort)) {
    die('--effort must be low|medium|high');
  }
  let model;
  if (opts.model) {
    model = normalizeModel(opts.model, opts.effort);
  } else if (opts.effort) {
    model = `gemini-3.7-flash-${opts.effort}`;
  } else {
    model = DEFAULTS.model[mode];
  }

  // profile: CLI flag > project policy (.agy-staff/config.json) > built-in default
  if (opts.restricted && opts.unrestricted) die('--restricted and --unrestricted are mutually exclusive');
  const policyProfile = mode === 'ask' ? null : loadProjectConfig()?.profiles?.[mode] || null;
  let profile;
  let profileSource; // 'flag' | 'project' | 'default' — used by the empty-response hint
  if (opts.restricted || opts.unrestricted) {
    profile = opts.restricted ? 'restricted' : 'unrestricted';
    profileSource = 'flag';
  } else if (policyProfile) {
    profile = policyProfile;
    profileSource = 'project';
    process.stderr.write(`agy-staff: profile=${profile} set by project policy (${configPath()})\n`);
  } else {
    profile = DEFAULTS.profile[mode];
    profileSource = 'default';
  }
  if (mode === 'ask' && (opts.unrestricted || opts.restricted)) {
    if (opts.unrestricted) process.stderr.write('agy-staff: ask is tool-free; --unrestricted ignored\n');
    profile = 'restricted';
  }

  // execution style is a property of the mode; no flag overrides it
  const background = DEFAULTS.background[mode];

  const timeout = opts.timeout || DEFAULTS.timeout[mode];

  // conversation
  const state = loadState();
  let conversation = opts.conversation || null;
  if (!conversation && opts.continue) {
    conversation = state.conversations?.[mode] || null;
    if (!conversation) die(`--continue given but no previous ${mode} conversation is recorded in state.json`);
  }

  const delivery = resolveDelivery(mode, opts, task);

  return { mode, model, profile, profileSource, background, timeout, conversation, delivery };
}

/** Task text comes from exactly one source: inline argv, --prompt-file, or
 *  --stdin. Long prompts should use the latter two instead of shell quoting. */
function taskText(opts) {
  const inline = opts._.join(' ').trim();
  const sources = [
    inline && 'inline text',
    opts['prompt-file'] && '--prompt-file',
    opts.stdin && '--stdin',
  ].filter(Boolean);
  if (sources.length > 1) die(`task text given more than one way (${sources.join(', ')}) — use exactly one`);
  if (opts['prompt-file']) {
    try {
      return fs.readFileSync(opts['prompt-file'], 'utf8').trim();
    } catch (e) {
      die(`cannot read --prompt-file ${opts['prompt-file']}: ${e.message}`);
    }
  }
  if (opts.stdin) {
    try {
      return fs.readFileSync(0, 'utf8').trim();
    } catch (e) {
      die(`cannot read task text from stdin: ${e.message}`);
    }
  }
  return inline;
}

function requireTask(mode, task) {
  const text = (task || '').trim();
  if (!text) {
    if (mode === 'ask') die('ask needs a question');
    if (mode === 'review') {
      die(
        'review needs a subject description, e.g. review "Review PR #730" or review "Review the current working tree"'
      );
    }
    die(`${mode} needs a task description`);
  }
  if (Buffer.byteLength(text) > MAX_INLINE_BYTES) {
    die(`task text exceeds the ${MAX_INLINE_BYTES / 1024}KB inline limit`);
  }
  return text;
}

function buildPrompt(mode, task, resolved) {
  const text = requireTask(mode, task);
  const context = gatherContext();

  // ask is zero-tool by design: question only, no workspace context
  if (mode === 'ask') return fillTemplate('ask', { TASK: text });
  return fillTemplate(mode, {
    TASK: text,
    CONTEXT: context,
    DELIVERY: implementDeliveryPrompt(resolved.delivery),
  });
}

// ---------------------------------------------------------------------------
// tiered workspace guards
//
//   implement → inspect first. A dirty first run returns a decision packet
//               unless the caller explicitly chose `--dirty continue`.
//               Continuations compare the recorded task snapshot instead of
//               requiring a clean tree.
//   review /  → no gate at all, never blocked. They should not be touching
//   research    files, so we snapshot `git status --porcelain` around the run
//               and report any delta with the result.
//   staffer   → same snapshot/report, but neutrally worded: a general task may
//               legitimately edit files, so the delta is information for the
//               caller, not an accusation.
// ---------------------------------------------------------------------------

function inGitRepo() {
  const r = sh('git', ['rev-parse', '--is-inside-work-tree']);
  return r.code === 0 && r.out === 'true';
}

/** Porcelain lines as an array, or null when git can't tell us (no repo). */
function porcelainSnapshot() {
  const r = sh('git', ['status', '--porcelain']);
  if (r.code !== 0) return null;
  return r.out ? r.out.split('\n') : [];
}

/** Lines that appeared during the run, plus lines whose status changed for a
 *  path that was already dirty (e.g. " M f" → "MM f"). */
function porcelainDelta(before, after) {
  const seen = new Map();
  for (const line of before) seen.set(line.slice(3), line);
  return after.filter((line) => seen.get(line.slice(3)) !== line);
}

function hash(data) {
  return crypto.createHash('sha256').update(data).digest('hex');
}

function gitBuffer(args) {
  const r = shBuffer('git', args);
  return r.code === 0 ? r.out : Buffer.alloc(0);
}

function untrackedPathsFromStatus(raw) {
  return raw
    .toString('utf8')
    .split('\0')
    .filter((entry) => entry.startsWith('? '))
    .map((entry) => entry.slice(2));
}

function hashPath(root, rel) {
  const abs = path.resolve(root, rel);
  if (!abs.startsWith(root + path.sep) && abs !== root) return { path: rel, type: 'outside', hash: null };
  let st;
  try {
    st = fs.lstatSync(abs);
  } catch {
    return { path: rel, type: 'missing', hash: null };
  }
  if (st.isSymbolicLink()) {
    return { path: rel, type: 'symlink', hash: hash(fs.readlinkSync(abs)) };
  }
  if (st.isFile()) {
    return { path: rel, type: 'file', hash: hash(fs.readFileSync(abs)) };
  }
  if (st.isDirectory()) {
    const entries = fs.readdirSync(abs).sort();
    const parts = [];
    for (const name of entries) {
      const childRel = path.join(rel, name);
      parts.push(JSON.stringify(hashPath(root, childRel)));
    }
    return { path: rel, type: 'dir', hash: hash(parts.join('\0')) };
  }
  return { path: rel, type: 'other', hash: `${st.mode}:${st.size}:${st.mtimeMs}` };
}

function currentHead() {
  const r = sh('git', ['rev-parse', 'HEAD']);
  return r.code === 0 && r.out ? r.out : null;
}

function currentBranch() {
  return sh('git', ['branch', '--show-current']).out || '(detached)';
}

function workspaceSnapshot() {
  if (!inGitRepo()) return null;
  const root = repoRoot();
  const status = porcelainSnapshot() || [];
  const statusRaw = gitBuffer(['status', '--porcelain=v2', '-z']);
  const head = currentHead();
  const diffParts = head
    ? [gitBuffer(['diff', '--binary', 'HEAD'])]
    : [gitBuffer(['diff', '--binary']), gitBuffer(['diff', '--cached', '--binary'])];
  const untracked = untrackedPathsFromStatus(statusRaw).map((rel) => hashPath(root, rel));
  const statusHash = hash(statusRaw);
  const diffHash = hash(Buffer.concat(diffParts));
  const untrackedHash = hash(JSON.stringify(untracked));
  return {
    repoRoot: root,
    cwd: process.cwd(),
    worktree: sh('git', ['rev-parse', '--show-toplevel']).out || root,
    gitCommonDir: path.resolve(root, sh('git', ['rev-parse', '--git-common-dir']).out || '.git'),
    branch: currentBranch(),
    head,
    status,
    dirty: status.length > 0,
    statusHash,
    diffHash,
    untracked,
    fingerprint: hash([statusHash, diffHash, untrackedHash].join('\0')),
  };
}

function snapshotMismatches(expected, actual) {
  if (!expected && !actual) return [];
  if (!expected || !actual) return ['repository presence changed'];
  const checks = [
    ['repo root', expected.repoRoot, actual.repoRoot],
    ['worktree', expected.worktree, actual.worktree],
    ['branch', expected.branch, actual.branch],
    ['HEAD', expected.head || '(none)', actual.head || '(none)'],
  ];
  const out = [];
  for (const [label, a, b] of checks) {
    if (a !== b) out.push(`${label} changed: expected ${a}, got ${b}`);
  }
  if (expected.fingerprint !== actual.fingerprint) {
    out.push('workspace state changed since the recorded snapshot');
  }
  return out;
}

function formatStatus(lines) {
  return lines && lines.length ? lines.map((l) => `  ${l}`).join('\n') : '  (clean)';
}

function ensureStateShape(state) {
  state.conversations = state.conversations || {};
  state.jobs = state.jobs || [];
  state.implementTasks = state.implementTasks || {};
  state.implementConversations = state.implementConversations || {};
  return state;
}

function findImplementTask(state, resolved) {
  ensureStateShape(state);
  if (!resolved.conversation) return null;
  const taskId =
    state.implementConversations[resolved.conversation] ||
    (state.last?.id === resolved.conversation ? state.last?.taskId : null) ||
    null;
  if (!taskId) return null;
  return state.implementTasks[taskId] || null;
}

function dirtyWorkspaceDecision(snapshot, delivery) {
  const recommendation =
    delivery.mode === 'diff'
      ? 'If these changes are part of this task, rerun with `--dirty continue`; otherwise use an isolated worktree or commit/stash them explicitly first.'
      : 'For `commit` or `pr`, start from a clean or isolated worktree, or explicitly include the existing baseline with `--include-baseline` after confirming every path belongs in the delivery.';
  return (
    'implement needs a workspace decision before starting.\n' +
    `delivery: ${delivery.mode} (${delivery.source})\n` +
    `repo: ${snapshot.repoRoot}\n` +
    `branch: ${snapshot.branch}\n` +
    `HEAD: ${snapshot.head || '(no commits yet)'}\n\n` +
    'Current dirty state:\n' +
    `${formatStatus(snapshot.status)}\n\n` +
    `Recommended: ${recommendation}\n\n` +
    'Options:\n' +
    '- Rerun with `--dirty continue` when the listed changes are in scope for this implement task.\n' +
    '- Create an isolated worktree when this task is independent of the listed changes.\n' +
    '- Commit the existing changes first only after confirming the exact paths and intent.\n' +
    '- Stash only when the user explicitly asks for it.\n\n' +
    'No agy job was started.'
  );
}

function baselineDeliveryDecision(task, delivery) {
  return (
    `implement delivery ${delivery.mode} would include a dirty baseline from task ${task.id}.\n` +
    'The companion will not commit or put pre-existing changes into a PR unless the caller confirms they belong in this delivery.\n\n' +
    'Options:\n' +
    '- Rerun with `--include-baseline` after confirming the recorded baseline paths belong in the commit or PR.\n' +
    '- Keep `--delivery diff` and review the workspace manually.\n' +
    '- Move the task to an isolated worktree or commit the baseline separately first.\n\n' +
    'No Git delivery was performed.'
  );
}

function implementGuardApplies(resolved) {
  return resolved.mode === 'implement';
}

function treeReportApplies(resolved) {
  return resolved.profile === 'unrestricted' && ['staffer', 'review', 'research'].includes(resolved.mode);
}

function prepareImplementLaunch(resolved, jobId) {
  if (!inGitRepo()) {
    if (['commit', 'pr'].includes(resolved.delivery.mode)) {
      die(`implement delivery ${resolved.delivery.mode} needs a git repository; run from a repo or use --delivery diff.`);
    }
    process.stderr.write(
      'agy-staff warning: not a git repository — agy\'s edits cannot be reviewed or rolled back via git.\n' +
        'Proceeding anyway; back up anything you care about, or run implement from inside a repository.\n'
    );
    return { inGitRepo: false, taskId: jobId };
  }

  const snapshot = workspaceSnapshot();
  const state = loadState();
  const previous = findImplementTask(state, resolved);
  if (previous) {
    const mismatches = snapshotMismatches(previous.lastObservedSnapshot, snapshot);
    if (mismatches.length) {
      die(
        'implement continuation refused: workspace changed since the recorded implement task.\n' +
          mismatches.map((m) => `- ${m}`).join('\n') +
          '\n\nExpected status:\n' +
          `${formatStatus(previous.lastObservedSnapshot?.status || [])}\n\n` +
          'Current status:\n' +
          `${formatStatus(snapshot.status)}`
      );
    }
    const includeBaseline = previous.includeBaseline || resolved.delivery.includeBaseline;
    if (previous.baselineDirty && ['commit', 'pr'].includes(resolved.delivery.mode) && !includeBaseline) {
      die(baselineDeliveryDecision(previous, resolved.delivery));
    }
    return {
      inGitRepo: true,
      taskId: previous.id,
      continuation: true,
      launchSnapshot: snapshot,
      baselineSnapshot: previous.baselineSnapshot,
      baselineDirty: previous.baselineDirty,
      includeBaseline,
    };
  }

  if (snapshot.dirty && resolved.delivery.dirty !== 'continue') {
    die(dirtyWorkspaceDecision(snapshot, resolved.delivery));
  }
  if (snapshot.dirty && ['commit', 'pr'].includes(resolved.delivery.mode) && !resolved.delivery.includeBaseline) {
    die(
      dirtyWorkspaceDecision(snapshot, resolved.delivery) +
        '\n\nBecause this delivery would create Git history, `--dirty continue` alone is not enough. Add `--include-baseline` only after confirming these paths belong in the commit or PR.'
    );
  }

  return {
    inGitRepo: true,
    taskId: jobId,
    continuation: false,
    launchSnapshot: snapshot,
    baselineSnapshot: snapshot,
    baselineDirty: snapshot.dirty,
    includeBaseline: resolved.delivery.includeBaseline,
  };
}

function verifyImplementLaunch(resolved) {
  const launch = resolved.implement;
  if (!launch?.inGitRepo) return null;
  const current = workspaceSnapshot();
  const mismatches = snapshotMismatches(launch.launchSnapshot, current);
  if (mismatches.length) {
    die(
      'implement job refused: workspace changed after dispatch and before the worker started.\n' +
        mismatches.map((m) => `- ${m}`).join('\n') +
        '\n\nDispatch status:\n' +
        `${formatStatus(launch.launchSnapshot.status)}\n\n` +
        'Current status:\n' +
        `${formatStatus(current?.status || [])}`
    );
  }
  return current;
}

function implementPostcondition(resolved, before, afterRun, deliveryResult) {
  if (!inGitRepo()) return '';
  if (deliveryResult?.mode === 'commit') {
    if (deliveryResult.noChanges) {
      return '\n[unrestricted] implement delivery=commit found no workspace changes to commit.';
    }
    return (
      '\n[unrestricted] implement delivery=commit completed.\n' +
      `commit: ${deliveryResult.commit}\n` +
      `staged paths: ${deliveryResult.paths.join(', ')}`
    );
  }
  if (deliveryResult?.mode === 'pr') {
    return (
      '\n[unrestricted] implement delivery=pr completed.\n' +
      (deliveryResult.commit ? `commit: ${deliveryResult.commit}\n` : '') +
      `branch: ${deliveryResult.branch}\n` +
      `pull request: ${deliveryResult.prUrl || '(created or updated; gh did not return a URL)'}`
    );
  }
  if (deliveryResult?.mode === 'skipped') {
    return (
      `\n[unrestricted] implement delivery=${deliveryResult.requested} was not performed because agy finished with warnings.\n` +
      'The workspace result is left for review.'
    );
  }

  if (!afterRun?.dirty) return '\n[unrestricted] implement delivery=diff left the working tree unchanged.';
  const diffStat = sh('git', ['diff', '--stat']).out;
  const delta = before && afterRun ? porcelainDelta(before.status || [], afterRun.status || []) : afterRun.status || [];
  const changedShape = delta.length ? delta.map((l) => `  ${l}`).join('\n') : '  (content changed without a new status entry)';
  const untracked = delta
    .filter((l) => l.startsWith('??'))
    .map((l) => l.slice(3))
    .join(', ');
  let out =
    `\n[unrestricted] implement delivery=${resolved.delivery.mode} left workspace changes. ` +
    'Changed status entries since launch:\n' +
    changedShape +
    '\n`git diff --stat`:\n' +
    (diffStat || '(only new files)');
  if (untracked) out += `\nNew untracked files: ${untracked}`;
  out += '\nACTION FOR THE CALLING AGENT: review the diff or continue the same task; do not require a clean tree for this recorded result.';
  return out;
}

/** Tree-delta warning for staffer/review/research: silent unless agy dirtied
 *  the tree. review/research should never edit, so the report blames agy; a
 *  staffer task may legitimately edit, so its wording is neutral. */
function treeDeltaReport(mode, before, after) {
  if (!before || !after) return '';
  const delta = porcelainDelta(before, after);
  if (!delta.length) return '';
  const blame =
    mode === 'staffer'
      ? `agy modified the working tree during this ${mode} run — verify the task asked for it. `
      : `agy modified the working tree during this ${mode} — it should not have. `;
  return (
    `\n[unrestricted] ${blame}` +
    `Delta (\`git status --porcelain\` entries that appeared or changed during the run):\n` +
    delta.map((l) => `  ${l}`).join('\n') +
    `\nACTION FOR THE CALLING AGENT: inspect these changes (\`git diff\`) before trusting this ${mode}. ` +
      `Rollback: \`git checkout -- <path>\` for tracked files, delete the new untracked ones.`
  );
}

function runChecked(cmd, args, label) {
  const r = sh(cmd, args);
  if (r.code !== 0) {
    die(`${label} failed.\ncommand: ${cmd} ${args.join(' ')}\n${r.err || r.out || '(no output)'}`);
  }
  return r;
}

function statusPaths() {
  const r = shBuffer('git', ['status', '--porcelain', '-z']);
  if (r.code !== 0) return [];
  const entries = r.out.toString('utf8').split('\0').filter(Boolean);
  const paths = [];
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    if (entry.length < 4) continue;
    let rel = entry.slice(3);
    if ((entry[0] === 'R' || entry[1] === 'R' || entry[0] === 'C' || entry[1] === 'C') && entries[i + 1]) {
      rel = entries[++i];
    }
    if (rel && !rel.startsWith('.agy-staff/')) paths.push(rel);
  }
  return [...new Set(paths)];
}

function commitImplementChanges(resolved) {
  const paths = statusPaths();
  if (!paths.length) return { mode: 'commit', noChanges: true, paths: [], commit: null };
  runChecked('git', ['add', '--', ...paths], 'git add for implement delivery');
  runChecked('git', ['commit', '-m', resolved.delivery.commitMessage], 'git commit for implement delivery');
  const commit = runChecked('git', ['rev-parse', 'HEAD'], 'read new commit SHA').out;
  return { mode: 'commit', noChanges: false, paths, commit };
}

function branchExists(name) {
  return sh('git', ['show-ref', '--verify', '--quiet', `refs/heads/${name}`]).code === 0;
}

function defaultBaseBranch(current) {
  const remoteHead = sh('git', ['symbolic-ref', '--quiet', '--short', 'refs/remotes/origin/HEAD']).out;
  if (remoteHead?.startsWith('origin/')) return remoteHead.slice('origin/'.length);
  const merge = sh('git', ['config', `branch.${current}.merge`]).out;
  if (merge?.startsWith('refs/heads/')) return merge.slice('refs/heads/'.length);
  if (current !== 'master' && branchExists('master')) return 'master';
  if (current !== 'main' && branchExists('main')) return 'main';
  return current === 'master' ? 'main' : 'master';
}

function parseGhJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function createOrUpdatePullRequest(resolved, commitResult) {
  const branch = currentBranch();
  const base = resolved.delivery.base || defaultBaseBranch(branch);
  if (branch === base) {
    die(`implement delivery pr needs a feature branch; current branch "${branch}" is the PR base "${base}".`);
  }

  runChecked('git', ['push', '-u', 'origin', branch], 'git push for implement PR delivery');

  const existing = sh(GH_BIN, ['pr', 'view', '--head', branch, '--json', 'number,url']);
  if (existing.code === 0) {
    const pr = parseGhJson(existing.out);
    if (pr?.number) {
      runChecked(GH_BIN, ['pr', 'edit', String(pr.number), '--base', base, '--title', resolved.delivery.prTitle, '--body', resolved.delivery.prBody], 'gh pr edit for implement delivery');
      return { mode: 'pr', branch, base, commit: commitResult.commit, prNumber: pr.number, prUrl: pr.url || null };
    }
  }

  const created = runChecked(
    GH_BIN,
    ['pr', 'create', '--draft', '--base', base, '--head', branch, '--title', resolved.delivery.prTitle, '--body', resolved.delivery.prBody],
    'gh pr create for implement delivery'
  );
  return { mode: 'pr', branch, base, commit: commitResult.commit, prNumber: null, prUrl: created.out || null };
}

function finalizeImplementDelivery(resolved) {
  if (resolved.mode !== 'implement' || !resolved.delivery || !inGitRepo()) return null;
  if (!['commit', 'pr'].includes(resolved.delivery.mode)) return { mode: 'diff' };
  if (resolved.implement?.baselineDirty && !resolved.implement?.includeBaseline) {
    die(baselineDeliveryDecision({ id: resolved.implement.taskId }, resolved.delivery));
  }
  const commitResult = commitImplementChanges(resolved);
  if (resolved.delivery.mode === 'commit') return commitResult;
  return createOrUpdatePullRequest(resolved, commitResult);
}

function agySucceeded(result) {
  const status = (result.payload.status || '').toUpperCase();
  return (!status || status === 'SUCCESS') && result.exit === 0;
}

function recordImplementDispatch(state, resolved, jobId) {
  if (resolved.mode !== 'implement' || !resolved.implement?.inGitRepo) return;
  ensureStateShape(state);
  const launch = resolved.implement;
  const taskId = launch.taskId || jobId;
  let task = state.implementTasks[taskId];
  if (!task) {
    task = {
      id: taskId,
      mode: 'implement',
      conversationId: resolved.conversation || null,
      repoRoot: launch.launchSnapshot.repoRoot,
      worktree: launch.launchSnapshot.worktree,
      branch: launch.launchSnapshot.branch,
      baseHead: launch.launchSnapshot.head,
      baselineSnapshot: launch.baselineSnapshot,
      baselineDirty: launch.baselineDirty,
      includeBaseline: launch.includeBaseline,
      jobIds: [],
    };
    state.implementTasks[taskId] = task;
  }
  task.delivery = resolved.delivery;
  task.includeBaseline = launch.includeBaseline;
  task.lastDispatchSnapshot = launch.launchSnapshot;
  task.lastObservedSnapshot = task.lastObservedSnapshot || launch.launchSnapshot;
  task.status = 'running';
  if (!task.jobIds.includes(jobId)) task.jobIds.push(jobId);
}

function recordImplementFinish(state, resolved, payload, jobId, snapshot, deliveryResult) {
  if (resolved.mode !== 'implement' || !resolved.implement?.inGitRepo) return;
  ensureStateShape(state);
  const taskId = resolved.implement.taskId || jobId;
  const task = state.implementTasks[taskId] || { id: taskId, jobIds: [] };
  task.mode = 'implement';
  task.conversationId = payload.conversation_id || resolved.conversation || task.conversationId || null;
  task.repoRoot = snapshot?.repoRoot || task.repoRoot;
  task.worktree = snapshot?.worktree || task.worktree;
  task.branch = snapshot?.branch || task.branch;
  task.baseHead = task.baseHead ?? resolved.implement.baselineSnapshot?.head ?? null;
  task.baselineSnapshot = task.baselineSnapshot || resolved.implement.baselineSnapshot;
  task.baselineDirty = task.baselineDirty ?? resolved.implement.baselineDirty;
  task.includeBaseline = resolved.implement.includeBaseline;
  task.delivery = resolved.delivery;
  task.deliveryResult = deliveryResult || null;
  task.lastObservedSnapshot = snapshot || task.lastObservedSnapshot;
  task.status = 'done';
  if (!task.jobIds.includes(jobId)) task.jobIds.push(jobId);
  state.implementTasks[taskId] = task;
  if (task.conversationId) state.implementConversations[task.conversationId] = taskId;
}

function executeRun(resolved, prompt, opts, jobId = null) {
  const implementBefore = implementGuardApplies(resolved) ? verifyImplementLaunch(resolved) : null;
  const treeBefore = treeReportApplies(resolved) ? porcelainSnapshot() : null;

  const result = runAgy({
    prompt,
    model: resolved.model,
    timeout: resolved.timeout,
    conversation: resolved.conversation,
    unrestricted: resolved.profile === 'unrestricted',
    jsonSchema: opts.json && resolved.mode === 'review' ? REVIEW_JSON_SCHEMA : null,
  });
  const payload = result.payload;

  const response = triageResult(result, resolved.mode, resolved.profile, resolved.profileSource);
  const treeAfter = treeBefore ? porcelainSnapshot() : null;
  const implementAfterRun = implementGuardApplies(resolved) ? workspaceSnapshot() : null;
  const deliveryResult =
    implementGuardApplies(resolved) && agySucceeded(result)
      ? finalizeImplementDelivery(resolved)
      : implementGuardApplies(resolved) && ['commit', 'pr'].includes(resolved.delivery?.mode)
        ? { mode: 'skipped', requested: resolved.delivery.mode }
        : null;
  const implementAfterDelivery = implementGuardApplies(resolved) ? workspaceSnapshot() : null;

  // persist conversation id
  const state = loadState();
  ensureStateShape(state);
  if (payload.conversation_id) {
    state.conversations[resolved.mode] = payload.conversation_id;
    state.last = {
      mode: resolved.mode,
      id: payload.conversation_id,
      ...(resolved.implement?.taskId ? { taskId: resolved.implement.taskId } : {}),
    };
  }
  if (implementGuardApplies(resolved)) {
    recordImplementFinish(state, resolved, payload, jobId, implementAfterDelivery, deliveryResult);
  }
  saveState(state);

  // Telemetry is plumbing, not content: it goes to stderr so it never mixes
  // into the deliverable. Foreground runs put it on the caller's stderr;
  // background workers have stdout and stderr both wired to jobs/<id>.log, so
  // it lands there as the job's provenance record.
  process.stderr.write(
    `[agy-staff] mode=${resolved.mode} profile=${resolved.profile} model=${resolved.model} ` +
      `duration=${payload.duration_seconds ?? '?'}s turns=${payload.num_turns ?? '?'} tokens(${fmtTokens(payload.usage)})\n` +
      `conversation: ${payload.conversation_id || 'unknown'} (follow up with --continue)\n`
  );

  // Guard output is part of the body: the calling agent must act on it.
  let guard = '';
  if (implementGuardApplies(resolved)) {
    guard += implementPostcondition(resolved, implementBefore, implementAfterRun, deliveryResult);
  }
  if (treeReportApplies(resolved)) guard += treeDeltaReport(resolved.mode, treeBefore, treeAfter);
  return guard ? response + '\n' + guard : response;
}

function cmdRun(mode, opts) {
  if (opts.restrict !== undefined) {
    die(`--restrict is a setup flag (per-repo policy: \`setup --restrict <modes|none>\`). For a single ${mode} run use --restricted.`);
  }
  const task = requireTask(mode, taskText(opts));
  const resolved = resolveRun(mode, opts, task);
  const prompt = buildPrompt(mode, task, resolved);
  dispatch(resolved, prompt, opts);
}

function dispatch(resolved, prompt, opts) {
  const mode = resolved.mode;
  if (!resolved.background) {
    process.stdout.write(executeRun(resolved, prompt, opts) + '\n');
    return;
  }

  // background: write a job spec, spawn ourselves detached as _worker
  const jobId = `${mode}-${Date.now().toString(36)}${Math.floor(Math.random() * 36).toString(36)}`;
  if (implementGuardApplies(resolved)) resolved.implement = prepareImplementLaunch(resolved, jobId);
  const jobsDir = path.join(ensureStateDir(), 'jobs');
  fs.mkdirSync(jobsDir, { recursive: true });
  const logFile = path.join(jobsDir, `${jobId}.log`);
  const specFile = path.join(jobsDir, `${jobId}.spec.json`);
  const resultFile = path.join(jobsDir, `${jobId}.result.md`);

  fs.writeFileSync(specFile, JSON.stringify({ jobId, resolved, prompt, opts: { json: !!opts.json } }, null, 2));

  // Register the job BEFORE spawning: a fast worker's own state update must
  // find the record already present, or it gets lost in its read-modify-write.
  const state = loadState();
  ensureStateShape(state);
  state.jobs.push({
    id: jobId,
    mode,
    pid: null,
    status: 'running',
    started_at: new Date().toISOString(),
    log_file: logFile,
    result_file: resultFile,
    ...(resolved.delivery ? { delivery: resolved.delivery.mode } : {}),
    ...(resolved.implement?.taskId ? { task_id: resolved.implement.taskId } : {}),
  });
  recordImplementDispatch(state, resolved, jobId);
  saveState(state);

  const logFd = fs.openSync(logFile, 'a');
  const child = spawn(process.execPath, [SELF, '_worker', jobId], {
    cwd: process.cwd(),
    detached: true,
    stdio: ['ignore', logFd, logFd],
  });
  child.unref();
  fs.closeSync(logFd);

  // Backfill the pid, preserving whatever status the worker may have written.
  const after = loadState();
  const rec = (after.jobs || []).find((j) => j.id === jobId);
  if (rec) {
    rec.pid = child.pid;
    saveState(after);
  }

  // The collect hint is the canonical contract, stated where the caller needs
  // it: one background `wait` per job, bounded by the job's own timeout plus
  // the companion's grace.
  process.stdout.write(
    `Started background ${mode} job.\n` +
      `job id: ${jobId} (pid ${child.pid})\n` +
      `model: ${resolved.model}  profile: ${resolved.profile}  timeout: ${resolved.timeout}\n` +
      (resolved.delivery ? `delivery: ${resolved.delivery.mode} (${resolved.delivery.source})\n` : '') +
      `result file (written when the job finishes): ${resultFile}\n` +
      `Collect: run \`wait ${jobId} --timeout ${collectTimeout(resolved.timeout)}\` as a background command ` +
      `(one background wait per job; exit 0 = result printed, 2 = still running — wait again).\n` +
      `Peek: \`status ${jobId}\`   Stop: \`cancel ${jobId}\`\n`
  );
}

function cmdWorker(jobId) {
  const jobsDir = path.join(stateDir(), 'jobs');
  const specFile = path.join(jobsDir, `${jobId}.spec.json`);
  const resultFile = path.join(jobsDir, `${jobId}.result.md`);
  const spec = JSON.parse(fs.readFileSync(specFile, 'utf8'));

  const output = executeRun(spec.resolved, spec.prompt, spec.opts, spec.jobId || jobId);
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

/** Same status derivation as refreshJobs, but read-only. wait's poll loop uses
 *  this: writing state back on every poll would race the worker's own final
 *  read-modify-write of state.json and could clobber it (see tests/README.md,
 *  "State-file races"). */
function liveJobStatus(job) {
  if (job.status !== 'running') return job.status;
  if (pidAlive(job.pid)) return 'running';
  return fs.existsSync(job.result_file) ? 'done' : 'crashed';
}

// Machine-readable job exit codes shared by `status <id>` and `wait`.
// 1 stays the generic companion error, so callers can loop on "code 2"
// without parsing any output.
const JOB_EXIT_CODES = { done: 0, running: 2, error: 3, crashed: 3, canceled: 4 };

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
    // machine-readable outcome so callers never have to parse the JSON
    process.exitCode = JOB_EXIT_CODES[job.status] ?? 1;
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
  process.stdout.write('\nDetails: `status <id>`   Output: `result <id>`\n');
}

const sleepMs = (ms) => new Promise((r) => setTimeout(r, ms));

/** Block until the job reaches a terminal state, then print its result —
 *  `wait` + `result` in one call. Bounded by its own --timeout (default 100s,
 *  chosen to sit under a typical harness per-command timeout); expiring is NOT
 *  a failure: exit code 2 means "still running — call wait again". */
async function cmdWait(opts) {
  const id = opts._[0] || null;
  const timeout = opts.timeout || '100s';
  const budget = durationToMs(timeout);
  if (budget == null) die(`invalid --timeout "${timeout}" (examples: 100s, 5m)`);

  // Read-only lookup: the poll loop must never write state.json, or it races
  // the worker's own final read-modify-write (see liveJobStatus).
  const findJob = () => {
    const jobs = loadState().jobs || [];
    if (id) return jobs.find((j) => j.id === id) || null;
    return jobs.length ? jobs[jobs.length - 1] : null;
  };
  let job = findJob();
  if (!job) die(id ? `no job ${id} in this repository` : 'no agy-staff jobs recorded in this repository');

  const POLL_MS = 2000;
  const HEARTBEAT_MS = 15_000;
  const start = Date.now();
  let lastBeat = start;
  let status = liveJobStatus(job);
  while (status === 'running' && Date.now() - start < budget) {
    await sleepMs(Math.min(POLL_MS, budget - (Date.now() - start)));
    job = findJob();
    if (!job) die(`job record disappeared from state.json`);
    status = liveJobStatus(job);
    // Liveness on stderr so a long background wait stays observable without
    // ever mixing into the result on stdout.
    if (status === 'running' && Date.now() - lastBeat >= HEARTBEAT_MS) {
      lastBeat = Date.now();
      const elapsed = Math.round((Date.now() - start) / 1000);
      process.stderr.write(`agy-staff: still waiting on ${job.id} (${elapsed}s elapsed, budget ${timeout})\n`);
    }
  }

  if (status === 'running') {
    process.stdout.write(
      `Job ${job.id} (${job.mode}) is still running after ${timeout}.\n` +
        `Run \`wait ${job.id}\` again to keep waiting (exit code 2 means exactly this), or \`cancel ${job.id}\` to stop it.\n`
    );
    process.exitCode = JOB_EXIT_CODES.running;
    return;
  }

  // Terminal: safe to normalize the record persistently now — the worker is done.
  refreshJobs(loadState());
  job = findJob();
  status = job.status;

  if (fs.existsSync(job.result_file)) {
    process.stdout.write(`# Job ${job.id} (${job.mode}, ${status})\n\n`);
    process.stdout.write(fs.readFileSync(job.result_file, 'utf8'));
  } else {
    process.stdout.write(
      `Job ${job.id} (${job.mode}) finished with status ${status} and no stored result. Log: ${job.log_file}\n`
    );
  }
  process.exitCode = JOB_EXIT_CODES[status] ?? 1;
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
    die(`job ${job.id} is still running — collect it with \`wait ${job.id}\` or peek with \`status ${job.id}\``);
  }
  if (!fs.existsSync(job.result_file)) {
    die(`job ${job.id} (${job.status}) has no stored result. Log: ${job.log_file}`);
  }
  process.stdout.write(`# Job ${job.id} (${job.mode}, ${job.status})\n\n`);
  process.stdout.write(fs.readFileSync(job.result_file, 'utf8'));
}

function cmdCancel(opts) {
  const id = opts._[0];
  if (!id) die('cancel needs a job id (see `status`)');
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

  const task = taskText(opts);
  if (!task) die('continue needs follow-up text');

  // execution style follows the resumed mode's default (ask → foreground,
  // everything else → background job)
  const resolved = resolveRun(mode, { ...opts, conversation: opts.conversation || last.id }, task);

  const prompt =
    mode === 'implement'
      ? `${implementDeliveryPrompt(resolved.delivery)}\n\nFollow-up in the same conversation:\n\n${task}`
      : `Follow-up in the same conversation:\n\n${task}`;
  dispatch(resolved, prompt, opts);
}

// ---------------------------------------------------------------------------
// setup
// ---------------------------------------------------------------------------

/** `setup --restrict <modes|none>`: write the per-repo policy. Declarative —
 *  the listed modes become restricted-by-default, every unlisted mode falls
 *  back to the built-in default. Written directly (no --apply): the file is
 *  repo-local, git-ignored by convention, and trivially reversible. */
function applyProjectPolicy(value) {
  const cfg = loadProjectConfig() || {};
  if (value === 'none') {
    delete cfg.profiles;
    if (Object.keys(cfg).length) {
      fs.writeFileSync(configPath(), JSON.stringify(cfg, null, 2) + '\n');
    } else {
      try {
        fs.unlinkSync(configPath());
      } catch {}
    }
    process.stdout.write(`Project policy cleared — all modes use the built-in defaults again.\n\n`);
    return false;
  }

  const modes = value.split(',').map((s) => s.trim()).filter(Boolean);
  if (!modes.length) die('--restrict needs a value: a comma-separated list of modes, or "none" to clear');
  for (const m of modes) {
    if (m === 'ask') die('ask is tool-free and always restricted; it cannot be configured');
    if (!CONFIGURABLE_MODES.includes(m)) {
      die(`--restrict: unknown mode "${m}" (configurable: ${CONFIGURABLE_MODES.join(', ')}, or "none" to clear)`);
    }
  }
  cfg.profiles = {};
  for (const m of modes) cfg.profiles[m] = 'restricted';
  ensureStateDir();
  fs.writeFileSync(configPath(), JSON.stringify(cfg, null, 2) + '\n');

  process.stdout.write(`Project policy written: ${configPath()}\n`);
  for (const m of modes) process.stdout.write(`  ${m}: restricted (default for this repository)\n`);
  process.stdout.write(
    'Unlisted modes keep the built-in default (unrestricted). A --restricted/--unrestricted flag on a\n' +
      'call still overrides the policy. This is a per-repo, per-machine preference (.agy-staff/ is\n' +
      'normally git-ignored, so it is not shared with the team) and a run policy, not a security\n' +
      'boundary — for untrusted input use an isolated checkout.\n\n'
  );
  return true;
}

function cmdSetup(opts) {
  // check agy availability
  const v = sh(AGY_BIN, ['--version']);
  if (v.code !== 0) {
    die(
      `agy CLI not found or not working (tried \`${AGY_BIN} --version\`).\n` +
        'Install Google Antigravity CLI and make sure `agy` is on PATH (expected at ~/.local/bin/agy).'
    );
  }

  let policyWritten = false;
  if (opts.restrict !== undefined) policyWritten = applyProjectPolicy(opts.restrict);

  let settings = {};
  let exists = false;
  try {
    settings = JSON.parse(fs.readFileSync(AGY_SETTINGS, 'utf8'));
    exists = true;
  } catch {}

  const current = settings.permissions?.allow || [];
  const missing = EVIDENCE_ALLOWLIST.filter((r) => !current.includes(r));

  process.stdout.write(`agy CLI: OK (version ${v.out})\n`);
  const profiles = loadProjectConfig()?.profiles || {};
  const policyLine = Object.keys(profiles).length
    ? Object.entries(profiles)
        .map(([m, p]) => `${m}=${p}`)
        .join(' ')
    : '(none — built-in defaults apply)';
  process.stdout.write(`Project policy (${configPath()}): ${policyLine}\n`);
  process.stdout.write(`Global settings file: ${AGY_SETTINGS} ${exists ? '(exists)' : '(will be created)'}\n\n`);

  if (!missing.length) {
    process.stdout.write('The evidence-gathering command allowlist is already installed. Nothing to do.\n');
    printSetupNotes();
    return;
  }

  process.stdout.write(
    'Setup is optional hardening: research/review/implement already run unrestricted by default.\n' +
      'It only matters if you use `--restricted`, which keeps agy\'s permission enforcement on.\n'
  );
  process.stdout.write('For a restricted run to gather evidence autonomously it needs this command allowlist:\n\n');
  for (const r of EVIDENCE_ALLOWLIST) {
    process.stdout.write(`  ${r}${current.includes(r) ? '  (already present)' : ''}\n`);
  }
  process.stdout.write(`\nThey will be appended to "permissions.allow" in ${AGY_SETTINGS}.\n`);
  process.stdout.write(
    'Scope: this file is GLOBAL — the rules apply to every agy run on this machine, not just this repository.\n' +
      'These rules are NOT read-only: agy prefix-matches the command target, so command(git) also permits\n' +
      '`git push` / `git reset --hard` and command(gh) also permits `gh pr merge`.\n'
  );

  if (!opts.apply) {
    process.stdout.write(
      policyWritten
        ? '\nALLOWLIST DRY RUN — the global settings file was not touched (only the project policy above was written).\n' +
            'The settings file will be backed up first. To apply the allowlist: rerun with --apply after the user confirms.\n'
        : '\nDRY RUN — nothing written. The settings file will be backed up first.\n' +
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
      '- Scope: the allowlist lives in the GLOBAL settings file above, so it applies to every agy run on\n' +
      '  this machine, in any repository — not only where you ran setup.\n' +
      '- Command rules are prefix-matched on the command target: command(git) matches "git add" but not\n' +
      '  "github". Prefix matching does not distinguish reads from writes — command(git) also allows\n' +
      '  "git push" and "git reset --hard", command(gh) also allows "gh pr merge". Treat this as an\n' +
      '  evidence-gathering allowlist, not a read-only one.\n' +
      '- Security-sensitive users can scope permissions per project instead: agy supports project-scoped\n' +
      '  permission rules (highest priority) tied to its --project system, but the exact project-settings\n' +
      '  file path is undocumented/unverified, so this setup only edits the global file above. If a rule\n' +
      '  seems ignored, check agy interactively for project-level overrides.\n' +
      '- This allowlist only affects restricted runs. research/review/implement are unrestricted by\n' +
      '  default (--dangerously-skip-permissions), and unrestricted runs ignore permission rules entirely.\n' +
      '- Per-repo policy: `setup --restrict <mode,...>` (e.g. review,research) makes those modes default\n' +
      '  to the restricted profile in THIS repository only; `setup --restrict none` clears it. The policy\n' +
      '  lives in .agy-staff/config.json (normally git-ignored — a personal preference, not shared with\n' +
      '  the team), and a --restricted/--unrestricted flag on a call always wins. It is a run policy for\n' +
      '  consistency, not a security boundary.\n' +
      '- Some agy tools ignore allow-rules in headless mode entirely and only work unrestricted. If a\n' +
      '  --restricted run keeps coming back empty even after setup, drop --restricted.\n'
  );
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------

function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  if (!cmd) {
    die(
      'usage: agy-companion.mjs <staffer|research|review|implement|ask|continue|status|wait|result|cancel|setup> [flags] [task]\n' +
        'flags: --restricted|--unrestricted --model <id> --effort <l|m|h> --timeout <dur> ' +
        '--prompt-file <path> --stdin --conversation <id> --continue --json (review) ' +
        '--delivery <diff|commit|pr> --dirty continue --include-baseline (implement) ' +
        '--apply --restrict <modes|none> (setup)\n' +
        'staffer/research/review/implement run unrestricted by default (no setup needed); --restricted is the ' +
        'hardening opt-in that uses the evidence-gathering allowlist from `setup`. ask is always tool-free. ' +
        'Per-repo policy: `setup --restrict review,research` makes those modes restricted by default here.'
    );
  }
  const opts = parseFlags(normalizeArgv(rest), { stopAtFirstPositional: MODES.includes(cmd) || cmd === 'continue' });

  if (MODES.includes(cmd)) return cmdRun(cmd, opts);
  switch (cmd) {
    case 'continue':
      return cmdContinue(opts);
    case 'status':
      return cmdStatus(opts);
    case 'wait':
      return cmdWait(opts).catch((e) => die(e?.message || String(e)));
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
