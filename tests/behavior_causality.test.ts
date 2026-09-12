import test from 'node:test';
import assert from 'node:assert/strict';
import type { CharacterStateUpdate, GameEvent, GameTurn, NPCExperience, NPCObservation, NPCReactionResult } from '../src/types';
import { captureNpcObservations, recentNpcExperiences, stateUpdateEvidenceError } from '../src/engine/world/ReactionEvidence';
import { materializeCharacterEffects } from '../src/engine/world/CharacterEffects';
import { sanitizeNpcObservations } from '../src/engine/world/WorldViews';
import { applyPatches } from '../src/engine/world/PatchEngine';
import { definition, textField, worldFor } from './fixtures/characterWorlds';
import { BUILTIN_AGENTS, DEFAULT_BACKENDS, DEFAULT_AGENT_GROUPS, INITIAL_DEMO_SAVE } from '../src/db/initialData';
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

test('new role migration and assistant edits preserve custom roles, bindings, future fields, preferences and dirty saves', async () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const values = new Map<string, string>();
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value), removeItem: (key: string) => values.delete(key) } });
  const originalStoreStates = [useAgentStore.getState(), useAgentGroupStore.getState(), useBackendStore.getState(), useGameStore.getState(), useSettingsStore.getState()] as const;
  try {
    const storage = new StorageService();
    const custom = { ...structuredClone(BUILTIN_AGENTS.find(a => a.id === 'action_adjudicator')!), name: '作者自定义裁定器', messages: [{ id: 'custom_msg', role: 'system' as const, content: '保留作者已有提示。' }], futureData: { retained: true } };
    const agents = [...BUILTIN_AGENTS.filter(a => !['action_adjudicator', 'narration_auditor', 'character_change_auditor'].includes(a.id)), custom];
    const resolverBinding = { agentId: 'world_resolver', backendId: DEFAULT_BACKENDS[0].id, model: 'custom-resolver-model', overrides: { temperature: 0.37, maxTokens: 999 }, futureBinding: 'preserve' };
    const narratorBinding = { agentId: 'narrator', backendId: DEFAULT_BACKENDS[0].id, model: 'custom-narrator-model', overrides: { temperature: 0.21 } };
    const existingNewBinding = { ...resolverBinding, agentId: 'action_adjudicator', model: 'already-customized-model' };
    const groups = [{ id: 'legacy_a', name: '已有自定义新角色', bindings: [resolverBinding, narratorBinding, existingNewBinding], futureGroup: { retained: true } }, { id: 'legacy_b', name: '需要补充绑定', bindings: [resolverBinding, narratorBinding] }];
    const diskSave = { ...structuredClone(INITIAL_DEMO_SAVE), activeAgentGroupId: 'legacy_a' };
    const dirty = { ...structuredClone(diskSave), name: '未保存进度', turns: diskSave.turns.map(t => ({ ...t, narratorOutput: '尚未落盘的历史正文。' })) };
    values.set('story_tavern_agents', JSON.stringify(agents));
    values.set('story_tavern_agent_groups', JSON.stringify(groups));
    values.set('story_tavern_backends', JSON.stringify(DEFAULT_BACKENDS));
    values.set('story_tavern_saves', JSON.stringify([diskSave]));
    values.set('story_tavern_settings', JSON.stringify({ ...DEFAULT_SETTINGS, characterGenerationMigrated: true, behaviorGroundingMigrated: true, behaviorGroundingVersion: 1, futureSetting: 'keep' }));
    values.set('model_assistant_backend', DEFAULT_BACKENDS[0].id);
    values.set('model_assistant_model', 'independent-assistant-model');
    values.set('secret_test_backend', 'SYNTHETIC_SECRET_DO_NOT_EXPOSE');
    useGameStore.setState({ saves: [dirty], activeSave: dirty, isExecuting: false });
    await storage.initDatabase();
    assert.equal(useGameStore.getState().activeSave, dirty);
    assert.equal(values.get('story_tavern_saves'), JSON.stringify([diskSave]));
    assert.deepEqual((await storage.getAgents()).find(a => a.id === custom.id), custom);
    assert.ok((await storage.getAgents()).some(a => a.id === 'narration_auditor'));
    assert.ok((await storage.getAgents()).some(a => a.id === 'character_change_auditor'));
    assert.equal((await storage.getSettings()).behaviorGroundingVersion, 2);
    assert.equal((await storage.getSettings() as any).futureSetting, 'keep');
    const migratedGroups = await storage.getAgentGroups();
    assert.deepEqual(migratedGroups[0].bindings.find(b => b.agentId === 'action_adjudicator'), existingNewBinding);
    assert.deepEqual(migratedGroups[1].bindings.find(b => b.agentId === 'action_adjudicator'), { ...resolverBinding, agentId: 'action_adjudicator' });
    assert.deepEqual(migratedGroups[1].bindings.find(b => b.agentId === 'narration_auditor'), { ...narratorBinding, agentId: 'narration_auditor' });
    assert.deepEqual(migratedGroups[1].bindings.find(b => b.agentId === 'character_change_auditor'), { ...resolverBinding, agentId: 'character_change_auditor' });
    assert.deepEqual((migratedGroups[0] as any).futureGroup, { retained: true });
    const once = values.get('story_tavern_agent_groups');
    await storage.initDatabase();
    assert.equal(values.get('story_tavern_agent_groups'), once);
    useAgentStore.setState({ agents: await storage.getAgents() });
    useAgentGroupStore.setState({ groups: migratedGroups, activeGroupId: 'legacy_a' });
    useBackendStore.setState({ backends: await storage.getBackends() });
    useSettingsStore.setState({ settings: await storage.getSettings() });
    const snapshot = readAssistantConfiguration();
    assert.equal((snapshot.resources as Resources).agents.action_adjudicator.name, custom.name);
    assert.ok((snapshot.resources as Resources).agents.narration_auditor);
    assert.ok(!JSON.stringify(snapshot).includes('SYNTHETIC_SECRET_DO_NOT_EXPOSE'));
    const reply = assistantReplySchema.parse({ reply: '', actions: [{ type: 'patch_config', resource: 'agents', patches: [{ op: 'replace', path: '/action_adjudicator/messages/0/content', value: '作者调整后的裁定提示。' }, { op: 'replace', path: '/narration_auditor/name', value: '旁白事实审核' }, { op: 'replace', path: '/character_change_auditor/name', value: '人物变化独立复核' }] }] });
    const reports: string[] = [];
    await executeAssistantChanges(reply, snapshot, new AbortController().signal, message => reports.push(message));
    assert.equal((await storageService.getAgents()).find(a => a.id === 'action_adjudicator')!.messages[0].content, '作者调整后的裁定提示。');
    assert.deepEqual((await storageService.getAgents()).find(a => a.id === 'action_adjudicator')!.defaults, custom.defaults);
    assert.deepEqual((useAgentStore.getState().agents.find(a => a.id === 'action_adjudicator') as any).futureData, custom.futureData);
    assert.equal(useAgentStore.getState().agents.find(a => a.id === 'narration_auditor')!.name, '旁白事实审核');
    assert.equal(useAgentStore.getState().agents.find(a => a.id === 'character_change_auditor')!.name, '人物变化独立复核');
    assert.equal((await storageService.getAgents()).find(a => a.id === 'character_change_auditor')!.name, '人物变化独立复核');
    assert.ok(reports.length >= 2);
    assert.equal(useGameStore.getState().activeSave, dirty);
    assert.equal(values.get('story_tavern_saves'), JSON.stringify([diskSave]));
    assert.equal(values.get('model_assistant_model'), 'independent-assistant-model');
    assert.equal(values.get('secret_test_backend'), 'SYNTHETIC_SECRET_DO_NOT_EXPOSE');
    const current = readAssistantConfiguration();
    const anotherEdit = assistantReplySchema.parse({ reply: '', actions: [{ type: 'patch_config', resource: 'agents', patches: [{ op: 'replace', path: '/narration_auditor/name', value: '尚未保存的新名称' }] }] });
    const cancelled = new AbortController(); cancelled.abort();
    await assert.rejects(executeAssistantChanges(anotherEdit, current, cancelled.signal, () => {}));
    await assert.rejects(executeAssistantChanges(anotherEdit, snapshot, new AbortController().signal, () => {}), /配置已变化/);
    const storedAgentsBeforeFailure = values.get('story_tavern_agents');
    const originalSaveAgent = storageService.saveAgent;
    const failureReports: string[] = [];
    try {
      storageService.saveAgent = async () => { throw new Error('synthetic write failure'); };
      await assert.rejects(executeAssistantChanges(anotherEdit, current, new AbortController().signal, message => failureReports.push(message)), /synthetic write failure/);
    } finally { storageService.saveAgent = originalSaveAgent; }
    assert.equal(values.get('story_tavern_agents'), storedAgentsBeforeFailure);
    assert.equal(useAgentStore.getState().agents.find(a => a.id === 'narration_auditor')!.name, '旁白事实审核');
    assert.ok(!failureReports.some(message => message.includes('已保存')), 'failed persistence must not report success');
    const illegal = assistantReplySchema.parse({ reply: '', actions: [{ type: 'patch_config', resource: 'groups', patches: [{ op: 'replace', path: '/legacy_a/bindings/0/agentId', value: 'unknown_new_role' }] }] });
    assert.throws(() => planAssistantChanges(illegal, current.resources as Resources));
    const marker = assistantReplySchema.parse({ reply: '', actions: [{ type: 'patch_config', resource: 'settings', patches: [{ op: 'replace', path: '/behaviorGroundingMigrated', value: false }] }] });
    assert.throws(() => planAssistantChanges(marker, current.resources as Resources), /内部设置|迁移/);
    const versionMarker = assistantReplySchema.parse({ reply: '', actions: [{ type: 'patch_config', resource: 'settings', patches: [{ op: 'replace', path: '/behaviorGroundingVersion', value: 1 }] }] });
    assert.throws(() => planAssistantChanges(versionMarker, current.resources as Resources), /内部设置|迁移/);
    await storage.saveSettings({ ...await storage.getSettings(), behaviorGroundingVersion: 3 });
    await storage.initDatabase();
    assert.equal((await storage.getSettings()).behaviorGroundingVersion, 3, 'a newer migration version must not be downgraded');
    assert.equal((await storage.getAgents()).find(a => a.id === 'character_change_auditor')!.name, '人物变化独立复核', 'versioned init must preserve an existing custom auditor');
  } finally {
    useAgentStore.setState(originalStoreStates[0]); useAgentGroupStore.setState(originalStoreStates[1]); useBackendStore.setState(originalStoreStates[2]); useGameStore.setState(originalStoreStates[3]); useSettingsStore.setState(originalStoreStates[4]);
    if (descriptor) Object.defineProperty(globalThis, 'localStorage', descriptor); else Reflect.deleteProperty(globalThis, 'localStorage');
  }
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
