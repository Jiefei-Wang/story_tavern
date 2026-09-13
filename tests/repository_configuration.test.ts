import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { createServer } from 'vite';
import defaults from '../src/db/repositoryDefaults.json';
import { repositoryConfigPlugin, readRepositoryFile, saveRepositoryFile } from '../scripts/repository-config-plugin';
import { validateRepositoryConfiguration } from '../src/db/repositoryConfiguration';
import { useRepositoryStore } from '../src/stores/useRepositoryStore';
import { useAgentStore } from '../src/stores/useAgentStore';
import { useAgentGroupStore } from '../src/stores/useAgentGroupStore';
import { useBackendStore } from '../src/stores/useBackendStore';
import { useGameStore } from '../src/stores/useGameStore';
import { storageService } from '../src/db/storage';
import { DEFAULT_BACKENDS } from '../src/db/initialData';
import { executeAssistantChanges, planAssistantChanges, readAssistantConfiguration } from '../src/engine/assistantConfiguration';
import { assistantReplySchema } from '../src/engine/modelAssistant';

test('repository validation rejects invalid parameters, references, unsafe keys and retired/core deletion; keeps future data', () => {
  const base = structuredClone(defaults) as any;
  base.future = { keep: true }; base.agents.text_router.defaults.future = 12;
  const original = JSON.stringify(base); validateRepositoryConfiguration(base); assert.equal(JSON.stringify(base), original);
  for (const change of [
    (d: any) => { d.agents.text_router.defaults.temperature = 9; },
    (d: any) => { d.agents.text_router.prompt = '{{missing}}'; },
    (d: any) => { d.groups.group_fast.bindings[0].agentId = 'missing'; },
    (d: any) => { d.groups.group_fast.bindings[0].backendId = 'personal'; },
    (d: any) => { d.groups.group_fast.bindings.push(d.groups.group_fast.bindings[0]); },
    (d: any) => { d.agents.text_router.secretRef = 'private'; },
    (d: any) => { d.agents.text_router.defaults.extraBody = { Authorization: 'private' }; },
    (d: any) => { d.future = JSON.parse('{"__proto__":{}}'); },
    (d: any) => { delete d.agents.text_router; },
    (d: any) => { delete d.groups.group_fast; },
    (d: any) => { d.agents.text_designer = { ...d.agents.text_router, id: 'text_designer' }; },
  ]) { const data = structuredClone(base); change(data); assert.throws(() => validateRepositoryConfiguration(data)); }
});

test('repository HTTP + assistant writes real isolated file, separates local data; cancellation/conflicts/failure receipts and explicit apply', async () => {
  const parent = path.resolve('.tmp/repository-config'); await mkdir(parent, { recursive: true });
  const root = await mkdtemp(path.join(parent, 'test-')); const file = path.join(root, 'src/db/repositoryDefaults.json');
  await mkdir(path.dirname(file), { recursive: true });
  const data = structuredClone(defaults) as any;
  data.agents.text_router.future = { keep: true };
  await writeFile(file, JSON.stringify(data));
  const server = await createServer({ root, configFile: false, plugins: [repositoryConfigPlugin()], server: { host: '127.0.0.1', port: 0 }, logLevel: 'silent' });
  const oldFetch = globalThis.fetch; const oldStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const stores = [useRepositoryStore, useAgentStore, useAgentGroupStore, useBackendStore, useGameStore] as const;
  const states = stores.map(s => s.getState());
  const memory = new Map<string, string>();
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: (k: string) => memory.get(k) ?? null, setItem: (k: string, v: string) => memory.set(k, v), removeItem: (k: string) => memory.delete(k) } });
  try {
    await server.listen(); const address = server.httpServer!.address() as { port: number };
    const url = `http://127.0.0.1:${address.port}/__story_repository`;
    globalThis.fetch = (input, init) => oldFetch(input === '/__story_repository' ? url : input, init);
    assert.equal((await oldFetch(url)).status, 403);
    assert.equal((await oldFetch(url, { headers: { 'X-Story-Local': '1', Origin: 'https://evil.test' } })).status, 403);
    assert.equal((await oldFetch(url, { method: 'DELETE', headers: { 'X-Story-Local': '1' } })).status, 405);
    await storageService.initDatabase();
    await useAgentStore.getState().loadAgents(); await useAgentGroupStore.getState().loadGroups();
    useBackendStore.setState({ backends: structuredClone(DEFAULT_BACKENDS) });
    useGameStore.setState({ saves: [], activeSave: null, isExecuting: false });
    await useRepositoryStore.getState().load();
    const patch = (name: string) => assistantReplySchema.parse({ reply: '', actions: [{ type: 'patch_config', resource: 'repositoryDefaults', patches: [{ op: 'replace', path: '/data/agents/text_router/name', value: name }, { op: 'replace', path: '/data/groups/group_fast/bindings/0/model', value: 'assistant/model' }] }] });
    let snapshot = readAssistantConfiguration(); const localBefore = new Map(memory); const reports: string[] = [];
    const cancelled = new AbortController(); cancelled.abort();
    await assert.rejects(executeAssistantChanges(patch('cancelled'), snapshot, cancelled.signal, m => reports.push(m)));
    assert.equal((await readRepositoryFile(file)).data.agents.text_router.name, defaults.agents.text_router.name);
    await executeAssistantChanges(patch('仓库路由'), snapshot, new AbortController().signal, m => reports.push(m));
    assert.equal((await readRepositoryFile(file)).data.agents.text_router.name, '仓库路由');
    assert.equal(useRepositoryStore.getState().draft?.agents.text_router.name, '仓库路由');
    assert.equal((await readRepositoryFile(file)).data.groups.group_fast.bindings[0].model, 'assistant/model');
    assert.deepEqual(((await readRepositoryFile(file)).data.agents.text_router as any).future, { keep: true });
    assert.deepEqual(memory, localBefore); assert.equal(reports.length, 1);
    await assert.rejects(executeAssistantChanges(patch('stale'), snapshot, new AbortController().signal, () => {}), /配置已变化/);
    snapshot = readAssistantConfiguration();
    useRepositoryStore.getState().edit(d => { d.groups.group_fast.name = '未保存草稿'; });
    await assert.rejects(executeAssistantChanges(patch('clobber'), snapshot, new AbortController().signal, () => {}), /未保存/);
    await useRepositoryStore.getState().load();
    snapshot = readAssistantConfiguration();
    const disk = await readRepositoryFile(file); disk.data.groups.group_fast.name = '外部修改';
    await saveRepositoryFile(file, disk.data, disk.revision);
    reports.length = 0;
    await assert.rejects(executeAssistantChanges(patch('conflict'), snapshot, new AbortController().signal, m => reports.push(m)), /文件已变化/);
    assert.equal(reports.length, 0);
    await useRepositoryStore.getState().load();
    snapshot = readAssistantConfiguration();
    globalThis.fetch = async () => new Response(JSON.stringify({ error: 'synthetic disk failure' }), { status: 500 });
    await assert.rejects(executeAssistantChanges(patch('failure'), snapshot, new AbortController().signal, m => reports.push(m)), /synthetic disk failure/);
    assert.equal(reports.length, 0);
    globalThis.fetch = (input, init) => oldFetch(input === '/__story_repository' ? url : input, init);
    const protectedRevision = assistantReplySchema.parse({ reply: '', actions: [{ type: 'patch_config', resource: 'repositoryDefaults', patches: [{ op: 'replace', path: '/revision', value: 'fake' }] }] });
    assert.throws(() => planAssistantChanges(protectedRevision, snapshot.resources as any), /只读/);
    // Apply uses the ordinary persistence path, without touching saves, secrets or selection.
    const router = { ...useAgentStore.getState().agents[0], localFuture: 'keep' };
    await useAgentStore.getState().saveAgent(router);
    memory.set('secret_test', 'synthetic-secret'); memory.set('model_assistant_model', 'independent');
    memory.set('story_tavern_saves', JSON.stringify([{ id: 'untouched', turns: ['history'] }]));
    const dirtySave = { id: 'dirty', name: '未保存进度' } as any;
    useGameStore.setState({ activeSave: dirtySave, saves: [dirtySave] });
    const protectedMemory = new Map(memory);
    await useRepositoryStore.getState().apply();
    assert.equal((await storageService.getAgents()).find(a => a.id === 'text_router')?.name, '仓库路由');
    assert.equal(((await storageService.getAgents()).find(a => a.id === router.id) as any)?.localFuture, 'keep');
    assert.equal(useGameStore.getState().activeSave, dirtySave);
    for (const [key, value] of protectedMemory) if (!['story_tavern_agents', 'story_tavern_agent_groups'].includes(key)) assert.equal(memory.get(key), value, key);
    const record = await readRepositoryFile(file);
    const pending = path.join(root, '.tmp/repository-config/repositoryDefaults.pending');
    await writeFile(pending, 'other writer');
    await assert.rejects(saveRepositoryFile(file, record.data, record.revision), /EEXIST/);
    assert.equal(await readFile(pending, 'utf8'), 'other writer');
  } finally {
    globalThis.fetch = oldFetch;
    stores.forEach((s, i) => (s.setState as any)(states[i]));
    if (oldStorage) Object.defineProperty(globalThis, 'localStorage', oldStorage); else delete (globalThis as any).localStorage;
    await server.close();
    assert.ok(root.startsWith(parent + path.sep)); await rm(root, { recursive: true, force: true });
  }
});
