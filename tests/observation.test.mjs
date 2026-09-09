import test from 'node:test';
import assert from 'node:assert/strict';
import { bytes, createParser, createProjection, boundSnapshot } from '../companion/observation.mjs';
const step = (index, type, state, extra = {}) => ({ event: 'step_update', step_update: { conversation_id: 'c', step_index: index, step_type: type, state, ...extra } });

test('UTF-8 chunks, multiple records, malformed/oversized lines and unterminated final record', () => {
  const events = [], warnings = [];
  const parser = createParser((e) => events.push(e), (w) => warnings.push(w), 100);
  const input = Buffer.from('{"text":"\u4e2d\u6587😀"}\nnope\n' + 'x'.repeat(200) + '\n{"last":true}');
  for (const byte of input) parser.write(Buffer.from([byte]));
  parser.end();
  assert.deepEqual(events, [{ text: '\u4e2d\u6587😀' }, { last: true }]);
  assert.equal(warnings.length, 2);
});

test('tool snapshots merge, recent text concatenates DONE delta and stays independent', () => {
  const p = createProjection();
  for (let i = 0; i < 7; i++) p.accept(step(i, 'tool', 'ACTIVE', { tool_name: 'shell', tool_info: { parameters: { command: String(i) } } }));
  p.accept(step(6, 'tool', 'DONE', { tool_info: { output: 'out' } }));
  p.accept(step(8, 'agent_response', 'ACTIVE', { text_delta: '\u4f60' }));
  p.accept(step(8, 'agent_response', 'ACTIVE', { text_delta: '\u597d' }));
  assert.equal(p.snapshot().latest_text.incomplete, true);
  p.accept(step(8, 'agent_response', 'DONE', { text_delta: '😀' }));
  const s = p.snapshot();
  assert.equal(s.recent_activities.length, 5);
  assert.deepEqual(s.recent_activities.map((a) => a.step_index), [2, 3, 4, 5, 6]);
  assert.equal(s.recent_activities.at(-1).output_preview, 'out');
  assert.equal(s.recent_activities.at(-1).input_preview, '{"command":"6"}');
  assert.equal(s.latest_text.text, '\u4f60\u597d😀');
  assert.equal(s.latest_text.incomplete, false);
  assert.deepEqual(p.snapshot(), s, 'reads do not consume shared history');
});

test('serialized budgets include JSON escaping, Unicode and metadata', () => {
  const p = createProjection();
  const large = '\u4e2d\u6587😀\u0000"\\'.repeat(8000);
  for (let i = 0; i < 7; i++) p.accept(step(i, 'tool', 'DONE', { tool_name: large, tool_info: { parameters: large, output: large } }));
  for (let i = 0; i < 10; i++) p.accept(step(8, 'agent_response', 'ACTIVE', { text_delta: large }));
  const s = p.snapshot();
  for (const a of s.recent_activities) { assert.ok(bytes(a) <= 1024); assert.equal(a.truncated, true); }
  assert.ok(bytes(s.latest_text) <= 2048);
  assert.equal(s.latest_text.truncated, true);
  const bounded = boundSnapshot({ ...s, details: { raw: large, diagnostics: large }, job_id: 'test' });
  assert.ok(bytes(bounded) + 1 <= 8192);
  assert.equal(bounded.truncated, true);
  assert.doesNotMatch(JSON.stringify(bounded), /�/);
});

test('unknown states and explicit tool errors remain evidence, not progress scores', () => {
  const p = createProjection();
  p.accept(step(0, 'tool', 'NEW_STATE', { tool_name: 'shell' }));
  assert.equal(p.snapshot().recent_activities[0].status, 'unknown');
  p.accept(step(0, 'tool', 'DONE', { tool_info: { error: { message: 'failed' } } }));
  assert.equal(p.snapshot().recent_activities[0].status, 'error');
  p.accept({ event: 'new-protocol-event' });
  assert.equal(p.snapshot().warnings.length, 2);
});

test('late updates do not resurrect evicted tools or replace newer response text', () => {
  const p = createProjection();
  for (let i = 0; i < 7; i++) p.accept(step(i, 'tool', 'ACTIVE', { tool_name: 'shell' }));
  p.accept(step(0, 'tool', 'DONE', { tool_info: { output: 'old' } }));
  assert.deepEqual(p.snapshot().recent_activities.map((a) => a.step_index), [2, 3, 4, 5, 6]);
  p.accept(step(10, 'agent_response', 'ACTIVE', { text_delta: 'new' }));
  p.accept(step(9, 'agent_response', 'DONE', { text_delta: 'old' }));
  assert.equal(p.snapshot().latest_text.text, 'new');
});

test('large fragmented records do not repeatedly scan all buffered bytes', () => {
  const record = Buffer.from(JSON.stringify({ response: 'x'.repeat(32 * 1024 * 1024) }) + '\n');
  const original = Buffer.byteLength;
  let scanned = 0, result;
  Buffer.byteLength = (value, ...args) => { scanned += value.length; return original(value, ...args); };
  try {
    const parser = createParser(event => { result = event; }, message => assert.fail(message), record.length + 1);
    for (let i = 0; i < record.length; i += 65536) parser.write(record.subarray(i, i + 65536));
    parser.end();
    assert.equal(result.response.length, 32 * 1024 * 1024);
    assert.ok(scanned < record.length * 3, `rescanned ${scanned} characters for ${record.length} bytes`);
  } finally { Buffer.byteLength = original; }
});

test('bounding legacy details preserves null pointers', () => {
  const out = boundSnapshot({ job_id: 'legacy', status: 'running', details: { raw_output: null, diagnostics: 'x'.repeat(20000) } });
  assert.equal(out.details.raw_output, null);
  assert.ok(bytes(out) + 1 <= 8192);
});
