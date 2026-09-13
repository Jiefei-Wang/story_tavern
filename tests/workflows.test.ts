import test from 'node:test';
import assert from 'node:assert/strict';
import { runWorkflow, validateWorkflow, type Workflow } from '../src/engine/workflows/Workflow';
import type { AgentDefinition, Backend } from '../src/types';
import { AgentRuntime } from '../src/engine/runtime/AgentRuntime';
import { defaultLibrary } from '../src/engine/library/Library';
import { storageService } from '../src/db/storage';
import { useLibraryStore } from '../src/stores/useLibraryStore';
import { useAgentStore } from '../src/stores/useAgentStore';
import { useAgentGroupStore } from '../src/stores/useAgentGroupStore';
import { useBackendStore } from '../src/stores/useBackendStore';
import { useGameStore } from '../src/stores/useGameStore';
import { readAssistantConfiguration, executeAssistantChanges, planAssistantChanges, type Resources } from '../src/engine/assistantConfiguration';
import { assistantReplySchema } from '../src/engine/modelAssistant';
import { reconcileAgentCatalog } from '../src/db/agentCatalog';

const agent: AgentDefinition = { id: 'text_custom', name: 'custom', description: '', prompt: '{{input}}', messages: [], inputs: [{ name: 'input', type: 'string', required: true }], outputSchema: null, defaults: {} };
const backend: Backend = { id: 'b', name: 'b', baseUrl: 'http://localhost/v1', enabled: true, authType: 'none', customHeaders: {}, timeoutMs: 1000, maxConcurrency: 1 };
const config = { agents: [agent], backends: [backend], groups: [{ id: 'g', name: 'g', bindings: [{ agentId: agent.id, backendId: 'b', model: 'm' }] }], groupId: 'g' };
const flow: Workflow = { id: 'f', name: '组合', steps: [{ id: 'a', agentId: agent.id, inputs: { input: { from: 'input' } } }, { id: 'b', agentId: agent.id, inputs: { input: { from: 'step', stepId: 'a', pointer: '' }, original: { from: 'input' } } }], output: { from: 'step', stepId: 'b', pointer: '' } };
const ok = (data: unknown) => ({ success: true, data, spanId: 'stub' });

test('catalog initialization retains custom workflow bindings in default groups', async () => {
  const groups = [{ id: 'group_fast', name: 'Fast', bindings: [{ agentId: agent.id, backendId: 'b', model: 'custom-model' }] }];
  await reconcileAgentCatalog({ getAgents: async () => [agent], saveAgent: async () => {}, deleteAgent: async () => {}, getAgentGroups: async () => groups,
    saveAgentGroup: async g => { if (g.id === 'group_fast') groups[0] = g; }, deleteAgentGroup: async () => {}, getSaves: async () => [], saveGame: async () => {} });
  assert.equal(groups[0].bindings.find(b => b.agentId === agent.id)?.model, 'custom-model');
});

test('sequential composition reuses agents, maps only explicit input, and returns selected text', async () => {
  const calls: any[] = [];
  const result = await runWorkflow(flow, 'hello', config, async options => { calls.push(options); return ok(options.context.input + '!'); });
  assert.equal(result, 'hello!!');
  assert.deepEqual(calls.map(c => c.context), [{ input: 'hello' }, { input: 'hello!', original: 'hello' }]);
  assert.equal(calls[0].protocol, 'definition'); assert.notEqual(calls[0].blockId, calls[1].blockId);
});

test('rejects forward references, duplicate IDs, missing agents and unsafe pointers before calls', async () => {
  for (const mutate of [
    (f: Workflow) => { f.steps[0].inputs.input = { from: 'step', stepId: 'b', pointer: '' }; },
    (f: Workflow) => { f.steps[1].id = 'a'; },
    (f: Workflow) => { f.steps[0].agentId = 'missing'; },
    (f: Workflow) => { f.output = { from: 'step', stepId: 'a', pointer: '/__proto__' }; },
    (f: Workflow) => { delete f.steps[0].inputs.input; },
  ]) { const f = structuredClone(flow); mutate(f); assert.throws(() => validateWorkflow(f, config.agents)); }
  await assert.rejects(runWorkflow(flow, 'hello', { ...config, groups: [] }, async () => { assert.fail('must not call'); }), /绑定/);
});

test('JSON Pointer decoding, missing paths, input types and final text are checked', async () => {
  const f = structuredClone(flow); f.steps[1].inputs.input = { from: 'step', stepId: 'a', pointer: '/a~1b/~0' };
  let n = 0;
  assert.equal(await runWorkflow(f, 'x', config, async () => ok(n++ ? 'done' : { 'a/b': { '~': 'text' } })), 'done');
  await assert.rejects(runWorkflow(f, 'x', config, async () => ok({})), /字段不存在/);
  await assert.rejects(runWorkflow(flow, 'x', config, async () => ok(12)), /input/);
  f.steps = [f.steps[0]]; f.output = { from: 'step', stepId: 'a', pointer: '' };
  await assert.rejects(runWorkflow(f, 'x', config, async () => ok({})), /最终输出/);
});

test('failure and cancellation stop downstream calls', async () => {
  let calls = 0;
  await assert.rejects(runWorkflow(flow, 'x', config, async () => { calls++; return { ...ok(null), success: false, error: 'private transport details' }; }), /步骤 a 失败/);
  assert.equal(calls, 1);
  const abort = new AbortController(); calls = 0;
  await assert.rejects(runWorkflow(flow, 'x', { ...config, signal: abort.signal }, async () => { calls++; abort.abort(); return ok('late'); }), { name: 'AbortError' });
  assert.equal(calls, 1);
});

test('real runtime honors output schema for text-prefixed custom agents using stub HTTP', async t => {
  t.mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify({ choices: [{ message: { content: '{"text":"done"}' } }] }), { headers: { 'content-type': 'application/json' } }));
  const f = structuredClone(flow); f.steps = [f.steps[0]]; f.output = { from: 'step', stepId: 'a', pointer: '/text' };
  const agents = [{ ...agent, outputSchema: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] } }];
  assert.equal(await runWorkflow(f, 'x', { ...config, agents }, options => new AgentRuntime().runAgent(options)), 'done');
});

test('assistant workflow writes persist unknown fields; invalid refs, cancellation, conflicts and failure never report success', async t => {
  const values = new Map<string, string>();
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value), removeItem: (key: string) => values.delete(key) } });
  useAgentStore.setState({ agents: config.agents }); useAgentGroupStore.setState({ groups: config.groups, activeGroupId: 'g' });
  useBackendStore.setState({ backends: config.backends }); useGameStore.setState({ saves: [], activeSave: null, isExecuting: false });
  const previous = await storageService.getLibrary(), revision = (previous?.revision ?? -1) + 1;
  await storageService.commitLibrary({ revision, data: { ...defaultLibrary(), future: 'keep', workflows: { f: { ...flow, future: { keep: true } } } } }, revision - 1);
  await useLibraryStore.getState().load();
  const reply = assistantReplySchema.parse({ reply: '', actions: [{ type: 'patch_config', resource: 'workflows', patches: [{ op: 'replace', path: '/f/name', value: 'renamed' }] }] });
  const reports: string[] = [], snapshot = readAssistantConfiguration();
  const abort = new AbortController(); abort.abort();
  await assert.rejects(executeAssistantChanges(reply, snapshot, abort.signal, m => reports.push(m)));
  assert.equal(reports.length, 0);
  await executeAssistantChanges(reply, snapshot, new AbortController().signal, m => reports.push(m));
  assert.equal(reports.length, 1);
  const stored = await storageService.getLibrary(); assert.equal(stored?.data.workflows?.f.name, 'renamed'); assert.deepEqual(stored?.data.workflows?.f.future, { keep: true }); assert.equal(stored?.data.future, 'keep');
  await assert.rejects(executeAssistantChanges(reply, snapshot, new AbortController().signal, () => assert.fail()), /配置已变化/);
  const bad = structuredClone(reply); bad.actions = [{ type: 'patch_config', resource: 'agents', patches: [{ op: 'remove', path: '/text_custom' }] }];
  assert.throws(() => planAssistantChanges(bad, readAssistantConfiguration().resources as Resources), /Agent 不存在/);
  await assert.rejects(useLibraryStore.getState().save(stored!.data, revision), /配置已变化/);
  const failed = structuredClone(reply); (failed.actions[0] as any).patches[0].value = 'failure';
  t.mock.method(storageService, 'commitLibrary', async () => { throw new Error('disk failure'); });
  await assert.rejects(executeAssistantChanges(failed, readAssistantConfiguration(), new AbortController().signal, () => assert.fail()), /disk failure/);
  assert.equal(useLibraryStore.getState().record.data.workflows?.f.name, 'renamed');
});
