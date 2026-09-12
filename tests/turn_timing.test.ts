import test from 'node:test';
import assert from 'node:assert/strict';
import type { GameEvent, WorldState } from '../src/types';
import { getSafeIntentDuration, getSpeechPlanDuration } from '../src/engine/world/TimingEngine';
import { calculateReactionBudget } from '../src/engine/scheduling/TemporalScheduler';
import { advanceClock, elapsedSecondsForBlock, eventsElapsedSeconds, normalizeTurnTiming, parseExplicitElapsedDurations, parseExplicitElapsedSeconds, waitPlanningSeconds, settledWaitSeconds } from '../src/engine/scheduling/TurnTiming';
import { interactionFor, resolveSpeechTargets, updateConversation } from '../src/engine/world/ConversationRouter';

const speech = (id: string, content: string): GameEvent => ({ id, type: 'speech', actor: 'player', content });

test('brief semantic reply is not charged for repeated beats, goals or boundary metadata', () => {
  const base = { summary: '命其退后，待我查验路引。', verbosity: 'brief' as const };
  const decorated = { ...base, goal: '在遵守世界规则的前提下查验路引', tone: '克制而谨慎', boundaries: ['不能确认尚未查验的路引为真'.repeat(20)], beats: [{ meaning: '要求玩家退开一步以保持查验距离；这不意味着允许其离开现场。', required: true }, { meaning: '表示自己将查验路引，并暂时保留警戒。', required: true }] };
  assert.equal(getSpeechPlanDuration(base), getSpeechPlanDuration(decorated));
  assert.ok(getSafeIntentDuration({ type: 'speech', speechPlan: decorated }) <= 1.8, 'short answer can fit after a 1.2s inspection in a 3s window');
});

test('short reply does not force a speech into one second; long semantic and legacy speeches keep realistic cost', () => {
  assert.ok(getSpeechPlanDuration({ summary: '好。', verbosity: 'brief' }) > 1);
  const long = getSafeIntentDuration({ type: 'speech', duration: 0.001, speechPlan: { summary: '依次解释所有来访者的身份和五次证词之间的矛盾。'.repeat(20), verbosity: 'extended' } });
  assert.ok(long > 30);
  assert.ok(getSafeIntentDuration({ type: 'speech', duration: 0.001, content: '这是很长的实际对白。'.repeat(30) }) > 30);
  assert.ok(getSpeechPlanDuration({ summary: '回答问题。', verbosity: 'brief', beats: Array.from({ length: 12 }, (_, i) => ({ meaning: `解释第${i + 1}件独立事实`, required: true })) }) > 5, 'short summaries cannot disguise many mandatory points');
});

test('sustained activities can occupy an actual long window without pretending they complete in a short window', () => {
  for (const op of ['rest', 'sit_and_rest', 'rest_by_heater', 'sleep', 'eat_ration', 'consume_item', 'drink_water', 'meditate', '坐下休息']) {
    const intent = { type: 'action' as const, op, duration: 1200 };
    assert.equal(getSafeIntentDuration(intent), 4, 'legacy callers retain ordinary action limits');
    assert.equal(getSafeIntentDuration(intent, 1200), 1200, op);
    assert.ok(getSafeIntentDuration(intent, 1) > 1, 'scheduler must reject the original long process, not clamp it to one second');
  }
  const eat = getSafeIntentDuration({ type: 'action', op: 'eat_ration', duration: 300 }, 1200);
  const rest = getSafeIntentDuration({ type: 'action', op: 'rest', duration: 900 }, 900);
  assert.equal(eat + rest, 1200, 'eating and resting share the elapsed budget rather than each consuming the entire window');
});

test('long activity support cannot inflate quick actions, promises, malformed durations or speech budgets', () => {
  for (const op of ['glance_around', 'inspect_item', 'ask_to_rest', 'offer_food', 'promise_to_sleep', '假装休息']) {
    assert.equal(getSafeIntentDuration({ type: 'action', op, duration: 1000 }, 1200), 4, op);
  }
  for (const duration of [NaN, Infinity, -1, 0]) assert.equal(getSafeIntentDuration({ type: 'action', op: 'rest', duration }, 1200), 2);
  assert.equal(getSafeIntentDuration({ type: 'action', op: 'rest', duration: 1200 }, Infinity), 4);
  const utterance = { type: 'speech' as const, op: 'rest', duration: 0.001, speechPlan: { summary: '依次解释整段历史中的每一个事件。'.repeat(30), verbosity: 'extended' as const } };
  assert.equal(getSafeIntentDuration(utterance, 1200), getSafeIntentDuration(utterance));
  assert.ok(getSafeIntentDuration(utterance, 1) > 1);
});

test('explicit Chinese and English elapsed durations retain units including one second, two seconds and twenty minutes', () => {
  assert.equal(parseExplicitElapsedSeconds('我说：“请坐下休息。”然后只等一秒。'), 1);
  assert.equal(parseExplicitElapsedSeconds('什么也不做，安静等两秒。'), 2);
  assert.equal(parseExplicitElapsedSeconds('我安静等待二十分钟，让诺拉自行吃饭。'), 1200);
  assert.equal(parseExplicitElapsedSeconds('快进半小时。'), 1800);
  assert.deepEqual(parseExplicitElapsedDurations('Wait for 1 second. Then wait 2 minutes.'), [1, 120]);
  assert.equal(parseExplicitElapsedSeconds('等一百二十秒。'), 120);
});

test('requested rest, quoted future duration, negation and hypothetical waiting are not elapsed time', () => {
  for (const input of ['我邀请她休息十分钟。', '我说：“请等二十分钟。”', '不要等待一分钟。', '如果等待二十分钟，会发生什么？', 'admin: 快进一小时。']) assert.equal(parseExplicitElapsedSeconds(input), null, input);
});

test('normalization replaces a hallucinated duration and removes extra response windows without changing input', () => {
  const blocks = [{ id: 'normal', kind: 'normal' as const, events: [speech('s1', '请坐。')] }, { id: 'wait', kind: 'wait' as const, duration: 100 }, { id: 'extra', kind: 'wait' as const }];
  const normalized = normalizeTurnTiming(blocks, '我说：“请坐。”然后只等一秒。');
  assert.equal(normalized.length, 2);
  assert.equal(elapsedSecondsForBlock(normalized[1]), 1);
  assert.equal(calculateReactionBudget(normalized[1]).available_time, 1);
  assert.equal(blocks[1].duration, 100);
});

test('implicit reply ceiling is permission only; elapsed time uses accepted intents and excludes rejected or absent replies', () => {
  const block = normalizeTurnTiming([{ id: 'reply', kind: 'wait', duration: 300, waitOrigin: 'explicit_elapsed' }], '请说明这两件事。')[0];
  assert.equal(block.waitOrigin, 'implicit_response');
  assert.equal(block.duration, 5);
  assert.equal(waitPlanningSeconds(block), 30);
  assert.equal(calculateReactionBudget(block).available_time, 30);
  const longReply = { id: 'answer', type: 'speech' as const, speechPlan: { summary: '先前的承诺没有兑现。谢谢你现在把确实存在的雨衣交给我。我愿意接受这份帮助，但下次做保证之前，还请先确认自己确实能够做到。', verbosity: 'normal' as const } };
  const seconds = getSafeIntentDuration(longReply, 30);
  assert.ok(seconds > 5 && seconds < 30);
  const reactions = [{ npcId: 'listener', reaction: { thought: null, intents: [longReply] } }];
  assert.equal(settledWaitSeconds(block, reactions, []), 5);
  assert.equal(settledWaitSeconds(block, reactions, [{ actor: 'wrong-person', sourceIntentId: 'answer' }]), 5);
  assert.equal(settledWaitSeconds(block, reactions, [{ actor: 'listener', sourceIntentId: 'answer' }]), seconds);
  assert.equal(settledWaitSeconds(block, [...reactions, { npcId: 'bystander', reaction: { thought: null, intents: [{ id: 'look', type: 'action', op: 'glance_around', duration: 2 }] } }], [{ actor: 'listener', sourceIntentId: 'answer' }, { actor: 'bystander', sourceIntentId: 'look' }]), seconds, 'different NPCs share the reaction window; a parallel glance does not extend the reply');
  block.duration = seconds;
  assert.equal(elapsedSecondsForBlock(block), seconds);
  assert.notEqual(elapsedSecondsForBlock(block), 30);
});

test('explicit one-second, two-second and twenty-minute waits cannot be enlarged by compiler provenance or accepted reply metadata', () => {
  for (const [input, seconds] of [['等一秒', 1], ['等两秒', 2], ['等待二十分钟', 1200]] as const) {
    const block = normalizeTurnTiming([{ id: 'wait', kind: 'wait', duration: 30, waitOrigin: 'implicit_response' }], input)[0];
    assert.equal(block.waitOrigin, 'explicit_elapsed');
    assert.equal(waitPlanningSeconds(block), seconds);
    assert.equal(settledWaitSeconds(block, [{ npcId: 'n', reaction: { thought: null, intents: [{ id: 'speech', type: 'speech', content: '很长的发言。'.repeat(30) }] } }], [{ actor: 'n', sourceIntentId: 'speech' }]), seconds);
  }
});

test('twenty minute wait encoded as a physical action becomes a 1200-second wait, preserving event order', () => {
  const normalized = normalizeTurnTiming([{ id: 'b', kind: 'normal', events: [speech('s1', '请坐。'), { id: 'w1', type: 'action', op: 'wait', duration: 20 }, speech('s2', '休息好了？')] }, { id: 'tail', kind: 'wait' }], '我说请坐，等待二十分钟，再问休息好了没。');
  assert.deepEqual(normalized.map(block => block.kind), ['normal', 'wait', 'normal']);
  assert.equal(normalized[1].duration, 1200);
  assert.equal(calculateReactionBudget(normalized[1]).available_time, 1200);
  assert.equal(normalized[2].events?.[0].id, 's2');
});

test('serial actions add time while explicit parallel events share time, and clocks advance deterministically', () => {
  const events: GameEvent[] = [{ id: 'a', type: 'action', duration: 2 }, { id: 'b', type: 'action', duration: 3 }];
  assert.equal(eventsElapsedSeconds(events), 5);
  assert.equal(eventsElapsedSeconds([events[0], { ...events[1], parallelWith: ['a'] }]), 3);
  assert.equal(calculateReactionBudget({ id: 'b', kind: 'normal', events: [{ id: 'a', type: 'action', duration: 1 }] }).available_time, 1);
  assert.equal(advanceClock('0842-12-31T23:50:00', 1200), '0843-01-01T00:10:00');
  assert.equal(advanceClock('2026-09-12T12:00:00', 1.5), '2026-09-12T12:00:01.500');
  assert.equal(advanceClock('2026-09-12T12:00:00Z', 2), '2026-09-12T12:00:02.000Z');
  assert.throws(() => advanceClock('not a date', 2));
  assert.throws(() => advanceClock('2026-09-12T12:00:00', Infinity));
});

test('calling a missing or absent character preserves the call without addressing or focusing any unavailable NPC', () => {
  const world: WorldState = { clock: '2026-01-01T00:00:00', scene: { location: 'room', weather: 'clear', lighting: 'day' }, entities: { player: { type: 'character', location: 'room' }, present: { type: 'character', location: 'room' }, absent: { type: 'character', location: 'far_away' } }, rules: {}, conversation: { focusNpcId: 'present' } };
  for (const target of ['ghost', 'absent']) {
    const events = resolveSpeechTargets([{ ...speech('call', '你在吗？'), target }], world);
    assert.equal(events[0].target, target);
    assert.equal(events[0].details?.targetUnavailable, true);
    assert.equal(interactionFor(target, events).addressed, false);
    assert.equal(interactionFor('present', events).addressed, false);
    updateConversation(world, [{ id: 'c', type: 'player_speech', actor: 'player', target, blockId: 'b' }]);
    assert.equal(world.conversation?.focusNpcId, 'present');
    assert.equal(world.entities.ghost, undefined);
  }
  assert.throws(() => resolveSpeechTargets([{ ...speech('forged', 'hello'), actor: 'ghost' }], world), /cannot create NPC events/);
});
