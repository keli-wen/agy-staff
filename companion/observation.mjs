// Per-job projection of AGY's NDJSON protocol. No shared observer cursor.
import { StringDecoder } from 'node:string_decoder';

export const bytes = (value) => Buffer.byteLength(JSON.stringify(value), 'utf8');
export function excerpt(value, limit, tail = false) {
  const text = typeof value === 'string' ? value : JSON.stringify(value ?? '');
  if (bytes(text) <= limit) return { text, truncated: false };
  const chars = Array.from(text);
  let lo = 0, hi = chars.length;
  while (lo < hi) {
    const n = Math.ceil((lo + hi) / 2);
    const part = tail ? chars.slice(-n).join('') : chars.slice(0, n).join('');
    if (bytes(part) <= limit) lo = n; else hi = n - 1;
  }
  return { text: lo ? (tail ? chars.slice(-lo) : chars.slice(0, lo)).join('') : '', truncated: true };
}

export function boundSnapshot(snapshot) {
  const out = structuredClone(snapshot);
  while (bytes(out) + 1 > 8192 && out.recent_activities?.length) {
    out.recent_activities.shift();
    out.truncated = true;
  }
  if (bytes(out) + 1 > 8192) { out.latest_text = null; out.truncated = true; }
  // Path/configuration values can also be unusually large. Keep the object valid.
  if (bytes(out) + 1 > 8192) {
    for (const key of Object.keys(out)) {
      if (typeof out[key] === 'string') out[key] = excerpt(out[key], 256).text;
    }
    for (const key of Object.keys(out.details || {})) out.details[key] = excerpt(out.details[key], 512).text;
    out.truncated = true;
    out.details_truncated = true;
  }
  // Terminal observations add nested recovery/configuration strings. Budget
  // those too; a long path must not bypass the same 8 KiB response ceiling.
  if (bytes(out) + 1 > 8192) {
    const trim = (value, limit) => {
      if (typeof value === 'string') return excerpt(value, limit).text;
      if (Array.isArray(value)) return value.map((item) => trim(item, limit));
      if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, trim(item, limit)]));
      return value;
    };
    out.truncated = true;
    out.details_truncated = true;
    for (const limit of [256, 128, 64]) {
      const compact = trim(out, limit);
      if (bytes(compact) + 1 <= 8192) return compact;
    }
    return { job_id: excerpt(out.job_id || '', 256).text, status: out.status,
      result_file: excerpt(out.result_file || out.details?.result || '', 512).text,
      truncated: true, details_truncated: true };
  }
  return out;
}

export function createProjection(onConversation = () => {}) {
  const data = { last_event_at: null, recent_activities: [], latest_text: null, warnings: [] };
  let conversation = null;
  const warn = (message) => { if (!data.warnings.includes(message) && data.warnings.length < 5) data.warnings.push(message); };
  const accept = (event) => {
    data.last_event_at = new Date().toISOString();
    const body = event?.[event.event] || event;
    const id = body?.conversation_id;
    if (typeof id === 'string' && id.length <= 256 && id !== conversation) { conversation = id; onConversation(id); }
    if (event.event === 'init' || event.event === 'result') return;
    if (event.event !== 'step_update') { warn('Unknown event retained in raw output.'); return; }
    const step = event.step_update;
    if (!step || !Number.isInteger(step.step_index)) { warn('Unrecognized step retained in raw output.'); return; }
    const key = `${conversation}:${step.step_index}`;
    const state = step.state === 'ACTIVE' ? 'running' : step.state === 'DONE' ? 'done' : 'unknown';
    if (step.step_type === 'tool') {
      let item = data.recent_activities.find((a) => a.key === key);
      if (!item) {
        const oldest = data.recent_activities[0];
        if (data.recent_activities.length === 5 && oldest.key.startsWith(`${conversation}:`) && step.step_index < oldest.step_index) return;
        item = { key, step_index: step.step_index, started_at: data.last_event_at };
        data.recent_activities.push(item);
        if (data.recent_activities.length > 5) data.recent_activities.shift();
      }
      const info = step.tool_info || {};
      const tool = excerpt(step.tool_name || info.name || item.tool || 'unknown', 100);
      item.tool = tool.text; item.tool_truncated = tool.truncated || !!item.tool_truncated;
      item.updated_at = data.last_event_at;
      item.status = info.error || step.error || /ERROR|FAIL/.test(step.state || '') ? 'error' : state;
      if (info.parameters !== undefined) {
        const input = excerpt(info.parameters, 240);
        item.input_preview = input.text; item.input_truncated = input.truncated;
      }
      if (info.output !== undefined || info.error || step.error) {
        const output = excerpt(info.error || step.error || info.output, 240);
        item.output_preview = output.text; item.output_truncated = output.truncated;
      }
      item.truncated = !!(item.input_truncated || item.output_truncated || item.tool_truncated);
      if (item.status === 'error') warn('Tool reported an explicit error; see raw output.');
      // Identity is bounded too; keys are internal, never serialized.
      const publicItem = { ...item }; delete publicItem.key;
      if (bytes(publicItem) > 1024) { item.input_preview = ''; item.output_preview = ''; item.truncated = true; }
    } else if (step.step_type === 'agent_response') {
      if (data.latest_text?.key.startsWith(`${conversation}:`) && step.step_index < data.latest_text.step_index) return;
      if (typeof step.text_delta === 'string' && step.text_delta) {
        const prev = data.latest_text?.key === key ? data.latest_text : null;
        const text = excerpt((prev?.text || '') + step.text_delta, 1700, true);
        data.latest_text = { key, step_index: step.step_index, text: text.text, truncated: !!(prev?.truncated || text.truncated), updated_at: data.last_event_at, incomplete: state !== 'done', status: state };
      } else if (data.latest_text?.key === key) {
        data.latest_text.incomplete = state !== 'done';
        data.latest_text.status = state;
        data.latest_text.updated_at = data.last_event_at;
      }
    }
  };
  const snapshot = () => {
    const out = structuredClone(data);
    out.recent_activities.forEach((item) => delete item.key);
    if (out.latest_text) delete out.latest_text.key;
    return out;
  };
  return { accept, snapshot, warn };
}

// Bound the pending record independently of raw file retention. Large/malformed
// records degrade observation; only a valid result event can complete a job.
export function createParser(onEvent, onWarning, maxRecord = 8 * 1024 * 1024) {
  const decoder = new StringDecoder('utf8');
  let pending = '', dropping = false;
  const consume = (text) => {
    for (const fragment of text.split(/(?<=\n)/)) {
      const end = fragment.endsWith('\n');
      if (!dropping) {
        if (Buffer.byteLength(pending) + Buffer.byteLength(fragment) > maxRecord) {
          pending = ''; dropping = true; onWarning('Oversized record omitted from projection; see raw output.');
        } else pending += fragment;
      }
      if (end) {
        if (!dropping && pending.trim()) {
          let event;
          try { event = JSON.parse(pending); } catch { onWarning('Malformed record retained in raw output.'); }
          if (event && typeof event === 'object') onEvent(event);
        }
        pending = ''; dropping = false;
      }
    }
  };
  return { write: (chunk) => consume(decoder.write(chunk)), end: () => consume(decoder.end() + '\n') };
}
