import { MockSimulator } from "../src/engine/runtime/MockSimulator";
import { gamePipeline } from "../src/engine/pipeline/GamePipeline";
import { INITIAL_HARBOR_TAVERN_WORLD } from "../src/engine/world/WorldState";
import {
  BUILTIN_AGENTS,
  DEFAULT_AGENT_GROUPS,
  DEFAULT_BACKENDS,
} from "./fixtures/legacyInitialData";

async function testUserAdmin() {
  console.log("=== 测试用户案例 1: admin:改变天气为下雪天 ===");
  const input1 = "admin:改变天气为下雪天";

  // 1. Input Compiler
  const compiled = MockSimulator.simulate("input_compiler", {
    player: { input: input1 },
    scene: INITIAL_HARBOR_TAVERN_WORLD.scene,
  });

  console.log("Compiler Blocks:", JSON.stringify(compiled, null, 2));

  if (compiled.blocks[0].kind !== "admin") {
    throw new Error(`FAIL: expected kind to be 'admin', got '${compiled.blocks[0].kind}'!`);
  }
  console.log("✓ Correctly compiled into kind: 'admin'!");

  // 2. Full Turn Pipeline
  const mockContext = {
    agents: BUILTIN_AGENTS,
    groups: DEFAULT_AGENT_GROUPS,
    backends: DEFAULT_BACKENDS,
    activeGroupId: "group_quality",
    mockMode: true,
  };

  const turnRes = await gamePipeline.executeTurn(
    input1,
    INITIAL_HARBOR_TAVERN_WORLD,
    1,
    mockContext
  );

  console.log("Turn Success:", turnRes.success);
  console.log("Applied Patches:", turnRes.turn.patches);
  console.log("New Scene Weather:", turnRes.turn.worldStateAfter.scene.weather);
  console.log("Narrator Output:\n", turnRes.turn.narratorOutput);

  if (turnRes.turn.worldStateAfter.scene.weather !== "snowy") {
    throw new Error(`FAIL: expected scene weather to be 'snowy', got '${turnRes.turn.worldStateAfter.scene.weather}'!`);
  }
  console.log("✓ World State weather successfully patched to 'snowy'!");

  console.log("\n=== 测试用户案例 2: 复合意图 (动作 + admin) ===");
  const input2 = "我走到艾琳身旁对她说“看外面”，另外admin:改变天气为下雪天";
  const compiled2 = MockSimulator.simulate("input_compiler", {
    player: { input: input2 },
    scene: INITIAL_HARBOR_TAVERN_WORLD.scene,
  });
  console.log("Compound Blocks:", JSON.stringify(compiled2, null, 2));
  const hasNormal = compiled2.blocks.some((b: any) => b.kind === "normal");
  const hasAdmin = compiled2.blocks.some((b: any) => b.kind === "admin");
  if (!hasNormal || hasAdmin) {
    throw new Error("FAIL: embedded admin must remain ordinary player input!");
  }
  console.log("✓ Embedded admin remained ordinary input without administrator authority!");

  console.log("\n>>> ALL ADMIN INTENT TESTS PASSED! <<<");
}

testUserAdmin().catch((e) => {
  console.error("Test failed:", e);
  process.exit(1);
});
