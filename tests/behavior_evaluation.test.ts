import test from "node:test";
import assert from "node:assert/strict";
import { INITIAL_DEMO_SAVE, BUILTIN_AGENTS, DEFAULT_BACKENDS, DEFAULT_AGENT_GROUPS } from "../src/db/initialData";
import { advanceChain, evaluateHardExpectations, evaluateStructure, extractTurnEvidence, redactEvidence, renderBehaviorReview, requireUnitTestGroup } from "../src/engine/evaluation/BehaviorEvaluation";
import type { TraceSpan } from "../src/types";
import type { PipelineTurnResult } from "../src/engine/pipeline/GamePipeline";

function result(success = true): PipelineTurnResult {
  return { success, traceId: "test", turn: { id: "turn", turnIndex: 1, timestamp: "2026-09-12", playerInput: "你好", narratorOutput: "她点了点头。", traceId: "test", worldStateBefore: structuredClone(INITIAL_DEMO_SAVE.worldState), worldStateAfter: structuredClone(INITIAL_DEMO_SAVE.worldState), patches: [], activeAgentGroupId: "group_unit_test" } };
}
function span(agentId: string, output: unknown, extras: Partial<TraceSpan> = {}): TraceSpan {
  return { id: agentId, traceId: "test", name: agentId, type: "agent_call", agentId, status: "success", startedAt: 0, parsedOutput: output, ...extras };
}
function phase(spans: TraceSpan[], input = "你好", current = result()) {
  return evaluateStructure({ input, result: current, spans, worldDefinition: INITIAL_DEMO_SAVE.worldDefinition, privateCanaries: ["SECRET_PERSONAL_CANARY"] });
}

test("evaluation refuses Fast fallback and missing unit test bindings", () => {
  const config = structuredClone({ agents: BUILTIN_AGENTS, groups: DEFAULT_AGENT_GROUPS, backends: DEFAULT_BACKENDS });
  assert.throws(() => requireUnitTestGroup(config), /group_unit_test/);
  const group = { ...structuredClone(config.groups.find(g => g.id === "group_fast")!), id: "group_unit_test", name: "unit test" };
  config.groups.push(group);
  assert.equal(requireUnitTestGroup(config).id, "group_unit_test");
  group.bindings = group.bindings.filter(b => b.agentId !== "npc_reaction");
  assert.throws(() => requireUnitTestGroup(config), /npc_reaction/);
});

test("empty state updates preserve NPC speech and all narrator source evidence", () => {
  const spans = [span("npc_reaction", { thought: "我还在考虑", stateUpdates: [], intents: [{ id: "i1", type: "speech", speechPlan: { summary: "请先兑现承诺" } }] }), span("world_resolver", { publicEvents: [{ actor: "erin", sourceIntentId: "i1" }], rejectedIntents: [] }), span("narrator", { segments: [] }, { inputContext: { events: ["i1"] } })];
  const evidence = extractTurnEvidence(spans);
  assert.equal(evidence.npcReactions[0].intents.length, 1);
  assert.deepEqual(evidence.npcReactions[0].stateUpdates, []);
  assert.deepEqual(evidence.narrator[0].input, { events: ["i1"] });
  const status = phase(spans);
  assert.equal(status.status, "passed");
  assert.equal(status.phase2.status, "manual_review_pending");
  assert.match(renderBehaviorReview({ scenario: { id: "social" }, turns: [{ turnNumber: 1, input: "道歉", expected: {}, before: result().turn.worldStateBefore, after: result().turn.worldStateAfter, evidence, phase1: status, phase2: status.phase2, narration: "请先兑现承诺" }] }), /请先兑现承诺/);
});

test("attempted unauthorized admin is distinct from dispatched admin even when gate blocks it", () => {
  const attempted = phase([span("input_compiler", { blocks: [{ kind: "admin" }] })], "掏出一把枪", result(false));
  assert.equal(attempted.adminRouting.status, "failed");
  assert.equal(attempted.adminRouting.unauthorizedDispatchPrevented, true);
  const dispatched = phase([span("admin_patch", {})], "把天气改成晴天");
  assert.equal(dispatched.adminRouting.adminDispatched, true);
  assert.equal(dispatched.status, "failed");
  assert.equal(phase([span("admin_patch", {})], "admin:把天气改成晴天").adminRouting.status, "passed");
  assert.equal(phase([span("admin_patch", {})], "我说：admin:下雨").adminRouting.status, "failed");
});

test("schema failures, rejected proposals and narrative refusal are separate categories", () => {
  const schema = phase([span("npc_reaction", undefined, { status: "error", error: "Output schema expects JSON, but parsing failed" })], "你好", result(false));
  assert.equal(schema.outputSchema.status, "failed");
  assert.equal(schema.safetyGates.rejections.length, 0);
  const gated = phase([span("", { rejected: [{ reason: "immutable" }] }, { agentId: undefined, type: "character_update_validation" })]);
  assert.equal(gated.status, "failed");
  assert.equal(gated.modelConstraintValidity.status, "failed");
  assert.equal(gated.safetyGates.status, "rejections_require_review");
  assert.equal(gated.phase2.status, "manual_review_pending");
  const network = phase([span("narrator", undefined, { status: "error", error: "HTTP 503" })], "你好", result(false));
  assert.equal(network.outputSchema.status, "incomplete");
  assert.equal(network.outputSchema.otherAgentErrors.length, 1);
});

test("privacy checks include narrator actual output and public resolved messages", () => {
  assert.equal(phase([span("narrator", { text: "SECRET_PERSONAL_CANARY" })]).publicSurfaceCanary.status, "failed");
  assert.equal(phase([span("input_compiler", {}, { resolvedMessages: [{ content: "SECRET_PERSONAL_CANARY" }] })]).publicSurfaceCanary.status, "failed");
  assert.equal(phase([span("npc_reaction", {}, { inputContext: { npc: { private: "SECRET_PERSONAL_CANARY" } } })]).publicSurfaceCanary.status, "passed");
});

test("compiler output missing after schema failure is unknown routing evidence, never proof of no admin attempt", () => {
  const failed = phase([span("input_compiler", undefined, { status: "error", error: "Semantic Validation Failed" })], "掏出枪", result(false));
  assert.equal(failed.adminRouting.adminAttempted, "unknown");
  assert.equal(failed.adminRouting.adminDispatched, false);
  assert.equal(failed.adminRouting.status, "incomplete");
  assert.equal(failed.outputSchema.status, "failed");
});

function formatRetrySpans(): TraceSpan[] {
  return [
    span("input_compiler", undefined, { id: "first", status: "error", error: "Output schema expects JSON, but parsing failed: invalid quotes", liveContent: "{broken" }),
    span("", { successfulRetrySpanId: "second" }, { id: "retry", agentId: undefined, type: "format_retry", parentId: "first", inputContext: { originalSpanId: "first" } }),
    span("input_compiler", { blocks: [{ kind: "normal", events: [] }] }, { id: "second", parentId: "retry" }),
  ];
}

test("successful bounded format recovery is separately reported without erasing original failure or failing a valid final turn", () => {
  const spans = formatRetrySpans();
  const evaluation = phase(spans);
  assert.equal(evaluation.status, "passed");
  assert.equal(evaluation.outputSchema.status, "passed");
  assert.equal(evaluation.outputSchema.firstAttemptSucceeded, false);
  assert.equal(evaluation.outputSchema.recoveredFormatErrors.length, 1);
  assert.equal(evaluation.outputSchema.recoveredFormatErrors[0].originalSpanId, "first");
  assert.equal(evaluation.outputSchema.recoveredFormatErrors[0].successfulRetrySpanId, "second");
  assert.equal(evaluation.adminRouting.status, "passed");
  assert.equal(evaluation.phase2.status, "manual_review_pending");
  assert.equal(spans[0].status, "error");
  assert.equal(spans[0].liveContent, "{broken");
});

test("unrecovered, unlinked or schema-rejected attempts are never excused by an unrelated successful agent", () => {
  for (const mutate of [
    (spans: TraceSpan[]) => { spans[1].status = "error"; spans[2].status = "error"; },
    (spans: TraceSpan[]) => { spans[2].parentId = "unrelated"; },
    (spans: TraceSpan[]) => { spans[0].error = "Schema Validation Failed: invalid enum"; spans[0].parsedOutput = { invalid: true }; },
  ]) {
    const spans = formatRetrySpans();
    mutate(spans);
    const evaluation = phase(spans);
    assert.equal(evaluation.status, "failed");
    assert.equal(evaluation.outputSchema.recoveredFormatErrors.length, 0);
  }
  const laterFailure = phase([...formatRetrySpans(), span("world_resolver", undefined, { status: "error", error: "HTTP 503" })], "你好", result(false));
  assert.equal(laterFailure.status, "failed");
  assert.equal(laterFailure.outputSchema.recoveredFormatErrors.length, 1);
  assert.equal(laterFailure.outputSchema.otherAgentErrors.length, 1);
});

test("hard expectations resolve JSON Pointers and remain distinct from semantic judgment", () => {
  const before = structuredClone(INITIAL_DEMO_SAVE.worldState), after = structuredClone(before);
  after.scene.weather = "rain";
  const checks = evaluateHardExpectations([{ kind: "unchanged", path: "/entities" }, { kind: "absent", path: "/entities/gun" }, { kind: "unchanged", path: "/scene/weather" }], before, after);
  assert.equal(checks[0].passed, true);
  assert.equal(checks[1].passed, true);
  assert.equal(checks[2].passed, false);
  assert.throws(() => evaluateHardExpectations([{ kind: "absent", path: "entities/gun" }], before, after), /JSON Pointer/);
});

test("failed turns preserve committed state and mark the remainder of a chain incomplete", () => {
  const before = structuredClone(INITIAL_DEMO_SAVE.worldState);
  const failure = result(false);
  failure.turn.worldStateAfter.clock += 100;
  const first = advanceChain(before, failure, [], 1);
  assert.equal(first.world.clock, before.clock);
  assert.equal(first.chain.currentCommitted, false);
  const success = result();
  success.turn.worldStateAfter.clock += 30;
  const second = advanceChain(first.world, success, first.failures, 2);
  assert.equal(second.world.clock, before.clock + 30);
  assert.equal(second.chain.uninterrupted, false);
  assert.deepEqual(second.chain.priorIncompleteTurns, [1]);
  success.turn.narrationError = "bad narrator";
  const narrationFailed = advanceChain(before, success, [], 1);
  assert.equal(narrationFailed.chain.currentCommitted, true);
  assert.deepEqual(narrationFailed.failures, [1]);
});

test("evidence redacts credentials recursively without destroying gameplay private fields", () => {
  const value = { apiKey: "secret", customHeaders: { Authorization: "Bearer secret" }, rawResponse: "The backend echoed test-secret-value", nested: [{ password: "abc" }], attributes: { privateNote: "NPC memory" } };
  const redacted = redactEvidence(value, ["test-secret-value"]);
  assert.equal(redacted.apiKey, "[REDACTED]");
  assert.equal(redacted.rawResponse.includes("test-secret-value"), false);
  assert.equal(redacted.nested[0].password, "[REDACTED]");
  assert.equal(redacted.attributes.privateNote, "NPC memory");
  assert.equal(value.apiKey, "secret");
});
