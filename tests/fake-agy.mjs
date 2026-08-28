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
 *   FAKE_AGY_TOUCH_CONTENT   content for FAKE_AGY_TOUCH_FILE
 *   FAKE_AGY_STDERR          text written to stderr alongside the payload
 *                            (or before dying under FAKE_AGY_NO_JSON)
 *   FAKE_AGY_ERROR           payload `error` field (default: absent)
 *   FAKE_AGY_NO_JSON         die before printing any payload (default exit 1),
 *                            with FAKE_AGY_STDERR on stderr — simulates agy
 *                            being killed by a harness sandbox pre-JSON
 */
import fs from 'node:fs';
import path from 'node:path';

const argv = process.argv.slice(2);

if (argv.includes('--version')) {
  process.stdout.write('1.1.13-fake\n');
  process.exit(0);
}

const argvFile = process.env.FAKE_AGY_ARGV_FILE;
if (argvFile) {
  try {
    fs.appendFileSync(argvFile, JSON.stringify(argv) + '\n');
  } catch {
    /* recording is best-effort */
  }
}

// Side effect knob: write a file while the "model" is working, i.e. strictly
// between the companion's before/after `git status --porcelain` snapshots.
const touch = process.env.FAKE_AGY_TOUCH_FILE;
if (touch) {
  const target = path.resolve(touch);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, process.env.FAKE_AGY_TOUCH_CONTENT || 'written by fake agy\n');
}

const sleepMs = Number(process.env.FAKE_AGY_SLEEP_MS || 0);
if (sleepMs > 0) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, sleepMs);
}

// Crash knob: emulate agy dying before it can print JSON (e.g. blocked by a
// harness sandbox). Writes FAKE_AGY_STDERR to stderr, prints no payload.
if (process.env.FAKE_AGY_NO_JSON) {
  if (process.env.FAKE_AGY_STDERR) process.stderr.write(process.env.FAKE_AGY_STDERR + '\n');
  process.exit(Number(process.env.FAKE_AGY_EXIT || 1));
}

const payload = {
  status: process.env.FAKE_AGY_STATUS || 'SUCCESS',
  response: process.env.FAKE_AGY_RESPONSE ?? 'fake answer',
  conversation_id: process.env.FAKE_AGY_CONVERSATION_ID || 'conv-1',
  duration_seconds: 1,
  num_turns: 1,
  usage: { input_tokens: 1, output_tokens: 1 },
};
if (process.env.FAKE_AGY_ERROR) payload.error = process.env.FAKE_AGY_ERROR;

if (process.env.FAKE_AGY_STDERR) process.stderr.write(process.env.FAKE_AGY_STDERR + '\n');
process.stdout.write(JSON.stringify(payload) + '\n');
process.exit(Number(process.env.FAKE_AGY_EXIT || 0));
