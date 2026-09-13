import test from 'node:test';
import assert from 'node:assert/strict';
import { AgentRuntime, type RunAgentOptions } from '../src/engine/runtime/AgentRuntime';
import { globalTraceManager } from '../src/engine/tracing/TraceManager';
import { INITIAL_HARBOR_TAVERN_WORLD } from '../src/engine/world/WorldState';

function options(signal?: AbortSignal, timeoutMs = 20): RunAgentOptions {
  return {
    agentId: 'input_compiler', groupId: 'transport_test', context: {}, signal,
    agents: [{ id: 'input_compiler', name: 'Transport test', description: '', messages: [], inputs: [], outputSchema: null, defaults: {} }],
    groups: [{ id: 'transport_test', name: 'Transport test', bindings: [{ agentId: 'input_compiler', backendId: 'transport_backend', model: 'test' }] }],
    backends: [{ id: 'transport_backend', name: 'Transport test', baseUrl: 'https://unused.invalid/v1', authType: 'none', customHeaders: {}, enabled: true, timeoutMs, maxConcurrency: 1 }],
  };
}
function aborted(): Error { return Object.assign(new Error('Synthetic transport stream aborted'), { name: 'AbortError' }); }
const pendingFetch: typeof fetch = async (_url, init) => new Promise<Response>((_resolve, reject) => {
  if (init?.signal?.aborted) reject(aborted());
  else init?.signal?.addEventListener('abort', () => reject(aborted()), { once: true });
});
async function withFetch<T>(replacement: typeof fetch, run: () => Promise<T>): Promise<T> {
  const original = globalThis.fetch;
  globalThis.fetch = replacement;
  try { return await run(); } finally { globalThis.fetch = original; }
}
function spanFor(spanId: string) {
  return globalTraceManager.getAllTraces().flatMap(t => t.spans).find(s => s.id === spanId)!;
}

test('backend deadline returns a diagnostic execution error while the caller signal remains active', async () => {
  const user = new AbortController();
  const result = await withFetch(pendingFetch, () => new AgentRuntime().runAgent(options(user.signal)));
  assert.equal(user.signal.aborted, false);
  assert.equal(result.success, false);
  assert.match(result.error || '', /timed out after 20 ms/);
  assert.doesNotMatch(result.error || '', /aborted by user|暂停/);
  assert.equal(spanFor(result.spanId).status, 'error');
});

test('deadline during streamed body reading preserves partial output and is not a user pause', async () => {
  const streamingFetch: typeof fetch = async (_url, init) => new Response(new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode('data: {"choices":[{"delta":{"content":"partial evidence"}}]}\n\n'));
      init?.signal?.addEventListener('abort', () => controller.error(aborted()), { once: true });
    },
  }), { headers: { 'Content-Type': 'text/event-stream' } });
  const result = await withFetch(streamingFetch, () => new AgentRuntime().runAgent(options()));
  assert.equal(result.success, false);
  assert.match(result.error || '', /timed out after 20 ms/);
  assert.equal(spanFor(result.spanId).status, 'error');
  assert.equal(spanFor(result.spanId).liveContent, 'partial evidence');
});

test('an independent transport AbortError is an error even without a configured caller signal', async () => {
  const result = await withFetch(async () => { throw aborted(); }, () => new AgentRuntime().runAgent(options()));
  assert.equal(result.success, false);
  assert.match(result.error || '', /transport aborted without user cancellation/);
  assert.match(result.error || '', /Synthetic transport stream aborted/);
  assert.equal(spanFor(result.spanId).status, 'error');
});

test('explicit caller cancellation still throws AbortError and marks the real request cancelled', async () => {
  const user = new AbortController();
  let started!: () => void;
  const requestStarted = new Promise<void>(resolve => { started = resolve; });
  const traceId = `user_cancel_${crypto.randomUUID()}`;
  await withFetch(async (url, init) => { const pending = pendingFetch(url, init); started(); return pending; }, async () => {
    const run = new AgentRuntime().runAgent({ ...options(user.signal, 1000), traceId });
    await requestStarted;
    user.abort();
    await assert.rejects(run, (error: any) => error.name === 'AbortError' && error.message === 'Generation aborted by user');
  });
  const trace = globalTraceManager.getTrace(traceId)!;
  assert.equal(trace.status, 'cancelled');
  assert.equal(trace.spans[0].status, 'cancelled');
});
