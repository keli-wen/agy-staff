#!/usr/bin/env node
/**
 * Fake `agy` CLI used by the companion regression tests.
 *
 * Never touches the network. Two behaviours:
 *   --version  → print a version string and exit 0 (what `setup` probes)
 *   otherwise  → append the full argv (JSON array, one line) to
 *                $FAKE_AGY_ARGV_FILE and print a single-line JSON payload
 *                shaped like a real `agy --output-format json` result.
 *
 * Env knobs (all optional):
 *   FAKE_AGY_ARGV_FILE       where to record argv (JSONL)
 *   FAKE_AGY_RESPONSE        response text            (default "fake answer")
 *   FAKE_AGY_STATUS          status field             (default "SUCCESS")
 *   FAKE_AGY_CONVERSATION_ID conversation id          (default "conv-1")
 *   FAKE_AGY_SLEEP_MS        stall before answering   (default 0)
 *   FAKE_AGY_EXIT            process exit code        (default 0)
 *   FAKE_AGY_TOUCH_FILE      create this file mid-"run" (default: touch nothing)
 *                            — simulates agy dirtying the working tree, which
 *                            the review/research delta report must catch
 *   FAKE_AGY_STDERR          text written to stderr alongside the payload
 *                            (or before dying under FAKE_AGY_NO_JSON)
 *   FAKE_AGY_ERROR           payload `error` field (default: absent)
 *   FAKE_AGY_NO_JSON         die before printing any payload (default exit 1),
 *                            with FAKE_AGY_STDERR on stderr — simulates agy
 *                            being killed by a harness sandbox pre-JSON
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

const argv = process.argv.slice(2);
if (process.env.FAKE_AGY_CWD_FILE) fs.writeFileSync(process.env.FAKE_AGY_CWD_FILE, process.cwd());

const argvFile = process.env.FAKE_AGY_ARGV_FILE;
if (argv.includes('--version')) {
  if (argvFile && process.env.FAKE_AGY_RECORD_VERSION) {
    try { fs.appendFileSync(argvFile, JSON.stringify(argv) + '\n'); } catch {}
  }
  process.stdout.write((process.env.FAKE_AGY_VERSION ?? '1.1.13-fake') + '\n');
  process.exit(0);
}
if (argvFile) {
  try {
    fs.appendFileSync(argvFile, JSON.stringify(argv) + '\n');
  } catch {
    /* recording is best-effort */
  }
}

if (argv[0] === 'models' || argv.includes('models')) {
  if (process.env.FAKE_AGY_MODELS_ERROR) {
    process.stderr.write(process.env.FAKE_AGY_MODELS_ERROR + '\n');
    process.exit(Number(process.env.FAKE_AGY_MODELS_EXIT || 1));
  }
  const defaultModels =
    process.env.FAKE_AGY_MODELS_OUTPUT ??
    [
      'Fetching available models...',
      'gemini-4-carbon-high\tGemini 4 Carbon (High)',
      'gemini-4-carbon-medium\tGemini 4 Carbon (Medium)',
      'gemini-4-carbon-low\tGemini 4 Carbon (Low)',
      'gemini-4-argon-high\tGemini 4 Argon (High)',
      'gemini-4-argon-medium\tGemini 4 Argon (Medium)',
      'gemini-4-argon-low\tGemini 4 Argon (Low)',
      'gemini-4-hydrogen-xhigh\tGemini 4 Hydrogen (XHigh)',
      'gemini-4-hydrogen-high\tGemini 4 Hydrogen (High)',
      'gemini-4-hydrogen-medium\tGemini 4 Hydrogen (Medium)',
      'gemini-4-hydrogen-low\tGemini 4 Hydrogen (Low)',
      'gemini-3.8-flash-high\tGemini 3.8 Flash (High)',
      'gemini-3.8-flash-medium\tGemini 3.8 Flash (Medium)',
      'gemini-3.8-flash-low\tGemini 3.8 Flash (Low)',
      'gemini-3.7-flash-high\tGemini 3.7 Flash (High)',
      'gemini-3.7-flash-medium\tGemini 3.7 Flash (Medium)',
      'gemini-3.7-flash-low\tGemini 3.7 Flash (Low)',
      'gemini-3.6-flash-high\tGemini 3.6 Flash (High)',
      'gemini-3.6-flash-medium\tGemini 3.6 Flash (Medium)',
      'gemini-3.6-flash-low\tGemini 3.6 Flash (Low)',
      'gemini-3.1-pro-high\tGemini 3.1 Pro (High)',
      'gemini-3.1-pro-low\tGemini 3.1 Pro (Low)',
    ].join('\n');
  process.stdout.write(defaultModels + '\n');
  process.exit(0);
}

// Side effect knob: write a file while the "model" is working, i.e. strictly
// between the companion's before/after `git status --porcelain` snapshots.
const touch = process.env.FAKE_AGY_TOUCH_FILE;
if (touch) {
  const target = path.resolve(touch);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, 'written by fake agy\n');
}

const streaming = argv[argv.indexOf('--output-format') + 1] === 'stream-json';
const modelFlagIndex = argv.indexOf('--model');
const requestedModel = modelFlagIndex >= 0 ? argv[modelFlagIndex + 1] : '';

function parseFailModels(raw) {
  if (!raw) return {};
  const trimmed = raw.trim();
  if (trimmed.startsWith('{')) {
    try { return JSON.parse(trimmed); } catch { return {}; }
  }
  const map = {};
  for (const part of trimmed.split(',')) {
    const idx = part.indexOf(':');
    if (idx > 0) {
      map[part.slice(0, idx).trim()] = part.slice(idx + 1).trim();
    }
  }
  return map;
}

const failModels = parseFailModels(process.env.FAKE_AGY_FAIL_MODELS);
const modelFailure = requestedModel ? failModels[requestedModel] : null;
if (modelFailure) {
  const kind = typeof modelFailure === 'object' ? modelFailure.kind : String(modelFailure);
  if (kind === 'sandbox' || kind === 'eperm') {
    process.stderr.write('Error: listen EPERM: operation not permitted 127.0.0.1\n');
    process.exit(1);
  }
  if (kind === 'unsupported_no_json') {
    process.stderr.write(`invalid model selection: unknown model ${requestedModel}\n`);
    process.exit(1);
  }
  if (streaming) {
    process.stdout.write(JSON.stringify({ event: 'init', init: { conversation_id: `conv-dead-${requestedModel}` } }) + '\n');
    if (process.env.FAKE_AGY_EVENTS) {
      for (const event of JSON.parse(process.env.FAKE_AGY_EVENTS)) process.stdout.write(JSON.stringify(event) + '\n');
    }
  }
  let errorMsg = `unknown model: ${requestedModel}`;
  let finishedReason;
  if (kind === 'unsupported') {
    errorMsg = `invalid model selection: model ${requestedModel} is not recognized as a known model`;
  } else if (kind === 'pro_unlisted') {
    // Exact verbatim output structure produced by agy 1.5.4 when the signed-in Pro
    // account's dynamic model list omits Ultra-only Carbon.
    const availableBlock = [
      'Available models:',
      '  gemini-4-argon-medium',
      '  gemini-4-argon-high',
      '  gemini-4-argon-low',
      '  gemini-3.8-flash-high',
      '  gemini-3.8-flash-medium',
      '  gemini-3.8-flash-low',
      '  claude-opus-5-5-medium',
      '  custom-auth-proxy-4030',
    ].join('\n');
    errorMsg = `invalid model selection (--model "${requestedModel}" --effort ""): model ${requestedModel} is not recognized as a known model or custom model in settings\n${availableBlock}`;
    process.stderr.write(`error: ${errorMsg}\n`);
    finishedReason = 'error';
  } else if (kind === 'hydrogen_only_unlisted') {
    const availableBlock = [
      'Available models:',
      '  gemini-4-hydrogen-xhigh',
      '  gemini-4-hydrogen-high',
      '  gemini-4-hydrogen-medium',
      '  gemini-4-hydrogen-low',
    ].join('\n');
    errorMsg = `invalid model selection (--model "${requestedModel}" --effort ""): model ${requestedModel} is not recognized as a known model or custom model in settings\n${availableBlock}`;
    process.stderr.write(`error: ${errorMsg}\n`);
    finishedReason = 'error';
  } else if (kind === 'flash_only_unlisted') {
    const availableBlock = [
      'Available models:',
      '  gemini-3.8-flash-high',
      '  gemini-3.8-flash-medium',
      '  gemini-3.8-flash-low',
    ].join('\n');
    errorMsg = `invalid model selection (--model "${requestedModel}" --effort ""): model ${requestedModel} is not recognized as a known model or custom model in settings\n${availableBlock}`;
    process.stderr.write(`error: ${errorMsg}\n`);
    finishedReason = 'error';
  } else if (kind === 'ultra_only_403') {
    process.stderr.write('AGY_ERROR: {"status":"PERMISSION_DENIED","error_code":403,"code_kind":"http","retryable":false,"error_id":"req-a403b-14290"}\n');
    errorMsg = 'Gemini 4 Carbon is only available to Google AI Ultra subscribers.';
    finishedReason = 'error';
  } else if (kind === 'ultra_precondition') {
    process.stderr.write('AGY_ERROR: {"status":"FAILED_PRECONDITION","error_code":400,"code_kind":"http","retryable":false,"error_id":"req-precond-99"}\n');
    errorMsg = `Model ${requestedModel} requires a Google AI Ultra subscription. Upgrade your plan to use this model.`;
    finishedReason = 'error';
  } else if (kind === 'unsupported_uuid_digits') {
    process.stderr.write('request_id=trace-a403b-14290-x401z\n');
    errorMsg = `unknown model: ${requestedModel}`;
  } else if (kind === 'quota' || kind === '429' || kind === 'resource_exhausted') {
    process.stderr.write('AGY_ERROR: {"status":"RESOURCE_EXHAUSTED","error_code":429,"code_kind":"http","retryable":false,"error_id":"err-quota"}\n');
    errorMsg = `429 Resource exhausted: quota exceeded for model ${requestedModel}`;
  } else if (kind === 'entitlement' || kind === '403_model') {
    process.stderr.write('AGY_ERROR: {"status":"PERMISSION_DENIED","error_code":403,"code_kind":"http","retryable":false,"error_id":"err-entitle"}\n');
    errorMsg = `Permission denied: model ${requestedModel} is not available for your account`;
  } else if (kind === '403_workspace') {
    process.stderr.write('AGY_ERROR: {"status":"PERMISSION_DENIED","error_code":403,"code_kind":"http","retryable":false,"error_id":"err-perm"}\n');
    errorMsg = 'Permission denied: caller does not have access to workspace';
  } else if (kind === 'token_revoked') {
    process.stderr.write('AGY_ERROR: {"status":"PERMISSION_DENIED","error_code":403,"code_kind":"http","retryable":false,"error_id":"err-tok"}\n');
    errorMsg = 'Authentication failed: token access revoked';
  } else if (kind === 'context_window') {
    process.stderr.write('AGY_ERROR: {"status":"INVALID_ARGUMENT","error_code":400,"code_kind":"http","retryable":false,"error_id":"err-ctx"}\n');
    errorMsg = 'Invalid argument: prompt exceeds model context window';
  } else if (kind === 'auth' || kind === '401') {
    process.stderr.write('AGY_ERROR: {"status":"UNAUTHENTICATED","error_code":401,"code_kind":"http","retryable":false,"error_id":"err-auth"}\n');
    errorMsg = '401 Unauthorized: Invalid credentials';
  }
  const errPayload = {
    conversation_id: '',
    status: 'ERROR',
    response: '',
    error: errorMsg,
    duration_seconds: 0,
    num_turns: 0,
    usage: { input_tokens: 0, output_tokens: 0 },
    ...(finishedReason ? { finished_reason: finishedReason } : {}),
  };
  await new Promise((resolve) => process.stdout.write(JSON.stringify(streaming ? { event: 'result', result: errPayload } : errPayload) + '\n', resolve));
  process.exit(1);
}

if (streaming && !process.env.FAKE_AGY_NO_JSON) {
  process.stdout.write(JSON.stringify({ event: 'init', init: { conversation_id: process.env.FAKE_AGY_CONVERSATION_ID ?? 'conv-1' } }) + '\n');
  if (process.env.FAKE_AGY_EVENTS) {
    for (const event of JSON.parse(process.env.FAKE_AGY_EVENTS)) process.stdout.write(JSON.stringify(event) + '\n');
  }
}

if (process.env.FAKE_AGY_CHILD_PID_FILE) {
  const descendantCode = "process.on('SIGTERM', () => {}); setTimeout(() => process.exit(0), 30000); setInterval(() => {}, 1000)";
  if (process.env.FAKE_AGY_ORPHAN_RELEASE_FILE) {
    const intermediary = `const fs = require('fs'); const child = require('child_process').spawn(process.execPath, ['-e', ${JSON.stringify(descendantCode)}], { detached: true, stdio: 'ignore' }); child.unref(); fs.writeFileSync(process.env.FAKE_AGY_CHILD_PID_FILE, String(child.pid)); setInterval(() => { if (fs.existsSync(process.env.FAKE_AGY_ORPHAN_RELEASE_FILE)) process.exit(0); }, 25);`;
    spawn(process.execPath, ['-e', intermediary], { stdio: 'ignore' });
  } else {
    const child = spawn(process.execPath, ['-e', descendantCode], { detached: !process.env.FAKE_AGY_INHERIT_STDIO, stdio: process.env.FAKE_AGY_INHERIT_STDIO ? ['ignore', 1, 2] : 'ignore' });
    fs.writeFileSync(process.env.FAKE_AGY_CHILD_PID_FILE, String(child.pid));
  }
}
if (process.env.FAKE_AGY_IGNORE_TERM) process.on('SIGTERM', () => {});

const sleepMs = Number(process.env.FAKE_AGY_SLEEP_MS || 0);
if (sleepMs > 0) {
  await new Promise((resolve) => setTimeout(resolve, sleepMs));
}
if (process.env.FAKE_AGY_RELEASE_FILE) {
  while (!fs.existsSync(process.env.FAKE_AGY_RELEASE_FILE)) await new Promise(resolve => setTimeout(resolve, 25));
}

// Crash knob: emulate agy dying before it can print JSON (e.g. blocked by a
// harness sandbox). Writes FAKE_AGY_STDERR to stderr, prints no payload.
if (process.env.FAKE_AGY_NO_JSON) {
  if (process.env.FAKE_AGY_STDOUT) process.stdout.write(process.env.FAKE_AGY_STDOUT + '\n');
  if (process.env.FAKE_AGY_STDERR) process.stderr.write(process.env.FAKE_AGY_STDERR + '\n');
  process.exit(Number(process.env.FAKE_AGY_EXIT || 1));
}

const payload = {
  status: process.env.FAKE_AGY_STATUS || 'SUCCESS',
  response: process.env.FAKE_AGY_RESPONSE ?? 'fake answer',
  conversation_id: process.env.FAKE_AGY_CONVERSATION_ID ?? 'conv-1',
  duration_seconds: 1,
  num_turns: 1,
  usage: { input_tokens: 1, output_tokens: 1 },
};
if (process.env.FAKE_AGY_ERROR) payload.error = process.env.FAKE_AGY_ERROR;
if (process.env.FAKE_AGY_FINISHED_REASON !== undefined) payload.finished_reason = JSON.parse(process.env.FAKE_AGY_FINISHED_REASON);

if (process.env.FAKE_AGY_STDERR) process.stderr.write(process.env.FAKE_AGY_STDERR + '\n');
await new Promise((resolve) => process.stdout.write(JSON.stringify(streaming ? { event: 'result', result: payload } : payload) + '\n', resolve));
if (process.env.FAKE_AGY_RESULT_FILE) fs.writeFileSync(process.env.FAKE_AGY_RESULT_FILE, 'result sent');
if (process.env.FAKE_AGY_AFTER_RESULT_MS) await new Promise(resolve => setTimeout(resolve, Number(process.env.FAKE_AGY_AFTER_RESULT_MS)));
process.exit(Number(process.env.FAKE_AGY_EXIT || 0));
