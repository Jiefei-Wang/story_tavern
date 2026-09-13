import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { groupRequests } from '../src/pages/Debug/traceRequests';
import { RawMessagesModal, buildRawMessageGroups, formatMessagesAsText } from '../src/pages/Debug/RawMessagesModal';
import type { TraceSpan, TurnTrace } from '../src/types';

const span = (id: string, extra: Partial<TraceSpan> = {}): TraceSpan => ({ id, traceId: 'trace', name: id, type: 'llm', status: 'success', startedAt: 1, ...extra });
test('validation attaches to its request across interleaved calls and retries; legacy output matching remains supported', () => {
  const first = span('first', { resolvedMessages: [], parsedOutput: 'bad' });
  const retry = span('retry', { resolvedMessages: [], parsedOutput: 'good' });
  const failed = span('failed', { type: 'text_validation', parentId: 'first', status: 'error' });
  const legacy = span('legacy', { type: 'text_validation', rawResponse: 'good' });
  const groups = groupRequests([first, retry, failed, legacy, span('commit', { type: 'text_commit' })]);
  assert.deepEqual(groups.map(g => [g.request.id, g.validations.map(v => v.id)]), [['first', ['failed']], ['retry', ['legacy']]]);
});
test('raw messages hide repeated content on initial render and inline validation under requests', () => {
  const messages = [{ role: 'user', content: 'UNIQUE_HISTORY_CONTENT' }];
  const trace: TurnTrace = { id: 'trace', turnNumber: 1, totalTokens: 0, playerInput: '', startedAt: 1, status: 'success', spans: [
    span('first', { resolvedMessages: messages }),
    span('second', { resolvedMessages: [...messages, { role: 'user', content: 'NEW_REQUEST_CONTENT' }] }),
    span('validation', { type: 'text_validation', parentId: 'second', parsedOutput: { valid: true } }),
  ] };
  const html = renderToStaticMarkup(React.createElement(RawMessagesModal, { trace, onClose() {} }));
  assert.equal(html.split('UNIQUE_HISTORY_CONTENT').length - 1, 1);
  assert.ok(html.includes('(previous message skipped, click to expand).'));
  assert.ok(html.includes('NEW_REQUEST_CONTENT'));
  assert.ok(html.includes('VALIDATION_OUTPUT(success)'));
  assert.ok(html.includes('2 个 Request'));
});


test('history is one list and clipboard follows its expansion without exposing raw envelopes', () => {
  const history = [{ role: 'user', content: 'history A' }, { role: 'assistant', content: 'history B' }];
  const trace: TurnTrace = { id: 'copy', turnNumber: 1, totalTokens: 0, playerInput: '', startedAt: 1, status: 'success', spans: [
    span('first', { resolvedMessages: history }),
    span('second', { resolvedMessages: [...history, { role: 'user', content: 'current input' }], requestParams: { secret_parameter_marker: 1 },
      rawResponse: { id: 'transport_marker', choices: [{ message: { reasoning_content: 'thought text', content: 'reply text' } }], usage: { total_tokens: 9 } } }),
  ] };
  const groups = buildRawMessageGroups(trace);
  assert.equal(groups[1].messages[0].history?.length, 2);
  assert.equal(groups[1].messages.filter(m => m.history).length, 1);
  const collapsed = formatMessagesAsText(groups, new Set());
  const expanded = formatMessagesAsText(groups, new Set(['second:0']));
  assert.equal(collapsed.split('history A').length - 1, 1);
  assert.equal(expanded.split('history A').length - 1, 2);
  assert.equal(expanded.split('history B').length - 1, 2);
  assert.ok(collapsed.includes('(previous message skipped, click to expand).'));
  for (const text of [collapsed, expanded, renderToStaticMarkup(React.createElement(RawMessagesModal, { trace, onClose() {} }))]) {
    assert.ok(text.includes('thought text'));
    assert.ok(text.includes('reply text'));
    assert.ok(text.includes('current input'));
    assert.ok(!text.includes('transport_marker'));
    assert.ok(!text.includes('secret_parameter_marker'));
  }
});

test('streaming response preserves reasoning separately from reply body', async () => {
  const { OpenAIStream } = await import('../src/engine/runtime/OpenAIStream');
  const stream = new OpenAIStream(() => {});
  for (const delta of [{ reasoning_content: 'think ' }, { reasoning_content: 'more' }, { content: 'answer' }]) {
    stream.push(`data: ${JSON.stringify({ choices: [{ index: 0, delta }] })}\n\n`);
  }
  stream.push('data: [DONE]\n\n');
  assert.deepEqual(stream.finish().choices[0].message, { reasoning_content: 'think more', content: 'answer' });
});
