import test from 'node:test';
import assert from 'node:assert/strict';
import type { NPCIntent, TemporalBlock, WorldState } from '../src/types';
import { GamePipeline } from '../src/engine/pipeline/GamePipeline';
import { agentRuntime } from '../src/engine/runtime/AgentRuntime';
import { mockActionResolution } from '../src/engine/world/ActionResolution';
import { definition, field, worldFor } from './fixtures/characterWorlds';
import { withCharacterContract } from '../src/engine/character-schema/AgentContract';
import { BUILTIN_AGENTS } from './fixtures/legacyInitialData';

const schema = definition([field('reliability', { default: 0.4, description: '履约可靠性；没有兑现的承诺不应该提高可靠性。' })]);
function initial(): WorldState {
  const world = worldFor(schema);
  world.entities.food = { type: 'item', name: '一份食品', location: 'tavern_room' };
  world.entities.table = { type: 'object', location: 'tavern_room' };
  return world;
}
const options = { agents: [], groups: [], backends: [], activeGroupId: 'unit_test', mockMode: false, worldDefinition: { version: 1, characterSchema: schema } };

type Handler = (args: any) => unknown | Promise<unknown>;
const isSettlement = (args: any): boolean => args.instructions?.includes('当前阶段：已经完成的物理过程效果结算') === true;
async function runStubbed(input: string, blocks: TemporalBlock[], handlers: Record<string, Handler>, world = initial(), characterSchema = schema) {
  const original = agentRuntime.runAgent;
  const calls: any[] = [];
  agentRuntime.runAgent = (async (args: any) => {
    calls.push(structuredClone({ agentId: args.agentId, context: args.context, instructions: args.instructions }));
    const defaults: Record<string, Handler> = {
      input_compiler: () => ({ blocks }),
      action_adjudicator: a => mockActionResolution(a.context.events, a.context.world, a.context.playerInput),
      perception: a => ({ npcObservations: { erin: a.context.events.map((e: any) => ({ eventId: e.id, saw: true, heard: true })) } }),
      npc_reaction: () => ({ thought: null, stateUpdates: [], intents: [] }),
      world_resolver: a => ({ patches: [], acceptedStateUpdates: a.context.npcReactions.flatMap((r: any) => (r.reaction.stateUpdates || []).map((_: any, updateIndex: number) => ({ npcId: r.npcId, updateIndex }))), publicEvents: a.context.npcReactions.flatMap((r: any) => r.reaction.intents.map((i: NPCIntent) => ({ actor: r.npcId, type: i.type, sourceIntentId: i.id, ...(i.op !== undefined ? { op: i.op } : {}), ...(i.target !== undefined ? { target: i.target } : {}), ...(i.speechPlan ? { speechPlan: i.speechPlan } : {}) }))) }),
      character_change_auditor: () => ({ valid: true, issues: [] }),
      narrator: () => ({ segments: [{ type: 'prose', text: '现场安静下来。' }] }),
      narration_auditor: () => ({ grounded: true, issues: [] }),
    };
    const selected = handlers[args.agentId] || defaults[args.agentId];
    if (!selected) throw new Error(`Unexpected agent ${args.agentId}`);
    const data = await selected(args);
    if (data && typeof data === 'object' && '__failure' in data) return { success: false, error: (data as any).__failure, spanId: 'stub' };
    return { success: true, data, spanId: 'stub' };
  }) as typeof original;
  try { return { result: await new GamePipeline().executeTurn(input, world, 1, { ...options, worldDefinition: { version: 1, characterSchema } }), calls }; }
  finally { agentRuntime.runAgent = original; }
}

test('normal and long-wait branches persist accepted consumption even when Resolver emits no physical patches', async () => {
  for (const wait of [false, true]) {
    const blocks: TemporalBlock[] = wait ? [{ id: 'wait', kind: 'wait', duration: 1200 }] : [{ id: 'normal', kind: 'normal', events: [{ id: 'look', type: 'action', actor: 'player', op: 'look', target: 'table', duration: 4 }] }];
    const { result, calls } = await runStubbed(wait ? '我等待二十分钟。' : '我看着桌面。', blocks, {
      npc_reaction: a => isSettlement(a)
        ? { thought: '当前Schema只有履约可靠性，进食没有相应属性需要结算。', stateUpdates: [], intents: [] }
        : { thought: '完成当前食品的消费。', stateUpdates: [], intents: [{ type: 'action', op: 'consume_item', target: 'food', duration: wait ? 300 : 2 }] },
    });
    assert.equal(result.success, true, result.error);
    assert.equal(result.turn.worldStateAfter.entities.food.consumed, true);
    assert.equal(result.turn.worldStateAfter.entities.food.name, '一份食品');
    assert.ok(result.turn.patches.some(p => p.path === '/entities/food/consumed' && p.value === true));
    assert.ok(result.turn.committedEvents?.some(e => e.type === 'npc_action' && e.op === 'consume_item' && e.target === 'food'));
    assert.equal(result.turn.worldStateAfter.entities.erin.attributes!.reliability, 0.4, 'physical consumption must not invent psychological effects');
    assert.ok(calls.filter(c => ['npc_reaction', 'world_resolver'].includes(c.agentId) && !isSettlement(c)).every(c => c.instructions.includes('consume_item')));
  }
});

test('time-filtered and explicitly rejected consumption never marks a food item consumed', async () => {
  for (const rejectByResolver of [false, true]) {
    const handlers: Record<string, Handler> = { npc_reaction: () => ({ thought: null, stateUpdates: [], intents: [{ type: 'action', op: 'consume_item', target: 'food', duration: 300 }] }) };
    if (rejectByResolver) handlers.world_resolver = a => ({ patches: [], acceptedStateUpdates: [], publicEvents: [], rejectedIntents: a.context.npcReactions.flatMap((r: any) => r.reaction.intents.map((intent: NPCIntent) => ({ intent, reason: '本次没有实际进食' }))) });
    const duration = rejectByResolver ? 1200 : 1;
    const { result } = await runStubbed(rejectByResolver ? '我等待二十分钟。' : '我只等一秒。', [{ id: 'wait', kind: 'wait', duration }], handlers);
    assert.equal(result.success, true, result.error);
    assert.equal(result.turn.worldStateAfter.entities.food.consumed, undefined);
    assert.ok(!result.turn.committedEvents?.some(e => e.type === 'npc_action' && e.op === 'consume_item'));
  }
});

test('invalid attribute proposal is corrected and re-audited with frozen intents and no double-applied delta', async () => {
  let reactions = 0, audits = 0;
  const blocks: TemporalBlock[] = [{ id: 'normal', kind: 'normal', events: [{ id: 'admission', type: 'speech', actor: 'player', target: 'erin', content: '对不起，我没有答应借给你的东西。' }] }];
  const { result, calls } = await runStubbed('我向艾琳承认失约。', blocks, {
    npc_reaction: a => {
      reactions++;
      return { thought: '重新评估承诺。', stateUpdates: [{ path: 'attributes.reliability', op: 'delta', value: reactions === 1 ? 0.1 : -0.1, reason: reactions === 1 ? '坦白值得提高可靠性' : '实际失约降低可靠性', sourceEventIds: [a.context.observations[0].eventId] }], intents: [{ type: 'action', op: reactions === 1 ? 'nod' : 'consume_item', ...(reactions === 1 ? {} : { target: 'food' }), duration: reactions === 1 ? 1 : 1200 }] };
    },
    character_change_auditor: () => ++audits === 1 ? { valid: false, issues: [{ updateIndex: 0, reason: '失约没有提高履约可靠性的事实依据' }] } : { valid: true, issues: [] },
  });
  assert.equal(result.success, true, result.error);
  assert.equal(reactions, 2);
  assert.equal(audits, 2);
  const resolver = calls.find(c => c.agentId === 'world_resolver').context;
  assert.equal(resolver.npcReactions[0].reaction.stateUpdates[0].value, -0.1);
  assert.ok(Math.abs(resolver.npcReactions[0].proposedCharacter.attributes.reliability - 0.3) < 1e-9);
  assert.deepEqual(resolver.npcReactions[0].reaction.intents.map((i: NPCIntent) => i.op), ['nod']);
  assert.ok(Math.abs(Number(result.turn.worldStateAfter.entities.erin.attributes!.reliability) - 0.3) < 1e-9);
  assert.equal(result.turn.worldStateAfter.entities.food.consumed, undefined);
  assert.deepEqual(result.turn.committedEvents?.filter(e => e.type === 'npc_action').map(e => e.op), ['nod']);
  const auditCalls = calls.filter(c => c.agentId === 'character_change_auditor');
  assert.equal(auditCalls[1].context.audit.proposedStateUpdates[0].value, -0.1);
  assert.deepEqual(auditCalls[1].context.audit.intents.map((i: NPCIntent) => i.op), ['nod']);
});

test('character causality audit transport failure rolls back earlier physical changes in the turn', async () => {
  const world = initial();
  world.entities.food.location = 'player';
  const before = structuredClone(world);
  const blocks: TemporalBlock[] = [{ id: 'normal', kind: 'normal', events: [{ id: 'put', type: 'action', actor: 'player', op: 'put', target: 'food', details: { destination: 'table' }, duration: 2 }, { id: 'say', type: 'speech', actor: 'player', target: 'erin', content: '对不起，我之前失约了。' }] }];
  const { result, calls } = await runStubbed('我把食品放桌上并道歉。', blocks, {
    action_adjudicator: a => ({ resolutions: a.context.events.filter((e: any) => e.type === 'action').map((e: any) => ({ eventId: e.id, status: 'success', summary: '食品已放到桌上。', reason: '已有物品和桌面可达。', effects: [{ kind: 'item_transfer', entityId: 'food', from: 'player', to: 'table' }] })), speechConstraints: a.context.events.filter((e: any) => e.type === 'speech').map((e: any) => ({ eventId: e.id, audibility: 'normal', audience: [] })) }),
    npc_reaction: a => ({ thought: null, stateUpdates: [{ path: 'attributes.reliability', op: 'delta', value: 0.1, sourceEventIds: [a.context.observations[0].eventId], reason: '需要审核的变化' }], intents: [] }),
    character_change_auditor: () => ({ __failure: 'HTTP 503 synthetic audit outage' }),
  }, world);
  assert.equal(result.success, false);
  assert.deepEqual(result.turn.worldStateAfter, before);
  assert.deepEqual(world, before);
  assert.ok(!calls.some(c => c.agentId === 'world_resolver'));
  assert.ok(calls.some(c => c.agentId === 'character_change_auditor'));
  assert.ok(calls.find(c => c.agentId === 'npc_reaction').context.observations.some((o: any) => o.op === 'put' && o.outcome?.status === 'success'), 'the earlier physical action really succeeded before the later audit failed');
});

const bodySchema = definition([
  field('hunger', { default: 0.8, description: '饥饿程度，越高越饿；实际进食可降低。' }),
  field('fatigue', { default: 0.7, description: '疲劳程度，越高越疲劳；实际休息可降低。' }),
]);
function bodyWorld(): WorldState {
  const world = worldFor(bodySchema);
  world.entities.food = { type: 'item', name: '一份食品', location: 'tavern_room' };
  return world;
}
const longWait: TemporalBlock[] = [{ id: 'wait', kind: 'wait', duration: 1200 }];

test('completed partial eating and rest settle body effects from committed durations even when pre-action proposals were empty', async () => {
  const { result, calls } = await runStubbed('我等待二十分钟。', longWait, {
    npc_reaction: a => {
      if (!isSettlement(a)) return { thought: '先执行进食与休息。', stateUpdates: [], intents: [
        { type: 'action', op: 'eat_item_partial', target: 'food', duration: 90 },
        { type: 'action', op: 'rest', duration: 300 },
      ] };
      const eat = a.context.observations.find((o: any) => o.op === 'eat_item_partial');
      const rest = a.context.observations.find((o: any) => o.op === 'rest');
      assert.equal(eat.duration, 90);
      assert.equal(rest.duration, 300);
      assert.equal(eat.outcome.status, 'success');
      assert.equal(rest.outcome.status, 'success');
      return { thought: '按已完成的部分进食和短暂休息结算有限生理效果。', intents: [], stateUpdates: [
        { path: 'attributes.hunger', op: 'delta', value: -0.1, sourceEventIds: [eat.eventId], reason: '已实际吃了一部分食物。' },
        { path: 'attributes.fatigue', op: 'delta', value: -0.05, sourceEventIds: [rest.eventId], reason: '已实际休息五分钟。' },
      ] };
    },
  }, bodyWorld(), bodySchema);
  assert.equal(result.success, true, result.error);
  const attributes = result.turn.worldStateAfter.entities.erin.attributes!;
  assert.ok(Math.abs(Number(attributes.hunger) - 0.7) < 1e-9);
  assert.ok(Math.abs(Number(attributes.fatigue) - 0.65) < 1e-9);
  assert.equal(result.turn.worldStateAfter.entities.food.consumed, undefined, 'partial eating cannot mark the entire item exhausted');
  assert.equal(calls.filter(c => c.agentId === 'npc_reaction').length, 2);
  assert.equal(calls.filter(isSettlement).length, 1);
  assert.deepEqual(result.turn.committedEvents?.filter(e => e.type === 'npc_action').map(e => e.op), ['eat_item_partial', 'rest']);
  const audit = calls.find(c => c.agentId === 'character_change_auditor').context.audit;
  assert.equal(audit.phase, 'completed_process');
  assert.deepEqual(audit.intents, [], 'settlement cannot replay the completed actions');
  const committedIds = new Set(result.turn.committedEvents?.filter(e => e.type === 'npc_action').map(e => e.id));
  assert.ok(audit.proposedStateUpdates.every((u: any) => u.sourceEventIds.length === 1 && committedIds.has(u.sourceEventIds[0])));
  const resolver = calls.find(c => c.agentId === 'world_resolver').context;
  assert.deepEqual(resolver.npcReactions[0].reaction.stateUpdates, [], 'effects were calculated after acceptance, not smuggled through pre-action candidates');
});

test('rejected physical processes trigger no post-action settlement or physiological changes', async () => {
  const world = bodyWorld();
  const { result, calls } = await runStubbed('我等待二十分钟。', longWait, {
    npc_reaction: () => ({ thought: '提出一个尚待裁决的进食动作。', stateUpdates: [], intents: [{ type: 'action', op: 'eat_item_partial', target: 'food', duration: 90 }] }),
    world_resolver: a => ({ patches: [], publicEvents: [], acceptedStateUpdates: [], rejectedIntents: a.context.npcReactions.flatMap((r: any) => r.reaction.intents.map((intent: NPCIntent) => ({ intent, reason: '食品已无法食用，动作没有执行。' }))) }),
  }, world, bodySchema);
  assert.equal(result.success, true, result.error);
  assert.deepEqual(result.turn.worldStateAfter.entities.erin.attributes, world.entities.erin.attributes);
  assert.equal(result.turn.worldStateAfter.entities.food.consumed, undefined);
  assert.equal(calls.filter(isSettlement).length, 0);
  assert.equal(calls.filter(c => c.agentId === 'character_change_auditor').length, 0);
  assert.ok(!result.turn.committedEvents?.some(e => e.type === 'npc_action'));
});

test('post-action model transport failure rolls back committed consumption, clock and state together', async () => {
  const world = bodyWorld(), before = structuredClone(world);
  const { result, calls } = await runStubbed('我等待二十分钟。', longWait, {
    npc_reaction: a => {
      if (!isSettlement(a)) return { thought: '吃完整份食品。', stateUpdates: [], intents: [{ type: 'action', op: 'consume_item', target: 'food', duration: 300 }] };
      assert.equal(a.context.visibleObjects.food.consumed, true, 'physical consumption was committed before the failing settlement');
      assert.equal(a.context.observations[0].outcome.status, 'success');
      return { __failure: 'HTTP 503 synthetic post-action outage' };
    },
  }, world, bodySchema);
  assert.equal(result.success, false);
  assert.match(result.error || '', /503/);
  assert.deepEqual(result.turn.worldStateAfter, before);
  assert.deepEqual(world, before);
  assert.equal(calls.filter(isSettlement).length, 1);
  assert.ok(!calls.some(c => c.agentId === 'narrator'), 'failed settlement must not publish successful prose');
});

test('upgraded Resolver contract removes obsolete attribute Patch instructions while preserving custom guidance', () => {
  const original = { ...BUILTIN_AGENTS.find(a => a.id === 'world_resolver')!, messages: [
    { id: 'custom', role: 'system' as const, content: '保留用户自定义的物理风格。' },
    { id: 'character_schema_contract', role: 'system' as const, content: '数值 delta 转成最终值 Patch；text append 必须连接后写入。' },
  ] };
  const upgraded = withCharacterContract(original, schema);
  assert.equal(upgraded.messages.filter(m => m.id === 'character_schema_contract').length, 1);
  assert.equal(upgraded.messages[0].content, original.messages[0].content);
  assert.doesNotMatch(JSON.stringify(upgraded.messages), /数值 delta 转成最终值 Patch|采纳某项更新时使用其中该字段的完整最终值/);
  assert.match(JSON.stringify(upgraded.messages), /completed_process/);
  assert.match(JSON.stringify(upgraded.messages), /不要提前扣除或恢复人物属性/);
  assert.match(JSON.stringify(upgraded.messages), /物品、环境和位置/);
  assert.equal(original.messages[1].content, '数值 delta 转成最终值 Patch；text append 必须连接后写入。');
});

test('accepted physical spell lights an existing object before source-bound resource settlement; direct attribute writes still roll back', async () => {
  const spellSchema = definition([field('mana', { default: 0.6, description: '施法消耗的剩余精力' })]);
  for (const directWrite of [false, true]) {
    const world = worldFor(spellSchema);
    world.entities.lamp = { type: 'object', location: 'tavern_room', lit: false };
    const before = structuredClone(world);
    const { result, calls } = await runStubbed('我安静等待三十秒。', [{ id: 'wait', kind: 'wait', duration: 30 }], {
      npc_reaction: a => isSettlement(a)
        ? { thought: '实际施法已经完成，结算资源成本。', intents: [], stateUpdates: [{ path: 'attributes.mana', op: 'delta', value: -0.1, reason: '已实际使用能力点灯', sourceEventIds: [a.context.observations[0].eventId] }] }
        : { thought: '执行掌握的点灯法术。', intents: [{ type: 'action', op: 'cast_spark', target: 'lamp', duration: 3 }], stateUpdates: [] },
      world_resolver: a => {
        assert.match(a.instructions, /completed_process/);
        assert.match(a.instructions, /不要提前扣除或恢复人物属性/);
        const intent = a.context.npcReactions[0].reaction.intents[0];
        return { patches: [{ op: 'replace', path: '/entities/lamp/lit', value: true }, ...(directWrite ? [{ op: 'replace', path: '/entities/erin/attributes/mana', value: 0.5 }] : [])], acceptedStateUpdates: [], publicEvents: [{ actor: 'erin', type: 'action', op: intent.op, target: intent.target, sourceIntentId: intent.id }] };
      },
    }, world, spellSchema);
    if (directWrite) {
      assert.equal(result.success, false);
      assert.match(result.error || '', /不得再手写人物属性Patch/);
      assert.deepEqual(result.turn.worldStateAfter, before);
      assert.ok(!calls.some(isSettlement), 'invalid Resolver output is not silently repaired or partially committed');
    } else {
      assert.equal(result.success, true, result.error);
      assert.equal(result.turn.worldStateAfter.entities.lamp.lit, true);
      assert.equal(result.turn.worldStateAfter.entities.erin.attributes!.mana, 0.5);
      const settlement = calls.find(isSettlement);
      assert.equal(settlement.context.visibleObjects.lamp.lit, true);
      assert.equal(settlement.context.npc.attributes.mana, 0.6, 'resource cost is neither pre-applied nor double-counted');
      assert.equal(settlement.context.observations[0].op, 'cast_spark');
      assert.equal(settlement.context.observations[0].outcome.status, 'success');
    }
  }
});
