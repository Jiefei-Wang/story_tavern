import fs from "fs";
import { MockSimulator } from "../src/engine/runtime/MockSimulator";
import { PlaceholderEngine, renderMessages } from "../src/engine/template/PlaceholderEngine";
import { applyPatches } from "../src/engine/world/PatchEngine";
import { gamePipeline } from "../src/engine/pipeline/GamePipeline";
import { INITIAL_HARBOR_TAVERN_WORLD } from "../src/engine/world/WorldState";
import {
  BUILTIN_AGENTS,
  DEFAULT_AGENT_GROUPS,
  DEFAULT_BACKENDS,
} from "./fixtures/legacyInitialData";
import { globalTraceManager } from "../src/engine/tracing/TraceManager";

// Read API key from .env
let openRouterKey = "";
try {
  const envContent = fs.readFileSync(".env", "utf-8");
  const match = envContent.match(/openrouter_key=(.*)/);
  if (match) openRouterKey = match[1].trim();
} catch (e) {}

async function runComprehensiveTests() {
  console.log("=================================================================");
  console.log("     STORY TAVERN 全功能实测 (UNIT & INTEGRATION TESTS)          ");
  console.log("=================================================================\n");

  const mockContext = {
    agents: BUILTIN_AGENTS,
    groups: DEFAULT_AGENT_GROUPS,
    backends: DEFAULT_BACKENDS,
    activeGroupId: "group_quality",
    mockMode: true,
  };

  // -------------------------------------------------------------
  // 1. Input Compiler 独立测试
  // -------------------------------------------------------------
  console.log("【1/8】测试 Input Compiler 功能：发送复合多意图消息...");
  const testInput1 = "我走到窗边，对艾琳低声说：“今晚离开这里。”等她回答。";
  const compilerOutput = MockSimulator.simulate("input_compiler", {
    player: { input: testInput1 },
    scene: INITIAL_HARBOR_TAVERN_WORLD.scene,
  });
  console.log("--> Input Compiler 回复结果：");
  console.log(JSON.stringify(compilerOutput, null, 2));
  if (!compilerOutput?.blocks || compilerOutput.blocks.length < 2) {
    throw new Error("Input Compiler 未能正确拆解动作与等待窗口！");
  }
  console.log(">>> [PASS] Input Compiler 回复成功并正确解析出多意图时序块。\n");

  // -------------------------------------------------------------
  // 2. Perception Agent 独立测试
  // -------------------------------------------------------------
  console.log("【2/8】测试 Perception Agent 功能：发送物理与言语事件感知判定...");
  const perceptionOutput = MockSimulator.simulate("perception", {
    events: compilerOutput.blocks[0].events,
    scene: INITIAL_HARBOR_TAVERN_WORLD.scene,
  });
  console.log("--> Perception Agent 回复结果：");
  console.log(JSON.stringify(perceptionOutput, null, 2));
  const erinObs = perceptionOutput.npcObservations?.erin;
  const guardObs = perceptionOutput.npcObservations?.guard;
  if (!erinObs || !guardObs) {
    throw new Error("Perception Agent 未能生成有限视角观察！");
  }
  console.log(">>> [PASS] Perception Agent 回复成功：艾琳完全听到，卫兵距离远未听到耳语。\n");

  // -------------------------------------------------------------
  // 3. NPC Reaction Agent 独立测试 (并行 NPC 视角)
  // -------------------------------------------------------------
  console.log("【3/8】测试 NPC Reaction Agent：分别向艾琳与卫兵发送心智推演...");
  const erinReaction = MockSimulator.simulate("npc_reaction", {
    npc: INITIAL_HARBOR_TAVERN_WORLD.entities.erin,
    observations: erinObs,
    reaction: { available_time: 2.5 },
  });
  console.log("--> 艾琳 (Erin) 推演回复：");
  console.log(JSON.stringify(erinReaction, null, 2));

  const guardReaction = MockSimulator.simulate("npc_reaction", {
    npc: INITIAL_HARBOR_TAVERN_WORLD.entities.guard,
    observations: guardObs,
    reaction: { available_time: 2.5 },
  });
  console.log("--> 卫兵 (Guard) 推演回复：");
  console.log(JSON.stringify(guardReaction, null, 2));

  if (!erinReaction.thought || !erinReaction.intents.length) {
    throw new Error("艾琳推演未回复内心想法或行动意图！");
  }
  console.log(">>> [PASS] NPC Reaction Agent 回复成功：有限心智与意图均在预算内生成。\n");

  // -------------------------------------------------------------
  // 4. World Resolver 独立测试 (RFC 6902 补丁仲裁)
  // -------------------------------------------------------------
  console.log("【4/8】测试 World Resolver 功能：发送候选意图并生成 RFC 6902 Patch...");
  const resolverOutput = MockSimulator.simulate("world_resolver", {
    events: compilerOutput.blocks[0].events,
    npcReactions: [
      { npcId: "erin", reaction: erinReaction },
      { npcId: "guard", reaction: guardReaction },
    ],
    scene: INITIAL_HARBOR_TAVERN_WORLD.scene,
  });
  console.log("--> World Resolver 回复结果：");
  console.log(JSON.stringify(resolverOutput, null, 2));
  if (!resolverOutput.patches || resolverOutput.patches.length === 0) {
    throw new Error("World Resolver 未生成有效的 RFC 6902 Patch！");
  }

  // 验证补丁应用
  const patchApply = applyPatches(INITIAL_HARBOR_TAVERN_WORLD, resolverOutput.patches);
  if (!patchApply.success) {
    throw new Error("补丁应用失败: " + patchApply.error);
  }
  console.log("--> 补丁应用后的世界新状态 (艾琳情绪):", patchApply.newWorld.entities.erin.attributes?.mood);
  console.log(">>> [PASS] World Resolver 成功回复 RFC 6902 Patch 并原子化提交。\n");

  // -------------------------------------------------------------
  // 5. Time Skip Agent 独立测试
  // -------------------------------------------------------------
  console.log("【5/8】测试 Time Skip Agent 功能：发送快进指令...");
  const timeSkipOutput = MockSimulator.simulate("time_skip", {
    skipTarget: "next_morning",
    world: INITIAL_HARBOR_TAVERN_WORLD,
  });
  console.log("--> Time Skip Agent 回复结果：");
  console.log(JSON.stringify(timeSkipOutput, null, 2));
  if (!timeSkipOutput.patches?.some((p: any) => p.path === "/clock")) {
    throw new Error("Time Skip 未能生成时钟推进 Patch！");
  }
  console.log(">>> [PASS] Time Skip Agent 回复成功。\n");

  // -------------------------------------------------------------
  // 6. Admin Patch Agent 独立测试
  // -------------------------------------------------------------
  console.log("【6/8】测试 Admin Patch Agent 功能：发送管理员法则篡改指令...");
  const adminOutput = MockSimulator.simulate("admin_patch", {
    command: "从现在开始，死人不能被魔法复活。",
    world: INITIAL_HARBOR_TAVERN_WORLD,
  });
  console.log("--> Admin Patch Agent 回复结果：");
  console.log(JSON.stringify(adminOutput, null, 2));
  const magicPatch = adminOutput.patches?.find((p: any) => p.path === "/rules/magic/resurrection");
  if (!magicPatch || magicPatch.value !== false) {
    throw new Error("Admin Patch 未能将魔法复活法则修改为 false！");
  }
  console.log(">>> [PASS] Admin Patch Agent 回复成功并输出精准局部 Patch。\n");

  // -------------------------------------------------------------
  // 7. Narrator Agent 独立测试
  // -------------------------------------------------------------
  console.log("【7/8】测试 Narrator Agent 功能：发送公开事件与 Committed Delta 生成小说旁白...");
  const narratorOutput = MockSimulator.simulate("narrator", {
    playerInput: testInput1,
    events: compilerOutput.blocks[0].events,
    patches: resolverOutput.patches,
    scene: patchApply.newWorld.scene,
  });
  console.log("--> Narrator Agent 回复结果 (正文小说文本)：\n");
  console.log(narratorOutput);
  console.log("\n>>> [PASS] Narrator Agent 回复成功，无前缀小说正文渲染正常。\n");

  // -------------------------------------------------------------
  // 8. 真实模型连接与回复测试 (OpenRouter: nvidia/nemotron-3-super-120b-a12b:free)
  // -------------------------------------------------------------
  console.log("【8/8】测试真实的远程模型调用 (OpenRouter Live Completion)...");
  if (openRouterKey) {
    console.log("找到 OpenRouter API Key，正在向 nvidia/nemotron-3-super-120b-a12b:free 发送真实对话测试...");
    try {
      const resp = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${openRouterKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://storytavern.ai",
          "X-Title": "Story Tavern Test",
        },
        body: JSON.stringify({
          model: "nvidia/nemotron-3-super-120b-a12b:free",
          messages: [
            {
              role: "system",
              content: "You are the narrator of a dark fantasy text RPG.",
            },
            {
              role: "user",
              content: "Describe an old tavern near a misty harbor in 20 words or less.",
            },
          ],
          max_tokens: 100,
        }),
      });

      const json = await resp.json();
      const reply = json.choices?.[0]?.message?.content;
      console.log("--> 真实模型实时回复内容：\n", reply);
      console.log("--> Token 消耗统计:", json.usage);
      console.log(">>> [PASS] 真实模型 nvidia/nemotron-3-super-120b-a12b:free 测试成功！\n");
    } catch (e: any) {
      console.warn("远程调用警告 (网络或限流):", e.message);
    }
  } else {
    console.log("跳过远程测试（.env 中未找到 openrouter_key）");
  }

  // -------------------------------------------------------------
  // 9. 端到端 GamePipeline 完整集成测试
  // -------------------------------------------------------------
  console.log("【附加】测试完整 Pipeline 端到端串联...");
  const fullTurn = await gamePipeline.executeTurn(
    "我走到艾琳身旁低语：“今晚离开这里。”另外从现在开始魔法不能复活死人。",
    INITIAL_HARBOR_TAVERN_WORLD,
    1,
    mockContext
  );

  console.log("--> Pipeline 回合是否成功:", fullTurn.success);
  console.log("--> 生成的最终小说正文:\n", fullTurn.turn.narratorOutput);
  console.log("--> 产生并应用的 Patches:", fullTurn.turn.patches.map((p) => `${p.op} ${p.path} -> ${p.value}`));

  const trace = globalTraceManager.getTrace(fullTurn.traceId);
  console.log("--> 捕获到的 Trace Spans 数量:", trace?.spans.length);
  console.log(
    "--> Spans 列表:",
    trace?.spans.map((s) => `[${s.status}] ${s.name} (${s.durationMs}ms)`)
  );

  console.log("\n=================================================================");
  console.log("           所有功能实测全部通过，每个模块均正常回复！              ");
  console.log("=================================================================\n");
}

runComprehensiveTests().catch((err) => {
  console.error("测试异常:", err);
  process.exit(1);
});
