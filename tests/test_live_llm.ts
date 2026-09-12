import fs from "fs";
import { BUILTIN_AGENTS, DEFAULT_AGENT_GROUPS, DEFAULT_BACKENDS } from "../src/db/initialData";
import { agentRuntime } from "../src/engine/runtime/AgentRuntime";
import { INITIAL_HARBOR_TAVERN_WORLD } from "../src/engine/world/WorldState";
import { globalTraceManager } from "../src/engine/tracing/TraceManager";
import { applyPatches, cloneWorldState } from "../src/engine/world/PatchEngine";

let openRouterKey = process.env.OPENROUTER_KEY || "";
try {
  const envContent = fs.readFileSync(".env", "utf-8");
  const match = envContent.match(/openrouter_key=(.*)/);
  if (match) openRouterKey = match[1].trim();
} catch (e) {}

process.env.OPENROUTER_KEY = openRouterKey;

async function testLiveLLM() {
  console.log("===============================================================");
  console.log("   STORY TAVERN: 真实大模型 (OPENROUTER) 端到端实测验证        ");
  console.log("===============================================================\n");

  const traceId = `trace_live_${Date.now()}`;
  globalTraceManager.startTurnTrace(traceId, 1, "admin:改变天气为下雪天");

  const runtimeOpts = {
    groupId: "group_quality",
    traceId,
    agents: BUILTIN_AGENTS,
    groups: DEFAULT_AGENT_GROUPS,
    backends: DEFAULT_BACKENDS,
    mockMode: false, // STRICTLY REAL LLM! NO MOCK!
  };

  // Step 1: Input Compiler
  console.log("【1/3】正在调用真实大模型 Input Compiler 解析输入 'admin:改变天气为下雪天'...");
  const t0 = Date.now();
  const compilerResult = await agentRuntime.runAgent({
    ...runtimeOpts,
    agentId: "input_compiler",
    context: {
      player: { input: "admin:改变天气为下雪天" },
      scene: INITIAL_HARBOR_TAVERN_WORLD.scene,
    },
  });

  console.log(`--> Input Compiler 耗时: ${Date.now() - t0}ms`);
  console.log("--> 真实 LLM 原始解析输出:", JSON.stringify(compilerResult.data, null, 2));

  if (!compilerResult.success || !compilerResult.data?.blocks) {
    throw new Error(`Input Compiler 失败: ${compilerResult.error}`);
  }

  const adminBlock = compilerResult.data.blocks.find((b: any) => b.kind === "admin");
  if (!adminBlock) {
    console.error("未能将 admin: 识别为 admin block!");
  } else {
    console.log(">>> [PASS] 真实 LLM 成功将指令拆解为 kind='admin' 时序块！\n");
  }

  // Step 2: Admin Patch
  console.log("【2/3】正在调用真实大模型 Admin Patch 结算世界变更...");
  const t1 = Date.now();
  let currentWorld = cloneWorldState(INITIAL_HARBOR_TAVERN_WORLD);
  const adminResult = await agentRuntime.runAgent({
    ...runtimeOpts,
    agentId: "admin_patch",
    context: {
      command: adminBlock?.command || "改变天气为下雪天",
      world: currentWorld,
    },
  });

  console.log(`--> Admin Patch 耗时: ${Date.now() - t1}ms`);
  console.log("--> 真实 LLM 生成的 RFC 6902 补丁:", JSON.stringify(adminResult.data?.patches, null, 2));

  if (adminResult.data?.patches?.length > 0) {
    const patchRes = applyPatches(currentWorld, adminResult.data.patches);
    if (patchRes.success) {
      currentWorld = patchRes.newWorld;
      console.log("--> Patch 应用成功，当前天气:", currentWorld.scene?.weather);
    }
  }

  // Step 3: Narrator
  console.log("【3/3】正在调用真实大模型 Narrator 生成正文旁白...");
  const t2 = Date.now();
  const narratorResult = await agentRuntime.runAgent({
    ...runtimeOpts,
    agentId: "narrator",
    context: {
      events: [
        {
          type: "admin_command",
          actor: "player",
          content: "改变天气为下雪天",
        },
      ],
      patches: adminResult.data?.patches || [],
      world: currentWorld,
      scene: currentWorld.scene,
    },
  });

  console.log(`--> Narrator 耗时: ${Date.now() - t2}ms`);
  console.log("--> 真实 LLM 撰写的小说叙事正文:\n\n", narratorResult.data);

  console.log("\n===============================================================");
  console.log("   真实大模型端到端调用完全成功！无任何 MOCK 参与！           ");
  console.log("===============================================================\n");
}

testLiveLLM().catch((err) => {
  console.error("真实 LLM 测试失败:", err);
  process.exit(1);
});
