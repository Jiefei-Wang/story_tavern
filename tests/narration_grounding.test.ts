import test from "node:test";
import assert from "node:assert/strict";
import { PipelineStageError, safePipelineError } from "../src/engine/errors/PipelineStageError";
import { renderNarratorSegments } from "../src/engine/narration/NarratorComposition";
import { NARRATION_AUDITOR, NARRATION_AUDIT_OUTPUT_INSTRUCTIONS, auditNarration } from "../src/engine/narration/NarrationAuditor";
import { withConversationContract } from "../src/engine/runtime/ConversationContracts";
import { withCharacterContract } from "../src/engine/character-schema/AgentContract";
import { BUILTIN_AGENTS, INITIAL_DEMO_SAVE } from "./fixtures/legacyInitialData";
import type { CommittedTurnEvent } from "../src/types";
import { SchemaValidator } from "../src/engine/schema/SchemaValidator";
import { NARRATION_FACT_PRIORITY_POLICY } from "../src/engine/narration/NarrationGroundingPolicy";

test("player-safe errors omit world trees and private values while debug errors retain the originals", () => {
  const details = { world: { entities: { erin: { attributes: { privateNote: "PRIVATE_WORLD_CANARY" } } } } };
  const error = new PipelineStageError("patch_application", `Invalid patch tree: ${JSON.stringify(details)}`, details, new Error("debug original"));
  assert.match(error.message, /PRIVATE_WORLD_CANARY/);
  assert.equal(error.details, details);
  assert.match(String(error.originalError), /debug original/);
  const visible = safePipelineError(error, "trace_safe_42");
  assert.match(visible, /状态提交未完成/);
  assert.match(visible, /trace_safe_42/);
  assert.equal(visible.includes("PRIVATE_WORLD_CANARY"), false);
  assert.equal(visible.includes("entities"), false);
  assert.equal(safePipelineError(new Error("Authorization: SECRET"), "PRIVATE <dump>").includes("SECRET"), false);
  assert.equal(safePipelineError({ name: "AbortError", message: "private" }), "生成已暂停。");
});

test("legacy renderer keeps failed and unadjudicated attempts distinct from successful actions", () => {
  const base = { id: "a1", blockId: "b1", type: "player_action", actor: "player", op: "nod", public: true } as CommittedTurnEvent;
  const output = { segments: [{ type: "event_ref", eventId: "a1" }] };
  assert.match(renderNarratorSegments(output, [base]), /尝试/);
  assert.equal(renderNarratorSegments(output, [base]).includes("点了点头"), false);
  assert.match(renderNarratorSegments(output, [{ ...base, outcome: { status: "failed", summary: "失败", reason: "条件不成立" } } as CommittedTurnEvent]), /未能完成/);
  assert.match(renderNarratorSegments(output, [{ ...base, outcome: { status: "success", summary: "完成", reason: "条件成立" } } as CommittedTurnEvent]), /点了点头/);
});

test("failed speech cannot authorize narrator dialogue while failed actions remain valid references for failure prose", () => {
  const failed = { id: "f1", blockId: "b1", type: "npc_speech", actor: "erin", sourceIntentId: "intent1", public: true, outcome: { status: "failed", summary: "未说出口", reason: "被打断" }, speechPlan: { summary: "答复" } } as CommittedTurnEvent;
  assert.throws(() => renderNarratorSegments({ segments: [{ type: "speech", sourceIntentId: "intent1", text: "回答了" }] }, [failed]), /Unknown or non-speech/);
  assert.equal(renderNarratorSegments({ segments: [{ type: "prose", sourceEventIds: ["f1"], text: "她未能说完。" }] }, [failed]), "她未能说完。");
});

test("saved NPC contracts gain causal event references, actual scene and personal history idempotently", () => {
  const npc = BUILTIN_AGENTS.find(agent => agent.id === "npc_reaction")!;
  const once = withConversationContract(npc), twice = withConversationContract(once);
  assert.deepEqual(twice, once);
  assert.match(JSON.stringify(twice.messages), /recentExperiences/);
  assert.match(JSON.stringify(twice.messages), /sourceEventIds/);
  assert.match(JSON.stringify(twice.messages), /json scene/);
  const complete = withCharacterContract(twice, INITIAL_DEMO_SAVE.worldDefinition.characterSchema);
  const updates = (complete.outputSchema as any).properties.stateUpdates;
  assert.equal(SchemaValidator.validate(updates, [{ path: "attributes.mood", op: "set", value: "calm", sourceEventIds: ["event_1"] }]).valid, true);
});

test("narrator protocol treats input as request and explicitly preserves adjudicated outcomes", () => {
  const narrator = withConversationContract(BUILTIN_AGENTS.find(agent => agent.id === "narrator")!);
  assert.deepEqual(withConversationContract(narrator), narrator);
  const prompt = JSON.stringify(narrator.messages);
  assert.match(prompt, /玩家原输入只是请求/);
  assert.match(prompt, /outcome.status=failed/);
  assert.match(prompt, /缺少结果的行动只能描述为尝试/);
  assert.match(prompt, /sourceEventIds/);
  assert.equal(prompt.includes("加入低后果的表情、动作"), false);
});

test("narration and auditor share entity-first grounding rules without embedding regression stories", () => {
  const narrator = withConversationContract(BUILTIN_AGENTS.find(agent => agent.id === "narrator")!);
  assert.equal(narrator.messages.find(message => message.id === "composition_fact_priority")?.content, NARRATION_FACT_PRIORITY_POLICY);
  assert.ok(NARRATION_AUDIT_OUTPUT_INSTRUCTIONS.includes(NARRATION_FACT_PRIORITY_POLICY));
  assert.match(NARRATION_FACT_PRIORITY_POLICY, /先检查实体，再检查行动/);
  assert.match(NARRATION_FACT_PRIORITY_POLICY, /旧归属也不能覆盖 location/);
  assert.match(NARRATION_FACT_PRIORITY_POLICY, /wait、speech、承诺和请求本身都不授权移动/);
  assert.match(NARRATION_FACT_PRIORITY_POLICY, /背后或无人观察处的行动/);
  assert.match(NARRATION_FACT_PRIORITY_POLICY, /summary\/reason 是裁决文字，不是创建物品或移动人物的机制/);
  assert.match(NARRATION_FACT_PRIORITY_POLICY, /区分本轮较早时刻与结束时刻/);
  assert.match(NARRATION_FACT_PRIORITY_POLICY, /纯比喻不意味着新物品真实存在/);
  const unseenExamples = [
    "维修员承诺修理信标，旁白却让他驾艇离港。",
    "结束状态中磁卡在档案柜内，旁白却称它仍别在领航员袖口。",
    "场景只有探测笔，失败裁决随口提到备用电池，旁白不能因此创造电池。",
    "值班员没有行动事件，旁白不能描写她趁人不注意改动航线。",
  ];
  const combinedPrompt = JSON.stringify(narrator.messages) + NARRATION_AUDIT_OUTPUT_INSTRUCTIONS;
  for (const example of unseenExamples) assert.equal(combinedPrompt.includes(example), false);
  for (const benchmarkDetail of ["沈苒", "岑岳", "诺拉", "口粮", "铜钱", "楼梯间"]) assert.equal(NARRATION_FACT_PRIORITY_POLICY.includes(benchmarkDetail), false);
});

test("shared temporal grounding defines seconds, concurrent timing and clock evidence without technical narration", () => {
  assert.match(NARRATION_FACT_PRIORITY_POLICY, /source.duration.*单位为秒，秒不能当分钟/);
  assert.match(NARRATION_FACT_PRIORITY_POLICY, /并行动作不能简单相加/);
  assert.match(NARRATION_FACT_PRIORITY_POLICY, /timeline 总耗时/);
  assert.match(NARRATION_FACT_PRIORITY_POLICY, /不从单个结束时钟猜开始时刻/);
  assert.match(NARRATION_FACT_PRIORITY_POLICY, /有时钟变化不证明进食、移动或属性变化发生/);
  assert.match(NARRATION_FACT_PRIORITY_POLICY, /不向玩家朗读.*实现术语/);
  assert.equal(NARRATION_FACT_PRIORITY_POLICY.includes("五分钟过去"), false);
  assert.match(NARRATION_FACT_PRIORITY_POLICY, /inclusive_block_window/);
  assert.match(NARRATION_FACT_PRIORITY_POLICY, /已经包含同blockId的NPC动作与对白/);
  assert.match(NARRATION_FACT_PRIORITY_POLICY, /再把同窗的回复放到窗口之后重复计时/);
  assert.match(NARRATION_FACT_PRIORITY_POLICY, /明确一秒等待、长时间等待和默认回应窗口同样成立/);
  const narrator = withConversationContract(BUILTIN_AGENTS.find(a => a.id === 'narrator')!);
  assert.match(JSON.stringify(narrator.messages), /inclusive_block_window/);
  assert.match(NARRATION_AUDIT_OUTPUT_INSTRUCTIONS, /inclusive_block_window/);
});

test("world resolver requires explicit state selection in upgraded live protocol while preserving existing required fields", () => {
  const resolver = withCharacterContract(BUILTIN_AGENTS.find(agent => agent.id === "world_resolver")!, INITIAL_DEMO_SAVE.worldDefinition.characterSchema);
  const schema = resolver.outputSchema!;
  assert.equal(SchemaValidator.validate(schema, { patches: [], publicEvents: [], acceptedStateUpdates: [{ npcId: "erin", updateIndex: 0 }] }).valid, true);
  assert.equal(SchemaValidator.validate(schema, { patches: [], publicEvents: [] }).valid, false);
  assert.equal(SchemaValidator.validate(schema, { publicEvents: [], acceptedStateUpdates: [] }).valid, false);
  assert.equal(SchemaValidator.validate(schema, { patches: [], publicEvents: [], acceptedStateUpdates: [{ npcId: "erin", updateIndex: -1 }] }).valid, false);
});

test("grounding auditor gets only explicit public context and rejects fabricated evidence references", async () => {
  const events = [{ id: "public_1", blockId: "b1", type: "player_action", public: true }, { id: "PRIVATE_EVENT", blockId: "b1", type: "environment", public: false }] as CommittedTurnEvent[];
  const context = { scene: INITIAL_DEMO_SAVE.worldState.scene, entities: {}, committedEvents: events, secretWorld: "PRIVATE_WORLD" };
  const execution = { agents: [], groups: [], backends: [], groupId: "test", instructions: "PRIVATE_INSTRUCTIONS" };
  const result = await auditNarration({ segments: [{ type: "prose", text: "他完成了动作。" }] }, context, execution, async options => {
    assert.equal(options.instructions, NARRATION_AUDIT_OUTPUT_INSTRUCTIONS);
    assert.equal(options.instructions.includes("PRIVATE_INSTRUCTIONS"), false);
    for (const field of ["grounded", "issues", "segmentIndex", "kind", "evidence", "correction", "sourceEventIds"]) assert.ok(options.instructions.includes(`"${field}"`));
    assert.match(options.instructions, /公开输入未提供的人物属性名称、数值或数值变化/);
    assert.deepEqual(Object.keys(options.context).sort(), ["committedEvents", "entities", "narration", "publicPatches", "scene"]);
    assert.equal(JSON.stringify(options.context).includes("PRIVATE"), false);
    return { success: true, spanId: "audit", data: { grounded: false, issues: [{ segmentIndex: 0, kind: "outcome_contradiction", evidence: "叙述完成但裁决失败", correction: "保留失败", sourceEventIds: ["made_up"] }] } };
  });
  assert.equal(result.success, false);
  assert.match(result.error || "", /unknown evidence/);
  assert.match(NARRATION_AUDITOR.messages[0].content, /不要要求固定台词或模板/);
});
