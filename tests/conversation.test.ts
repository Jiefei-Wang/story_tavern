import test from "node:test";
import assert from "node:assert/strict";
import { BUILTIN_AGENTS } from "../src/db/initialData";
import { GamePipeline } from "../src/engine/pipeline/GamePipeline";
import { agentRuntime } from "../src/engine/runtime/AgentRuntime";
import { MockSimulator } from "../src/engine/runtime/MockSimulator";
import { withConversationContract } from "../src/engine/runtime/ConversationContracts";
import { resolveSpeechTargets, updateConversation } from "../src/engine/world/ConversationRouter";
import { validatePublicEvents } from "../src/engine/world/WorldViews";
import { renderNarratorSegments } from "../src/engine/narration/NarratorComposition";
import { PipelineStageError } from "../src/engine/errors/PipelineStageError";
import { INITIAL_HARBOR_TAVERN_WORLD } from "../src/engine/world/WorldState";
import { CommittedTurnEvent, NPCReactionResult, WorldState } from "../src/types";
import { SchemaValidator } from "../src/engine/schema/SchemaValidator";

function world(): WorldState {
  const w = structuredClone(INITIAL_HARBOR_TAVERN_WORLD);
  for (const id of ["girl_01", "erin", "guard", "tavern_owner"]) w.entities[id] = {
    type: "character", name: id === "guard" ? "卫兵" : id, location: w.scene.location, mentalState: { mood: "calm" },
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
      npc_reaction: () => ({ thought: "听到了。", mentalUpdates: [{ aspect: "mood", newValue: "amused" }], intents: [{ id: "llm_duplicate_id", type: "speech", target: "player", content: "三十文。" }] }),
    };
    const data = (overrides[args.agentId] || defaults[args.agentId])?.(args.context) ?? MockSimulator.simulate(args.agentId, args.context);
    return { success: true, data, spanId: "stub" };
  }) as typeof original;
  try { return { result: await new GamePipeline().executeTurn(input, w, 5, options), contexts }; }
  finally { agentRuntime.runAgent = original; }
}

test("all listeners react, only addressed NPC speech survives, mental updates survive in normal and inherited wait", async () => {
  const { result, contexts } = await run(world(), {}, [
    { id: "b1", kind: "normal", events: [speech] }, { id: "b2", kind: "wait", duration: 5 },
  ]);
  assert.equal(result.success, true, result.error);
  assert.equal(result.turn.narrationError, undefined);
  assert.equal(contexts.npc_reaction.length, 8);
  const ids = new Set<string>();
  for (const c of contexts.world_resolver) for (const { npcId, reaction } of c.npcReactions) {
    assert.equal(reaction.intents.length, npcId === "girl_01" ? 1 : 0);
    assert.equal(reaction.mentalUpdates[0].newValue, "amused");
    for (const i of reaction.intents) { assert.ok(!ids.has(i.id)); ids.add(i.id); }
  }
  for (const id of ["girl_01", "erin", "guard", "tavern_owner"]) assert.equal(result.turn.worldStateAfter.entities[id].mentalState?.mood, "amused");
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
  assert.throws(() => resolveSpeechTargets([{ ...speech, target: "ghost" }], w), PipelineStageError);
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

test("forged resolver speech fails pipeline and rolls back previous admin and conversation", async () => {
  const w = world(); w.conversation = { focusNpcId: "guard" };
  const { result } = await run(w, { world_resolver: () => ({ patches: [], publicEvents: [{ actor: "tavern_owner", type: "speech", content: "假的" }] }) }, [
    { id: "a", kind: "admin", command: "下雪" }, { id: "b", kind: "normal", events: [speech] },
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

test("admin NPC creation cannot establish imaginary dialogue; narration failure preserves committed world", async () => {
  const { result, contexts } = await run(world(), {
    admin_patch: c => ({ patches: [{ op: "add", path: "/entities/new_girl", value: { type: "character", name: "女孩", location: c.world.scene.location } }] }),
    narrator: () => ({ segments: [{ type: "narration", text: "她问：“要喝点什么吗？”" }] }),
  }, [], "admin:让我遇到个漂亮女孩");
  assert.equal(result.success, true);
  assert.ok(result.turn.worldStateAfter.entities.new_girl);
  assert.ok(result.turn.narrationError);
  assert.doesNotMatch(result.turn.narratorOutput, /要喝点什么/);
  assert.deepEqual(result.turn.worldStateAfter.conversation, {});
  assert.equal(contexts.npc_reaction, undefined);
  assert.ok(contexts.narrator[0].committedEvents.every((e: any) => e.type !== "npc_speech"));
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
  const local = await run(w, {}, [{ id: "admin", kind: "admin", command: "下雪" }]);
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
  }, [{ id: "move", kind: "admin", command: "切换场景" }]);
  assert.deepEqual(changed.result.turn.worldStateAfter.conversation, {});
});
