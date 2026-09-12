import test from "node:test";
import assert from "node:assert/strict";
import { AGENT_LABELS, isGenerationRunning } from "../src/pages/Play/GenerationPanel";
import { globalTraceManager } from "../src/engine/tracing/TraceManager";

test("AGENT_LABELS provides human-readable names for agent roles", () => {
  assert.equal(AGENT_LABELS.input_compiler, "理解你的行动");
  assert.equal(AGENT_LABELS.perception, "观察场景");
  assert.equal(AGENT_LABELS.npc_reaction, "角色反应");
  assert.equal(AGENT_LABELS.world_resolver, "结算变化");
  assert.equal(AGENT_LABELS.narrator, "撰写旁白");
  assert.equal(AGENT_LABELS.time_skip, "时间流逝");
  assert.equal(AGENT_LABELS.character_generator, "人物生成");
  assert.equal(AGENT_LABELS.admin_patch, "执行管理员指令");
});

test("isGenerationRunning returns false when running is false (auto-hides on completion)", () => {
  const traceId = "test_completed_trace";
  globalTraceManager.startTurnTrace(traceId, 1, "test action");
  globalTraceManager.createSpan(traceId, "span_1", "Narrator", "agent_call");
  globalTraceManager.endTurnTrace(traceId, "success");

  const traces = globalTraceManager.getAllTraces();

  // When running is false, generation panel must NOT be running (auto-hides)
  assert.equal(
    isGenerationRunning(traceId, false, traces),
    false,
    "When running is false, isGenerationRunning must return false"
  );
});

test("isGenerationRunning returns false when trace status is success or error", () => {
  const traceId = "test_finished_trace";
  globalTraceManager.startTurnTrace(traceId, 1, "test action");
  globalTraceManager.endTurnTrace(traceId, "success");

  const traces = globalTraceManager.getAllTraces();
  assert.equal(
    isGenerationRunning(traceId, true, traces),
    false,
    "When trace is completed with success, isGenerationRunning must return false"
  );
});

test("isGenerationRunning returns true during active trace execution", () => {
  const traceId = "test_active_running_trace";
  globalTraceManager.startTurnTrace(traceId, 2, "test action 2");
  const traces = globalTraceManager.getAllTraces();

  assert.equal(
    isGenerationRunning(traceId, true, traces),
    true,
    "When running is true and trace is active, isGenerationRunning must return true"
  );
});

test("Turn trace contains spans accessible by traceId for modal view", () => {
  const traceId = "test_turn_modal_trace";
  globalTraceManager.startTurnTrace(traceId, 3, "玩家询问艾琳关于船只的消息");
  globalTraceManager.createSpan(traceId, "span_compiler", "Input Compiler", "agent_call");
  globalTraceManager.createSpan(traceId, "span_reaction", "NPC Reaction", "agent_call");
  globalTraceManager.updateSpan(traceId, "span_reaction", {
    status: "success",
    liveContent: "艾琳转过头，轻声说道：那艘船今晚就要起航了。",
    displayLabel: "角色反应 · 艾琳",
    model: "deepseek-chat",
  });
  globalTraceManager.endTurnTrace(traceId, "success");

  const traces = globalTraceManager.getAllTraces();
  const foundTrace = traces.find((t) => t.id === traceId);
  assert.ok(foundTrace, "Trace must be found for the turn");
  assert.equal(foundTrace.turnNumber, 3);
  assert.equal(foundTrace.status, "success");

  const agentSpans = foundTrace.spans.filter((s) => s.type === "agent_call");
  assert.equal(agentSpans.length, 2);

  const reactionSpan = agentSpans.find((s) => s.id === "span_reaction");
  assert.ok(reactionSpan);
  assert.equal(reactionSpan.displayLabel, "角色反应 · 艾琳");
  assert.equal(reactionSpan.model, "deepseek-chat");
  assert.match(reactionSpan.liveContent!, /那艘船今晚就要起航了/);
});
