import test from "node:test";
import assert from "node:assert/strict";
import { BUILTIN_AGENTS } from "../src/db/initialData";
import { GamePipeline } from "../src/engine/pipeline/GamePipeline";
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

async function run(w: WorldState, overrides: Record<string, (context: any) => any> = {}, blocks: any[] = [{ id: "b1", kind: "normal", events: [speech] }], input = "你每月工资多少？") {
  const original = agentRuntime.runAgent;
  const contexts: Record<string, any[]> = {};
  agentRuntime.runAgent = (async (args: any) => {
    (contexts[args.agentId] ??= []).push(structuredClone(args.context));
    const defaults: Record<string, (c: any) => any> = {
      input_compiler: () => ({ blocks }),
      perception: c => ({ npcObservations: Object.fromEntries(["girl_01", "erin", "guard", "tavern_owner"].map(id => [id, c.events.map((e: any) => ({ eventId: e.id, saw: true, heard: true }))])) }),
      npc_reaction: () => ({ thought: "听到了。", stateUpdates: [{ path: "attributes.mood", op: "set", value: "amused" }], intents: [{ id: "llm_duplicate_id", type: "speech", target: "player", content: "三十文。" }] }),
    };
    const data = (overrides[args.agentId] || defaults[args.agentId])?.(args.context) ?? MockSimulator.simulate(args.agentId, args.context);
    return { success: true, data, spanId: "stub" };
  }) as typeof original;
  try { return { result: await new GamePipeline().executeTurn(input, w, 5, options), contexts }; }
  finally { agentRuntime.runAgent = original; }
}

test("listeners settle once in the following response window with full observations; only the addressed NPC may speak", async () => {
  const { result, contexts } = await run(world(), {}, [
    { id: "b1", kind: "normal", events: [speech] }, { id: "b2", kind: "wait", duration: 5 },
  ]);
  assert.equal(result.success, true, result.error);
  assert.equal(result.turn.narrationError, undefined);
  assert.equal(contexts.npc_reaction.length, 4);
  assert.equal(contexts.world_resolver.length, 1);
  for (const c of contexts.npc_reaction) assert(c.observations.some((o: any) => o.content === speech.content && o.heard));
  const ids = new Set<string>();
  for (const c of contexts.world_resolver) for (const { npcId, reaction } of c.npcReactions) {
    assert.equal(reaction.intents.length, npcId === "girl_01" ? 1 : 0);
    assert.equal(reaction.stateUpdates[0].value, "amused");
    for (const i of reaction.intents) { assert.ok(!ids.has(i.id)); ids.add(i.id); }
  }
  for (const id of ["girl_01", "erin", "guard", "tavern_owner"]) assert.equal(result.turn.worldStateAfter.entities[id].attributes?.mood, "amused");
  assert.equal(result.turn.worldStateAfter.conversation?.focusNpcId, "girl_01");
  const committed = contexts.narrator[0].committedEvents;
  assert.equal(new Set(committed.map((e: any) => e.id)).size, committed.length);
});

test("focus fills omitted compiler targets; explicit guard and group override; old and stale saves remain safe", async () => {
  const w = world(); w.conversation = { focusNpcId: "girl_01", lastSpeakerId: "girl_01" };
  assert.equal(resolveSpeechTargets([{ ...speech, target: "" }], w)[0].target, "girl_01");
  assert.equal(resolveSpeechTargets([{ ...speech, target: "guard" }], w)[0].target, "guard");
  assert.equal(resolveSpeechTargets([{ ...speech, target: "all" }], w)[0].target, "all");
  const { result, contexts } = await run(w, {}, [{ id: "b1", kind: "normal", events: [{ ...speech, target: "" }] }]);
  assert.equal(result.success, true);
  assert.equal(contexts.input_compiler[0].conversation.focusNpcId, "girl_01");
  assert.equal(contexts.perception[0].events[0].target, "girl_01");
  const compile = (input: string) => MockSimulator.simulate("input_compiler", { player: { input }, scene: w.scene, entities: w.entities, conversation: w.conversation });
  assert.equal(compile("你每月工资多少？").blocks[0].events[0].target, "girl_01");
  assert.equal(compile("我转头问卫兵：“你每月工资多少？”").blocks[0].events[0].target, "guard");
  w.entities.girl_01.location = "far_away";
  assert.equal(resolveSpeechTargets([{ ...speech, target: "" }], w)[0].target, "");
  const absentSpeech = resolveSpeechTargets([{ ...speech, target: "ghost" }], w)[0];
  assert.equal(absentSpeech.target, "ghost");
  assert.equal(absentSpeech.details?.targetUnavailable, true);
  delete w.conversation;
  assert.equal((await run(w, {}, [])).result.success, true);
});

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

test("implicit reply uses actual accepted speech duration consistently in clock, wait event and personal experience; explicit one second stays strict", async () => {
  const reply = { type: 'speech' as const, target: 'player', speechPlan: { summary: '我愿意回答你的问题，但需要把固定工钱与临时补贴分开说明。每月领取的部分是固定的，补贴要看实际值班情况，不能把两者当成每月必然拿到的同一个数字。', verbosity: 'normal' as const } };
  const replySeconds = getSafeIntentDuration(reply);
  assert.ok(replySeconds > 5 && replySeconds < 30);
  const overrides = { npc_reaction: (c: any) => ({ thought: null, stateUpdates: [], intents: c.npc.id === 'girl_01' ? [reply] : [] }) };
  const blocks = [{ id: 'ask', kind: 'normal', events: [speech] }, { id: 'reply', kind: 'wait', duration: 5 }];
  const initial = world();
  const { result, contexts } = await run(initial, overrides, blocks);
  assert.equal(result.success, true, result.error);
  const wait = result.turn.committedEvents!.find(event => event.type === 'wait')!;
  assert.equal((wait.source as any).duration, replySeconds);
  assert.equal((wait.source as any).timeSemantics, 'inclusive_block_window');
  assert.equal((wait.source as any).includesNpcEventsInBlock, true);
  assert.equal(result.turn.worldStateAfter.clock, advanceClock(initial.clock, eventsElapsedSeconds([speech]) + replySeconds));
  assert.equal(contexts.npc_reaction.find(c => c.npc.id === 'girl_01').reaction.available_time, 30);
  const waitExperience = result.turn.npcExperiences!.girl_01.find(e => e.observation.op === 'wait')!;
  assert.equal(waitExperience.observation.duration, replySeconds);
  assert.equal(result.turn.committedEvents!.filter(event => event.type === 'npc_speech').length, 1);
  const explicit = await run(world(), overrides, blocks, '我问你每月工资多少，然后只等一秒。');
  assert.equal(explicit.result.success, true, explicit.result.error);
  assert.equal((explicit.result.turn.committedEvents!.find(event => event.type === 'wait')!.source as any).duration, 1);
  assert.equal((explicit.result.turn.committedEvents!.find(event => event.type === 'wait')!.source as any).includesNpcEventsInBlock, true);
  assert.equal(explicit.result.turn.committedEvents!.filter(event => event.type === 'npc_speech').length, 0);
  assert.equal(explicit.contexts.npc_reaction.find(c => c.npc.id === 'girl_01').reaction.available_time, 1);
});

test("source-anchored listening request gives only its present target a response without fabricating player speech", async () => {
  const input = '我停下手上的动作，听girl_01讲解接下来的安排。';
  const listen = { id: 'listen', type: 'action', actor: 'player', op: 'listen_to', target: 'girl_01', duration: 1, content: '听girl_01讲解接下来的安排', responseRequest: { target: 'girl_01', sourceText: '听girl_01讲解接下来的安排' } };
  const { result, contexts } = await run(world(), {}, [{ id: 'b1', kind: 'normal', events: [listen] }, { id: 'b2', kind: 'wait' }], input);
  assert.equal(result.success, true, result.error);
  assert.equal(result.turn.narrationError, undefined);
  const direct = contexts.npc_reaction.find(c => c.npc.id === 'girl_01');
  assert.equal(direct.interaction.maySpeak, true);
  assert.ok(direct.observations.some((o: any) => o.type === 'action' && o.op === 'listen_to' && o.content === listen.responseRequest.sourceText));
  for (const context of contexts.npc_reaction.filter(c => c.npc.id !== 'girl_01')) {
    assert.equal(context.interaction.maySpeak, false);
    assert.ok(context.observations.every((o: any) => o.content !== listen.responseRequest.sourceText));
  }
  assert.equal(result.turn.committedEvents!.filter(e => e.type === 'player_speech').length, 0);
  assert.deepEqual(result.turn.committedEvents!.filter(e => e.type === 'npc_speech').map(e => e.actor), ['girl_01']);
  assert.ok(result.turn.committedEvents!.some(e => e.type === 'player_action' && e.op === 'listen_to'));
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

test("calling an absent person remains an ordinary call without creating or invoking that NPC", async () => {
  const w = world();
  w.entities.guard.location = "far_away";
  const { result, contexts } = await run(w, {}, [{ id: "call", kind: "normal", events: [{ ...speech, target: "ghost", content: "周先生，你在吗？" }] }], "我向不在这里的周先生喊话。");
  assert.equal(result.success, true, result.error);
  assert.equal(result.turn.worldStateAfter.entities.ghost, undefined);
  assert.ok((contexts.npc_reaction || []).every(context => !["ghost", "guard"].includes(context.npc.id)));
  assert.ok((contexts.npc_reaction || []).every(context => context.interaction.addressed === false));
  assert.ok(result.turn.committedEvents?.some(event => event.type === "player_speech" && event.target === "ghost"));
  assert.ok(!result.turn.committedEvents?.some(event => event.type === "npc_speech"));
});

test("forged resolver speech fails pipeline and rolls back previous time skip and conversation", async () => {
  const w = world(); w.conversation = { focusNpcId: "guard" };
  const { result } = await run(w, { world_resolver: () => ({ patches: [], publicEvents: [{ actor: "tavern_owner", type: "speech", content: "假的" }] }) }, [
    { id: "a", kind: "time_skip", to: "next_morning" }, { id: "b", kind: "normal", events: [speech] },
  ]);
  assert.equal(result.success, false);
  assert.match(result.error!, /world_resolver/);
  assert.deepEqual(result.turn.worldStateAfter, w);
  assert.deepEqual(result.turn.patches, []);
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

test("admin NPC creation receives a deterministic receipt without imaginary dialogue", async () => {
  const { result, contexts } = await run(world(), {
    admin_patch: c => ({ patches: [{ op: "add", path: "/entities/new_girl", value: { type: "character", name: "女孩", location: c.world.scene.location } }] }),
    narrator: () => ({ segments: [{ type: "narration", text: "她问：“要喝点什么吗？”" }] }),
  }, [], "admin:让我遇到个漂亮女孩");
  assert.equal(result.success, true);
  assert.ok(result.turn.worldStateAfter.entities.new_girl);
  assert.equal(result.turn.narrationError, undefined);
  assert.equal(result.turn.narratorOutput, "管理员修改已应用。");
  assert.doesNotMatch(result.turn.narratorOutput, /要喝点什么/);
  assert.deepEqual(result.turn.worldStateAfter.conversation, {});
  assert.equal(contexts.npc_reaction, undefined);
  assert.equal(contexts.narrator, undefined);
  assert.equal(contexts.narration_auditor, undefined);
});

test("conversation comes from committed events; NPC-to-NPC speech does not steal focus; skip resets", async () => {
  const w = world();
  updateConversation(w, [committed]);
  assert.deepEqual(w.conversation, { lastSpeakerId: "girl_01", focusNpcId: "girl_01" });
  updateConversation(w, [{ ...committed, actor: "guard", target: "erin" }]);
  assert.equal(w.conversation?.lastSpeakerId, "guard");
  assert.equal(w.conversation?.focusNpcId, "girl_01");
  const skip = await run(w, {}, [{ id: "skip", kind: "time_skip", to: "next_day" }]);
  assert.deepEqual(skip.result.turn.worldStateAfter.conversation, {});
  const local = await run(w, {}, [], "admin:下雪");
  assert.equal(local.result.success, true, local.result.error);
  assert.deepEqual(local.result.turn.worldStateAfter.conversation, w.conversation);
});

test("saved narrator definitions are upgraded without changing backend defaults; schema matches structured protocol", () => {
  const narrator = withConversationContract({ ...BUILTIN_AGENTS.find(a => a.id === "narrator")!, version: "old", outputSchema: null, messages: [{ id: "old", role: "system", content: "自由输出小说" }] });
  assert.ok(narrator.outputSchema);
  assert.deepEqual(withConversationContract(narrator), narrator);
  assert.equal(SchemaValidator.validate(narrator.outputSchema!, { segments: [{ type: "event_ref", eventId: "evt_1" }] }).valid, true);
  assert.equal(SchemaValidator.validate(narrator.outputSchema!, "旧自由文本").valid, false);
});

test("group speech grants explicit group permission while standalone wait grants no speech", async () => {
  const group = await run(world(), {}, [{ id: "group", kind: "normal", events: [{ ...speech, target: "all" }] }]);
  assert.equal(group.result.success, true, group.result.error);
  assert.ok(group.contexts.npc_reaction.every(c => c.interaction.addressed && c.interaction.maySpeak));
  const wait = await run(world(), {}, [{ id: "wait", kind: "wait", duration: 10 }]);
  assert.equal(wait.result.success, true, wait.result.error);
  assert.ok(wait.contexts.npc_reaction.every(c => !c.interaction.maySpeak));
  assert.ok(wait.contexts.world_resolver[0].npcReactions.every((r: any) => r.reaction.intents.length === 0));
});

test("duplicate public speech source cannot be committed twice", () => {
  const event = { actor: "girl_01", type: "speech" as const, content: "三十文。", sourceIntentId: "i1" };
  assert.throws(() => validatePublicEvents([event, event], world(), [{ npcId: "girl_01", reaction: { thought: null, intents: [{ id: "i1", type: "speech", content: "三十文。" }] } }]), PipelineStageError);
});

test("unknown narration references fail narration stage without undoing committed speech", async () => {
  const { result } = await run(world(), { narrator: () => ({ segments: [{ type: "event_ref", eventId: "not_committed" }] }) });
  assert.equal(result.success, true);
  assert.match(result.turn.narrationError!, /Unknown/);
  assert.equal(result.turn.worldStateAfter.conversation?.focusNpcId, "girl_01");
});

test("scene change resets focus and a subsequent turn resumes the committed speaker", async () => {
  const first = await run(world());
  const second = await run(first.result.turn.worldStateAfter, {}, [{ id: "next", kind: "normal", events: [{ ...speech, target: "" }] }]);
  assert.equal(second.contexts.perception[0].events[0].target, "girl_01");
  const changed = await run(second.result.turn.worldStateAfter, {
    admin_patch: () => ({ patches: [{ op: "replace", path: "/scene/location", value: "new_scene" }] }),
  }, [{ id: "move", kind: "admin", command: "切换场景" }], "admin:切换场景");
  assert.deepEqual(changed.result.turn.worldStateAfter.conversation, {});
});
