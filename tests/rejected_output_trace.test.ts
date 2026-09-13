import test from "node:test";
import assert from "node:assert/strict";
import { BUILTIN_AGENTS, DEFAULT_AGENT_GROUPS, DEFAULT_BACKENDS } from "./fixtures/legacyInitialData";
import { GamePipeline } from "../src/engine/pipeline/GamePipeline";
import { MockSimulator } from "../src/engine/runtime/MockSimulator";
import { INITIAL_HARBOR_TAVERN_WORLD } from "../src/engine/world/WorldState";
import { globalTraceManager } from "../src/engine/tracing/TraceManager";

const unauthorized = { blocks: [{ id: "b1", kind: "admin", command: "创造一把枪" }] };
const context = {
  agents: BUILTIN_AGENTS,
  groups: [ { ...structuredClone(DEFAULT_AGENT_GROUPS.find(group => group.id === "group_fast")!), bindings: DEFAULT_AGENT_GROUPS.find(group => group.id === "group_fast")!.bindings.map(binding => ({ ...binding, backendId: "trace_test_backend" })) } ],
  backends: [{ ...DEFAULT_BACKENDS[0], id: "trace_test_backend", enabled: true, authType: "none" as const, customHeaders: { "X-Test-Private": "TRANSPORT_PRIVATE_CANARY" }, baseUrl: "https://trace.invalid/v1" }],
  activeGroupId: "group_fast", mockMode: false,
};

test("schema-rejected real responses retain parsed unauthorized admin evidence without committing or logging transport headers", async (t) => {
  let requests = 0;
  const rawResponse = { choices: [{ message: { content: JSON.stringify(unauthorized) } }] };
  t.mock.method(globalThis, "fetch", async () => { requests++; return new Response(JSON.stringify(rawResponse), { headers: { "content-type": "application/json" } }); });
  const result = await new GamePipeline().executeTurn("我在古代掏出一把枪", INITIAL_HARBOR_TAVERN_WORLD, 1, context);
  assert.equal(result.success, false);
  assert.deepEqual(result.turn.worldStateAfter, INITIAL_HARBOR_TAVERN_WORLD);
  assert.deepEqual(result.turn.patches, []);
  assert.equal(requests, 2, 'one bounded structural retry cannot authorize an admin dispatch');
  const trace = globalTraceManager.getTrace(result.traceId)!;
  const compiler = trace.spans.find(span => span.agentId === "input_compiler")!;
  assert.equal(compiler.status, "error");
  assert.match(compiler.error!, /Schema Validation Failed/);
  assert.deepEqual(compiler.parsedOutput, unauthorized);
  assert.deepEqual(compiler.rawResponse, rawResponse);
  assert.equal(trace.spans.some(span => span.agentId === "admin_patch"), false);
  assert.equal(trace.spans.filter(span => span.agentId === 'input_compiler' && span.status === 'error').length, 2);
  assert.equal(JSON.stringify(trace).includes("TRANSPORT_PRIVATE_CANARY"), false);
});

test("invalid JSON retains the raw response and parse error without claiming a parsed output", async (t) => {
  const rawResponse = { choices: [{ message: { content: "{ broken JSON" } }] };
  t.mock.method(globalThis, "fetch", async () => new Response(JSON.stringify(rawResponse), { headers: { "content-type": "application/json" } }));
  const result = await new GamePipeline().executeTurn("你好", INITIAL_HARBOR_TAVERN_WORLD, 1, context);
  assert.equal(result.success, false);
  const compiler = globalTraceManager.getTrace(result.traceId)!.spans.find(span => span.agentId === "input_compiler")!;
  assert.equal(compiler.status, "error");
  assert.match(compiler.error!, /parsing failed/);
  assert.deepEqual(compiler.rawResponse, rawResponse);
  assert.equal(compiler.liveContent, "{ broken JSON");
  assert.equal(compiler.parsedOutput, undefined);
});

test("mock schema rejections retain the same proposed admin blocks and leave the world untouched", async (t) => {
  t.mock.method(MockSimulator, "simulate", () => structuredClone(unauthorized));
  const result = await new GamePipeline().executeTurn("改变天气", INITIAL_HARBOR_TAVERN_WORLD, 1, { ...context, mockMode: true });
  assert.equal(result.success, false);
  assert.deepEqual(result.turn.worldStateAfter, INITIAL_HARBOR_TAVERN_WORLD);
  const trace = globalTraceManager.getTrace(result.traceId)!;
  const compiler = trace.spans.find(span => span.agentId === "input_compiler")!;
  assert.equal(compiler.status, "error");
  assert.deepEqual(compiler.parsedOutput, unauthorized);
  assert.deepEqual(JSON.parse(compiler.rawResponse as string), unauthorized);
  assert.equal(trace.spans.some(span => span.agentId === "admin_patch"), false);
});
