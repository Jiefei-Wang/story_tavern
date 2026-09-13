import test from 'node:test';
import assert from 'node:assert/strict';
import { TextProcessor, textProcessor } from '../src/engine/text/Processor';
import { createTextWorld, migrateToText, restoreLegacyCopy } from '../src/engine/text/Migration';
import { DocumentWorkspace, validateTextWorld } from '../src/engine/text/Documents';
import { prepareHistory, historyMessages, characterHistory, anchoredNarration, visibleNarration } from '../src/engine/text/History';
import { validateCards, validateDesigns, validateRoute } from '../src/engine/text/RoutedProtocol';
import { ROUTED_AGENTS, addTextBindings } from '../src/engine/text/Agents';
import { INITIAL_DEMO_SAVE, BUILTIN_AGENTS, DEFAULT_AGENT_GROUPS, DEFAULT_BACKENDS } from './fixtures/legacyInitialData';
import { StorageService, storageService } from '../src/db/storage';
import { AgentRuntime, type RunAgentOptions } from '../src/engine/runtime/AgentRuntime';
import { globalTraceManager } from '../src/engine/tracing/TraceManager';
import { readAssistantConfiguration, executeAssistantChanges, planAssistantChanges } from '../src/engine/assistantConfiguration';
import { useGameStore } from '../src/stores/useGameStore';
import { useAgentStore } from '../src/stores/useAgentStore';
import { useAgentGroupStore } from '../src/stores/useAgentGroupStore';
import { useBackendStore } from '../src/stores/useBackendStore';
import { useSettingsStore } from '../src/stores/useSettingsStore';
import type { GameSave } from '../src/types';

const context = { agents: BUILTIN_AGENTS, groups: DEFAULT_AGENT_GROUPS, backends: DEFAULT_BACKENDS, activeGroupId: DEFAULT_AGENT_GROUPS[0].id, mockMode: false };
const fixture = (): GameSave => ({ ...structuredClone(INITIAL_DEMO_SAVE), id: `test_${crypto.randomUUID()}`, textWorld: createTextWorld() });
const memory = new Map<string, string>();
Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: (key: string) => memory.get(key) ?? null, setItem: (key: string, value: string) => memory.set(key, value), removeItem: (key: string) => memory.delete(key) } });
const adapter = (options: { selected?: string[]; create?: boolean; silent?: boolean; invalidDesign?: boolean; fail?: string; inspect?: (o: RunAgentOptions) => void } = {}) => {
    const calls: RunAgentOptions[] = [];
    const run = async (o: RunAgentOptions) => {
        calls.push(structuredClone({ ...o, signal: undefined }));
        options.inspect?.(o);
        if (options.fail === o.agentId) throw new Error('controlled model failure');
        let data: unknown;
        if (o.agentId === 'text_router') data = { characters: options.selected ?? ['erin'], new_characters: options.create ? [{ request_id: 'new_1', description: '路上独立的一位女孩，不是艾琳' }] : [], instructions: o.context.input === '不是一个扫帚' ? '纠正上次扫帚的描写，不把纠正当成发言，不重新执行玩家行动。' : '按用户需求回应，不替玩家决定。' };
        else if (o.agentId === 'text_designer' && o.context.task.startsWith('创建')) data = { cards: [{ request_id: 'new_1', name: '路过的女孩', public: '在路边的女孩。', profile: '说话直接。', initial_state: { summary: '刚走到路边。' } }] };
        else if (o.agentId === 'text_designer') data = { characters: o.context.material.cards.map((c: any) => ({ character_id: c.character_id, expression: options.invalidDesign ? [] : options.silent ? null : '有什么事吗？', action: options.silent ? null : '停下脚步。', end_state: { summary: '留意来人的招呼。', future: { retained: true } } })) };
        else if (o.agentId === 'text_storyteller') data = '女孩停下脚步，问：“有什么事吗？”';
        else throw new Error('Unexpected legacy stage: ' + o.agentId);
        return { success: true, data: typeof data === 'string' ? data : JSON.stringify(data), spanId: 'test' };
    };
    return { calls, run };
};

test('one routing + one batched Designer + one narrator, atomically saved with end states and anchors', async () => {
    const source = fixture(), a = adapter({ selected: ['erin', 'guard'] });
    const storage = new StorageService();
    await storage.commitTextGame(source, null);
    const result = await new TextProcessor(a.run).execute(source, '我向两人打招呼。', context);
    assert.deepEqual(a.calls.map(c => c.agentId), ['text_router', 'text_designer', 'text_storyteller']);
    assert(a.calls.every(c => !c.toolSchema));
    assert(a.calls.slice(0, 2).every(c => c.jsonObject));
    assert(!a.calls[2].jsonObject);
    assert.equal(result.turns.at(-1)!.textTurn!.designs!.length, 2);
    assert.equal(result.turns.at(-1)!.narration!.anchor, 2);
    assert(result.turns.at(-1)!.narration!.requestText.endsWith('【时间点 2】'));
    assert(!result.turns.at(-1)!.narratorOutput.includes('时间点'));
    assert.equal(source.turns[0].narration, undefined);
    assert.deepEqual(result.textWorld!.documents['characters/erin/memory.md'], source.textWorld!.documents['characters/erin/memory.md']);
    assert.deepEqual(result.textWorld!.documents[source.textWorld!.scene], source.textWorld!.documents[source.textWorld!.scene]);
    await storage.commitTextGame(result, 0);
    const loaded = (await storage.getSaves()).find(s => s.id === source.id)!;
    assert.deepEqual(loaded.turns, JSON.parse(JSON.stringify(result.turns)));
    assert.equal(loaded.turns.at(-1)!.textTurn!.commit, 'saved');
});

test('new character cards are created before the one joint design call and use program-generated IDs', async () => {
    const a = adapter({ create: true }), source = fixture();
    const result = await new TextProcessor(a.run).execute(source, '我向路上另一位女孩打招呼。', context);
    assert.deepEqual(a.calls.map(c => c.agentId), ['text_router', 'text_designer', 'text_designer', 'text_storyteller']);
    const id = result.turns.at(-1)!.textTurn!.createdCharacters![0];
    assert(id.startsWith('person_'));
    assert(result.textWorld!.characters.includes(id));
    assert.equal(a.calls[2].context.material.cards.length, 2);
    assert(a.calls[2].context.material.cards.some((c: any) => c.character_id === id));
    for (const kind of ['profile', 'public', 'memory']) assert(result.textWorld!.documents[`characters/${id}/${kind}.md`]);
    assert.equal(source.textWorld!.characters.length, 4);
    validateTextWorld(result.textWorld!);
});

test('null performance skips narrator integration but still persists changed end state', async () => {
    const a = adapter({ silent: true });
    const result = await new TextProcessor(a.run).execute(fixture(), '我默默看着艾琳。', context);
    assert.deepEqual(a.calls[2].context.material.performances, []);
    assert.equal(result.turns.at(-1)!.textTurn!.designs![0].end_state.summary, '留意来人的招呼。');
    assert.deepEqual(result.turns.at(-1)!.textTurn!.events, []);
});

test('no selected NPC means no Designer call, while narrator still receives input and route instructions', async () => {
    const a = adapter({ selected: [] });
    await new TextProcessor(a.run).execute(fixture(), '不是一个扫帚', context);
    assert.deepEqual(a.calls.map(c => c.agentId), ['text_router', 'text_storyteller']);
    assert(a.calls[1].conversation!.at(-1)!.content.includes('不是一个扫帚'));
    assert(a.calls[1].conversation!.at(-1)!.content.includes('不把纠正当成发言'));
});

test('correction remains one linear turn; every stage gets original feedback and full preceding story', async () => {
    const a = adapter(), source = fixture();
    const first = await new TextProcessor(a.run).execute(source, '我走进房间。', context);
    first.turns.at(-1)!.narratorOutput = '房间角落有一个扫帚。';
    first.turns.at(-1)!.narration!.requestText = anchoredNarration(first.turns.at(-1)!.narratorOutput, 2);
    const b = adapter();
    const second = await new TextProcessor(b.run).execute(first, '不是一个扫帚', context);
    for (const call of b.calls) {
        const sent = JSON.stringify(call.conversation);
        assert(sent.includes('房间角落有一个扫帚'));
        assert(sent.includes('不是一个扫帚'));
        assert(sent.includes('【时间点 2】'));
        if (call.agentId !== 'text_router') assert(sent.includes('不重新执行玩家行动'));
    }
    assert.deepEqual(second.turns[1], first.turns[1]);
    assert.equal(second.turns.at(-1)!.textTurn!.correctionOf, undefined);
    assert.equal(second.turns.at(-1)!.narration!.anchor, 3);
});

test('stable request prefix survives selection changes, skipped NPC turns and reload', async () => {
    const source = fixture(), a = adapter(), first = await new TextProcessor(a.run).execute(source, '我打招呼。', context);
    const b = adapter({ selected: [] }), second = await new TextProcessor(b.run).execute(JSON.parse(JSON.stringify(first)), '看看天气。', context);
    const c = adapter(), third = await new TextProcessor(c.run).execute(second, '我再次问艾琳。', context);
    for (const id of ['text_router', 'text_storyteller']) {
        const oldPrefix = a.calls.find(o => o.agentId === id)!.conversation!.slice(0, -1);
        const next = c.calls.find(o => o.agentId === id)!.conversation!;
        assert.deepEqual(next.slice(0, oldPrefix.length), oldPrefix);
        assert(next.some(m => m.content === first.turns.at(-1)!.narration!.requestText));
        assert(next.some(m => m.content === second.turns.at(-1)!.narration!.requestText));
    }
    const state = c.calls.find(o => o.agentId === 'text_designer')!.context.material.cards[0].state_history;
    assert.equal(state.length, 1);
    assert.equal(state[0].anchor, 2, 'idle NPC keeps its earlier state origin');
    assert.equal(characterHistory(third.turns, 'erin').at(-1)!.anchor, 4);
});

test('narrator receives no private end states or world secrets', async () => {
    const source = fixture(); source.textWorld!.documents['world/private.md'].text = 'PRIVATE_WORLD_SENTINEL';
    const a = adapter(); await new TextProcessor(a.run).execute(source, '我打招呼。', context);
    assert(JSON.stringify(a.calls[1].conversation).includes('PRIVATE_WORLD_SENTINEL'));
    const narrator = JSON.stringify(a.calls[2].conversation);
    assert(!narrator.includes('PRIVATE_WORLD_SENTINEL'));
    assert(!narrator.includes('end_state'));
    assert(!narrator.includes('昨晚听见'));
});

test('invalid Designer shape gets one detailed retry and failed trace; no history/state mutations', async () => {
    const a = adapter({ invalidDesign: true }), source = fixture(), snapshot = structuredClone(source);
    let traceId = '';
    await assert.rejects(() => new TextProcessor(a.run).execute(source, '我打招呼。', { ...context, onTraceStarted: id => { traceId = id; } }), /erin.expression/);
    assert.equal(a.calls.filter(o => o.agentId === 'text_designer').length, 2);
    assert(!a.calls.some(o => o.agentId === 'text_storyteller'));
    const trace = globalTraceManager.getTrace(traceId)!;
    assert.equal(trace.spans.filter(s => s.type === 'text_validation' && s.status === 'error').length, 2);
    assert(trace.spans.some(s => s.type === 'text_failure' && s.error));
    assert.deepEqual(source, snapshot);
});

test('cancellation or narrator failure cannot leave new character cards, states or consumed indices', async () => {
    for (const cancel of [false, true]) {
        const controller = new AbortController(), source = fixture(), snapshot = structuredClone(source);
        const a = adapter({ create: true, fail: cancel ? undefined : 'text_storyteller', inspect: o => { if (cancel && o.agentId === 'text_storyteller') controller.abort(); } });
        await assert.rejects(() => new TextProcessor(a.run).execute(source, '另一位女孩。', { ...context, signal: controller.signal }));
        assert.deepEqual(source, snapshot);
        const next = await new TextProcessor(adapter().run).execute(source, '我打招呼。', context);
        assert.equal(next.turns.at(-1)!.narration!.anchor, 2);
    }
});

test('routing and card validators reject unknown IDs, player selection, omissions and bad state shapes', () => {
    const route = { characters: ['erin'], new_characters: [], instructions: '回应' };
    assert.throws(() => validateRoute({ ...route, characters: ['player'] }, ['erin']), /未授权/);
    assert.throws(() => validateRoute({ ...route, characters: ['erin', 'erin'] }, ['erin']), /重复/);
    assert.throws(() => validateRoute({ ...route, new_characters: Array(5).fill({}) }, ['erin']), /至多四位/);
    assert.throws(() => validateDesigns({ characters: [] }, ['erin']), /遗漏/);
    assert.throws(() => validateDesigns({ characters: [{ character_id: 'erin', expression: null, action: null, end_state: [] }] }, ['erin']), /JSON 对象/);
    assert.throws(() => validateCards({ cards: [] }, ['new_1']), /数量/);
    assert.throws(() => validateCards({ cards: [{ request_id: 'forged' }] }, ['new_1']), /未授权/);
});

test('program markers stay out of narration display/copy; malformed stored anchors are rejected', () => {
    const source = fixture();
    const first = prepareHistory(source.turns);
    assert.equal(first[0].narration!.anchor, 1);
    assert.deepEqual(prepareHistory(first), first);
    assert.equal(visibleNarration('正文\n\n【时间点 12】'), '正文');
    assert.equal(visibleNarration('他说“【时间点 12】”。'), '他说“【时间点 12】”。');
    assert.equal(visibleNarration(anchoredNarration('正文', 3)), '正文');
    first[0].narration!.requestText = 'wrong';
    assert.throws(() => prepareHistory(first), /时间锚点无效/);
    assert.equal(source.turns[0].narration, undefined);
});

test('model-echoed anchor is stripped and only the committed program anchor is stored', async () => {
    const a = adapter();
    const result = await new TextProcessor(async o => o.agentId === 'text_storyteller' ? { success: true, data: '正文\n\n【时间点 999】', spanId: 'test' } : a.run(o)).execute(fixture(), '你好', context);
    assert.equal(result.turns.at(-1)!.narratorOutput, '正文');
    assert.equal(result.turns.at(-1)!.narration!.requestText, '正文\n\n【时间点 2】');
});

test('new role bindings inherit exact existing models/overrides and preserve customized old/new agents', () => {
    const old = { id: 'custom', name: 'custom', bindings: [
        { agentId: 'text_organizer', backendId: 'b', model: 'router_model', overrides: { temperature: 0.2 } },
        { agentId: 'text_character', backendId: 'b', model: 'character_model' },
        { agentId: 'text_narrator', backendId: 'b', model: 'narrator_model' },
    ] };
    const mapped = addTextBindings(old);
    assert.equal(mapped.bindings.find(b => b.agentId === 'text_router')!.model, 'router_model');
    assert.equal(mapped.bindings.find(b => b.agentId === 'text_designer')!.model, 'character_model');
    assert.equal(mapped.bindings.find(b => b.agentId === 'text_storyteller')!.model, 'narrator_model');
    assert.deepEqual(mapped.bindings.slice(0, 3), old.bindings);
    mapped.bindings.find(b => b.agentId === 'text_router')!.model = 'custom_new';
    assert.equal(addTextBindings(mapped).bindings.find(b => b.agentId === 'text_router')!.model, 'custom_new');
    assert.deepEqual(addTextBindings(mapped), mapped);
});

test('actual HTTP request has fixed system first, visible history anchors, current input last, and no tool loop', async () => {
    const oldFetch = globalThis.fetch; const sent: any[] = [];
    globalThis.fetch = async (_url, options) => {
        const request = JSON.parse(String(options?.body)); sent.push(request);
        const content = request.messages[0].content;
        const output = content.includes('只选择本轮') ? { characters: ['erin'], new_characters: [], instructions: '回应' }
            : content.includes('一次共同设计') ? { characters: [{ character_id: 'erin', expression: '你好。', action: null, end_state: { summary: '已问候。' } }] } : '她说：“你好。”';
        return new Response(JSON.stringify({ choices: [{ message: { content: typeof output === 'string' ? output : JSON.stringify(output) } }] }), { headers: { 'content-type': 'application/json' } });
    };
    try {
        const runtime = new AgentRuntime();
        const realContext = { ...context, agents: ROUTED_AGENTS, activeGroupId: 'test', groups: [{ id: 'test', name: 'test', bindings: ROUTED_AGENTS.map(a => ({ agentId: a.id, backendId: 'local', model: 'test' })) }], backends: [{ id: 'local', name: 'local', baseUrl: 'http://localhost:1234/v1', authType: 'none' as const, customHeaders: {}, enabled: true, maxConcurrency: 1, timeoutMs: 1000 }] };
        await new TextProcessor(o => runtime.runAgent(o)).execute(fixture(), '你好', realContext);
        assert.equal(sent.length, 3);
        for (const request of sent) {
            assert.equal(request.messages[0].role, 'system');
            assert(request.messages.some((m: any) => m.content.includes('【时间点 1】')));
            assert(request.messages.at(-1).content.includes('用户原始输入：\n你好'));
            assert.equal(request.tools, undefined);
        }
    } finally { globalThis.fetch = oldFetch; }
});

test('atomic CAS rejects competing candidates, preserves unknown fields and stable anchors through 12 turns', async () => {
    const source = fixture(); (source as any).future = { keep: true }; source.textWorld!.documents['world/common.md'].future = 'keep';
    const storage = new StorageService(); await storage.commitTextGame(source, null);
    let save = source;
    for (let n = 0; n < 12; n++) {
        const candidate = await new TextProcessor(adapter().run).execute(save, `问候 ${n}`, context);
        await storage.commitTextGame(candidate, save.textWorld!.revision);
        if (n === 0) await assert.rejects(() => storage.commitTextGame(candidate, 0), /冲突/);
        save = (await storage.getSaves()).find(s => s.id === source.id)!;
    }
    assert.equal(save.textWorld!.revision, 12);
    assert.equal(save.turns.at(-1)!.narration!.anchor, 13);
    assert.equal((save as any).future.keep, true);
    assert.equal(save.textWorld!.documents['world/common.md'].future, 'keep');
    assert.equal(characterHistory(save.turns, 'erin').length, 12);
    assert(historyMessages(save.turns).some(m => m.content.endsWith('【时间点 2】')));
});

test('assistant edits new cards and role prompts, rejects writable runtime state, preserves history/cancel/conflict', async () => {
    const source = fixture(), storage = new StorageService(); await storage.commitTextGame(source, null);
    const generated = await new TextProcessor(adapter({ create: true }).run).execute(source, '我打招呼。', context); await storage.commitTextGame(generated, 0);
    useGameStore.setState({ saves: [generated], activeSave: generated, isExecuting: false });
    useAgentStore.setState({ agents: BUILTIN_AGENTS }); useAgentGroupStore.setState({ groups: DEFAULT_AGENT_GROUPS, activeGroupId: context.activeGroupId }); useBackendStore.setState({ backends: DEFAULT_BACKENDS });
    const snapshot = readAssistantConfiguration();
    const resource = (snapshot.resources as any).textSaves;
    assert(!JSON.stringify(resource).includes('requestText'));
    assert(!JSON.stringify(resource).includes('designs'));
    const id = generated.turns.at(-1)!.textTurn!.createdCharacters![0];
    const reply: any = { reply: '', actions: [{ type: 'patch_config', resource: 'textSaves', patches: [{ op: 'replace', path: `/${source.id}/documents/characters~1${id}~1profile.md/text`, value: '# 女孩\n说话温和。' }] }] };
    for (const key of ['anchor', 'designs', 'end_state', 'turns', 'narration']) assert.throws(() => planAssistantChanges({ reply: '', actions: [{ type: 'patch_config', resource: 'textSaves', patches: [{ op: 'add', path: `/${source.id}/${key}`, value: {} }] }] } as any, snapshot.resources! as any), /只读历史/);
    const aborted = new AbortController(); aborted.abort(); await assert.rejects(() => executeAssistantChanges(reply, snapshot, aborted.signal, () => {}));
    await executeAssistantChanges(reply, snapshot, new AbortController().signal, () => {});
    const saved = (await storage.getSaves()).find(s => s.id === source.id)!;
    assert.equal(saved.textWorld!.documents[`characters/${id}/profile.md`].text, '# 女孩\n说话温和。');
    assert.deepEqual(saved.turns, JSON.parse(JSON.stringify(generated.turns)));
    assert.equal(useGameStore.getState().activeSave!.textWorld!.documents[`characters/${id}/profile.md`].text, '# 女孩\n说话温和。');
    await assert.rejects(() => executeAssistantChanges(reply, snapshot, new AbortController().signal, () => {}), /配置已变化/);
    const next = readAssistantConfiguration();
    const roles: any = { reply: '', actions: [{ type: 'patch_config', resource: 'agents', patches: [{ op: 'replace', path: '/text_designer/messages/0/content', value: 'Designer 的自定义提示词。' }] }] };
    await executeAssistantChanges(roles, next, new AbortController().signal, () => {});
    assert.equal(useAgentStore.getState().agents.find(a => a.id === 'text_designer')!.messages[0].content, 'Designer 的自定义提示词。');
});

test('store commit failure persists diagnostics and leaves successful story/state history unchanged', async () => {
    const source = fixture(); await storageService.commitTextGame(source, null);
    useGameStore.setState({ saves: [source], activeSave: source, isExecuting: false }); useAgentStore.setState({ agents: BUILTIN_AGENTS }); useAgentGroupStore.setState({ groups: DEFAULT_AGENT_GROUPS, activeGroupId: context.activeGroupId }); useBackendStore.setState({ backends: DEFAULT_BACKENDS });
    useSettingsStore.setState(s => ({ settings: { ...s.settings, mockLlmMode: false } }));
    const oldRunner = (textProcessor as any).runner, oldCommit = storageService.commitTextGame;
    try {
        (textProcessor as any).runner = adapter().run;
        storageService.commitTextGame = async () => { throw new Error('controlled disk failure'); };
        const ok = await useGameStore.getState().sendPlayerInput('你好');
        assert.equal(ok, false);
        assert.deepEqual(useGameStore.getState().activeSave, source);
        const trace = (await storageService.getTraces()).find(t => t.id === useGameStore.getState().currentTraceId)!;
        assert(trace.spans.some(s => s.type === 'text_failure' && s.error?.includes('controlled disk failure')));
    } finally { (textProcessor as any).runner = oldRunner; storageService.commitTextGame = oldCommit; }
});

test('legacy migration and document authoring preserve unknown metadata and player invariants', () => {
    const raw = structuredClone(INITIAL_DEMO_SAVE); (raw as any).future = { keep: true };
    const migrated = migrateToText(raw); assert.deepEqual(migrated.legacyBackup, raw); assert.equal((restoreLegacyCopy(migrated) as any).future.keep, true);
    assert.deepEqual(migrateToText(migrated), migrated);
    const world = createTextWorld(); world.documents['world/common.md'].future = 'keep';
    const workspace = new DocumentWorkspace(world, new Set(['world/common.md']), new Set(['world/common.md']));
    assert.throws(() => workspace.read('world/private.md'), /权限/);
    assert.throws(() => workspace.replace('world/common.md', 1, world.documents['world/common.md'].text, '新常识'), /版本/);
    workspace.replace('world/common.md', 0, world.documents['world/common.md'].text, '新常识');
    assert.equal(workspace.world.documents['world/common.md'].future, 'keep');
    assert.throws(() => validateTextWorld({ ...world, characters: [] }), /玩家必须存在/);
});
