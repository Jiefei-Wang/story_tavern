import test from "node:test";
import assert from "node:assert/strict";
import { useGameStore } from "../src/stores/useGameStore";
import { useSettingsStore } from "../src/stores/useSettingsStore";
import { useAgentStore } from "../src/stores/useAgentStore";
import { useAgentGroupStore } from "../src/stores/useAgentGroupStore";
import { INITIAL_DEMO_SAVE, BUILTIN_AGENTS, DEFAULT_AGENT_GROUPS } from "../src/db/initialData";
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

test("cancelGeneration pauses sendPlayerInput, restores user input, and does not commit turn or mutate world", async () => {
  const save = setupStore();
  const initialTurnCount = save.turns.length;
  const initialWorld = structuredClone(save.worldState);
  const testInput = "我仔细端详酒馆柜台上的酒瓶";

  // Start generation in mock mode
  const sendPromise = useGameStore.getState().sendPlayerInput(testInput);

  // Verify execution has started and pendingPlayerInput is tracked
  assert.equal(useGameStore.getState().isExecuting, true);
  assert.equal(useGameStore.getState().pendingPlayerInput, testInput);

  // Cancel generation
  const restoredInput = useGameStore.getState().cancelGeneration();

  // Verify input is returned for the input box
  assert.equal(restoredInput, testInput);

  // Await the pipeline completion
  const success = await sendPromise;
  assert.equal(success, false);

  // Verify state after cancellation
  const state = useGameStore.getState();
  assert.equal(state.isExecuting, false);
  assert.equal(state.executionError, null);
  assert.equal(state.pendingPlayerInput, null);

  // Verify no turn was appended to history
  assert.equal(state.activeSave?.turns.length, initialTurnCount);

  // Verify world state was completely unpolluted (rollback invariant)
  assert.deepEqual(state.activeSave?.worldState, initialWorld);
});

test("cancelGeneration pauses retryTurn without creating incomplete variations", async () => {
  const save = setupStore();
  // Add a playable turn to retry
  const playableTurn = {
    id: "turn_playable_1",
    turnIndex: save.turns.length,
    timestamp: new Date().toISOString(),
    playerInput: "走到吧台前向酒馆老板打听消息",
    narratorOutput: "酒馆老板抬起头看了你一眼。",
    traceId: "trace_turn_1",
    worldStateBefore: structuredClone(save.worldState),
    worldStateAfter: structuredClone(save.worldState),
    patches: [],
    activeAgentGroupId: "group_fast",
    status: "success" as const,
    variations: [],
    activeVariationIndex: 0,
  };
  save.turns.push(playableTurn);
  useGameStore.setState({ activeSave: save, saves: [save] });

  const initialTurnCount = save.turns.length;
  const targetTurn = save.turns[initialTurnCount - 1];
  const initialVariationsCount = targetTurn.variations?.length ?? 1;

  // Start retry turn
  const retryPromise = useGameStore.getState().retryTurn(initialTurnCount - 1);

  assert.equal(useGameStore.getState().isExecuting, true);
  assert.equal(useGameStore.getState().pendingPlayerInput, targetTurn.playerInput);

  // Cancel retry
  const restoredInput = useGameStore.getState().cancelGeneration();
  assert.equal(restoredInput, targetTurn.playerInput);

  const success = await retryPromise;
  assert.equal(success, false);

  const state = useGameStore.getState();
  assert.equal(state.isExecuting, false);
  assert.equal(state.executionError, null);

  // Verify turn count and variations count remain intact
  assert.equal(state.activeSave?.turns.length, initialTurnCount);
  const currentTurn = state.activeSave?.turns[initialTurnCount - 1];
  assert.equal(currentTurn?.variations?.length ?? 1, initialVariationsCount);
});

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
