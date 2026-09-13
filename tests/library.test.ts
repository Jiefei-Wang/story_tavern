import test from 'node:test';
import assert from 'node:assert/strict';
import { createStorySave, defaultLibrary, validateLibrary } from '../src/engine/library/Library';
import { validateTextWorld } from '../src/engine/text/Documents';
import { TextProcessor } from '../src/engine/text/Processor';
import { ROUTED_AGENTS } from '../src/engine/text/Agents';
import { AgentRuntime } from '../src/engine/runtime/AgentRuntime';
import { storageService } from '../src/db/storage';
import { useLibraryStore } from '../src/stores/useLibraryStore';
import { useGameStore } from '../src/stores/useGameStore';
import { useAgentStore } from '../src/stores/useAgentStore';
import { useAgentGroupStore } from '../src/stores/useAgentGroupStore';
import { useBackendStore } from '../src/stores/useBackendStore';
import { readAssistantConfiguration, executeAssistantChanges, planAssistantChanges, type Resources } from '../src/engine/assistantConfiguration';
import { assistantReplySchema } from '../src/engine/modelAssistant';

test('library rejects invalid references, duplicate casts, blank world text and mismatched IDs', () => {
  for (const mutate of [
    (l: ReturnType<typeof defaultLibrary>) => { delete l.worlds.harbor; },
    (l: ReturnType<typeof defaultLibrary>) => { delete l.characters.player; },
    (l: ReturnType<typeof defaultLibrary>) => { l.stories.harbor_story.supportingIds.push('erin'); },
    (l: ReturnType<typeof defaultLibrary>) => { l.stories.harbor_story.supportingIds.push('player'); },
    (l: ReturnType<typeof defaultLibrary>) => { l.stories.harbor_story.supportingIds.push('missing'); },
    (l: ReturnType<typeof defaultLibrary>) => { l.worlds.harbor.description = ' '; },
    (l: ReturnType<typeof defaultLibrary>) => { l.characters.player.id = '../player'; },
    (l: ReturnType<typeof defaultLibrary>) => { l.selectedStoryId = 'missing'; },
  ]) { const library = defaultLibrary(); mutate(library); assert.throws(() => validateLibrary(library)); }
  const solo = defaultLibrary(); solo.stories.harbor_story.playerId = 'erin'; solo.stories.harbor_story.supportingIds = [];
  validateLibrary(solo); const save = createStorySave(solo, 'harbor_story', 'test');
  assert.equal(save.textWorld!.playerId, 'erin'); assert.deepEqual(save.textWorld!.characters, ['erin']); validateTextWorld(save.textWorld!);
});

test('new games snapshot definitions and opening; library changes and deletion cannot mutate their progress', async () => {
  const library = defaultLibrary(), save = createStorySave(library, 'harbor_story', 'test');
  const original = structuredClone(save);
  library.worlds.harbor.description = '新世界'; library.characters.erin.setting = '新的角色'; delete library.stories.harbor_story; library.selectedStoryId = null;
  assert.deepEqual(save, original); assert.equal(save.turns[0].playerInput, '');
  await storageService.commitTextGame(save, null);
  assert.deepEqual((await storageService.getSaves()).find(s => s.id === save.id), original);
  await storageService.deleteGame(save.id);
});

test('actual HTTP prompt includes configured definitions, opening and input, excluding display metadata', async t => {
  const library = defaultLibrary();
  library.worlds.harbor.name = 'WORLD_NAME_NOT_SENT'; library.worlds.harbor.summary = 'WORLD_SUMMARY_NOT_SENT'; library.worlds.harbor.image = 'https://example.com/IMAGE_NOT_SENT.png';
  library.stories.harbor_story.name = 'STORY_NAME_NOT_SENT'; library.stories.harbor_story.summary = 'STORY_SUMMARY_NOT_SENT';
  library.characters.player.details = 'PLAYER_DETAIL_INCLUDED';
  const save = createStorySave(library, 'harbor_story', 'test');
  const sent: any[] = [];
  t.mock.method(globalThis, 'fetch', async (_url: unknown, options: any) => {
    const body = JSON.parse(options.body); sent.push(body);
    const system = body.messages[0].content;
    const output = system.includes('只选择本轮') ? { characters: ['erin'], new_characters: [], instructions: '回应' } : system.includes('一次共同设计') ? { characters: [{ character_id: 'erin', thought: null, expression_outline: '你好。', action: null, end_state: { summary: '已经问候' } }] } : '艾琳说：“你好。”';
    return new Response(JSON.stringify({ choices: [{ message: { content: typeof output === 'string' ? output : JSON.stringify(output) } }] }), { headers: { 'content-type': 'application/json' } });
  });
  const agents = ROUTED_AGENTS.map(a => ({ ...a, messages: [...a.messages, { id: 'stale_task', role: 'user' as const, content: 'OLD_TEMPLATE_NOT_SENT' }] }));
  const runtime = new AgentRuntime();
  await new TextProcessor(o => runtime.runAgent(o)).execute(save, '你好', { agents, activeGroupId: 'test', groups: [{ id: 'test', name: 'test', bindings: agents.map(a => ({ agentId: a.id, backendId: 'test', model: 'model' })) }], backends: [{ id: 'test', name: 'test', baseUrl: 'http://localhost:1234/v1', authType: 'none', customHeaders: {}, enabled: true, timeoutMs: 1000, maxConcurrency: 1 }], mockMode: false, recentTurns: save.turns });
  assert.equal(sent.length, 3);
  for (const body of sent) {
    assert.deepEqual(body.messages.map((m: any) => m.role), ['user']);
    const prompt = body.messages[0].content;
    assert(prompt.includes('PLAYER_DETAIL_INCLUDED'));
    assert(prompt.includes(library.worlds.harbor.description));
    assert(prompt.includes('艾琳'));
    assert(prompt.includes(library.stories.harbor_story.opening));
    assert(prompt.includes('用户原始输入：\n你好'));
    assert(!JSON.stringify(body.messages).includes('NOT_SENT'));
  }
});

test('assistant library patches are durable, atomic across references, preserve unknowns and never overwrite saves or credentials', async t => {
  const values = new Map<string, string>();
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: (k: string) => values.get(k) ?? null, setItem: (k: string, v: string) => values.set(k, v), removeItem: (k: string) => values.delete(k) } });
  try {
    const data = defaultLibrary(); data.characters.erin.future = { keep: true }; data.future = { untouched: 42 };
    await storageService.commitLibrary({ revision: 0, data }, -1); await useLibraryStore.getState().load();
    useAgentStore.setState({ agents: ROUTED_AGENTS });
    useAgentGroupStore.setState({ groups: [{ id: 'test', name: 'test', bindings: [] }], activeGroupId: 'test' });
    useBackendStore.setState({ backends: [] });
    const dirty = createStorySave(data, 'harbor_story', 'test'); dirty.name = '未保存进度';
    useGameStore.setState({ saves: [dirty], activeSave: dirty, isExecuting: false });
    values.set('secret_backend_test', 'DO_NOT_EXPOSE'); values.set('model_assistant_model', 'my-model');
    const patch = (patches: any[]) => assistantReplySchema.parse({ reply: '', actions: [{ type: 'patch_config', resource: 'library', patches }] });
    const change = patch([{ op: 'replace', path: '/characters/erin/name', value: '新名字' }]);
    const reports: string[] = [];
    const snapshot = readAssistantConfiguration();
    assert(!JSON.stringify(snapshot).includes('DO_NOT_EXPOSE'));
    await executeAssistantChanges(change, snapshot, new AbortController().signal, s => reports.push(s));
    assert.equal(reports.length, 1);
    const persisted = (await storageService.getLibrary())!;
    assert.equal(persisted.data.characters.erin.name, '新名字');
    assert.deepEqual(persisted.data.characters.erin.future, { keep: true }); assert.deepEqual(persisted.data.future, { untouched: 42 });
    assert.equal(useGameStore.getState().activeSave, dirty); assert.equal(useGameStore.getState().saves[0], dirty);
    assert.equal(values.get('secret_backend_test'), 'DO_NOT_EXPOSE'); assert.equal(values.get('model_assistant_model'), 'my-model');
    await assert.rejects(executeAssistantChanges(change, snapshot, new AbortController().signal, () => {}), /配置已变化/);
    const invalid = patch([{ op: 'remove', path: '/characters/erin' }]);
    assert.throws(() => planAssistantChanges(invalid, readAssistantConfiguration().resources as Resources), /配角不存在/);
    // A single final-state patch removes a reference and its object together.
    await executeAssistantChanges(patch([{ op: 'replace', path: '/stories/harbor_story/supportingIds', value: [] }, { op: 'remove', path: '/characters/erin' }]), readAssistantConfiguration(), new AbortController().signal, () => {});
    assert.equal((await storageService.getLibrary())!.data.characters.erin, undefined);
    const current = readAssistantConfiguration(), before = values.get('story_tavern_library_v2');
    const worldChange = patch([{ op: 'replace', path: '/worlds/harbor/description', value: '改变的世界' }]);
    const controller = new AbortController(); controller.abort();
    const failures: string[] = [];
    await assert.rejects(executeAssistantChanges(worldChange, current, controller.signal, s => failures.push(s)));
    assert.equal(values.get('story_tavern_library_v2'), before); assert.equal(failures.length, 0);
    const originalCommit = storageService.commitLibrary;
    t.mock.method(storageService, 'commitLibrary', async () => { throw new Error('模拟落盘失败'); });
    await assert.rejects(executeAssistantChanges(worldChange, current, new AbortController().signal, s => failures.push(s)), /落盘失败/);
    assert.deepEqual(readAssistantConfiguration(), current); assert.equal(failures.length, 0);
    t.mock.restoreAll();
    assert.equal(storageService.commitLibrary, originalCommit);
    const record = (await storageService.getLibrary())!;
    const concurrent = await Promise.allSettled([storageService.commitLibrary({ ...record, revision: record.revision + 1 }, record.revision), storageService.commitLibrary({ ...record, revision: record.revision + 1 }, record.revision)]);
    assert.equal(concurrent.filter(r => r.status === 'fulfilled').length, 1);
  } finally { if (descriptor) Object.defineProperty(globalThis, 'localStorage', descriptor); else Reflect.deleteProperty(globalThis, 'localStorage'); }
});

test('initialization removes pre-library saves but retains new saves, library edits and backend preferences', async () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage'), values = new Map<string, string>();
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: (k: string) => values.get(k) ?? null, setItem: (k: string, v: string) => values.set(k, v), removeItem: (k: string) => values.delete(k) } });
  try {
    const save = createStorySave(defaultLibrary(), 'harbor_story', 'group_quality');
    values.set('story_tavern_saves', JSON.stringify([{ ...save, id: 'old', textWorld: undefined }, save]));
    values.set('model_assistant_model', 'preserve');
    await storageService.initDatabase();
    assert.deepEqual((await storageService.getSaves()).map(s => s.id), [save.id]);
    const record = (await storageService.getLibrary())!; record.data.stories = {}; record.data.selectedStoryId = null;
    await storageService.commitLibrary({ ...record, revision: record.revision + 1 }, record.revision);
    await storageService.initDatabase();
    assert.deepEqual((await storageService.getLibrary())!.data.stories, {});
    assert.equal(values.get('model_assistant_model'), 'preserve');
  } finally { if (descriptor) Object.defineProperty(globalThis, 'localStorage', descriptor); else Reflect.deleteProperty(globalThis, 'localStorage'); }
});
