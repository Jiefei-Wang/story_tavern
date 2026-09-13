import test from "node:test";
import assert from "node:assert/strict";
import { ACTION_ADJUDICATOR, buildActionProtocolInstructions, mockActionResolution, preflightPlayerActions, resolvePlayerActions, validateActionResolutions, type ActionDecision, type ActionEffect } from "../src/engine/world/ActionResolution";
import { agentRuntime } from "../src/engine/runtime/AgentRuntime";
import { globalTraceManager } from "../src/engine/tracing/TraceManager";
import { DEFAULT_BACKENDS } from "./fixtures/legacyInitialData";
import type { GameEvent, WorldState } from "../src/types";

function world(): WorldState {
  return { clock: "2030-01-01T12:00:00", scene: { location: "room", lighting: "light", weather: "clear" }, rules: { capabilities: "ordinary physical actions only" }, entities: {
    room: { type: "location" }, elsewhere: { type: "location" }, player: { type: "character", location: "room", attributes: {} }, witness: { type: "character", location: "room", attributes: {} }, observer: { type: "character", location: "room", attributes: {} },
    parcel: { type: "item", location: "player" }, table: { type: "object", location: "room" }, closed: { type: "object", location: "room", locked: true, open: false }, key: { type: "item", location: "player", opens: "closed" }, tool: { type: "item", location: "player", loaded: false },
  } };
}
const action = (op = "put", target = "parcel", extra: Partial<GameEvent> = {}): GameEvent => ({ id: "e1", type: "action", actor: "player", op, target, ...extra });
const decision = (effects: ActionEffect[] = [], extra: Partial<ActionDecision> = {}): ActionDecision => ({ eventId: "e1", status: "success", summary: "物品被放在桌上。", reason: "物品与桌面存在且可达。", effects, ...extra });
const output = (resolutions: ActionDecision[]) => ({ resolutions, speechConstraints: [] });

test("missing item is a failed in-world attempt, never a created item or successful event", () => {
  const before = world(), events = [action("draw", "unknown_object", { details: { item: "unknown_object" } })];
  assert.equal(preflightPlayerActions(events, before).pending.length, 0);
  const result = validateActionResolutions(events, before, output([]));
  assert.equal(result.events[0].outcome?.status, "failed");
  assert.deepEqual(result.patches, []);
  assert.deepEqual(result.world, before);
});

test("existing unloaded tool can be placed, but cannot produce a shot", () => {
  const before = world();
  const put = validateActionResolutions([action("put", "tool")], before, output([decision([{ kind: "item_transfer", entityId: "tool", from: "player", to: "table" }])]));
  assert.equal(put.world.entities.tool.location, "table");
  const shot = validateActionResolutions([action("fire", "tool")], put.world, output([]));
  assert.equal(shot.events[0].outcome?.status, "failed");
  assert.deepEqual(shot.patches, []);
  assert.equal(before.entities.tool.location, "player");
});

test("an existing described surface need not have an entity, but needs quoted grounding and local placement", () => {
  const before = world(); before.scene.description = "屋内有一张铺着白布的长桌。";
  const event = action("put", "unmodeled_table", { details: { item: "parcel" } });
  assert.equal(preflightPlayerActions([event], before).pending.length, 1);
  const placed = decision([{ kind: "item_transfer", entityId: "parcel", from: "player", to: "room" }], { grounding: { kind: "scene_anchor", description: "铺白布的长桌桌面", evidence: "一张铺着白布的长桌" } });
  const result = validateActionResolutions([event], before, output([placed]));
  assert.equal(result.world.entities.parcel.location, "room");
  assert.equal(result.world.entities.unmodeled_table, undefined);
  assert.throws(() => validateActionResolutions([event], before, output([{ ...placed, grounding: undefined }])), /scene anchor/);
  assert.throws(() => validateActionResolutions([event], before, output([{ ...placed, grounding: { kind: "scene_anchor", description: "未知表面", evidence: "原文没有的表面" } }])), /scene anchor/);
});

test("offering an item does not authorize the recipient accepting or consuming it", () => {
  const before = world(), event = action("give", "witness", { details: { item: "parcel" } });
  assert.throws(() => validateActionResolutions([event], before, output([decision([{ kind: "item_transfer", entityId: "parcel", from: "player", to: "witness" }])])), /accept/);
  const offer = validateActionResolutions([event], before, output([decision([{ kind: "item_transfer", entityId: "parcel", from: "player", to: "room" }])]));
  assert.equal(offer.world.entities.parcel.location, "room");
  assert.equal(offer.world.entities.parcel.consumed, undefined);
  assert.deepEqual(offer.world.entities.witness, before.entities.witness);
});

test("multi-step take and place uses exact intermediate ownership and preserves original state", () => {
  const before = world(); before.entities.parcel.location = "table";
  const events = [action("take"), action("put", "parcel", { id: "e2" })];
  const result = validateActionResolutions(events, before, output([
    decision([{ kind: "item_transfer", entityId: "parcel", from: "table", to: "player" }]),
    decision([{ kind: "item_transfer", entityId: "parcel", from: "player", to: "room" }], { eventId: "e2" }),
  ]));
  assert.equal(result.world.entities.parcel.location, "room");
  assert.equal(result.patches.length, 2);
  assert.equal(before.entities.parcel.location, "table");
  assert.throws(() => validateActionResolutions(events, before, output([
    decision([{ kind: "item_transfer", entityId: "parcel", from: "table", to: "player" }]),
    decision([{ kind: "item_transfer", entityId: "parcel", from: "table", to: "room" }], { eventId: "e2" }),
  ])), /exact source/);
  assert.equal(before.entities.parcel.location, "table");
});

test("consumption requires possession and cannot repeat or silently delete the item", () => {
  const consumed = validateActionResolutions([action("eat")], world(), output([decision([{ kind: "item_consume", entityId: "parcel" }])]));
  assert.equal(consumed.world.entities.parcel.consumed, true);
  assert.equal(consumed.world.entities.parcel.location, "player");
  const repeated = validateActionResolutions([action("eat")], consumed.world, output([]));
  assert.equal(repeated.outcomes[0].status, "failed");
  assert.deepEqual(repeated.patches, []);
});

test("physical reach prevents taking another person's item, remote items and items inside locked containers", () => {
  for (const location of ["witness", "elsewhere", "closed"]) {
    const before = world(); before.entities.parcel.location = location;
    const result = validateActionResolutions([action("take")], before, output([]));
    assert.equal(result.outcomes[0].status, "failed", location);
    assert.deepEqual(result.world, before);
  }
});

test("model effect envelopes cannot create objects, mutate characters, open locked containers or invent ammunition", () => {
  const before = world();
  assert.throws(() => validateActionResolutions([action("open", "closed")], before, output([decision([{ kind: "object_state", entityId: "closed", field: "open", value: true }])])), /Locked/);
  assert.throws(() => validateActionResolutions([action("unlock", "closed")], before, output([decision([{ kind: "object_state", entityId: "closed", field: "locked", value: false }])])), /held key/);
  assert.throws(() => validateActionResolutions([action("load", "tool")], before, output([decision([{ kind: "object_state", entityId: "tool", field: "loaded", value: true }])])), /ammunition/);
  for (const effect of [{ kind: "patch", path: "/rules", value: {} }, { kind: "object_state", entityId: "player", field: "health", value: true }]) {
    assert.throws(() => validateActionResolutions([action()], before, output([decision([effect as any])])));
  }
  assert.deepEqual(before, world());
});

test("a held key with explicit object authorization can unlock before opening", () => {
  const result = validateActionResolutions([action("unlock", "closed", { details: { itemId: "key" } })], world(), output([decision([
    { kind: "object_state", entityId: "closed", field: "locked", value: false }, { kind: "object_state", entityId: "closed", field: "open", value: true },
  ])]));
  assert.equal(result.world.entities.closed.locked, false);
  assert.equal(result.world.entities.closed.open, true);
});

test("wrong IDs, duplicate IDs, unrelated effects and effects on failed actions are rejected atomically", () => {
  const before = world();
  assert.throws(() => preflightPlayerActions([action(), action()], before), /unique/);
  assert.throws(() => validateActionResolutions([action()], before, output([decision([], { eventId: "invented" })])), /exactly/);
  assert.throws(() => validateActionResolutions([action()], before, output([decision([{ kind: "item_transfer", entityId: "tool", from: "player", to: "table" }])])), /unrelated/);
  assert.throws(() => validateActionResolutions([action()], before, output([decision([{ kind: "item_consume", entityId: "parcel" }], { status: "failed" })])), /Failed actions/);
  assert.deepEqual(before, world());
});

test("whisper audience is an authoritative restriction and cannot expand to a bystander", () => {
  const speech: GameEvent = { id: "s1", type: "speech", actor: "player", target: "witness", content: "private words" };
  const result = validateActionResolutions([speech], world(), { resolutions: [], speechConstraints: [{ eventId: "s1", audibility: "whisper", audience: ["witness"] }] });
  assert.deepEqual(result.events[0].audience, ["witness"]);
  assert.equal(result.events[0].audibility, "whisper");
  assert.throws(() => validateActionResolutions([speech], world(), { resolutions: [], speechConstraints: [{ eventId: "s1", audibility: "whisper", audience: ["witness", "observer"] }] }), /addressed/);
  assert.throws(() => validateActionResolutions([speech], world(), output([])), /speech IDs/);
});

test("live helper uses original input and world rules even for speech-only input; impossible references skip model", async (t) => {
  const calls: any[] = [];
  t.mock.method(agentRuntime, "runAgent", async (options: any) => {
    calls.push(options);
    return { success: true, data: { resolutions: [], speechConstraints: [{ eventId: "s1", audibility: "whisper", audience: ["witness"] }] } };
  });
  const options = { agents: [ACTION_ADJUDICATOR], groups: [], backends: [], groupId: "unit-test", mockMode: false };
  const before = world(), speech: GameEvent = { id: "s1", type: "speech", actor: "player", target: "witness", content: "hello" };
  await resolvePlayerActions([speech], before, "我贴近耳边私语hello", options);
  assert.equal(calls[0].agentId, "action_adjudicator");
  assert.equal(calls[0].context.playerInput, "我贴近耳边私语hello");
  assert.deepEqual(calls[0].context.world.rules, before.rules);
  const invalid = await resolvePlayerActions([action("draw", "nonexistent", { details: { item: "nonexistent" } })], before, "凭空拿出物品", options);
  assert.equal(invalid.outcomes[0].status, "failed");
  assert.equal(calls.length, 1);
});

test("mock uses the same closed protocol for valid items and whisper restrictions", () => {
  const events: GameEvent[] = [action(), { id: "s1", type: "speech", target: "witness", content: "hello" }];
  const result = validateActionResolutions(events, world(), mockActionResolution(events, world(), "低声说hello"));
  assert.equal(result.world.entities.parcel.location, "room");
  assert.equal(result.events[1].audibility, "whisper");
});

test("dynamic action instructions give exact disjoint ID lists and complete kind examples/schema", () => {
  const text = buildActionProtocolInstructions([{ id: "s_only", type: "speech", target: "witness", content: "hello" }]);
  assert.match(text, /resolutions必须精确为 \[\]/);
  assert.match(text, /普通说话audibility=normal且audience必须精确为\[\]/);
  assert.match(text, /"kind":"item_transfer"/);
  assert.match(text, /"from":"CURRENT_OWNER_ID"/);
  assert(text.includes(JSON.stringify(ACTION_ADJUDICATOR.outputSchema)));
  const mixed = buildActionProtocolInstructions([action(), { id: "s2", type: "speech", target: "witness", content: "hello" }]);
  assert.match(mixed, /action ID，按顺序恰好一次：\["e1"\]/);
  assert.match(mixed, /"eventId":"s2"/);
});

test("one explicit schema correction keeps the first rejected response in trace and uses unchanged world", async (t) => {
  const before = world(), traceId = `action_retry_${Date.now()}`;
  globalTraceManager.startTurnTrace(traceId, 1, "place parcel");
  const requests: any[] = [];
  const invalid = output([decision([{ type: "item_transfer", entityId: "parcel", from: "player", to: "table" } as any])]);
  const valid = output([decision([{ kind: "item_transfer", entityId: "parcel", from: "player", to: "table" }])]);
  t.mock.method(globalThis, "fetch", async (_url: any, init: any) => {
    requests.push(JSON.parse(init.body));
    return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(requests.length === 1 ? invalid : valid) } }] }), { headers: { "content-type": "application/json" } });
  });
  const options = { traceId, agents: [ACTION_ADJUDICATOR], groupId: "action-test", groups: [{ id: "action-test", name: "unit test", bindings: [{ agentId: "action_adjudicator", backendId: "test-backend", model: "test-model" }] }], backends: [{ ...DEFAULT_BACKENDS[0], id: "test-backend", enabled: true, authType: "none" as const, baseUrl: "https://action.invalid/v1", customHeaders: {} }], mockMode: false };
  const result = await resolvePlayerActions([action()], before, "place parcel", options);
  assert.equal(requests.length, 2);
  assert.equal(result.world.entities.parcel.location, "table");
  assert.equal(before.entities.parcel.location, "player");
  assert.match(requests[1].messages.at(-1).content, /唯一一次/);
  assert.match(requests[1].messages.at(-1).content, /不能把失败动作改成成功/);
  const trace = globalTraceManager.getTrace(traceId)!;
  const calls = trace.spans.filter(span => span.agentId === "action_adjudicator");
  assert.equal(calls.length, 2);
  assert.equal(calls[0].status, "error");
  assert.deepEqual(calls[0].parsedOutput, invalid);
  assert.equal(calls[1].status, "success");
  assert.deepEqual((calls[0].inputContext as any).world, (calls[1].inputContext as any).world);
  assert(trace.spans.some(span => span.type === "action_protocol_retry"));
  globalTraceManager.endTurnTrace(traceId, "success");
});

test("speech misclassification is regenerated once, not silently normalized", async (t) => {
  let calls = 0;
  const speech: GameEvent = { id: "s1", type: "speech", target: "witness", content: "hello" };
  t.mock.method(agentRuntime, "runAgent", async () => {
    calls++;
    return { success: true, spanId: `stub${calls}`, data: calls === 1 ? { resolutions: [decision([], { eventId: "s1" })], speechConstraints: [] } : { resolutions: [], speechConstraints: [{ eventId: "s1", audibility: "normal", audience: [] }] } };
  });
  const result = await resolvePlayerActions([speech], world(), "hello", { agents: [ACTION_ADJUDICATOR], groups: [], backends: [], groupId: "test" });
  assert.equal(calls, 2);
  assert.equal(result.events[0].audibility, "normal");
  assert.equal(result.events[0].outcome, undefined);
});

test("protocol retry is bounded at two calls and never relaxes invalid physics", async (t) => {
  let calls = 0;
  t.mock.method(agentRuntime, "runAgent", async () => { calls++; return { success: true, spanId: `stub${calls}`, data: output([decision([], { eventId: "wrong" })]) }; });
  const options = { agents: [ACTION_ADJUDICATOR], groups: [], backends: [], groupId: "test" };
  await assert.rejects(resolvePlayerActions([action()], world(), "put", options), /exactly once/);
  assert.equal(calls, 2);
  t.mock.restoreAll();
  calls = 0;
  t.mock.method(agentRuntime, "runAgent", async () => { calls++; return { success: true, spanId: "physics", data: output([decision([{ kind: "object_state", entityId: "closed", field: "open", value: true }])]) }; });
  await assert.rejects(resolvePlayerActions([action("open", "closed")], world(), "open", options), /Locked/);
  assert.equal(calls, 1);
});

test("unstructured refusal or transport errors do not trigger a protocol retry", async (t) => {
  let calls = 0;
  t.mock.method(agentRuntime, "runAgent", async () => { calls++; return { success: false, spanId: "refusal", error: "Output schema expects JSON, but parsing failed: unexpected plain text refusal" }; });
  await assert.rejects(resolvePlayerActions([action()], world(), "put", { agents: [ACTION_ADJUDICATOR], groups: [], backends: [], groupId: "test" }), /parsing failed/);
  assert.equal(calls, 1);
});

test("free model explanations cannot invent hidden possessions or expose secrets through public outcomes", () => {
  const before = world();
  const poisoned = decision([], { status: "failed", summary: "玩家摸到袋中只有隐藏金币PRIVATE_CANARY。", reason: "他以前偷过一封秘密信件PRIVATE_REASON。" });
  const failed = validateActionResolutions([action("look")], before, output([poisoned]));
  assert.deepEqual(failed.outcomes[0], poisoned, "retain exact original model decision for internal evidence");
  assert.deepEqual(failed.events[0].outcome, { status: "failed", summary: "尝试未成功：所需对象或条件没有成立。", reason: "所需对象或条件没有成立" });
  assert.doesNotMatch(JSON.stringify(failed.events), /隐藏金币|PRIVATE_CANARY|PRIVATE_REASON|秘密信件/);
  const successful = validateActionResolutions([action()], before, output([decision([{ kind: "item_transfer", entityId: "parcel", from: "player", to: "table" }], { summary: poisoned.summary, reason: poisoned.reason })]));
  assert.equal(successful.world.entities.parcel.location, "table");
  assert.match(successful.events[0].outcome!.summary, /移至/);
  assert.doesNotMatch(JSON.stringify(successful.events), /隐藏金币|PRIVATE_CANARY|PRIVATE_REASON|秘密信件/);
  const looking = validateActionResolutions([action("look")], before, output([decision([], { summary: poisoned.summary, reason: poisoned.reason })]));
  assert.equal(looking.events[0].outcome!.summary, "当前动作尝试已完成；未确认其他物品或状态变化。");
  assert.doesNotMatch(JSON.stringify(looking.events), /PRIVATE_/);
});

test("later take is checked after opening, and a failed opener cannot grant reachability", () => {
  const before = world();
  before.entities.closed.locked = false;
  before.entities.parcel.location = 'closed';
  const events = [action('open', 'closed'), action('take', 'parcel', { id: 'e2' })];
  assert.deepEqual(preflightPlayerActions(events, before).pending.map(event => event.id), ['e1', 'e2']);
  const take = decision([{ kind: 'item_transfer', entityId: 'parcel', from: 'closed', to: 'player' }], { eventId: 'e2' });
  const opened = validateActionResolutions(events, before, output([decision([{ kind: 'object_state', entityId: 'closed', field: 'open', value: true }]), take]));
  assert.equal(opened.world.entities.parcel.location, 'player');
  assert.deepEqual(opened.outcomes.map(outcome => outcome.status), ['success', 'success']);
  const unopened = validateActionResolutions(events, before, output([decision([], { status: 'failed' }), take]));
  assert.deepEqual(unopened.outcomes.map(outcome => outcome.status), ['failed', 'failed']);
  assert.equal(unopened.world.entities.parcel.location, 'closed');
  assert.equal(before.entities.closed.open, false);
});

test("travel effect requires matching movement operation and target; movement can enable later reach", () => {
  const before = world();
  const travel: ActionEffect = { kind: 'actor_move', entityId: 'player', from: 'room', to: 'elsewhere' };
  assert.throws(() => validateActionResolutions([action('look', 'elsewhere')], before, output([decision([travel])])), /movement op and event target/);
  assert.throws(() => validateActionResolutions([action('move_to', 'room')], before, output([decision([travel])])), /movement op and event target/);
  before.entities.parcel.location = 'elsewhere';
  const moved = validateActionResolutions([action('move_to', 'elsewhere'), action('take', 'parcel', { id: 'e2' })], before, output([decision([travel]), decision([{ kind: 'item_transfer', entityId: 'parcel', from: 'elsewhere', to: 'player' }], { eventId: 'e2' })]));
  assert.equal(moved.world.entities.player.location, 'elsewhere');
  assert.equal(moved.world.entities.parcel.location, 'player');
});

test("stale background ownership gets one explicit source correction and preserves both original output and unchanged world", async t => {
  const before = world();
  before.scene.description = '玩家随身携带包裹，这是较早的背景。';
  before.entities.parcel.location = 'room';
  const traceId = `stale_source_${Date.now()}`;
  globalTraceManager.startTurnTrace(traceId, 1, 'put parcel');
  const requests: any[] = [];
  const invalid = output([decision([{ kind: 'item_transfer', entityId: 'parcel', from: 'player', to: 'table' }])]);
  const valid = output([decision([{ kind: 'item_transfer', entityId: 'parcel', from: 'room', to: 'table' }])]);
  t.mock.method(globalThis, 'fetch', async (_url: any, init: any) => {
    requests.push(JSON.parse(init.body));
    return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(requests.length === 1 ? invalid : valid) } }] }), { headers: { 'content-type': 'application/json' } });
  });
  const options = { traceId, agents: [ACTION_ADJUDICATOR], groupId: 'action-test', groups: [{ id: 'action-test', name: 'unit test', bindings: [{ agentId: 'action_adjudicator', backendId: 'test-backend', model: 'test-model' }] }], backends: [{ ...DEFAULT_BACKENDS[0], id: 'test-backend', authType: 'none' as const, baseUrl: 'https://action.invalid/v1' }] };
  const result = await resolvePlayerActions([action()], before, '把包裹放在桌上', options);
  assert.equal(requests.length, 2);
  assert.equal(result.world.entities.parcel.location, 'table');
  assert.equal(before.entities.parcel.location, 'room');
  assert.match(requests[1].messages.at(-1).content, /currentFrom=room/);
  assert.match(requests[1].messages.at(-1).content, /程序没有替你改from值/);
  const trace = globalTraceManager.getTrace(traceId)!;
  const spans = trace.spans.filter(span => span.agentId === 'action_adjudicator');
  assert.deepEqual(spans[0].parsedOutput, invalid);
  assert.ok(spans[0].rawResponse);
  assert.deepEqual((spans[0].inputContext as any).world, (spans[1].inputContext as any).world);
  assert.ok(trace.spans.some(span => span.type === 'action_resolution_validation' && span.status === 'error' && span.error?.includes('source is stale')));
  assert.equal((trace.spans.find(span => span.type === 'action_protocol_retry')?.parsedOutput as any).retryReason, 'stale_source');
  globalTraceManager.endTurnTrace(traceId, 'success');
});

test("stale source retry cannot change destination or repeat indefinitely, and locked destinations are not retried", async t => {
  const options = { agents: [ACTION_ADJUDICATOR], groups: [], backends: [], groupId: 'test' };
  for (const retryMode of ['repeat', 'expand', 'locked'] as const) {
    const before = world(); before.entities.parcel.location = 'room';
    let calls = 0;
    const stub = t.mock.method(agentRuntime, 'runAgent', async () => {
      calls++;
      const to = retryMode === 'locked' ? 'closed' : retryMode === 'expand' && calls === 2 ? 'room' : 'table';
      const from = retryMode === 'expand' && calls === 2 ? 'room' : 'player';
      return { success: true, spanId: `stale_${calls}`, data: output([decision([{ kind: 'item_transfer', entityId: 'parcel', from, to }])]) };
    });
    await assert.rejects(resolvePlayerActions([action()], before, '放包裹', options), retryMode === 'repeat' ? /source is stale/ : retryMode === 'expand' ? /effect scope/ : /closed or locked/);
    assert.equal(calls, retryMode === 'locked' ? 1 : 2);
    assert.equal(before.entities.parcel.location, 'room');
    stub.mock.restore();
  }
});
