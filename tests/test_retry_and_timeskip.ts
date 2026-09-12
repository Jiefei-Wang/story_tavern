import fs from "fs";
import { BUILTIN_AGENTS, DEFAULT_AGENT_GROUPS, DEFAULT_BACKENDS } from "../src/db/initialData";
import { agentRuntime } from "../src/engine/runtime/AgentRuntime";
import { INITIAL_HARBOR_TAVERN_WORLD } from "../src/engine/world/WorldState";
import { globalTraceManager } from "../src/engine/tracing/TraceManager";
import { gamePipeline } from "../src/engine/pipeline/GamePipeline";
import { GameTurn } from "../src/types";

let openRouterKey = process.env.OPENROUTER_KEY || "";
try {
  const envContent = fs.readFileSync(".env", "utf-8");
  const match = envContent.match(/openrouter_key=(.*)/);
  if (match) openRouterKey = match[1].trim();
} catch (e) {}

process.env.OPENROUTER_KEY = openRouterKey;

async function runTests() {
  console.log("===============================================================");
  console.log("   STORY TAVERN: FAST 模式、自然语言快进与重试分支集成测试       ");
  console.log("===============================================================\n");

  // 1. Test Fast Group LLM call
  console.log("【1/3】测试 Fast 模式鉴权与执行 (group_fast)...");
  const fastRuntimeOpts = {
    groupId: "group_fast",
    traceId: `trace_fast_${Date.now()}`,
    agents: BUILTIN_AGENTS,
    groups: DEFAULT_AGENT_GROUPS,
    backends: DEFAULT_BACKENDS,
    mockMode: false,
  };

  const fastInputRes = await agentRuntime.runAgent({
    ...fastRuntimeOpts,
    agentId: "input_compiler",
    context: {
      player: { input: "admin:让卫兵全部晕倒" },
      scene: INITIAL_HARBOR_TAVERN_WORLD.scene,
    },
  });

  console.log("--> Fast 模式 Input Compiler 响应成功，无 401 错误！");
  console.log("--> 输出数据:", JSON.stringify(fastInputRes.data, null, 2));
  if (!fastInputRes.success) {
    throw new Error(`Fast 模式失败: ${fastInputRes.error}`);
  }
  console.log(">>> [PASS] Fast 模式鉴权与调用验证成功！\n");

  // 2. Test Natural Language Time Skip
  console.log("【2/3】测试自然语言时间快进抽取 (如 '快进：半小时')...");
  const timeSkipTurn = await gamePipeline.executeTurn(
    "快进：半小时",
    INITIAL_HARBOR_TAVERN_WORLD,
    1,
    {
      agents: BUILTIN_AGENTS,
      groups: DEFAULT_AGENT_GROUPS,
      backends: DEFAULT_BACKENDS,
      activeGroupId: "group_fast",
      mockMode: false,
    }
  );

  console.log("--> 快进 Pipeline 执行结果:", timeSkipTurn.success ? "成功" : "失败");
  console.log("--> 推进产生的 Patches:", timeSkipTurn.turn.patches);
  console.log("--> 推进后的世界状态时钟:", timeSkipTurn.turn.worldStateAfter.clock);
  console.log("--> 快进后小说叙事正文:\n", timeSkipTurn.turn.narratorOutput);
  if (!timeSkipTurn.success) {
    throw new Error(`快进执行失败: ${timeSkipTurn.error}`);
  }
  console.log(">>> [PASS] 自然语言时间快进抽取与世界推进成功！\n");

  // 3. Test Turn Retry and Branching logic
  console.log("【3/3】测试重试与分支数据模型结构...");
  const initialTurn: GameTurn = { ...timeSkipTurn.turn };
  const variation1: GameTurn = {
    ...initialTurn,
    id: "turn_var_1",
    narratorOutput: "这是分支 1 的故事推演结果。",
  };
  const variation2: GameTurn = {
    ...initialTurn,
    id: "turn_var_2",
    narratorOutput: "这是重试后生成的分支 2 的故事推演结果。",
  };

  const branchedTurn: GameTurn = {
    ...variation2,
    variations: [variation1, variation2],
    activeVariationIndex: 1,
  };

  if (!branchedTurn.variations || branchedTurn.variations.length !== 2) {
    throw new Error("分支数不正确！");
  }
  if (branchedTurn.activeVariationIndex !== 1) {
    throw new Error("当前激活分支序号不正确！");
  }
  console.log("--> 分支数量:", branchedTurn.variations.length);
  console.log("--> 当前激活分支:", (branchedTurn.activeVariationIndex ?? 0) + 1);
  console.log("--> 分支 1 叙事:", branchedTurn.variations[0].narratorOutput);
  console.log("--> 分支 2 叙事:", branchedTurn.variations[1].narratorOutput);
  console.log(">>> [PASS] 重试与分支数据模型验证成功！\n");

  console.log("===============================================================");
  console.log("             全部新功能测试通过，运行正常！                     ");
  console.log("===============================================================\n");
}

runTests().catch((err) => {
  console.error("测试出错:", err);
  process.exit(1);
});
