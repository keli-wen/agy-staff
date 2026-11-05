// Native AGY metadata is evidence, not a retry policy or a task-completion verdict.
import { StringDecoder } from 'node:string_decoder';
import { excerpt } from './observation.mjs';

const MAX_LINE = 64 * 1024;
const MAX_ERRORS = 3;
const FINISHED_REASONS = new Set(['print_timeout', 'interrupted', 'error']);

/** Parse stderr before its display tail is truncated. Keep bounded, typed fields
 * from the last three AGY_ERROR records; the original stderr remains in the log.
 * AGY 1.4.12 uses status/error_code/code_kind/retryable/error_id, not
 * canonical_status. short_error is deliberately left in the original log. */
export function createNativeErrorCollector() {
  const decoder = new StringDecoder('utf8');
  let pending = '', dropping = false;
  const errors = [], warnings = [];
  const warn = (message) => { if (!warnings.includes(message)) warnings.push(message); };
  const line = (text) => {
    const match = /^\s*AGY_ERROR:\s*(.*)$/.exec(text.trimEnd());
    if (!match) return;
    let value;
    try { value = JSON.parse(match[1]); } catch { warn('Malformed AGY_ERROR record; see original stderr.'); return; }
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      warn('Malformed AGY_ERROR record; see original stderr.'); return;
    }
    const error = {};
    for (const field of ['status', 'code_kind', 'error_id']) {
      if (value[field] === undefined) continue;
      if (typeof value[field] !== 'string' || !value[field]) {
        warn('Invalid AGY_ERROR field type; see original stderr.'); continue;
      }
      const bounded = excerpt(value[field], 256);
      error[field] = bounded.text;
      if (bounded.truncated) warn('AGY_ERROR fields truncated; see original stderr.');
    }
    if (value.error_code !== undefined) {
      if (Number.isSafeInteger(value.error_code)) error.error_code = value.error_code;
      else warn('Invalid AGY_ERROR field type; see original stderr.');
    }
    if (value.retryable !== undefined) {
      if (typeof value.retryable === 'boolean') error.retryable = value.retryable;
      else warn('Invalid AGY_ERROR field type; see original stderr.');
    }
    if (!Object.keys(error).length) { warn('Unrecognized AGY_ERROR record; see original stderr.'); return; }
    errors.push(error);
    if (errors.length > MAX_ERRORS) {
      errors.shift(); warn('Older AGY_ERROR records omitted; see original stderr.');
    }
  };
  const consume = (text) => {
    for (const part of text.split(/(?<=\n)/)) {
      if (!dropping) {
        if (Buffer.byteLength(pending) + Buffer.byteLength(part) > MAX_LINE) {
          if (/^\s*AGY_ERROR:/.test(pending + part)) warn('Oversized AGY_ERROR record omitted; see original stderr.');
          pending = ''; dropping = true;
        } else pending += part;
      }
      if (part.endsWith('\n')) {
        if (!dropping) line(pending);
        pending = ''; dropping = false;
      }
    }
  };
  return {
    write(chunk) { consume(typeof chunk === 'string' ? chunk : decoder.write(chunk)); },
    end() { consume(decoder.end()); if (!dropping && pending) line(pending); pending = ''; },
    snapshot() { return { ...(errors.length ? { errors: structuredClone(errors) } : {}), ...(warnings.length ? { warnings: [...warnings] } : {}) }; },
  };
}

export function nativeResult(payload, diagnostic = {}, exitCode = null) {
  const out = { ...diagnostic, exit_code: exitCode };
  const warnings = [...(diagnostic.warnings || [])];
  if (typeof payload?.status === 'string') out.status = excerpt(payload.status, 128).text;
  if (payload?.finished_reason !== undefined) {
    if (typeof payload.finished_reason === 'string' && payload.finished_reason) {
      const reason = excerpt(payload.finished_reason, 256);
      out.finished_reason = reason.text;
      if (reason.truncated) warnings.push('finished_reason truncated; see original result.');
      if (!FINISHED_REASONS.has(payload.finished_reason)) warnings.push('Unknown finished_reason; see original result.');
    } else warnings.push('Invalid finished_reason; falling back to legacy result handling.');
  }
  if (warnings.length) out.warnings = warnings;
  return out;
}

export function hasNativeWarnings(native) {
  return !!(native?.finished_reason || native?.errors?.length || native?.warnings?.length || native?.compatibility_warning || native?.compatibility_error);
}

export function isResponseTimeout(payload, native) {
  // Explicit termination and API failure metadata outrank legacy prose. An API
  // DEADLINE_EXCEEDED is not evidence that --print-timeout expired.
  if (native.finished_reason) return native.finished_reason === 'print_timeout';
  if (native.errors?.length) return false;
  const status = String(payload.status || '').toUpperCase();
  return ['TIMEOUT', 'TIMED_OUT', 'RESPONSE_TIMEOUT'].includes(status) ||
    (status === 'ERROR' && /^timeout waiting for response[.!]?$/i.test(String(payload.error || '').trim()));
}
