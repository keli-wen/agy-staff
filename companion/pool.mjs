// Account pool: reads quota and switches accounts through the `agy-switch` CLI.
//
// agy has no per-run account option; its login is the App+agy credential agy-switch writes.
// Switching uses `--target agy`, which never closes or restarts the Antigravity App.
// This module only observes and (when relay is authorized) asks agy-switch to
// switch. It never reads or prints credentials: agy-switch's JSON output is an
// allow-list without tokens, and accounts are shown by label, never by email.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

/** Minimum remaining fraction (0..1) an account needs, by expected task size. */
export const NEED_MIN = { small: 0.10, medium: 0.30, large: 0.60 };
/** A relayed continuation only needs an account that is clearly not empty. */
export const HOP_MIN = 0.10;
export const DEFAULT_RELAY = {
  enabled: false,
  exhausted_below: 0.05,
  need: 'medium',
  max_hops: 4,
  wait_other_agy_seconds: 300,
};

export function configDir() {
  return process.env.AGY_STAFF_HOME || path.join(os.homedir(), '.agy-staff');
}
export function configFile() { return path.join(configDir(), 'config.json'); }

export function loadRelayConfig() {
  try {
    const raw = JSON.parse(fs.readFileSync(configFile(), 'utf8'))?.relay;
    if (!raw || typeof raw !== 'object') return { ...DEFAULT_RELAY };
    const out = { ...DEFAULT_RELAY };
    if (typeof raw.enabled === 'boolean') out.enabled = raw.enabled;
    if (Number.isFinite(raw.exhausted_below) && raw.exhausted_below >= 0 && raw.exhausted_below < 0.5) out.exhausted_below = raw.exhausted_below;
    if (NEED_MIN[raw.need]) out.need = raw.need;
    if (Number.isInteger(raw.max_hops) && raw.max_hops >= 0 && raw.max_hops <= 10) out.max_hops = raw.max_hops;
    if (Number.isFinite(raw.wait_other_agy_seconds) && raw.wait_other_agy_seconds >= 0) out.wait_other_agy_seconds = raw.wait_other_agy_seconds;
    return out;
  } catch {
    return { ...DEFAULT_RELAY };
  }
}

export function saveRelayConfig(patch) {
  let whole = {};
  try { whole = JSON.parse(fs.readFileSync(configFile(), 'utf8')) || {}; } catch { /* first write */ }
  whole.relay = { ...loadRelayConfig(), ...patch };
  fs.mkdirSync(configDir(), { recursive: true });
  const tmp = `${configFile()}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, JSON.stringify(whole, null, 2) + '\n');
  fs.renameSync(tmp, configFile());
  return whole.relay;
}

// ---------------------------------------------------------------------------
// agy-switch access
// ---------------------------------------------------------------------------

function switchCommand(args) {
  const bin = process.env.AGY_SWITCH_BIN || 'agy-switch';
  if (/\.(mjs|cjs|js)$/i.test(bin)) return { cmd: process.execPath, args: [bin, ...args] };
  return { cmd: bin, args };
}

/** Run agy-switch. Returns { code, json, stderr }; json is null when stdout is not JSON. */
export function runSwitch(args, { timeoutMs = 60_000 } = {}) {
  const c = switchCommand(args);
  const r = spawnSync(c.cmd, c.args, { encoding: 'utf8', timeout: timeoutMs, windowsHide: true, maxBuffer: 8 * 1024 * 1024 });
  if (r.error) return { code: null, json: null, stderr: r.error.code === 'ENOENT' ? 'agy-switch is not installed or not on PATH' : String(r.error.message) };
  let json = null;
  try { json = JSON.parse(r.stdout); } catch { /* plain text or empty */ }
  return { code: r.status, json, stderr: (r.stderr || '').trim().slice(0, 400) };
}

export function shortId(id) { return String(id || '').slice(0, 8); }
export function labelOf(account) {
  return (account?.custom_label && String(account.custom_label).trim()) || shortId(account?.id) || 'unknown';
}

/** gemini-* models draw on the Gemini pool; claude-* and gpt-* on the third-party pool. */
export function familyOf(model) {
  return /^(claude|gpt)/i.test(String(model || '')) ? '3p' : 'gemini';
}

/** Lowest known remaining fraction across the family's 5h and weekly buckets. */
export function remainingFor(quota, family) {
  if (!quota) return null;
  if (quota.is_forbidden) return { fraction: 0, bucket: 'forbidden', reset_time: null };
  const prefix = family === '3p' ? '3p-' : 'gemini-';
  let worst = null;
  for (const group of quota.quota_groups || []) {
    for (const bucket of group.buckets || []) {
      if (!String(bucket.bucket_id || '').startsWith(prefix)) continue;
      if (!bucket.remaining_fraction_known || !Number.isFinite(bucket.remaining_fraction)) continue;
      if (!worst || bucket.remaining_fraction < worst.fraction) {
        worst = { fraction: bucket.remaining_fraction, bucket: bucket.bucket_id, reset_time: bucket.reset_time || null };
      }
    }
  }
  return worst;
}

/** Read every saved account with its cached quota; `refresh` asks Google first. */
export function snapshot({ family = 'gemini', refresh = false } = {}) {
  if (refresh) {
    const r = runSwitch(['refresh', '--json'], { timeoutMs: 180_000 });
    if (r.code === null) return { error: r.stderr };
  }
  const listed = runSwitch(['accounts', 'list', '--json']);
  if (listed.code !== 0 || !Array.isArray(listed.json?.accounts)) {
    return { error: listed.stderr || `agy-switch accounts list failed (exit ${listed.code})` };
  }
  const accounts = listed.json.accounts.map((account) => {
    const quota = runSwitch(['quota', account.id, '--json']);
    const q = quota.code === 0 ? quota.json?.quota : null;
    return {
      id: account.id,
      label: labelOf(account),
      is_current: !!account.is_current,
      disabled: !!account.disabled,
      validation_blocked: !!account.validation_blocked,
      last_updated: q?.last_updated ?? null,
      remaining: remainingFor(q, family),
    };
  });
  return { family, refreshed: !!refresh, accounts };
}

/** Choose the account to run on. Keeps the current one when it is good enough. */
export function pickAccount(snap, { minimum, exclude = new Set() }) {
  const usable = snap.accounts.filter((a) => !a.disabled && !a.validation_blocked && !exclude.has(a.id)
    && a.remaining && a.remaining.fraction >= minimum);
  if (!usable.length) return null;
  const current = usable.find((a) => a.is_current);
  if (current) return { account: current, switchNeeded: false };
  const best = usable.reduce((top, a) => (a.remaining.fraction > top.remaining.fraction ? a : top));
  return { account: best, switchNeeded: true };
}

export function formatPool(snap) {
  if (snap.error) return `[agy-staff pool] unavailable: ${snap.error}`;
  const pct = (r) => (r ? `${Math.round(r.fraction * 100)}%` : 'unknown');
  const lines = [`[agy-staff pool] family=${snap.family} source=${snap.refreshed ? 'refreshed' : 'cached'} accounts=${snap.accounts.length}`];
  for (const a of snap.accounts) {
    const flags = [a.is_current ? 'current' : null, a.disabled ? 'disabled' : null, a.validation_blocked ? 'blocked' : null].filter(Boolean);
    lines.push(`- ${a.label}${flags.length ? ` (${flags.join(', ')})` : ''}: remaining=${pct(a.remaining)}` +
      `${a.remaining?.bucket ? ` limited_by=${a.remaining.bucket}` : ''}${a.remaining?.reset_time ? ` resets=${a.remaining.reset_time}` : ''}`);
  }
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// guards: switching is a global credential change
// ---------------------------------------------------------------------------

function listProcesses() {
  if (process.env.AGY_STAFF_PROCESS_LIST) {
    try { return fs.readFileSync(process.env.AGY_STAFF_PROCESS_LIST, 'utf8').split('\n').filter(Boolean); } catch { return null; }
  }
  if (process.platform === 'win32') {
    const r = spawnSync('tasklist', ['/FO', 'CSV', '/NH'], { encoding: 'utf8', windowsHide: true });
    return r.status === 0 ? r.stdout.split('\n').filter(Boolean) : null;
  }
  const r = spawnSync('ps', ['-axo', 'command='], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, windowsHide: true });
  return r.status === 0 ? r.stdout.split('\n').filter(Boolean) : null;
}

/** Number of live agy processes (a running invocation keeps its old token and may rewrite it). */
export function agyProcessCount(lines = listProcesses()) {
  if (!lines) return null;
  // `agy --hub` is the Antigravity App's background server, not a task run.
  return lines.filter((line) => !/\s--hub(?:\s|=|$)/.test(line) && (process.platform === 'win32'
    ? /^"agy\.exe"/i.test(line)
    : /^(?:\S*\/)?agy(?:\s|$)/.test(line))).length;
}

/** Switch the shared App+agy login without closing or restarting any client (`--target agy`). */
export function switchTo(account) {
  const r = runSwitch(['switch', account.id, '--target', 'agy', '--json'], { timeoutMs: 180_000 });
  const detail = r.code === 2 ? 'this agy-switch has no `--target agy` (switching without restarting the App); update agy-switch' : r.stderr;
  return { ok: r.code === 0, code: r.code, detail };
}

export function currentId() {
  const r = runSwitch(['current', '--json']);
  return r.code === 0 ? r.json?.account?.id ?? null : null;
}
