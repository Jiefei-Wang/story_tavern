import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_STORY_WORKFLOW, validateWorkflow, type Workflow } from '../src/engine/workflows/Workflow';
import { StoryWorkflow } from '../src/engine/workflows/StoryTurn';
import { createStorySave, defaultLibrary, getStoryWorkflow, validateLibrary } from '../src/engine/library/Library';
import { useLibraryStore } from '../src/stores/useLibraryStore';
import { useGameStore } from '../src/stores/useGameStore';
import { useAgentStore } from '../src/stores/useAgentStore';
import { useAgentGroupStore } from '../src/stores/useAgentGroupStore';
import { useBackendStore } from '../src/stores/useBackendStore';
import { useSettingsStore } from '../src/stores/useSettingsStore';
import { agentRuntime, type RunAgentOptions } from '../src/engine/runtime/AgentRuntime';
import { storageService } from '../src/db/storage';
import { assistantReplySchema } from '../src/engine/modelAssistant';
import { executeAssistantChanges, readAssistantConfiguration } from '../src/engine/assistantConfiguration';
import type { AgentDefinition, Backend } from '../src/types';

const agent: AgentDefinition = { id: 'custom_story', name: '自定义故事', description: '', prompt: '{{input}}\n{{history}}', messages: [], inputs: [{ name: 'input', type: 'string', required: true }], outputSchema: null, defaults: {} };
const group = { id: 'custom', name: '自定义', bindings: [{ agentId: agent.id, backendId: 'b', model: 'm' }] };
const backend: Backend = { id: 'b', name: 'b', baseUrl: 'http://example.test/v1', authType: 'none', customHeaders: {}, timeoutMs: 1000, maxConcurrency: 1, enabled: true };
const flow: Workflow = { id: 'custom', name: '自定义', steps: [{ id: 'story', agentId: agent.id, inputs: { input: { from: 'input' }, history: { from: 'context', pointer: '/history' } } }], output: { from: 'step', stepId: 'story', pointer: '' } };
const config = { agents: [agent], groups: [group], backends: [backend], activeGroupId: group.id, mockMode: false };

test('default story graph preserves required stage order; old libraries select it without rewriting history', () => {
  assert.equal(getStoryWorkflow(defaultLibrary()).id, DEFAULT_STORY_WORKFLOW.id);
  const bad = structuredClone(DEFAULT_STORY_WORKFLOW); bad.steps.reverse();
  assert.throws(() => validateWorkflow(bad), /故事阶段/);
  bad.steps = DEFAULT_STORY_WORKFLOW.steps.slice(1);
  assert.throws(() => validateWorkflow(bad), /故事阶段/);
  assert.throws(() => validateLibrary({ ...defaultLibrary(), storyWorkflowId: 'missing' }), /组合不存在/);
});

test('custom game graph receives explicit history only and leaves character data intact', async () => {
  const save = createStorySave(defaultLibrary(), 'harbor_story', group.id), before = structuredClone(save);
  const next = await new StoryWorkflow(async options => {
    assert.equal(options.agentId, agent.id); assert.equal(options.protocol, 'definition');
    assert.deepEqual(Object.keys(options.context).sort(), ['history', 'input']);
    assert(options.context.history[0].content.endsWith('【时间点 1】'));
    return { success: true, data: '新的故事。', spanId: 'test' };
  }).execute(save, '继续', { ...config, workflow: flow });
  assert.deepEqual(save, before);
  assert.equal(next.turns.at(-1)?.textTurn?.pipeline, 'workflow-v1');
  assert.equal(next.turns.at(-1)?.textTurn?.workflowId, flow.id);
  assert.equal(next.turns.at(-1)?.narration?.anchor, 2);
  for (const id of save.textWorld!.characters) assert.deepEqual(next.textWorld!.documents[`characters/${id}/memory.md`], save.textWorld!.documents[`characters/${id}/memory.md`]);
});

async function setup() {
  const values = new Map<string, string>();
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: (k: string) => values.get(k) ?? null, setItem: (k: string, v: string) => values.set(k, v), removeItem: (k: string) => values.delete(k) } });
  const library = { ...defaultLibrary(), workflows: { custom: flow }, storyWorkflowId: flow.id };
  await storageService.commitLibrary({ revision: 0, data: library }, -1);
  await useLibraryStore.getState().load();
  useAgentStore.setState({ agents: [agent] }); useBackendStore.setState({ backends: [backend] }); useAgentGroupStore.setState({ groups: [group], activeGroupId: group.id });
  useSettingsStore.setState(s => ({ settings: { ...s.settings, mockLlmMode: false } }));
  const save = createStorySave(library, 'harbor_story', group.id);
  await storageService.commitTextGame(save, null);
  useGameStore.setState({ activeSave: save, saves: [save], isExecuting: false, executionError: null, currentTraceId: null });
  return save;
}

test('game store runs the selected composition, commits it and preserves other unsaved progress', async t => {
  const save = await setup(), other = { ...structuredClone(save), id: 'other', name: '未保存修改' };
  useGameStore.setState(s => ({ saves: [...s.saves, other] }));
  let calls = 0;
  t.mock.method(agentRuntime, 'runAgent', async (options: RunAgentOptions) => { assert.equal(options.agentId, agent.id); calls++; return { success: true, data: '已完成的正文', spanId: 'test' }; });
  assert.equal(await useGameStore.getState().sendPlayerInput('继续'), true);
  assert.equal(calls, 1);
  const stored = (await storageService.getSaves()).find(s => s.id === save.id)!;
  assert.equal(stored.turns.at(-1)?.narratorOutput, '已完成的正文');
  assert.equal(stored.turns.at(-1)?.textTurn?.commit, 'saved');
  assert.equal(useGameStore.getState().saves.find(s => s.id === other.id), other);
});

test('cancelled game composition restores input without writing a turn or switching active saves', async t => {
  const save = await setup();
  let release!: () => void;
  const started = new Promise<void>(resolve => { release = resolve; });
  t.mock.method(agentRuntime, 'runAgent', async (options: RunAgentOptions) => { release(); await new Promise<void>(resolve => options.signal!.addEventListener('abort', () => resolve(), { once: true })); return { success: true, data: 'late', spanId: 'test' }; });
  const run = useGameStore.getState().sendPlayerInput('取消这个输入');
  await started;
  assert.equal(useGameStore.getState().cancelGeneration(), '取消这个输入');
  assert.equal(await run, false);
  assert.equal(useGameStore.getState().activeSave, save);
  assert.equal(useGameStore.getState().executionError, null);
  assert.equal((await storageService.getSaves()).find(s => s.id === save.id)!.turns.length, 1);
});

test('save conflict and retired retry keep complete original history', async t => {
  const save = await setup();
  t.mock.method(agentRuntime, 'runAgent', async () => ({ success: true, data: 'not committed', spanId: 'test' }));
  t.mock.method(storageService, 'commitTextGame', async () => { throw new Error('revision conflict'); });
  assert.equal(await useGameStore.getState().sendPlayerInput('继续'), false);
  assert.equal(useGameStore.getState().activeSave, save);
  assert.equal(await useGameStore.getState().retryTurn(0), false);
  await useGameStore.getState().switchTurnVariation(0, 1);
  assert.equal(useGameStore.getState().activeSave, save);
});

test('assistant atomically changes game selection and deletes its former workflow, preserving unknown fields', async () => {
  await setup();
  const reply = assistantReplySchema.parse({ reply: '', actions: [
    { type: 'patch_config', resource: 'workflows', patches: [{ op: 'remove', path: '/custom' }] },
    { type: 'patch_config', resource: 'library', patches: [{ op: 'replace', path: '/storyWorkflowId', value: null }, { op: 'add', path: '/future', value: { keep: true } }] },
  ] });
  const before = readAssistantConfiguration(), reports: string[] = [];
  await executeAssistantChanges(reply, before, new AbortController().signal, m => reports.push(m));
  const saved = await storageService.getLibrary();
  assert.equal(saved?.revision, 1); assert.deepEqual(saved?.data.workflows, {}); assert.equal(saved?.data.storyWorkflowId, null); assert.deepEqual(saved?.data.future, { keep: true }); assert.equal(reports.length, 1);
});
