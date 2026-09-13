import test from "node:test";
import assert from "node:assert/strict";
import { agentRuntime } from "../src/engine/runtime/AgentRuntime";
import { DEFAULT_BACKENDS } from "./fixtures/legacyInitialData";
import { globalTraceManager } from "../src/engine/tracing/TraceManager";
import type { AgentDefinition } from "../src/types";

const agent: AgentDefinition = { id: "format_test", name: "format", description: "format", messages: [{ id: "m", role: "user", content: "{{task}}" }], inputs: [], outputSchema: { type: "object", additionalProperties: false, required: ["value"], properties: { value: { type: "number" } } }, defaults: {} };
const config = { agentId: agent.id, groupId: "format_group", agents: [agent], groups: [{ id: "format_group", name: "format", bindings: [{ agentId: agent.id, backendId: "format_backend", model: "test-model" }] }], backends: [{ ...DEFAULT_BACKENDS[0], id: "format_backend", authType: "none" as const, baseUrl: "https://format.invalid" }], context: { task: "保留事实" } };
const response = (content: string) => new Response(JSON.stringify({ choices: [{ message: { content } }] }), { headers: { "content-type": "application/json" } });

test("JSON-shaped parse error has exactly one auditable new request and preserves the original bytes", async (t) => {
  const requests: any[] = [];
  const bad = '{“value”:1}';
  t.mock.method(globalThis, "fetch", async (_url: unknown, init: RequestInit) => { requests.push(JSON.parse(init.body as string)); return response(requests.length === 1 ? bad : '{"value":1}'); });
  const traceId = `format_success_${Date.now()}`;
  const result = await agentRuntime.runAgent({ ...config, traceId });
  assert.equal(result.success, true, result.error);
  assert.deepEqual(result.data, { value: 1 });
  assert.equal(requests.length, 2);
  assert.equal(requests[0].model, requests[1].model);
  assert.match(requests[1].messages.at(-1).content, /唯一一次/);
  const trace = globalTraceManager.getTrace(traceId)!;
  const attempts = trace.spans.filter(span => span.agentId === agent.id);
  assert.equal(attempts.length, 2);
  assert.equal(attempts[0].liveContent, bad);
  assert.equal(attempts[0].parsedOutput, undefined);
  assert.equal(attempts[0].status, "error");
  assert.equal(attempts[1].status, "success");
  assert.equal(trace.spans.find(span => span.type === "format_retry")?.status, "success");
});

test("repeated malformed JSON stops after the one permitted retry", async (t) => {
  let requests = 0;
  t.mock.method(globalThis, "fetch", async () => { requests++; return response("{ malformed"); });
  const result = await agentRuntime.runAgent(config);
  assert.equal(result.success, false);
  assert.equal(requests, 2);
});

test("plain-text refusal is never format-retried", async (t) => {
  for (const content of ["我不能协助侵犯他人隐私。"] ) {
    let requests = 0;
    const mock = t.mock.method(globalThis, "fetch", async () => { requests++; return response(content); });
    const result = await agentRuntime.runAgent(config);
    assert.equal(result.success, false);
    assert.equal(requests, 1);
    mock.mock.restore();
  }
});

test("missing protocol field can recover once with original invalid JSON preserved", async (t) => {
  const requests: any[] = [];
  t.mock.method(globalThis, "fetch", async (_url: unknown, init: RequestInit) => { requests.push(JSON.parse(init.body as string)); return response(requests.length === 1 ? '{}' : '{"value":2}'); });
  const traceId = `schema_recovery_${Date.now()}`;
  const result = await agentRuntime.runAgent({ ...config, traceId });
  assert.equal(result.success, true);
  assert.equal(requests.length, 2);
  assert.match(requests[1].messages.at(-1).content, /required.*value/);
  const spans = globalTraceManager.getTrace(traceId)!.spans;
  assert.deepEqual(spans.find(span => span.agentId === agent.id)!.parsedOutput, {});
  assert.equal((spans.find(span => span.type === 'format_retry')!.inputContext as any).cause, 'json_schema');
});

test("persistent wrong field types fail after one retry and cannot be coerced locally", async (t) => {
  let requests = 0;
  t.mock.method(globalThis, 'fetch', async () => { requests++; return response('{"value":"wrong type"}'); });
  const result = await agentRuntime.runAgent(config);
  assert.equal(result.success, false);
  assert.equal(requests, 2);
});
