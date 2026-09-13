import test from "node:test";
import assert from "node:assert/strict";
import { BUILTIN_AGENTS } from "./fixtures/legacyInitialData";
import { agentRuntime } from "../src/engine/runtime/AgentRuntime";
import { MockSimulator } from "../src/engine/runtime/MockSimulator";
import { withConversationContract } from "../src/engine/runtime/ConversationContracts";
import { interactionFor, resolveSpeechTargets, updateConversation } from "../src/engine/world/ConversationRouter";
import { validatePublicEvents } from "../src/engine/world/WorldViews";
import { renderNarratorSegments } from "../src/engine/narration/NarratorComposition";
import { PipelineStageError } from "../src/engine/errors/PipelineStageError";
import { INITIAL_HARBOR_TAVERN_WORLD } from "../src/engine/world/WorldState";
import { CommittedTurnEvent, NPCReactionResult, WorldState } from "../src/types";
import { SchemaValidator } from "../src/engine/schema/SchemaValidator";
import { getSafeIntentDuration } from "../src/engine/world/TimingEngine";
import { advanceClock, eventsElapsedSeconds } from "../src/engine/scheduling/TurnTiming";
import { validateActionResolutions } from "../src/engine/world/ActionResolution";

test("compiler item/destination protocol rejects unknown object alias before action execution", () => {
  const saved = structuredClone(BUILTIN_AGENTS.find(a => a.id === "input_compiler")!);
  const original = structuredClone(saved);
  const upgraded = withConversationContract(saved);
  const event = { id: "e1", type: "action", actor: "player", op: "put_on", target: "table", item: "cup", duration: 1 };
  const wrap = (value: unknown) => ({ blocks: [{ id: "b1", kind: "normal", events: [value] }] });
  assert.equal(SchemaValidator.validate(upgraded.outputSchema!, wrap(event)).valid, true);
  const { item, ...rest } = event;
  assert.equal(SchemaValidator.validate(upgraded.outputSchema!, wrap({ ...rest, object: item })).valid, false);
  assert.equal(SchemaValidator.validate(upgraded.outputSchema!, wrap({ ...event, outcome: { status: "success" } })).valid, false);
  const before = world();
  before.entities.cup = { type: "item", location: "player" };
  before.entities.table = { type: "object", location: before.scene.location };
  const settled = validateActionResolutions([event as any], before, { resolutions: [{ eventId: "e1", status: "success", summary: "放置杯子", reason: "已存在且可达", effects: [{ kind: "item_transfer", entityId: "cup", from: "player", to: "table" }] }], speechConstraints: [] });
  assert.equal(settled.world.entities.cup.location, "table");
  assert.equal(before.entities.cup.location, "player");
  assert.deepEqual(saved, original);
});

function world(): WorldState {
  const w = structuredClone(INITIAL_HARBOR_TAVERN_WORLD);
  for (const id of ["girl_01", "erin", "guard", "tavern_owner"]) w.entities[id] = {
    type: "character", name: id === "guard" ? "卫兵" : id, location: w.scene.location, attributes: { mood: "calm" },
  };
  return w;
}
const speech = { id: "e1", type: "speech" as const, actor: "player", target: "girl_01", content: "你每月工资多少？" };
const options = { agents: BUILTIN_AGENTS, groups: [], backends: [], activeGroupId: "test", mockMode: true };

test("resolver rejects missing, forged, wrong-type, wrong-owner, rewritten and retargeted speech sources", () => {
  const reactions: { npcId: string; reaction: NPCReactionResult }[] = [{ npcId: "girl_01", reaction: { thought: null, intents: [{ id: "girl_i1", type: "speech", content: "三十文。", target: "player" }] } }];
  const good = { actor: "girl_01", type: "speech" as const, content: "三十文。", target: "player", sourceIntentId: "girl_i1" };
  assert.doesNotThrow(() => validatePublicEvents([good], world(), reactions));
  for (const patch of [{ sourceIntentId: undefined }, { sourceIntentId: "fake" }, { actor: "tavern_owner" }, { content: "我一个月赚三十文铜钱。" }, { target: "guard" }]) {
    assert.throws(() => validatePublicEvents([{ ...good, ...patch }], world(), reactions), PipelineStageError);
  }
  reactions[0].reaction.intents[0].type = "action";
  assert.throws(() => validatePublicEvents([good], world(), reactions), PipelineStageError);
});

test("listening permission requires current source, matching present target and success; quoted, hypothetical, negative and passive listening do not grant it", () => {
  const w = world(); w.entities.guard.location = 'far_away';
  const sourceText = '听girl_01讲解安排';
  const action = { id: 'listen', type: 'action' as const, op: 'listen_to', target: 'girl_01', responseRequest: { target: 'girl_01', sourceText } };
  for (const input of ['我说：“听girl_01讲解安排。”', '如果听girl_01讲解安排，会怎样？', '不要听girl_01讲解安排。', '我以前听girl_01讲解安排。', '我偷听girl_01讲解安排。', '我在旁听girl_01讲解安排。', '我观察桌子。']) assert.throws(() => resolveSpeechTargets([action], w, input), /Response request/);
  for (const target of ['guard', 'missing', 'all', 'group']) assert.throws(() => resolveSpeechTargets([{ ...action, target, responseRequest: { target, sourceText: `听${target}讲解安排` } }], w, `听${target}讲解安排`), /Response request/);
  assert.throws(() => resolveSpeechTargets([{ ...action, responseRequest: { target: 'girl_01', sourceText: '听girl_01给erin讲故事' } }], w, '听girl_01给erin讲故事'), /Response request/);
  assert.throws(() => resolveSpeechTargets([{ ...action, target: 'erin' }], w, sourceText), /Response request/);
  const resolved = resolveSpeechTargets([action], w, sourceText);
  assert.equal(interactionFor('girl_01', resolved).maySpeak, false, 'an unresolved attempt is not an accepted listening request');
  assert.equal(interactionFor('girl_01', resolved.map(e => ({ ...e, outcome: { status: 'failed', summary: '未能听取', reason: '不可感知' } }))).maySpeak, false);
  const forged = resolveSpeechTargets([{ id: 'fake', type: 'action', op: 'listen_to', target: 'girl_01', details: { responseRequested: true }, outcome: { status: 'success', summary: '', reason: '' } }], w, '我观察桌子。');
  assert.equal(interactionFor('girl_01', forged).maySpeak, false);
});

test("saved compiler definitions receive the sourced request protocol without losing custom settings", () => {
  const saved = { ...structuredClone(BUILTIN_AGENTS.find(a => a.id === 'input_compiler')!), version: 'custom+conversation-v1', defaults: { temperature: 0.37 } };
  delete (saved.outputSchema as any).properties.blocks.items.properties.events.items.properties.responseRequest;
  const upgraded = withConversationContract(saved);
  const schema = (upgraded.outputSchema as any).properties.blocks.items.properties.events.items.properties.responseRequest;
  assert.equal(SchemaValidator.validate(schema, { target: 'erin', sourceText: '听艾琳解释安排' }).valid, true);
  assert.equal(SchemaValidator.validate(schema, { target: 'erin' }).valid, false);
  assert.deepEqual(upgraded.defaults, saved.defaults);
  assert.ok(upgraded.messages.some(m => m.content.includes('不能因没有引号对白而丢掉')));
  assert.equal(withConversationContract(upgraded).messages.filter(m => m.id === 'conversation_policy').length, 1);
  assert.equal((saved.outputSchema as any).properties.blocks.items.properties.events.items.properties.responseRequest, undefined);
});

const committed: CommittedTurnEvent = { id: "evt_1", blockId: "b1", type: "npc_speech", actor: "girl_01", target: "player", public: true, content: "我一个月大概有三十文。" };
test("narrator rejects quoted and unquoted invented dialogue; event refs render original speech exactly", () => {
  for (const text of ['老板说道：“我每个月赚三十文。”', '老板说："三十文"', "「三十文」", "『三十文』", "老板回答他每月赚三十文。", "Owner says: thirty coins."]) {
    assert.throws(() => renderNarratorSegments({ segments: [{ type: "narration", text }] }, [committed]), PipelineStageError);
  }
  const output = renderNarratorSegments({ segments: [{ type: "narration", text: "随后。" }, { type: "event_ref", eventId: "evt_1" }] }, [committed]);
  assert.equal(output, `随后。\n\ngirl_01：“${committed.content}”`);
  for (const id of ["thought", "rejected_intent", "missing"]) assert.throws(() => renderNarratorSegments({ segments: [{ type: "event_ref", eventId: id }] }, [committed]), PipelineStageError);
  assert.throws(() => renderNarratorSegments({ segments: [{ type: "event_ref", eventId: "evt_1" }] }, [{ ...committed, public: false }]), PipelineStageError);
});

test("saved narrator definitions are upgraded without changing backend defaults; schema matches structured protocol", () => {
  const narrator = withConversationContract({ ...BUILTIN_AGENTS.find(a => a.id === "narrator")!, version: "old", outputSchema: null, messages: [{ id: "old", role: "system", content: "自由输出小说" }] });
  assert.ok(narrator.outputSchema);
  assert.deepEqual(withConversationContract(narrator), narrator);
  assert.equal(SchemaValidator.validate(narrator.outputSchema!, { segments: [{ type: "event_ref", eventId: "evt_1" }] }).valid, true);
  assert.equal(SchemaValidator.validate(narrator.outputSchema!, "旧自由文本").valid, false);
});

test("duplicate public speech source cannot be committed twice", () => {
  const event = { actor: "girl_01", type: "speech" as const, content: "三十文。", sourceIntentId: "i1" };
  assert.throws(() => validatePublicEvents([event, event], world(), [{ npcId: "girl_01", reaction: { thought: null, intents: [{ id: "i1", type: "speech", content: "三十文。" }] } }]), PipelineStageError);
});
