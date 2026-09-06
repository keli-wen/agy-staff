import test from 'node:test';
import assert from 'node:assert/strict';
import { bytes, createParser, createProjection, boundSnapshot } from '../companion/observation.mjs';
const step = (index, type, state, extra = {}) => ({ event: 'step_update', step_update: { conversation_id: 'c', step_index: index, step_type: type, state, ...extra } });

test('UTF-8 chunks, multiple records, malformed/oversized lines and unterminated final record', () => {
  const events = [], warnings = [];
  const parser = createParser((e) => events.push(e), (w) => warnings.push(w), 100);
  const input = Buffer.from('{"text":"中文😀"}\nnope\n' + 'x'.repeat(200) + '\n{"last":true}');
  for (const byte of input) parser.write(Buffer.from([byte]));
  parser.end();
  assert.deepEqual(events, [{ text: '中文😀' }, { last: true }]);
  assert.equal(warnings.length, 2);
});

test('tool snapshots merge, recent text concatenates DONE delta and stays independent', () => {
  const p = createProjection();
  for (let i = 0; i < 7; i++) p.accept(step(i, 'tool', 'ACTIVE', { tool_name: 'shell', tool_info: { parameters: { command: String(i) } } }));
  p.accept(step(6, 'tool', 'DONE', { tool_info: { output: 'out' } }));
  p.accept(step(8, 'agent_response', 'ACTIVE', { text_delta: '你' }));
  p.accept(step(8, 'agent_response', 'ACTIVE', { text_delta: '好' }));
  assert.equal(p.snapshot().latest_text.incomplete, true);
  p.accept(step(8, 'agent_response', 'DONE', { text_delta: '😀' }));
  const s = p.snapshot();
  assert.equal(s.recent_activities.length, 5);
  assert.deepEqual(s.recent_activities.map((a) => a.step_index), [2, 3, 4, 5, 6]);
  assert.equal(s.recent_activities.at(-1).output_preview, 'out');
  assert.equal(s.recent_activities.at(-1).input_preview, '{"command":"6"}');
  assert.equal(s.latest_text.text, '你好😀');
  assert.equal(s.latest_text.incomplete, false);
  assert.deepEqual(p.snapshot(), s, 'reads do not consume shared history');
});

test('serialized budgets include JSON escaping, Unicode and metadata', () => {
  const p = createProjection();
  const large = '中文😀\u0000"\\'.repeat(8000);
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
