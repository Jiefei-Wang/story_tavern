import test from "node:test";
import assert from "node:assert/strict";
import { compressionContractError, filterNpcIntentBudget, fitNpcSpeechBudget } from "../src/engine/scheduling/NpcSpeechBudget";
import { getSafeIntentDuration } from "../src/engine/world/TimingEngine";
import { globalTraceManager } from "../src/engine/tracing/TraceManager";
import { agentRuntime } from "../src/engine/runtime/AgentRuntime";
import { GamePipeline } from "../src/engine/pipeline/GamePipeline";
import { MockSimulator } from "../src/engine/runtime/MockSimulator";
import { BUILTIN_AGENTS } from "../src/db/initialData";
import { INITIAL_HARBOR_TAVERN_WORLD } from "../src/engine/world/WorldState";
import type { NPCIntent, NPCReactionResult } from "../src/types";

const normalize = (intent: NPCIntent) => intent;
const speech = (short = false): NPCIntent => ({ id: "model_id", type: "speech", target: "player", duration: 0.01, speechPlan: { summary: short ? "愿意等候" : "我愿意等候但需要详细解释全部想法".repeat(20), verbosity: "brief", stance: "同意等候", beats: [{ meaning: "愿意等候", required: true }], boundaries: ["不作额外承诺"] } });
const original = (): NPCReactionResult => ({ thought: "先回答问题", stateUpdates: [{ path: "attributes.mood", op: "set", value: "calm" }], intents: [speech()] });

test("necessary speech receives one actual shortening request, unchanged estimator and original state proposal only", async () => {
  let calls = 0;
  const first = original();
  const result = await fitNpcSpeechBudget({ original: first, seconds: 5, maySpeak: true, idPrefix: "npc", normalize, retry: async instructions => {
    calls++;
    assert.match(instructions, /不延长窗口/);
    assert.match(instructions, /所有required beats/);
    return { success: true, spanId: "retry", data: { thought: "重复思考", stateUpdates: [{ path: "attributes.mood", op: "set", value: "angry" }], intents: [speech(true)] } };
  } });
  assert.equal(calls, 1);
  assert.equal(result.retried, true);
  assert.equal(result.reaction.intents.length, 1);
  assert.equal(result.reaction.intents[0].duration, getSafeIntentDuration(speech(true)));
  assert.ok(result.reaction.intents[0].duration! >= 1.5);
  assert.ok(getSafeIntentDuration(speech()) > 5);
  assert.deepEqual(result.reaction.stateUpdates, first.stateUpdates);
  assert.equal(result.reaction.thought, first.thought);
  assert.equal(result.firstAttempt.rejectedIntents[0].reason, "time_budget");
  assert.equal(first.intents[0].duration, 0.01);
});

test("no retry when speech is forbidden, budget below minimum, already fits, or no speech was proposed", async () => {
  for (const args of [
    { original: original(), seconds: 5, maySpeak: false },
    { original: original(), seconds: 1.49, maySpeak: true },
    { original: { ...original(), intents: [speech(true)] }, seconds: 5, maySpeak: true },
    { original: { ...original(), intents: [] }, seconds: 5, maySpeak: true },
  ]) {
    const result = await fitNpcSpeechBudget({ ...args, idPrefix: "npc", normalize, retry: async () => { throw new Error("must not regenerate"); } });
    assert.equal(result.retried, false);
  }
});

test("overlong retry remains rejected after exactly one request and all time/permission filters are visible", async () => {
  let calls = 0;
  const result = await fitNpcSpeechBudget({ original: original(), seconds: 5, maySpeak: true, idPrefix: "npc", normalize, retry: async () => { calls++; return { success: true, spanId: "retry", data: original() }; } });
  assert.equal(calls, 1);
  assert.equal(result.reaction.intents.length, 0);
  assert.match(result.retryReason || "", /仍无speech/);
  assert.equal(result.filteredIntents.length, 2);
  assert.equal(result.filteredIntents.every(item => item.estimatedDuration > item.remainingSeconds), true);
  const forbidden = filterNpcIntentBudget([speech(true)], 5, false, "npc", normalize);
  assert.equal(forbidden.rejectedIntents[0].reason, "speech_not_permitted");
});

test("compression cannot discard mandatory meaning, change boundaries/target/stance or add actions", () => {
  const first = speech();
  for (const change of [
    (intent: NPCIntent) => { intent.target = "someone_else"; },
    (intent: NPCIntent) => { intent.speechPlan!.beats = []; },
    (intent: NPCIntent) => { intent.speechPlan!.boundaries = []; },
    (intent: NPCIntent) => { intent.speechPlan!.stance = "拒绝等候"; },
  ]) {
    const next = speech(true); change(next);
    assert.ok(compressionContractError([first], [next]));
  }
  assert.match(compressionContractError([first], [speech(true), { id: "x", type: "action", op: "take_item" }]) || "", /新增/);
});

for (const waitWindow of [false, true]) test(`pipeline ${waitWindow ? "wait" : "normal"} integrates one speech retry and settles first state once`, async t => {
  let erinCalls = 0;
  const world = structuredClone(INITIAL_HARBOR_TAVERN_WORLD);
  const blocks = [{ id: "b1", kind: "normal", events: [{ id: "e1", actor: "player", type: "speech", target: "erin", content: "请告诉我你是否愿意一起在这里等候下一班交通工具到达。" }] }, ...(waitWindow ? [{ id: "b2", kind: "wait", duration: 5 }] : [])];
  t.mock.method(agentRuntime, "runAgent", async (options: any) => {
    let data;
    if (options.agentId === "input_compiler") data = { blocks };
    else if (options.agentId === "perception") data = { npcObservations: { erin: options.context.events.map((event: any) => ({ eventId: event.id, saw: true, heard: true })) } };
    else if (options.agentId === "npc_reaction") {
      if (options.context.npc.id !== "erin") data = { thought: null, stateUpdates: [], intents: [] };
      else { erinCalls++; data = { ...original(), stateUpdates: [{ path: "attributes.mood", op: "set", value: erinCalls === 1 ? "calm" : "angry" }], intents: [speech(erinCalls > 1)] }; }
    } else {
      if (options.agentId === "world_resolver") {
        const reaction = options.context.npcReactions.find((item: any) => item.npcId === "erin").reaction;
        assert.equal(reaction.stateUpdates.length, 1);
        assert.equal(reaction.stateUpdates[0].value, "calm");
        assert.equal(reaction.intents.filter((intent: any) => intent.type === "speech").length, 1);
      }
      data = MockSimulator.simulate(options.agentId, options.context);
    }
    return { success: true, data, spanId: "stub" };
  });
  const result = await new GamePipeline().executeTurn("我向艾琳询问是否愿意等候。", world, 1, { agents: BUILTIN_AGENTS, groups: [], backends: [], activeGroupId: "test", mockMode: true });
  assert.equal(result.success, true, result.error);
  assert.equal(result.turn.narrationError, undefined);
  assert.equal(erinCalls, 2);
  assert.equal(result.turn.worldStateAfter.entities.erin.attributes!.mood, "calm");
  assert.equal(result.turn.committedEvents!.filter(event => event.type === "npc_speech" && event.actor === "erin").length, 1);
  const trace = globalTraceManager.getTrace(result.traceId)!;
  const budgetRetry = trace.spans.filter(span => span.type === "npc_speech_budget_retry");
  assert.equal(budgetRetry.length, 1);
  assert.equal(budgetRetry[0].status, "success");
  const filter = trace.spans.find(span => span.type === "intent_filter" && span.id.includes("erin"))!;
  assert.equal((filter.parsedOutput as any).rejections[0].reason, "time_budget");
});
