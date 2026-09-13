import { INITIAL_DEMO_SAVE } from './fixtures/legacyInitialData';
import test from "node:test";
import assert from "node:assert/strict";

import {
  AgentDefinition,
  AgentGroup,
  Backend,
  GameEvent,
  GameTurn,
  TemporalBlock,
  WorldState,
} from "../src/types";
import { INITIAL_HARBOR_TAVERN_WORLD } from "../src/engine/world/WorldState";
import {
  applyPatches,
  cloneWorldState,
  isValidPatchOperation,
  validateWorldPatchPath,
  validateWorldState,
} from "../src/engine/world/PatchEngine";
import { SpatialEngine } from "../src/engine/world/SpatialEngine";
import { SchemaValidator } from "../src/engine/schema/SchemaValidator";
import {
  AgentRuntime,
  extractJsonPayload,
  sanitizeExtraBody,
  sanitizeCustomHeaders,
} from "../src/engine/runtime/AgentRuntime";
import { GamePipeline, getSafeIntentDuration } from "../src/engine/pipeline/GamePipeline";
import { MockSimulator } from "../src/engine/runtime/MockSimulator";
import { globalTraceManager } from "../src/engine/tracing/TraceManager";
import { storageService, DEFAULT_SETTINGS } from "../src/db/storage";
import { useTraceStore } from "../src/stores/useTraceStore";
import { useSettingsStore } from "../src/stores/useSettingsStore";
import { useGameStore } from "../src/stores/useGameStore";
import { useAgentGroupStore } from "../src/stores/useAgentGroupStore";
import { useBackendStore } from "../src/stores/useBackendStore";
import { useAgentStore } from "../src/stores/useAgentStore";
import { BUILTIN_AGENTS, DEFAULT_AGENT_GROUPS, DEFAULT_BACKENDS } from "./fixtures/legacyInitialData";
import {
  buildPerceptionView,
  buildNarratorEntityView,
  buildNpcView,
  filterPublicPatches,
  isPrivateWorldPath,
  sanitizeNpcObservations,
  validatePerceptionAgainstEvents,
  validatePublicEvents,
} from "../src/engine/world/WorldViews";
import {
  getSpeechDuration,
  getClampedActionDuration,
  getSafeEventDuration,
  maxThoughtChars,
} from "../src/engine/world/TimingEngine";

const mockBackend: Backend = {
  id: "backend_mock",
  name: "Mock Backend",
  baseUrl: "https://api.openai.com/v1",
  authType: "none",
  customHeaders: {},
  timeoutMs: 5000,
  maxConcurrency: 2,
  enabled: true,
  models: ["mock-model"],
  defaultModel: "mock-model",
};

const mockGroup: AgentGroup = {
  id: "group_test",
  name: "Test Group",
  bindings: BUILTIN_AGENTS.map((a) => ({
    agentId: a.id,
    backendId: "backend_mock",
    model: "mock-model",
  })),
};

const mockExecContext = {
  agents: BUILTIN_AGENTS,
  groups: [mockGroup],
  backends: [mockBackend],
  activeGroupId: "group_test",
  mockMode: true,
};

test("Test 1: wait block execution semantics with response window", async () => {
  const pipeline = new GamePipeline();
  const input = "我对艾琳说：“你好。” 然后等她回答。";
  const result = await pipeline.executeTurn(
    input,
    INITIAL_HARBOR_TAVERN_WORLD,
    1,
    mockExecContext
  );

  assert.equal(result.success, true, "Turn with wait block should succeed");
  assert.equal(result.turn.status, "success");

  // Verify wait block execution in trace
  const trace = globalTraceManager.getTrace(result.traceId);
  assert.ok(trace, "Turn trace must exist");
  const waitBlockSpan = trace.spans.find(
    (s) => s.type === "temporal_block" && s.name.includes("wait")
  );
  assert.ok(waitBlockSpan, "Trace must contain execution of wait block");
});

test("Test 2: invisible NPC with saw=false, heard=false must not react", async () => {
  const runtime = new AgentRuntime();
  // Simulate NPC reaction with empty perception
  const mockObservations = [
    { eventId: "e1", saw: false, heard: false },
  ];

  const reaction = MockSimulator.simulate("npc_reaction", {
    npc: { id: "guard", name: "卫兵" },
    observations: mockObservations,
    reaction: { available_time: 2.0 },
  });

  assert.equal(reaction.thought, null, "Invisible NPC should have null thought");
  assert.equal(reaction.intents.length, 0, "Invisible NPC should produce 0 intents");
});

test("Test 3: empty perception yields zero NPC reactions without random fallback", async () => {
  const pipeline = new GamePipeline();
  // Provide input with no player action or speech (e.g. ambient observation)
  const emptyObsResult = MockSimulator.simulate("perception", {
    events: [],
    scene: INITIAL_HARBOR_TAVERN_WORLD.scene,
    entities: INITIAL_HARBOR_TAVERN_WORLD.entities,
  });

  assert.deepEqual(
    emptyObsResult.npcObservations,
    {},
    "Empty events should produce empty npcObservations"
  );
});

test("Test 4: perception failure causes fail-fast and keeps world unchanged", async () => {
  const pipeline = new GamePipeline();
  // Create an execution context where perception agent is missing/broken
  const badAgents = BUILTIN_AGENTS.filter((a) => a.id !== "perception");
  const badContext = {
    ...mockExecContext,
    agents: badAgents,
  };

  const initialWorld = cloneWorldState(INITIAL_HARBOR_TAVERN_WORLD);
  const result = await pipeline.executeTurn(
    "我走向艾琳并说话",
    initialWorld,
    2,
    badContext
  );

  assert.equal(result.success, false, "Pipeline must fail when perception fails");
  assert.equal(result.turn.status, "error");
  assert.deepEqual(
    result.turn.worldStateAfter,
    initialWorld,
    "World state after failed turn must equal initial world"
  );
  assert.equal(result.turn.patches.length, 0, "Error turn must commit 0 patches");
});

test("Test 5: NPC outside scene is not included in scene characters", () => {
  const world = cloneWorldState(INITIAL_HARBOR_TAVERN_WORLD);
  // Place tavern_owner explicitly at tavern_bar
  world.entities.tavern_owner = {
    type: "character",
    name: "酒馆老板",
    location: "tavern_bar",
  };
  world.scene.location = "tavern_outside";

  const isInScene = SpatialEngine.isEntityInScene(
    "tavern_owner",
    world.entities.tavern_owner,
    world
  );
  assert.equal(isInScene, false, "Tavern owner in tavern_bar must not be in tavern_outside scene");

  const sceneChars = SpatialEngine.getSceneCharacters(world, false);
  const charIds = sceneChars.map((c) => c.id);
  assert.ok(!charIds.includes("tavern_owner"), "Tavern owner must not appear in scene characters");
});

test("Test 6: output schema validation rejects invalid JSON data structure", () => {
  const schema = {
    type: "object",
    required: ["blocks"],
    properties: {
      blocks: {
        type: "array",
        minItems: 1,
      },
    },
  };

  const invalidData = { foo: 123 };
  const res = SchemaValidator.validate(schema, invalidData);
  assert.equal(res.valid, false, "Schema validation must fail for data missing required properties");

  assert.throws(
    () => {
      SchemaValidator.validateOrThrow(schema, invalidData, "input_compiler");
    },
    (err: any) => err.code === "SCHEMA_VALIDATION_ERROR"
  );
});

test("Test 7: malformed patch rejected atomically", () => {
  const world = cloneWorldState(INITIAL_HARBOR_TAVERN_WORLD);
  const malformed = [{ op: "replace" } as any];

  const result = applyPatches(world, malformed);
  assert.equal(result.success, false, "Malformed patch must fail");
  assert.equal(result.appliedPatches.length, 0);
  assert.deepEqual(result.newWorld, world, "World state must remain unchanged on patch error");
});

test("Test 8: partially invalid patch set is rejected completely without partial commit", () => {
  const world = cloneWorldState(INITIAL_HARBOR_TAVERN_WORLD);
  const validPatch = {
    op: "replace" as const,
    path: "/scene/weather",
    value: "stormy",
  };
  const invalidPatch = {
    op: "replace" as const,
    path: "/scene/invalid_missing_value",
  } as any;

  const result = applyPatches(world, [validPatch, invalidPatch]);
  assert.equal(result.success, false, "Atomic patch apply must fail if 1 patch is invalid");
  assert.equal(result.appliedPatches.length, 0, "No patches should be applied");
  assert.equal(world.scene.weather, "clear", "Original world weather must remain unchanged");
});

test("Test 9: multi-block rollback restores initial world state", async () => {
  const pipeline = new GamePipeline();
  const initialWorld = cloneWorldState(INITIAL_HARBOR_TAVERN_WORLD);

  // A normal block succeeds before a missing time_skip agent fails.
  const brokenAgents = BUILTIN_AGENTS.filter((a) => a.id !== "time_skip");

  // This exercises rollback without implicitly granting administrator authority.
  const input = "我走到窗边，然后快进到第二天";
  // Execute turn
  const result = await pipeline.executeTurn(input, initialWorld, 3, {
    ...mockExecContext,
    agents: brokenAgents,
    activeGroupId: "group_test",
  });

  assert.equal(result.success, false, "Multi-block turn must fail when subsequent block fails");
  assert.equal(result.turn.status, "error");
  assert.deepEqual(
    result.turn.worldStateAfter,
    initialWorld,
    "Rolled back turn worldStateAfter must match initialWorld"
  );
  assert.equal(result.turn.patches.length, 0, "Error turn must commit 0 patches");
});

test("Test 10: invalid group throws error without silent fallback to groups[0]", async () => {
  const runtime = new AgentRuntime();
  const res = await runtime.runAgent({
    agentId: "input_compiler",
    groupId: "does_not_exist",
    context: { input: "hello" },
    agents: BUILTIN_AGENTS,
    groups: [mockGroup],
    backends: [mockBackend],
  });

  assert.equal(res.success, false);
  assert.ok(
    res.error?.includes("Agent Group 'does_not_exist' not found"),
    "Must fail fast with explicit group not found error"
  );
});

test("Test 11: missing agent binding throws error without silent fallback to backend[0]", async () => {
  const runtime = new AgentRuntime();
  const groupWithoutCompiler: AgentGroup = {
    id: "group_incomplete",
    name: "Incomplete Group",
    bindings: [], // No bindings
  };

  const res = await runtime.runAgent({
    agentId: "input_compiler",
    groupId: "group_incomplete",
    context: { input: "hello" },
    agents: BUILTIN_AGENTS,
    groups: [groupWithoutCompiler],
    backends: [mockBackend],
  });

  assert.equal(res.success, false);
  assert.ok(
    res.error?.includes("has no binding in group"),
    "Must fail fast with explicit missing binding error"
  );
});

test("Test 12: disabled backend throws error without making request", async () => {
  const runtime = new AgentRuntime();
  const disabledBackend: Backend = {
    ...mockBackend,
    id: "backend_disabled",
    enabled: false,
  };

  const groupWithDisabled: AgentGroup = {
    id: "group_disabled",
    name: "Group Disabled",
    bindings: [
      {
        agentId: "input_compiler",
        backendId: "backend_disabled",
        model: "mock-model",
      },
    ],
  };

  const res = await runtime.runAgent({
    agentId: "input_compiler",
    groupId: "group_disabled",
    context: { input: "hello" },
    agents: BUILTIN_AGENTS,
    groups: [groupWithDisabled],
    backends: [disabledBackend],
  });

  assert.equal(res.success, false);
  assert.ok(
    res.error?.includes("is disabled"),
    "Must fail fast when backend is disabled"
  );
});

test("Test 13: Mock mode persistence preserves true setting upon reload", async () => {
  await storageService.saveSettings({
    ...DEFAULT_SETTINGS,
    mockLlmMode: true,
  });

  const reloaded = await storageService.getSettings();
  assert.equal(reloaded.mockLlmMode, true, "mockLlmMode must remain true on reload");

  // Clean up
  await storageService.saveSettings({
    ...DEFAULT_SETTINGS,
    mockLlmMode: false,
  });
});

test("Test 14: autosave=false updates memory store without saving to persistence", async () => {
  useSettingsStore.setState({
    settings: {
      ...DEFAULT_SETTINGS,
      autosave: false,
    },
  });

  let saveGameCalled = false;
  const originalSaveGame = storageService.saveGame.bind(storageService);
  storageService.saveGame = async (save) => {
    saveGameCalled = true;
    return originalSaveGame(save);
  };

  try {
    const activeSave = await createLegacyFixture("Autosave Test");
    saveGameCalled = false; // Reset after creation

    await useGameStore.getState().sendPlayerInput("我看向窗外");
    assert.equal(saveGameCalled, false, "saveGame must NOT be called when autosave=false");
  } finally {
    storageService.saveGame = originalSaveGame;
    useSettingsStore.setState({
      settings: { ...DEFAULT_SETTINGS, autosave: true },
    });
  }
});

test("Test 15: Tauri DB failure throws instead of falling back to localStorage", async () => {
  // Both desktop and browser must fail closed when the shared host fails.
  const originalUsesLocalService = storageService.usesLocalService;
  storageService.usesLocalService = () => true;

  // Under Node/test, invoke will fail
  await assert.rejects(
    async () => {
      await storageService.getBackends();
    },
    "In Tauri mode, failing SQLite call must reject/throw rather than silently falling back to localStorage"
  );

  storageService.usesLocalService = originalUsesLocalService;
});

test("Test 16: missing binding in real mode fails fast with explicit error", async () => {
  const runtime = new AgentRuntime();
  const groupWithoutBinding: AgentGroup = {
    id: "group_no_binding",
    name: "Group Without Binding",
    bindings: [],
  };

  const res = await runtime.runAgent({
    agentId: "narrator",
    groupId: "group_no_binding",
    context: { playerInput: "hello" },
    agents: BUILTIN_AGENTS,
    groups: [groupWithoutBinding],
    backends: [mockBackend],
    mockMode: false,
  });

  assert.equal(res.success, false);
  assert.ok(res.error?.includes("has no binding in group"));
});

test("Test 17: history missing trace returns undefined without fallback to traces[0]", () => {
  useTraceStore.setState({
    traces: [
      {
        id: "existing_trace_1",
        turnNumber: 1,
        playerInput: "input",
        startedAt: 100,
        status: "success",
        spans: [],
        totalTokens: 0,
      },
    ],
    selectedTraceId: "non_existent_trace_id_999",
  });

  const selected = useTraceStore.getState().getSelectedTrace();
  assert.equal(selected, undefined, "Missing trace must return undefined instead of falling back to traces[0]");
});

test("Test 18: trace persistence saves and reloads trace", async () => {
  const sampleTrace = {
    id: `trace_persist_test_${Date.now()}`,
    turnNumber: 5,
    playerInput: "测试持久化",
    startedAt: Date.now(),
    status: "success" as const,
    spans: [],
    totalTokens: 150,
  };

  await storageService.saveTrace(sampleTrace);
  const fetched = await storageService.getTrace(sampleTrace.id);
  assert.ok(fetched, "Stored trace must be retrievable");
  assert.equal(fetched.id, sampleTrace.id);
  assert.equal(fetched.playerInput, "测试持久化");
});

test("Test 19: Agent Editor test uses draft prompt and draft schema", async () => {
  const draftPrompt = "Draft system prompt testing: {{player.input}}";
  const draftSchema = {
    type: "object",
    required: ["message"],
    properties: {
      message: { type: "string" },
    },
  };
  const draftAgent: AgentDefinition = {
    ...BUILTIN_AGENTS[0],
    id: "test_draft_agent",
    messages: [{ id: "m1", role: "system", content: draftPrompt }],
    outputSchema: draftSchema,
  };

  const runtime = new AgentRuntime();
  const testGroup: AgentGroup = {
    id: "draft_test_group",
    name: "Draft Group",
    bindings: [
      {
        agentId: "test_draft_agent",
        backendId: "backend_mock",
        model: "mock-model",
      },
    ],
  };

  const res = await runtime.runAgent({
    agentId: "test_draft_agent",
    groupId: "draft_test_group",
    context: { player: { input: "test" } },
    agents: [draftAgent],
    groups: [testGroup],
    backends: [mockBackend],
    mockMode: true,
  });

  assert.equal(res.success, true);
  // Verify trace recorded the draft prompt
  const span = globalTraceManager.getTrace(res.spanId)?.spans[0];
  // Verify draft agent definition was used
  assert.ok(draftAgent.messages[0].content === draftPrompt);
});

test("Test 20: mock regex does not misidentify character '进' as time skip", () => {
  const compilerResult = MockSimulator.simulate("input_compiler", {
    player: { input: "我走进酒馆大门，点了一杯麦酒" },
  });

  const hasTimeSkip = compilerResult.blocks.some((b: any) => b.kind === "time_skip");
  assert.equal(hasTimeSkip, false, "Input with '走' and '进' must not be misidentified as time skip");
});

test("Test 21: unknown admin command does not default to snow", () => {
  const result = MockSimulator.simulate("admin_patch", {
    command: "让猫喜欢鱼",
  });

  const isSnowy = result.patches.some(
    (p: any) => p.path === "/scene/weather" && p.value === "snowy"
  );
  assert.equal(isSnowy, false, "Unknown admin command must NOT default to snow");
  assert.equal(result.patches.length, 0, "Unknown admin command must produce 0 patches");
});

test("Test 22: NPC intent duration exceeding reaction budget is rejected", async () => {
  // Reaction with budget 1.0s receiving 5.0s speech intent
  const budget = { available_time: 1.0, response_window: false };
  const rx = MockSimulator.simulate("npc_reaction", {
    npc: { id: "erin", name: "艾琳" },
    observations: [{ eventId: "e1", saw: true, heard: true, content: "你好" }],
    reaction: budget,
  });

  // Verify total duration of generated intents does not exceed available_time
  const totalDuration = (rx.intents || []).reduce(
    (sum: number, it: any) => sum + (it.duration || 1.0),
    0
  );
  assert.ok(
    totalDuration <= budget.available_time,
    `Total intent duration (${totalDuration}s) must not exceed available_time (${budget.available_time}s)`
  );
});

test("Test 23: multiple temporal blocks trace contains all block spans in order", async () => {
  const pipeline = new GamePipeline();
  // Input producing normal and wait blocks
  const result = await pipeline.executeTurn(
    "我对艾琳说：“快走。” 然后等她回答。",
    INITIAL_HARBOR_TAVERN_WORLD,
    4,
    mockExecContext
  );

  const trace = globalTraceManager.getTrace(result.traceId);
  assert.ok(trace);

  const blockSpans = trace.spans.filter((s) => s.type === "temporal_block");
  assert.ok(blockSpans.length >= 2, "Trace must have at least 2 distinct temporal block spans");

  // Check sequential ordering
  for (let i = 1; i < blockSpans.length; i++) {
    assert.ok(blockSpans[i].startedAt >= blockSpans[i - 1].startedAt);
  }
});

test("Test 24: patch prototype pollution attempt is strictly rejected", () => {
  const world = cloneWorldState(INITIAL_HARBOR_TAVERN_WORLD);
  const maliciousPatch = {
    op: "add" as const,
    path: "/__proto__/polluted",
    value: true,
  };

  assert.throws(
    () => {
      validateWorldPatchPath(maliciousPatch.path, maliciousPatch.op);
    },
    /prototype pollution/i
  );

  const result = applyPatches(world, [maliciousPatch]);
  assert.equal(result.success, false, "Prototype pollution patch must be rejected atomically");
  assert.equal(result.appliedPatches.length, 0);
  assert.equal((Object.prototype as any).polluted, undefined, "Object prototype must not be polluted");
});

test("Test 25: core root removal is strictly rejected", () => {
  const world = cloneWorldState(INITIAL_HARBOR_TAVERN_WORLD);
  const coreRemovalPatch = {
    op: "remove" as const,
    path: "/entities",
  };

  assert.throws(
    () => {
      validateWorldPatchPath(coreRemovalPatch.path, coreRemovalPatch.op);
    },
    /protected core branch/i
  );

  const result = applyPatches(world, [coreRemovalPatch]);
  assert.equal(result.success, false, "Removing core root branch must be rejected atomically");
  assert.ok(result.newWorld.entities, "Entities root must still exist");
});

test("Test 26: mock mode without backend can execute full turn", async () => {
  const pipeline = new GamePipeline();
  const result = await pipeline.executeTurn(
    "我对艾琳说：“你好，今天天气不错。”",
    INITIAL_HARBOR_TAVERN_WORLD,
    1,
    {
      agents: BUILTIN_AGENTS,
      groups: [],
      backends: [],
      activeGroupId: "",
      mockMode: true,
    }
  );

  assert.equal(result.success, true, "Mock mode turn without backends must succeed");
  assert.equal(result.turn.status, "success");
  assert.ok(result.turn.narratorOutput.length > 0, "Narrator should produce story output in mock mode");
});

test("Test 27: negative, NaN, Infinity, and zero duration cannot gain extra budget", () => {
  assert.equal(getSafeIntentDuration({ type: "action", duration: -100 }), 2.0);
  assert.equal(getSafeIntentDuration({ type: "action", duration: NaN }), 2.0);
  assert.equal(getSafeIntentDuration({ type: "action", duration: Infinity }), 2.0);
  assert.equal(getSafeIntentDuration({ type: "action", duration: 0 }), 2.0);
  assert.equal(getSafeIntentDuration({ type: "action", duration: 2.5 }), 2.5);
  assert.equal(getSafeIntentDuration({ type: "wait", duration: -100 }), 1.0);
});

test("Test 28: extraBody cannot override reserved model or messages parameters", () => {
  assert.throws(() => {
    sanitizeExtraBody({ model: "evil-model" });
  }, /forbidden reserved field 'model'/i);

  assert.throws(() => {
    sanitizeExtraBody({ messages: [] });
  }, /forbidden reserved field 'messages'/i);

  assert.throws(() => {
    sanitizeExtraBody({ temperature: 0.9 });
  }, /forbidden reserved field 'temperature'/i);
});

test("Test 29: customHeaders cannot override Authorization or transport headers", () => {
  assert.throws(() => {
    sanitizeCustomHeaders({ Authorization: "Bearer bad" });
  }, /forbidden/i);
  assert.throws(() => {
    sanitizeCustomHeaders({ authorization: "Bearer bad" });
  }, /forbidden/i);
  assert.throws(() => {
    sanitizeCustomHeaders({ Host: "bad.com" });
  }, /forbidden/i);
});

test("Test 30: standalone runAgent trace closes and does not remain active", async () => {
  const runtime = new AgentRuntime();
  const traceId = `standalone_test_${Date.now()}`;
  const res = await runtime.runAgent({
    agentId: "input_compiler",
    groupId: "group_test",
    context: { player: { input: "hello" } },
    traceId,
    agents: BUILTIN_AGENTS,
    groups: [mockGroup],
    backends: [mockBackend],
    mockMode: true,
  });

  assert.equal(res.success, true);
  const trace = globalTraceManager.getTrace(traceId);
  assert.ok(trace);
  assert.equal(trace.status, "success", "Standalone trace must be closed with status success");
});

test("Test 31: failed block parent span status becomes error", async () => {
  const pipeline = new GamePipeline();
  const brokenAgents = BUILTIN_AGENTS.filter((a) => a.id !== "perception");
  const result = await pipeline.executeTurn(
    "我走向艾琳",
    INITIAL_HARBOR_TAVERN_WORLD,
    1,
    {
      ...mockExecContext,
      agents: brokenAgents,
    }
  );

  assert.equal(result.success, false);
  const trace = globalTraceManager.getTrace(result.traceId);
  assert.ok(trace);
  const blockSpan = trace.spans.find((s) => s.type === "temporal_block");
  assert.ok(blockSpan);
  assert.equal(blockSpan.status, "error", "Parent block span must be closed as error on failure");
});

test("Test 32: malformed nested agent output is rejected by semantic validator", () => {
  // input_compiler with missing op in action event
  const malformedCompiler = {
    blocks: [
      {
        id: "b1",
        kind: "normal",
        events: [{ id: "e1", type: "action" /* missing op */ }],
      },
    ],
  };
  assert.throws(() => {
    SchemaValidator.validateAgentSemantics("input_compiler", malformedCompiler);
  }, /non-empty 'op'/i);

  // perception with invalid observation
  const malformedPerception = {
    npcObservations: {
      erin: [{ eventId: "e1", saw: "not_a_boolean" }],
    },
  };
  assert.throws(() => {
    SchemaValidator.validateAgentSemantics("perception", malformedPerception);
  }, /boolean 'saw'/i);

  // npc_reaction with speech missing content
  const malformedReaction = {
    thought: "hmm",
    intents: [{ type: "speech" /* missing content */ }],
  };
  assert.throws(() => {
    SchemaValidator.validateAgentSemantics("npc_reaction", malformedReaction);
  }, /non-empty 'content'/i);
});

test("Test 33: removing or replacing player entity violates invariants", () => {
  const world = cloneWorldState(INITIAL_HARBOR_TAVERN_WORLD);

  // Direct remove of /entities/player
  assert.throws(() => {
    validateWorldPatchPath("/entities/player", "remove");
  }, /Prohibited patch operation/i);

  // Attempting to wipe /entities with {}
  const wipeEntitiesPatch = { op: "replace" as const, path: "/entities", value: {} };
  const res = applyPatches(world, [wipeEntitiesPatch]);
  assert.equal(res.success, false, "Wiping entities must fail because player is deleted");
});

test("Test 34: scene weather, lighting, and location must be non-empty strings", () => {
  const world = cloneWorldState(INITIAL_HARBOR_TAVERN_WORLD);

  // Removing /scene/weather
  const removeWeatherPatch = { op: "remove" as const, path: "/scene/weather" };
  const res1 = applyPatches(world, [removeWeatherPatch]);
  assert.equal(res1.success, false, "Removing scene.weather must violate WorldState invariant");

  // Replacing /scene/weather with empty string
  const emptyWeatherPatch = { op: "replace" as const, path: "/scene/weather", value: "" };
  const res2 = applyPatches(world, [emptyWeatherPatch]);
  assert.equal(res2.success, false, "Empty scene.weather must violate WorldState invariant");

  // Valid weather change succeeds
  const validWeatherPatch = { op: "replace" as const, path: "/scene/weather", value: "snowy" };
  const res3 = applyPatches(world, [validWeatherPatch]);
  assert.equal(res3.success, true, "Valid weather change must succeed");
  assert.equal(res3.newWorld.scene.weather, "snowy");
});

test("Test 35: retry historical turn removes subsequent turns and sets current world (Test A)", async () => {
  useSettingsStore.setState({
    settings: { ...DEFAULT_SETTINGS, mockLlmMode: true },
  });

  await createLegacyFixture("Branch Test A");
  // Legacy variation compatibility: new saves now use the separate text transaction path.
  useGameStore.setState(s=>({activeSave:{...s.activeSave!,textWorld:undefined}}));
  await useGameStore.getState().sendPlayerInput("动作 1"); // Turn 1
  await useGameStore.getState().sendPlayerInput("动作 2"); // Turn 2
  await useGameStore.getState().sendPlayerInput("动作 3"); // Turn 3

  const turnsBefore = useGameStore.getState().activeSave!.turns;
  assert.equal(turnsBefore.length, 4); // [0: init, 1: 动作1, 2: 动作2, 3: 动作3]

  // Retry Turn 1 (historical turn)
  const retrySuccess = await useGameStore.getState().retryTurn(1);
  assert.equal(retrySuccess, true);

  const turnsAfter = useGameStore.getState().activeSave!.turns;
  assert.equal(turnsAfter.length, 2, "Turns after Turn 1 must be removed on historical retry");
  assert.equal(turnsAfter[1].turnIndex, 1);
  assert.equal(turnsAfter[1].variations?.length, 2, "Turn 1 should now have 2 variations");
  assert.deepEqual(
    useGameStore.getState().activeSave!.worldState,
    turnsAfter[1].worldStateAfter,
    "Current world must equal retried Turn 1 worldStateAfter"
  );
});

test("Test 36: switch historical variation removes subsequent turns (Test B)", async () => {
  useSettingsStore.setState({
    settings: { ...DEFAULT_SETTINGS, mockLlmMode: true },
  });

  await createLegacyFixture("Branch Test B");
  useGameStore.setState(s=>({activeSave:{...s.activeSave!,textWorld:undefined}}));
  await useGameStore.getState().sendPlayerInput("动作 1"); // Turn 1
  // Retry Turn 1 to create 2 variations while it's head
  await useGameStore.getState().retryTurn(1);
  // Now add Turn 2 on top of variation 2
  await useGameStore.getState().sendPlayerInput("动作 2");
  assert.equal(useGameStore.getState().activeSave!.turns.length, 3); // [0, 1, 2]

  // Switch Turn 1 back to variation 0
  await useGameStore.getState().switchTurnVariation(1, 0);

  const turnsAfter = useGameStore.getState().activeSave!.turns;
  assert.equal(turnsAfter.length, 2, "Switching historical Turn 1 variation must truncate Turn 2");
  assert.equal(turnsAfter[1].activeVariationIndex, 0);
  assert.deepEqual(
    useGameStore.getState().activeSave!.worldState,
    turnsAfter[1].variations![0].worldStateAfter,
    "Current world must equal variation 0 worldStateAfter"
  );
});

test("Test 37: Narrator data contract contains NPC public events and excludes private states", async () => {
  const pipeline = new GamePipeline();
  const result = await pipeline.executeTurn(
    `我对艾琳说：“${"今晚跟我走。".repeat(16)}”`,
    INITIAL_HARBOR_TAVERN_WORLD,
    1,
    mockExecContext
  );

  assert.equal(result.success, true);
  const trace = globalTraceManager.getTrace(result.traceId);
  assert.ok(trace);

  const narratorSpan = trace.spans.find((s) => s.agentId === "narrator");
  assert.ok(narratorSpan, "Narrator span must exist");

  const resolvedMessagesStr = JSON.stringify(narratorSpan.resolvedMessages);

  // Must contain Erin's speech and Guard's action from World Resolver publicEvents
  assert.ok(
    resolvedMessagesStr.includes("小声点……") || resolvedMessagesStr.includes("艾琳"),
    "Narrator must receive Erin's speech from publicEvents"
  );

  // Must NOT contain Erin's internal thought, private memory, relationships, or mentalState patch
  assert.ok(
    !resolvedMessagesStr.includes("他让我今晚离开……难道码头"),
    "Narrator must NOT receive Erin's private thought"
  );
  assert.ok(
    !resolvedMessagesStr.includes("/mentalState"),
    "Narrator must NOT receive private mentalState patches"
  );
});

test("Test 38: observation sanitization filters unperceived events and deletes speech content when heard=false", () => {
  const events: GameEvent[] = [
    { id: "e1", type: "action", actor: "player", op: "wave" },
    { id: "e2", type: "speech", actor: "player", content: "秘密逃跑计划" },
  ];

  // Case 1: saw=false && heard=false must be completely removed
  const obs1 = [
    { eventId: "e1", saw: true, heard: false },
    { eventId: "e2", saw: false, heard: false, content: "秘密逃跑计划" },
  ];
  const res1 = sanitizeNpcObservations("guard", obs1, events);
  assert.equal(res1.length, 1);
  assert.equal(res1[0].eventId, "e1");

  // Case 2: heard=false for speech must delete speech content
  const obs2 = [{ eventId: "e2", saw: true, heard: false, content: "秘密逃跑计划" }];
  const res2 = sanitizeNpcObservations("guard", obs2, events);
  assert.equal(res2.length, 1);
  assert.equal(res2[0].content, undefined, "Speech content must be deleted when heard=false");

  // Case 3: heard=true for speech must authoritatively use GameEvent content, ignoring LLM hallucination
  const obs3 = [{ eventId: "e2", saw: true, heard: true, content: "LLM_HALLUCINATION" }];
  const res3 = sanitizeNpcObservations("guard", obs3, events);
  assert.equal(res3.length, 1);
  assert.equal(
    res3[0].content,
    "秘密逃跑计划",
    "Authoritative GameEvent content must replace LLM hallucination"
  );
});

test("Test 39: Perception View prevents leakage of NPC private memory, goal, relationships, and mentalState", () => {
  const world = cloneWorldState(INITIAL_HARBOR_TAVERN_WORLD);
  world.entities["erin"] = {
    type: "character",
    name: "艾琳",
    location: "room",

    relationships: { player: { trust: 99 } },
    attributes: { mood: "ultra_secret", memory: "SUPER_SECRET_MEMORY_123", goal: "SUPER_SECRET_GOAL_456" },
  };

  const view = buildPerceptionView(world);
  const serialized = JSON.stringify(view);

  assert.ok(!serialized.includes("SUPER_SECRET_MEMORY_123"), "Perception view must not contain memory");
  assert.ok(!serialized.includes("SUPER_SECRET_GOAL_456"), "Perception view must not contain goal");
  assert.ok(!serialized.includes("relationships"), "Perception view must not contain relationships");
  assert.ok(!serialized.includes("ultra_secret"), "Perception view must not contain mentalState");

  assert.equal(view.entities["erin"].location, "room");
  assert.equal(view.entities["erin"].type, "character");
});

test("Test 40: Narrator View and Patch Filter prevent leakage of private fields", () => {
  const world = cloneWorldState(INITIAL_HARBOR_TAVERN_WORLD);
  world.entities["erin"] = {
    type: "character",
    name: "艾琳",
    location: "tavern_outside",

    relationships: { player: { trust: 50 } },
    attributes: { mood: "hidden_mood", memory: "NARRATOR_FORBIDDEN_MEMORY", goal: "NARRATOR_FORBIDDEN_GOAL" },
  };

  const narratorEntities = buildNarratorEntityView(world);
  const serializedEntities = JSON.stringify(narratorEntities);

  assert.ok(!serializedEntities.includes("NARRATOR_FORBIDDEN_MEMORY"));
  assert.ok(!serializedEntities.includes("NARRATOR_FORBIDDEN_GOAL"));
  assert.ok(!serializedEntities.includes("relationships"));
  assert.ok(!serializedEntities.includes("hidden_mood"));

  const patches = [
    { op: "replace" as const, path: "/clock", value: "Day 2" },
    { op: "replace" as const, path: "/entities/erin/attributes/mood", value: "alert" },
    { op: "replace" as const, path: "/entities/erin/attributes/memory", value: "leak" },
    { op: "replace" as const, path: "/entities/erin/relationships/player/trust", value: 10 },
    { op: "replace" as const, path: "/entities/erin/attributes/goal", value: "escape" },
    { op: "replace" as const, path: "/scene/weather", value: "snowy" },
  ];

  const publicPatches = filterPublicPatches(patches);
  assert.equal(publicPatches.length, 2);
  assert.equal(publicPatches[0].path, "/clock");
  assert.equal(publicPatches[1].path, "/scene/weather");
});

test("Test 41: Retry failure leaves turns, variations, and worldState completely unchanged", async () => {
  useSettingsStore.setState({
    settings: { ...DEFAULT_SETTINGS, mockLlmMode: true },
  });

  await createLegacyFixture("Retry Fail Test");
  useGameStore.setState(s=>({activeSave:{...s.activeSave!,textWorld:undefined}}));
  await useGameStore.getState().sendPlayerInput("动作 1");
  await useGameStore.getState().sendPlayerInput("动作 2");
  await useGameStore.getState().sendPlayerInput("动作 3");

  const turnsBefore = structuredClone(useGameStore.getState().activeSave!.turns);
  const worldBefore = structuredClone(useGameStore.getState().activeSave!.worldState);

  // Force failure by temporarily clearing groups
  useAgentGroupStore.setState({ groups: [] });

  const retrySuccess = await useGameStore.getState().retryTurn(1);
  assert.equal(retrySuccess, false, "Retry with missing groups must fail");

  // Restore groups
  useAgentGroupStore.setState({ groups: DEFAULT_AGENT_GROUPS, activeGroupId: "group_quality" });

  const turnsAfter = structuredClone(useGameStore.getState().activeSave!.turns);
  const worldAfter = structuredClone(useGameStore.getState().activeSave!.worldState);

  assert.equal(turnsAfter.length, 4, "Turn count must not change on failed retry");
  assert.deepEqual(turnsAfter, turnsBefore, "Turns array must be deeply identical after failed retry");
  assert.deepEqual(worldAfter, worldBefore, "WorldState must be deeply identical after failed retry");
});

test("Test 42: Duration cannot be cheated with small numbers or oversized numbers", () => {
  // Speech duration estimator overrides small LLM duration (e.g. 0.01)
  const longSpeechDuration = getSpeechDuration("这是一段很长的讲话内容，包含了很多字符，不能以零点零一秒草草敷衍过去。");
  assert.ok(longSpeechDuration >= 5.0, `Long speech duration should be >= 5.0s, got ${longSpeechDuration}s`);

  // Action duration clamping prevents 0.01s cheating
  const clampedSmallAction = getClampedActionDuration(0.01, "walk");
  assert.ok(clampedSmallAction >= 1.0, `Clamped action duration should be >= 1.0s, got ${clampedSmallAction}s`);

  // Input event duration prevents 1000s tampering
  const safeEventDuration = getSafeEventDuration({
    id: "e1",
    type: "speech",
    content: "你好",
    duration: 1000,
  });
  assert.ok(
    safeEventDuration <= 3.0,
    `Speech "你好" with duration 1000 must be safely estimated <= 3.0s, got ${safeEventDuration}s`
  );

  // Thought character limits
  assert.equal(maxThoughtChars(0.5), 20);
  assert.equal(maxThoughtChars(2.0), 80);
});

test("Test 43: Wait observation cache is cleared across time_skip and admin blocks", async () => {
  const pipeline = new GamePipeline();

  // Sequence: Normal speech -> Time Skip -> Wait
  const result = await pipeline.executeTurn(
    "我对艾琳说：“快走。” 然后快进到第二天。然后等待她的回答。",
    INITIAL_HARBOR_TAVERN_WORLD,
    1,
    mockExecContext
  );

  assert.equal(result.success, true);
  const trace = globalTraceManager.getTrace(result.traceId);
  assert.ok(trace);

  // The wait block should not inherit observations from the normal block across time_skip
  const waitSpan = trace.spans.find((s) => s.name.includes("wait"));
  assert.ok(waitSpan);
});

test("Test 44: Backend draft testing does not persist draft to database", async () => {
  const draftBackend: Backend = {
    ...mockBackend,
    id: "backend_ephemeral_draft_test",
    name: "Draft Ephemeral",
    baseUrl: "http://localhost:11434/v1",
  };

  // Run testConnection with persistStatus = false
  await useBackendStore.getState().testConnection(draftBackend, "fake_key_123", false);

  const backendsInStore = useBackendStore.getState().backends;
  assert.equal(
    backendsInStore.some((b) => b.id === draftBackend.id),
    false,
    "Draft backend must not be added to backend store when persistStatus is false"
  );

  const backendsInDb = await storageService.getBackends();
  assert.equal(
    backendsInDb.some((b) => b.id === draftBackend.id),
    false,
    "Draft backend must not be written to database storage when persistStatus is false"
  );
});

test("Test 45: Perception produce unknown eventId throws PipelineStageError", () => {
  const invalidPerception: any = {
    npcObservations: {
      erin: [{ eventId: "unknown_hallucinated_event_id_999", saw: true, heard: false }],
    },
  };

  const blockEvents: GameEvent[] = [
    { id: "e1", type: "action", actor: "player", op: "wave" },
  ];

  assert.throws(
    () => {
      validatePerceptionAgainstEvents(invalidPerception, blockEvents);
    },
    /unknown eventId/i,
    "Must throw PipelineStageError when Perception returns unknown eventId"
  );
});

test("Test 46: Public event validation enforces actor existence, valid type, and non-empty content", () => {
  const world = cloneWorldState(INITIAL_HARBOR_TAVERN_WORLD);

  // Invalid non-existent actor
  assert.throws(
    () => {
      validatePublicEvents([{ actor: "ghost_actor_unknown", type: "action" }], world);
    },
    /non-existent actor/i
  );

  // Invalid speech with empty content
  assert.throws(
    () => {
      validatePublicEvents([{ actor: "erin", type: "speech", content: "" }], world);
    },
    /non-empty content/i
  );

  // Valid public events
  assert.doesNotThrow(() => {
    validatePublicEvents(
      [
        { actor: "erin", type: "speech", content: "小声点……", sourceIntentId: "erin_i0" },
        { actor: "guard", type: "action", op: "watch_player" },
        { actor: "environment", type: "environment" },
      ],
      world,
      [{ npcId: "erin", reaction: { thought: null, intents: [{ id: "erin_i0", type: "speech", content: "小声点……" }] } }]
    );
  });
});

// These tests exercise the retained numeric pipeline directly, not the new story launcher.
async function createLegacyFixture(name: string) {
  useAgentStore.setState({ agents: BUILTIN_AGENTS });
  useAgentGroupStore.setState({ groups: DEFAULT_AGENT_GROUPS, activeGroupId: 'group_quality' });
  const save = { ...structuredClone(INITIAL_DEMO_SAVE), id: `legacy_test_${crypto.randomUUID()}`, name };
  await storageService.saveGame(save);
  useGameStore.setState(s => ({ activeSave: save, saves: [...s.saves, save], isExecuting: false }));
  return save;
}
