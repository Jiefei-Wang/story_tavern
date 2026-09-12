import {
  renderTemplate,
  renderMessages,
  inspectPlaceholders,
  getNestedValue,
} from "../src/engine/template/PlaceholderEngine";
import { applyPatches, cloneWorldState } from "../src/engine/world/PatchEngine";
import { ConcurrencyLimiter } from "../src/engine/scheduling/ConcurrencyLimiter";
import { gamePipeline } from "../src/engine/pipeline/GamePipeline";
import { INITIAL_HARBOR_TAVERN_WORLD } from "../src/engine/world/WorldState";
import {
  BUILTIN_AGENTS,
  DEFAULT_AGENT_GROUPS,
  DEFAULT_BACKENDS,
} from "../src/db/initialData";
import { globalTraceManager } from "../src/engine/tracing/TraceManager";

function assert(condition: boolean, msg: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${msg}`);
  }
  console.log(`  ✓ ${msg}`);
}

async function runTests() {
  console.log("\n=== 1. Testing PlaceholderEngine ===");
  const testContext = {
    player: { input: "Hello world" },
    npc: { name: "Erin", mentalState: { mood: "uneasy" } },
    reaction: { available_time: 2.5 },
  };

  // Test basic variable
  const out1 = renderTemplate("Player said: {{player.input}}", testContext);
  assert(out1 === "Player said: Hello world", "Basic variable replacement works");

  // Test nested variable
  const out2 = renderTemplate("Mood is {{npc.mentalState.mood}}", testContext);
  assert(out2 === "Mood is uneasy", "Nested variable replacement works");

  // Test json modifier
  const out3 = renderTemplate("NPC data: {{json npc}}", testContext);
  assert(out3.includes('"name": "Erin"'), "{{json variable}} outputs valid JSON string");

  // Test missing variable fallback
  const out4 = renderTemplate("Unknown: {{unknown.var}}", testContext);
  assert(out4.includes("[UNDEFINED: unknown.var]"), "Missing variable handled gracefully");

  // Test placeholder inspection
  const inspections = inspectPlaceholders("{{player.input}} and {{missing.prop}}", testContext);
  assert(inspections.length === 2, "Inspects 2 placeholders");
  assert(inspections[0].exists === true, "player.input exists");
  assert(inspections[1].exists === false, "missing.prop correctly flagged as missing");

  console.log("\n=== 2. Testing PatchEngine (RFC 6902) ===");
  const initialWorld = cloneWorldState(INITIAL_HARBOR_TAVERN_WORLD);
  const patchRes = applyPatches(initialWorld, [
    {
      op: "replace",
      path: "/entities/erin/mentalState/mood",
      value: "alert",
    },
    {
      op: "replace",
      path: "/rules/magic/resurrection",
      value: false,
    },
  ]);

  assert(patchRes.success === true, "Patch applied successfully");
  assert(
    patchRes.newWorld.entities.erin.mentalState?.mood === "alert",
    "Mood correctly updated to alert"
  );
  assert(
    patchRes.newWorld.rules.magic.resurrection === false,
    "Magic resurrection correctly disabled"
  );
  assert(
    initialWorld.entities.erin.mentalState?.mood === "uneasy",
    "Initial world remained immutable"
  );

  console.log("\n=== 3. Testing ConcurrencyLimiter ===");
  const limiter = new ConcurrencyLimiter();
  let concurrentExecutions = 0;
  let maxObserved = 0;

  const runTask = async () => {
    return limiter.run("test_backend", 2, async () => {
      concurrentExecutions++;
      if (concurrentExecutions > maxObserved) maxObserved = concurrentExecutions;
      await new Promise((r) => setTimeout(r, 50));
      concurrentExecutions--;
    });
  };

  await Promise.all([runTask(), runTask(), runTask(), runTask()]);
  assert(maxObserved <= 2, `Concurrency limit respected: max observed ${maxObserved} <= 2`);

  console.log("\n=== 4. Testing GamePipeline in Mock Mode ===");
  const mockExecContext = {
    agents: BUILTIN_AGENTS,
    groups: DEFAULT_AGENT_GROUPS,
    backends: DEFAULT_BACKENDS,
    activeGroupId: "group_quality",
    mockMode: true,
  };

  const turnResult = await gamePipeline.executeTurn(
    "我走到艾琳旁边，对她说“今晚离开这里。”",
    INITIAL_HARBOR_TAVERN_WORLD,
    1,
    mockExecContext
  );

  assert(turnResult.success === true, "Pipeline execution succeeded");
  assert(Boolean(turnResult.turn.narratorOutput), "Narrator prose was generated");
  assert(
    turnResult.turn.worldStateAfter.entities.erin.mentalState?.mood === "alert",
    "World state committed Erin's mood as alert"
  );
  assert(turnResult.turn.patches.length > 0, "JSON patches were generated and recorded");

  // Trace verification
  const trace = globalTraceManager.getTrace(turnResult.traceId);
  assert(trace !== undefined, "Turn trace was recorded in TraceManager");
  assert(trace!.spans.length >= 4, `Trace contains ${trace!.spans.length} spans`);

  const spanAgents = trace!.spans.map((s) => s.agentId);
  assert(spanAgents.includes("input_compiler"), "Trace contains input_compiler span");
  assert(spanAgents.includes("perception"), "Trace contains perception span");
  assert(spanAgents.includes("npc_reaction"), "Trace contains npc_reaction span");
  assert(spanAgents.includes("world_resolver"), "Trace contains world_resolver span");
  assert(spanAgents.includes("narrator"), "Trace contains narrator span");

  console.log("\n=== 5. Testing Admin Command Pipeline ===");
  const adminTurn = await gamePipeline.executeTurn(
    "另外从现在开始魔法不能复活死人。",
    INITIAL_HARBOR_TAVERN_WORLD,
    2,
    mockExecContext
  );

  assert(adminTurn.success === true, "Admin command turn succeeded");
  assert(
    adminTurn.turn.worldStateAfter.rules.magic.resurrection === false,
    "Magic resurrection rule was patched to false by Admin Patch agent"
  );

  console.log("\n>>> ALL TESTS PASSED SUCCESSFULLY! <<<\n");
}

runTests().catch((e) => {
  console.error("Test failed:", e);
  process.exit(1);
});
