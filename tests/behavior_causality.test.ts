import { createStorySave, defaultLibrary } from '../src/engine/library/Library';
import test from 'node:test';
import assert from 'node:assert/strict';
import type { CharacterStateUpdate, GameEvent, GameTurn, NPCExperience, NPCObservation, NPCReactionResult } from '../src/types';
import { captureNpcObservations, recentNpcExperiences, stateUpdateEvidenceError } from '../src/engine/world/ReactionEvidence';
import { materializeCharacterEffects } from '../src/engine/world/CharacterEffects';
import { sanitizeNpcObservations } from '../src/engine/world/WorldViews';
import { applyPatches } from '../src/engine/world/PatchEngine';
import { definition, textField, worldFor } from './fixtures/characterWorlds';
import { BUILTIN_AGENTS, DEFAULT_BACKENDS, DEFAULT_AGENT_GROUPS, INITIAL_DEMO_SAVE } from './fixtures/legacyInitialData';
import { MockSimulator } from '../src/engine/runtime/MockSimulator';
import { DEFAULT_SETTINGS, StorageService, storageService } from '../src/db/storage';
import { executeAssistantChanges, planAssistantChanges, readAssistantConfiguration, type Resources } from '../src/engine/assistantConfiguration';
import { assistantReplySchema } from '../src/engine/modelAssistant';
import { useAgentStore } from '../src/stores/useAgentStore';
import { useAgentGroupStore } from '../src/stores/useAgentGroupStore';
import { useBackendStore } from '../src/stores/useBackendStore';
import { useGameStore } from '../src/stores/useGameStore';
import { useSettingsStore } from '../src/stores/useSettingsStore';

const observation = (id: string, content = '玩家作出一项声明。'): NPCObservation => ({ eventId: id, type: 'speech', actor: 'player', saw: true, heard: true, content });
const experience = (id: string, path?: string): NPCExperience => ({ id, observation: observation(id), appliedStatePaths: path ? [path] : [] });
const turn = (id: string, status: 'success' | 'error', entries: Record<string, NPCExperience[]>): GameTurn => ({ ...structuredClone(INITIAL_DEMO_SAVE.turns[0]), id, status, npcExperiences: entries });

test('recent NPC experience is limited to the selected NPC and successful turn branch, and is returned by value', () => {
  const history = [turn('t1', 'success', { erin: [experience('erin_1')], guard: [experience('guard_secret')] }), turn('failed', 'error', { erin: [experience('rolled_back')] }), turn('t2', 'success', { erin: [experience('erin_2')] })];
  history[2].variations = [turn('unselected', 'success', { erin: [experience('other_branch')] })];
  assert.deepEqual(recentNpcExperiences(history, 'erin').map(e => e.id), ['erin_1', 'erin_2']);
  assert.deepEqual(recentNpcExperiences(history, 'erin', 1).map(e => e.id), ['erin_2']);
  assert.deepEqual(recentNpcExperiences(history, 'missing'), []);
  const copied = recentNpcExperiences(history, 'erin');
  copied[0].observation.content = 'mutated';
  assert.notEqual(history[0].npcExperiences!.erin[0].observation.content, 'mutated');
});

test('same source and field cannot settle twice; a distinct observed cause or a different field may settle', () => {
  const update: CharacterStateUpdate = { path: 'attributes.memories', op: 'append', value: '新观察', sourceEventIds: ['e1'], reason: '听到了新的事实' };
  const prior = [experience('e1', 'attributes.memories')];
  assert.match(stateUpdateEvidenceError(update, [observation('e1')], prior) || '', /同一经历/);
  assert.equal(stateUpdateEvidenceError({ ...update, path: 'attributes.mood' }, [observation('e1')], prior), null);
  assert.equal(stateUpdateEvidenceError({ ...update, sourceEventIds: ['e2'] }, [observation('e2')], prior), null);
  assert.match(stateUpdateEvidenceError({ ...update, sourceEventIds: ['someone_else_secret'] }, [observation('e2')], []) || '', /不可感知/);
  assert.match(stateUpdateEvidenceError({ ...update, sourceEventIds: [] }, [observation('e2')], []) || '', /sourceEventIds/);
});

test('an unperceived event ID alone is not evidence for a character update', () => {
  const update: CharacterStateUpdate = { path: 'attributes.memories', op: 'append', value: '不能知道', sourceEventIds: ['hidden'] };
  assert.ok(stateUpdateEvidenceError(update, [{ eventId: 'hidden', saw: false, heard: false }], []), 'both-false observations must not authorize effects');
});

test('capturing observations deduplicates event identity and cannot alias the source record', () => {
  const entries: Record<string, NPCExperience[]> = {};
  const observed = observation('e1');
  captureNpcObservations(entries, 'erin', [observed, observed]);
  assert.equal(entries.erin.length, 1);
  observed.content = 'source changed';
  assert.notEqual(entries.erin[0].observation.content, 'source changed');
  captureNpcObservations(entries, 'guard', [observation('guard_event')]);
  assert.deepEqual(entries.erin.map(e => e.id), ['e1']);
});

test('whisper audience overrides a hallucinated heard=true while still allowing an onlooker to see the action', () => {
  const event: GameEvent = { id: 'whisper', type: 'speech', actor: 'player', target: 'amo', audibility: 'whisper', audience: ['amo'], content: '秘密口令是蓝鹭。' };
  const raw = [{ ...observation('whisper'), content: 'Perception forged content' }];
  const listener = sanitizeNpcObservations('amo', raw, [event]);
  const onlooker = sanitizeNpcObservations('ilian', raw, [event]);
  assert.equal(listener[0].content, event.content);
  assert.equal(onlooker[0].saw, true);
  assert.equal(onlooker[0].heard, false);
  assert.equal(onlooker[0].content, undefined);
  assert.equal(onlooker[0].actor, 'player');
  assert.equal(raw[0].content, 'Perception forged content');
  assert.deepEqual(sanitizeNpcObservations('brann', [{ eventId: 'whisper', saw: false, heard: true }], [event]), [], 'a corrected non-hearing, non-seeing observer must not retain a usable event');
});

const schema = definition([textField('memories', { default: '旧记录。', freedom: 'free', updatePolicy: 'append_only' })]);
const reactions: Array<{ npcId: string; reaction: NPCReactionResult }> = [{ npcId: 'erin', reaction: { thought: null, intents: [], stateUpdates: [{ path: 'attributes.memories', op: 'append', value: '新记录。', sourceEventIds: ['e1'] }] } }];

test('accepted text append is materialized by code without overwriting old content or mutating proposals', () => {
  const world = worldFor(schema);
  const before = structuredClone(world);
  const patches = materializeCharacterEffects({ patches: [], acceptedStateUpdates: [{ npcId: 'erin', updateIndex: 0 }] }, world, reactions, schema);
  const result = applyPatches(world, patches);
  assert.equal(result.success, true, result.error);
  assert.equal(result.newWorld.entities.erin.attributes!.memories, '旧记录。新记录。');
  assert.deepEqual(world, before);
  assert.equal(reactions[0].reaction.stateUpdates![0].value, '新记录。');
  assert.equal(result.newWorld.entities.player.attributes!.memories, '旧记录。');
});

test('unknown, fractional and duplicate accepted proposal references cannot create state changes', () => {
  const world = worldFor(schema);
  for (const accepted of [[{ npcId: 'erin', updateIndex: 7 }], [{ npcId: 'erin', updateIndex: 0.5 }], [{ npcId: 'missing', updateIndex: 0 }], [{ npcId: 'erin', updateIndex: 0 }, { npcId: 'erin', updateIndex: 0 }]]) {
    assert.throws(() => materializeCharacterEffects({ patches: [], acceptedStateUpdates: accepted }, world, reactions, schema), /未知|重复/);
  }
  assert.equal(world.entities.erin.attributes!.memories, '旧记录。');
});

test('resolver cannot combine accepted effects with handwritten character attributes, including whole-character overwrite', () => {
  const world = worldFor(schema);
  for (const patch of [
    { op: 'replace' as const, path: '/entities/erin/attributes/memories', value: 'overwritten' },
    { op: 'replace' as const, path: '/entities/erin', value: { ...world.entities.erin, attributes: { memories: 'overwritten' } } },
    { op: 'replace' as const, path: '/entities', value: world.entities },
  ]) assert.throws(() => materializeCharacterEffects({ patches: [patch], acceptedStateUpdates: [{ npcId: 'erin', updateIndex: 0 }] }, world, reactions, schema), /人物属性Patch|人物|双写/);
});

test('default groups independently bind the character auditor and mock returns only its audit protocol', () => {
  assert.equal(BUILTIN_AGENTS.filter(agent => agent.id === 'character_change_auditor').length, 1);
  for (const group of DEFAULT_AGENT_GROUPS) {
    const source = group.bindings.find(binding => binding.agentId === 'world_resolver')!;
    const auditors = group.bindings.filter(binding => binding.agentId === 'character_change_auditor');
    assert.equal(auditors.length, 1);
    assert.deepEqual(auditors[0], { ...source, agentId: 'character_change_auditor' });
    assert.notEqual(auditors[0], source);
  }
  assert.deepEqual(MockSimulator.simulate('character_change_auditor', {}), { valid: true, issues: [] });
});
