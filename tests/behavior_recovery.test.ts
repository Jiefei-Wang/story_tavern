import test from "node:test";
import assert from "node:assert/strict";
import type { TraceSpan } from "../src/types";
import { summarizeBehaviorRecovery } from "../src/engine/evaluation/BehaviorRecovery";
import { evaluateStructure, extractTurnEvidence, renderBehaviorReview } from "../src/engine/evaluation/BehaviorEvaluation";
import { INITIAL_DEMO_SAVE } from "./fixtures/legacyInitialData";
import type { PipelineTurnResult } from "../src/engine/pipeline/GamePipeline";

function span(id: string, type: string, parsedOutput: unknown, extras: Partial<TraceSpan> = {}): TraceSpan {
  return { id, traceId: "t", name: id, type, startedAt: 0, status: "success", parsedOutput, ...extras };
}
const call = (id: string, agentId: string, output: unknown, extras: Partial<TraceSpan> = {}) => span(id, "agent_call", output, { agentId, ...extras });
function actionSpans(): TraceSpan[] {
  return [
    call("a0", "action_adjudicator", { wrong: true }, { parentId: "block", blockId: "b", status: "error", error: "Schema Validation Failed" }),
    span("v0", "action_resolution_validation", { rejectedOutput: { wrong: true } }, { parentId: "a0", status: "error", inputContext: { attempt: 0 } }),
    span("retry", "action_protocol_retry", { originalOutputPreserved: true }, { parentId: "v0", inputContext: { originalSpanId: "a0", maximumRetries: 1 } }),
    call("a1", "action_adjudicator", { outcomes: [{ status: "failed", reason: "door locked" }] }, { parentId: "block", blockId: "b" }),
    span("v1", "action_resolution_validation", { outcomes: [{ status: "failed", reason: "door locked" }], patches: [] }, { parentId: "a1", inputContext: { attempt: 1 } }),
  ];
}
function evaluation(spans: TraceSpan[]) {
  const world = structuredClone(INITIAL_DEMO_SAVE.worldState);
  const result: PipelineTurnResult = { success: true, traceId: "t", turn: { id: "turn", turnIndex: 1, timestamp: "now", playerInput: "尝试开门", narratorOutput: "门仍关着。", traceId: "t", worldStateBefore: world, worldStateAfter: world, patches: [], activeAgentGroupId: "group_unit_test" } };
  return evaluateStructure({ input: "尝试开门", result, spans, worldDefinition: INITIAL_DEMO_SAVE.worldDefinition });
}

function schemaRetrySpans(): TraceSpan[] {
  return [
    call("schema0", "narration_auditor", { grounded: false, issues: [{ problem: "wrong key" }] }, { status: "error", error: "Schema Validation Failed: missing kind" }),
    span("schemaRetry", "format_retry", { successfulRetrySpanId: "schema1", retrySpanId: "schema1" }, { parentId: "schema0", inputContext: { cause: "json_schema", originalSpanId: "schema0", maximumAttempts: 1 } }),
    call("schema1", "narration_auditor", { grounded: true, issues: [] }, { parentId: "schemaRetry" }),
  ];
}

test("JSON schema recovery retains the rejected parsed object and explicit cause with the same linked format recovery rules", () => {
  const spans = schemaRetrySpans(), original = structuredClone(spans);
  const status = evaluation(spans);
  assert.equal(status.status, "passed");
  assert.equal(status.outputSchema.firstAttemptSucceeded, false);
  assert.equal(status.outputSchema.recoveredFormatErrors[0].cause, "json_schema");
  assert.equal(status.recovery.jsonFormatRetries[0].status, "recovered");
  assert.deepEqual(status.recovery.jsonFormatRetries[0].first?.output, { grounded: false, issues: [{ problem: "wrong key" }] });
  assert.equal(status.recovery.jsonFormatRetries[0].final?.spanId, "schema1");
  assert.equal(status.phase2.status, "manual_review_pending");
  assert.deepEqual(spans, original);
});

test("schema retry fails closed when exhausted, unlinked or unmarked; plain refusal is not recorded as recovery", () => {
  for (const change of [
    (spans: TraceSpan[]) => { spans[1].status = "error"; spans[2].status = "error"; spans[2].error = "Output schema expects JSON, but parsing failed"; spans[2].parsedOutput = undefined; },
    (spans: TraceSpan[]) => { spans[2].parentId = "unrelated"; },
    (spans: TraceSpan[]) => { spans[1].inputContext = { originalSpanId: "schema0" }; },
    (spans: TraceSpan[]) => { spans[0].parsedOutput = undefined; spans[0].error = "Output schema expects JSON, but parsing failed"; spans[0].liveContent = "I cannot assist with harmful conduct."; },
  ]) {
    const spans = schemaRetrySpans(); change(spans);
    const status = evaluation(spans);
    assert.equal(status.status, "failed");
    assert.equal(status.outputSchema.recoveredFormatErrors.length, 0);
  }
});

test("action protocol recovery preserves initial errors and successful adjudication of a failed world action without changing strict phase1", () => {
  const spans = actionSpans(), before = structuredClone(spans);
  const status = evaluation(spans);
  assert.equal(status.recovery.actionProtocolRetries[0].status, "recovered");
  assert.equal(status.recovery.actionProtocolRetries[0].first.agent?.error, "Schema Validation Failed");
  assert.equal((status.recovery.actionProtocolRetries[0].final.validation?.output as any).outcomes[0].status, "failed");
  assert.equal(status.status, "failed");
  assert.equal(status.outputSchema.status, "failed");
  assert.equal(status.phase2.status, "manual_review_pending");
  assert.deepEqual(spans, before);
});

test("scheduled retries, unrelated successful blocks and failed final validation cannot prove recovery", () => {
  assert.equal(summarizeBehaviorRecovery(actionSpans().slice(0, 3)).actionProtocolRetries[0].status, "incomplete");
  const unrelated = actionSpans(); unrelated[3].blockId = "other";
  assert.equal(summarizeBehaviorRecovery(unrelated).actionProtocolRetries[0].status, "incomplete");
  const rejected = actionSpans(); rejected[4].status = "error";
  assert.equal(summarizeBehaviorRecovery(rejected).actionProtocolRetries[0].status, "failed");
  const unlinked = actionSpans(); unlinked[2].parentId = "unrelated";
  assert.equal(summarizeBehaviorRecovery(unlinked).actionProtocolRetries[0].status, "incomplete");
});

function characterSpans(accepted: unknown[], remaining: unknown[] = []): TraceSpan[] {
  return [
    call("c0", "character_change_auditor", { valid: false, issues: [{ updateIndex: 0, reason: "no completed process" }] }, { parentId: "b", inputContext: { audit: { npcId: "scholar", proposedStateUpdates: [{ value: 5 }] } } }),
    call("other", "character_change_auditor", { valid: false, issues: [{ updateIndex: 0, reason: "unrelated person" }] }, { parentId: "b", inputContext: { audit: { npcId: "guard" } } }),
    call("c1", "character_change_auditor", { valid: remaining.length === 0, issues: remaining }, { parentId: "b", inputContext: { audit: { npcId: "scholar" } } }),
    span("b_scholar_state_updates", "character_update_validation", { proposed: [{ value: 5 }], accepted, rejected: [{ update: { value: 5 }, reason: ["no completed process"], corrected: true }, ...remaining], committed: false }, { parentId: "b" }),
  ];
}

test("causal correction distinguishes valid candidates, full withdrawal and remaining rejection without claiming committed changes", () => {
  const corrected = evaluation(characterSpans([{ value: -2 }]));
  const correction = corrected.recovery.characterCausalCorrections[0];
  assert.equal(correction.status, "corrected_candidates");
  assert.equal(correction.first.audit?.spanId, "c0");
  assert.equal(correction.final.audit?.spanId, "c1");
  assert.deepEqual(correction.final.acceptedCandidates, [{ value: -2 }]);
  assert.equal((correction.final.validation?.output as any).committed, false);
  assert.equal(corrected.status, "failed");
  assert.equal(corrected.modelConstraintValidity.status, "failed");
  assert.equal(corrected.recovery.unfinishedCharacterAudits[0]?.spanId, "other");
  const withdrawn = summarizeBehaviorRecovery(characterSpans([]));
  assert.equal(withdrawn.characterCausalCorrections[0].status, "withdrawn_all_candidates");
  assert.deepEqual(withdrawn.characterCausalCorrections[0].final.acceptedCandidates, []);
  const partial = summarizeBehaviorRecovery(characterSpans([{ value: -2 }], [{ update: { value: 9 }, reason: ["unsupported"] }]));
  assert.equal(partial.characterCausalCorrections[0].status, "still_rejected_after_correction");
  assert.equal(partial.characterCausalCorrections[0].final.stillRejected.length, 1);
});

function narrationSpans(): TraceSpan[] {
  return [
    call("n0", "narrator", { segments: [{ text: "The lantern is now in his hand." }] }),
    call("audit0", "narration_auditor", { grounded: false, issues: [{ kind: "new_consequential_fact", evidence: "lantern remains on shelf" }] }),
    call("n1", "narrator", { segments: [{ text: "The lantern remains on the shelf." }] }),
    call("audit1", "narration_auditor", { grounded: true, issues: [] }),
    span("composition", "narrator_validation", { renderedOutput: "The lantern remains on the shelf." }),
  ];
}

test("narrator rewrite keeps first and final audit outcomes without making semantic pass or erasing the first issue", () => {
  const evaluated = evaluation(narrationSpans());
  const rewrite = evaluated.recovery.narrationRewrite;
  assert.equal(rewrite.status, "corrected");
  assert.equal((rewrite.first.audit?.output as any).grounded, false);
  assert.equal((rewrite.final.audit?.output as any).grounded, true);
  assert.equal(rewrite.narratorAttempts.length, 2);
  assert.equal(evaluated.status, "passed");
  assert.equal(evaluated.phase2.status, "manual_review_pending");
  const rejected = narrationSpans(); rejected[3].parsedOutput = { grounded: false, issues: ["still unsupported"] };
  assert.equal(summarizeBehaviorRecovery(rejected).narrationRewrite.status, "failed");
  assert.equal(summarizeBehaviorRecovery(narrationSpans().slice(0, 3)).narrationRewrite.status, "incomplete");
  assert.equal(summarizeBehaviorRecovery(narrationSpans().slice(0, 4)).narrationRewrite.status, "incomplete");
});

test("review explicitly renders recovery evidence and preserves strict status", () => {
  const spans = [...actionSpans(), ...characterSpans([]), ...narrationSpans()];
  const phase1 = evaluation(spans);
  const report = renderBehaviorReview({ scenario: { id: "boundary" }, turns: [{ turnNumber: 1, phase1, phase2: phase1.phase2, before: INITIAL_DEMO_SAVE.worldState, after: INITIAL_DEMO_SAVE.worldState, evidence: extractTurnEvidence(spans) }] });
  assert.match(report, /协议恢复 \/ 人物因果修正 \/ 旁白重写/);
  assert.match(report, /withdrawn_all_candidates/);
  assert.match(report, /Schema Validation Failed/);
  assert.match(report, /阶段一：failed/);
});
