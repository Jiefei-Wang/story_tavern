import test from 'node:test';
import assert from 'node:assert/strict';
import type { NPCIntent, NPCReactionResult, WorldResolverResult, WorldState } from '../src/types';
import { isPhysicalEffectAction, isSustainedPhysicalProcess, materializeNpcPhysicalEffects } from '../src/engine/world/NPCPhysicalEffects';
import { getSafeIntentDuration } from '../src/engine/world/TimingEngine';
import { applyPatches } from '../src/engine/world/PatchEngine';

function world(): WorldState {
  return { clock: '2026-01-01T12:00:00', scene: { location: 'room', weather: 'clear', lighting: 'day' }, rules: {}, entities: { player: { type: 'character', location: 'room' }, diner: { type: 'character', location: 'room', attributes: { customEnergy: 0.3 } }, other: { type: 'character', location: 'room' }, room: { type: 'location' }, table: { type: 'object', location: 'room' }, food: { type: 'item', name: '一份食物', location: 'table', provenance: '保留历史' } } };
}
function data(intent: NPCIntent = { id: 'meal', type: 'action', op: 'consume_item', target: 'food', duration: 300 }) {
  const reactions: Array<{ npcId: string; reaction: NPCReactionResult }> = [{ npcId: 'diner', reaction: { thought: null, stateUpdates: [], intents: [intent] } }];
  const result: WorldResolverResult = { patches: [], publicEvents: [{ actor: 'diner', type: 'action', sourceIntentId: intent.id, op: intent.op, target: intent.target }] };
  return { reactions, result };
}

test('only accepted completed item use materializes consumed and preserves entity history and character attributes', () => {
  const w = world(), before = structuredClone(w), { result, reactions } = data();
  const extra = materializeNpcPhysicalEffects(result, w, reactions);
  assert.deepEqual(extra, [{ op: 'add', path: '/entities/food/consumed', value: true }]);
  const applied = applyPatches(w, extra);
  assert.equal(applied.success, true);
  assert.deepEqual(applied.newWorld.entities.food, { ...before.entities.food, consumed: true });
  assert.deepEqual(applied.newWorld.entities.diner, before.entities.diner);
  assert.deepEqual(w, before);
  assert.deepEqual(materializeNpcPhysicalEffects({ patches: [] }, w, reactions), []);
  assert.deepEqual(materializeNpcPhysicalEffects({ patches: [], rejectedIntents: [{ intent: reactions[0].reaction.intents[0], reason: '没有足够时间' }] }, w, reactions), []);
});

test('legacy eat target is supported conservatively while a bite, start, invitation and unknown action consume nothing', () => {
  const w = world();
  for (const op of ['eat_food', 'drink_food', 'eat_item']) {
    const { result, reactions } = data({ id: 'i', type: 'action', op, target: 'food', duration: 300 });
    assert.equal(materializeNpcPhysicalEffects(result, w, reactions).length, 1);
  }
  for (const intent of [
    { op: 'take_bite' }, { op: 'start_eating' }, { op: 'taste_item' }, { op: 'plan_to_eat' }, { op: 'invite_to_eat' }, { op: 'eat_unknown_name' }, { op: 'eat' },
    { op: 'eat_food', content: '只吃一小口，剩余保留。' }, { op: 'consume_item', content: 'taste only a little' },
  ]) {
    const { result, reactions } = data({ id: 'i', type: 'action', target: 'food', duration: 1, ...intent });
    assert.deepEqual(materializeNpcPhysicalEffects(result, w, reactions), [], intent.op);
  }
});

test('consumption requires an exact accepted intent source and rejects contradictory accept/reject decisions', () => {
  const w = world(), { result, reactions } = data();
  assert.throws(() => materializeNpcPhysicalEffects({ ...result, publicEvents: [{ ...result.publicEvents![0], sourceIntentId: 'forged' }] }, w, reactions), /原始人物意图/);
  assert.throws(() => materializeNpcPhysicalEffects({ ...result, publicEvents: [{ ...result.publicEvents![0], actor: 'other' }] }, w, reactions), /原始人物意图/);
  assert.throws(() => materializeNpcPhysicalEffects({ ...result, rejectedIntents: [{ intent: reactions[0].reaction.intents[0], reason: 'budget rejected' }] }, w, reactions), /同时被接受与拒绝/);
});

test('items must be accessible and cannot be used from another character, locked container, absent actor or unknown target', () => {
  const { result, reactions } = data();
  for (const location of ['player', 'other', 'far_away']) {
    const w = world(); w.entities.food.location = location;
    assert.throws(() => materializeNpcPhysicalEffects(result, w, reactions), /不可达|别人持有/);
  }
  const owned = world(); owned.entities.food.location = 'diner';
  assert.equal(materializeNpcPhysicalEffects(result, owned, reactions).length, 1);
  const locked = world(); locked.entities.table.locked = true;
  assert.throws(() => materializeNpcPhysicalEffects(result, locked, reactions), /容器未打开/);
  const absent = world(); absent.entities.diner.location = 'far_away';
  assert.throws(() => materializeNpcPhysicalEffects(result, absent, reactions), /不可达/);
  const missing = world(); delete missing.entities.food;
  assert.throws(() => materializeNpcPhysicalEffects(result, missing, reactions), /已有物品/);
});

test('the same item cannot be consumed twice in one block or across blocks', () => {
  const w = world(), { result, reactions } = data();
  assert.throws(() => materializeNpcPhysicalEffects({ ...result, publicEvents: [...result.publicEvents!, ...result.publicEvents!] }, w, reactions), /再次消费/);
  w.entities.food.consumed = true;
  assert.throws(() => materializeNpcPhysicalEffects(result, w, reactions), /再次消费/);
});

test('existing consumed patch is deduplicated, false conflicts and deletion are rejected', () => {
  const w = world(), { result, reactions } = data();
  assert.deepEqual(materializeNpcPhysicalEffects({ ...result, patches: [{ op: 'add', path: '/entities/food/consumed', value: true }] }, w, reactions), []);
  assert.throws(() => materializeNpcPhysicalEffects({ ...result, patches: [{ op: 'add', path: '/entities/food/consumed', value: false }] }, w, reactions), /相冲突/);
  assert.throws(() => materializeNpcPhysicalEffects({ ...result, patches: [{ op: 'remove', path: '/entities/food' }] }, w, reactions), /不得删除/);
  w.entities.food.consumed = false;
  assert.deepEqual(materializeNpcPhysicalEffects(result, w, reactions), [{ op: 'replace', path: '/entities/food/consumed', value: true }]);
});

test('rejected or absent consumption cannot bypass source checking through raw consumed patches or entity replacements', () => {
  const w = world(), { result, reactions } = data();
  for (const patches of [
    [{ op: 'add' as const, path: '/entities/food/consumed', value: true }],
    [{ op: 'replace' as const, path: '/entities/food', value: { ...w.entities.food, consumed: true } }],
    [{ op: 'replace' as const, path: '/entities', value: { ...w.entities, food: { ...w.entities.food, consumed: true } } }],
  ]) {
    assert.throws(() => materializeNpcPhysicalEffects({ patches, publicEvents: [], rejectedIntents: [{ intent: reactions[0].reaction.intents[0], reason: 'did not eat' }] }, w, reactions), /没有已接受完整消费意图/);
    assert.throws(() => materializeNpcPhysicalEffects({ patches }, w, []), /没有已接受完整消费意图/);
  }
  w.entities.food.consumed = true;
  assert.throws(() => materializeNpcPhysicalEffects({ patches: [{ op: 'replace', path: '/entities/food/consumed', value: false }] }, w, []), /复原/);
  assert.throws(() => materializeNpcPhysicalEffects({ patches: [{ op: 'remove', path: '/entities/food' }] }, w, []), /删除/);
});

test('generic eat with explicit completion in original content consumes even when public action omits content', () => {
  const { result, reactions } = data({ id: 'i', type: 'action', op: 'eat', target: 'food', content: '吃完整份食物。', duration: 300 });
  assert.equal(result.publicEvents![0].content, undefined);
  assert.equal(materializeNpcPhysicalEffects(result, world(), reactions).length, 1);
});

test('post-action process selection includes partial eating, rest and actual spellcasting but excludes plans and gestures', () => {
  for (const op of ['eat_item_partial', 'drink_water', 'rest', 'sleep', 'meditate', 'cast_small_flame', 'use_ability', 'activate_skill', 'heal', 'run_to_exit', '施法', '治疗', '奔跑']) assert.equal(isSustainedPhysicalProcess({ type: 'action', op }), true, op);
  for (const op of ['look', 'nod', 'glance_around', 'offer_food', 'plan_to_eat', 'ask_to_cast', 'promise_to_rest', 'pretend_to_heal', 'command_run', 'command_rest']) assert.equal(isSustainedPhysicalProcess({ type: 'action', op }), false, op);
  assert.equal(isSustainedPhysicalProcess({ type: 'speech', op: 'eat', content: '我愿意吃饭。' }), false);
  assert.equal(isPhysicalEffectAction({ type: 'action', op: 'cast_spell' }), true);
  assert.equal(getSafeIntentDuration({ type: 'action', op: 'cast_spell', duration: 1000 }, 1200), 4, 'effect eligibility must not enlarge short-action timing');
});
