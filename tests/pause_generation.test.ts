import test from "node:test";
import assert from "node:assert/strict";
import { useGameStore } from "../src/stores/useGameStore";
import { useSettingsStore } from "../src/stores/useSettingsStore";
import { useAgentStore } from "../src/stores/useAgentStore";
import { useAgentGroupStore } from "../src/stores/useAgentGroupStore";
import { INITIAL_DEMO_SAVE, BUILTIN_AGENTS, DEFAULT_AGENT_GROUPS } from "./fixtures/legacyInitialData";
import { globalConcurrencyLimiter } from "../src/engine/scheduling/ConcurrencyLimiter";
import { agentRuntime } from "../src/engine/runtime/AgentRuntime";
import { globalTraceManager } from "../src/engine/tracing/TraceManager";
import { isGenerationRunning } from "../src/pages/Play/GenerationPanel";

function setupStore() {
  useSettingsStore.setState({
    settings: {
      mockLlmMode: true,
      autosave: false,
      language: "zh-CN",
      theme: "system",
      developerMode: false,
      logLevel: "info",
    },
  });
  useAgentStore.setState({ agents: BUILTIN_AGENTS });
  useAgentGroupStore.setState({
    groups: DEFAULT_AGENT_GROUPS,
    activeGroupId: "group_fast",
  });
  const save = structuredClone(INITIAL_DEMO_SAVE);
  useGameStore.setState({
    saves: [save],
    activeSave: save,
    isExecuting: false,
    executionError: null,
    pendingPlayerInput: null,
    currentTraceId: save.turns[save.turns.length - 1]?.traceId ?? null,
  });
  return save;
}

test("ConcurrencyLimiter respects AbortSignal and removes cancelled requests from queue", async () => {
  const controller = new AbortController();

  // Test 1: pre-aborted signal throws immediately
  controller.abort();
  await assert.rejects(
    () => globalConcurrencyLimiter.run("test_backend", 1, async () => "ok", controller.signal),
    (err: any) => err.name === "AbortError"
  );

  // Test 2: signal aborts while queued behind another active task
  let resolveBlockingTask!: () => void;
  const blockingTaskStarted = new Promise<void>((r) => {
    globalConcurrencyLimiter.run("test_backend_2", 1, async () => {
      r();
      await new Promise<void>((done) => { resolveBlockingTask = done; });
    });
  });

  await blockingTaskStarted;

  const queuedController = new AbortController();
  let queuedTaskExecuted = false;

  const queuedPromise = globalConcurrencyLimiter.run("test_backend_2", 1, async () => {
    queuedTaskExecuted = true;
    return "should_not_run";
  }, queuedController.signal);

  // Abort while queued
  queuedController.abort();

  await assert.rejects(
    queuedPromise,
    (err: any) => err.name === "AbortError"
  );

  assert.equal(queuedTaskExecuted, false);

  // Release blocking task
  resolveBlockingTask();
});

test("AgentRuntime in mock mode aborts and marks span as cancelled", async () => {
  const controller = new AbortController();
  const traceId = `test_abort_trace_${Date.now()}`;

  globalTraceManager.startTurnTrace(traceId, 1, "test abort");

  const runPromise = agentRuntime.runAgent({
    agentId: "input_compiler",
    groupId: "group_fast",
    traceId,
    agents: BUILTIN_AGENTS,
    groups: DEFAULT_AGENT_GROUPS,
    backends: [],
    mockMode: true,
    context: {
      player: { input: "测试中断" },
      scene: { location: "harbor_tavern", weather: "clear", lighting: "morning" },
      conversation: {},
      entities: {},
    },
    signal: controller.signal,
  });

  // Abort while running
  controller.abort();

  await assert.rejects(
    runPromise,
    (err: any) => err.name === "AbortError"
  );

  const traces = globalTraceManager.getAllTraces();
  const trace = traces.find((t) => t.id === traceId);
  const span = trace?.spans.find((s) => s.agentId === "input_compiler");
  assert.ok(span);
  assert.equal(span.status, "cancelled");
});

test("cancelTurnTrace updates trace and running spans to cancelled and hides GenerationPanel", () => {
  const traceId = `test_cancel_trace_${Date.now()}`;
  globalTraceManager.startTurnTrace(traceId, 1, "测试取消追踪");
  globalTraceManager.createSpan(traceId, "span_1", "Input Compiler", "agent_call");
  globalTraceManager.createSpan(traceId, "span_2", "Narrator", "agent_call");

  // Before cancellation, generation is running
  let traces = globalTraceManager.getAllTraces();
  assert.equal(isGenerationRunning(traceId, true, traces), true);

  // Cancel the trace
  const cancelledTrace = globalTraceManager.cancelTurnTrace(traceId);
  assert.ok(cancelledTrace);
  assert.equal(cancelledTrace.status, "cancelled");
  assert.equal(cancelledTrace.spans[0].status, "cancelled");
  assert.equal(cancelledTrace.spans[1].status, "cancelled");

  // After cancellation, generation panel is not running
  traces = globalTraceManager.getAllTraces();
  assert.equal(isGenerationRunning(traceId, true, traces), false);
});
