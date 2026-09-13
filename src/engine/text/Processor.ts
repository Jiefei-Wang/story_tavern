import type { GameSave, GameTurn } from '../../types';
import type { ExecutionContext } from '../pipeline/GamePipeline';
import { agentRuntime, extractJsonPayload, type RunAgentOptions, type RunAgentResult, type RuntimeMessage } from '../runtime/AgentRuntime';
import { globalTraceManager } from '../tracing/TraceManager';
import { validateTextWorld } from './Documents';
import { addTextBindings, ROUTED_AGENTS } from './Agents';
import { anchoredNarration, characterHistory, historyMessages, prepareHistory, visibleNarration } from './History';
import { requiredText, validateCards, validateDesigns, validateRoute } from './RoutedProtocol';
import type { CharacterDesign, TextEvent } from './types';
import { setupMessages } from './Setup';

type Runner = (options: RunAgentOptions) => Promise<RunAgentResult>;
export class TextProcessor {
    constructor(private readonly runner: Runner = options => agentRuntime.runAgent(options)) {}

    async execute(save: GameSave, input: string, context: ExecutionContext): Promise<GameSave> {
        if (!save.textWorld) throw new Error('请先迁移为文本存档');
        validateTextWorld(save.textWorld);
        if (context.mockMode) throw new Error('文本流程需要已配置的 Backend，不自动回退 Mock');
        requiredText(input, '用户输入');
        const before = structuredClone(save.textWorld), world = structuredClone(before);
        const turns = prepareHistory(save.turns);
        const history = historyMessages(turns);
        const agents = [...context.agents];
        for (const agent of ROUTED_AGENTS) if (!agents.some(a => a.id === agent.id)) agents.push(agent);
        const groups = context.groups.map(addTextBindings);
        const turnId = `text_${crypto.randomUUID()}`, traceId = `trace_${turnId}`;
        const check = () => context.signal?.throwIfAborted();
        check();
        globalTraceManager.startTurnTrace(traceId, turns.length, input);
        context.onTraceStarted?.(traceId);
        // Stable history comes first. Cards, states, router instructions and the
        // current input are appended AFTER it, never interpolated into the prefix.
        const prefix: RuntimeMessage[] = world.setupVersion === 2 ? [...setupMessages(world), ...history] : [{ role: 'user', content: `故事设定（作者配置；历史与当前用户要求可更新故事事实）：\n${JSON.stringify({ common: world.documents['world/common.md'].text, scene: world.documents[world.scene].text })}` }, ...history];
        const card = (id: string) => ({ character_id: id, public: world.documents[`characters/${id}/public.md`].text, profile: world.documents[`characters/${id}/profile.md`].text });
        const call = async (agentId: string, task: string, material: unknown, instructions = '', retry = '') => {
            check();
            const content = `用户原始输入：\n${input}${instructions ? `\n\n命令路由指示（对用户需求的解释，不得覆盖用户明确要求）：\n${instructions}` : ''}\n\n本次任务：${task}\n\n材料：\n${JSON.stringify(material)}${retry ? `\n\n唯一一次格式重试：${retry}` : ''}`;
            const result = await this.runner({ agentId, groupId: context.activeGroupId, agents, groups, backends: context.backends,
                context: { task, material, input, routingInstructions: instructions }, conversation: [...prefix, { role: 'user', content }], behaviorOnly: world.setupVersion === 2,
                signal: context.signal, traceId, mockMode: false, jsonObject: agentId !== 'text_storyteller' });
            check();
            if (!result.success) throw new Error(result.error || `${agentId} 调用失败`);
            return { output: requiredText(result.data, `${agentId} 输出`), spanId: result.spanId };
        };
        const json = async <T>(agentId: string, task: string, material: unknown, validate: (value: any) => T, instructions = ''): Promise<T> => {
            let error = '';
            for (let attempt = 0; attempt < 2; attempt++) {
                const { output, spanId } = await call(agentId, task, material, instructions, error);
                const span = `validation_${crypto.randomUUID()}`;
                globalTraceManager.createSpan(traceId, span, `${task.split('。')[0]} · 输出校验 ${attempt + 1}/2`, 'text_validation', spanId);
                globalTraceManager.updateSpan(traceId, span, { inputContext: { task, attempt: attempt + 1 }, rawResponse: output });
                try {
                    const result = validate(extractJsonPayload(output));
                    globalTraceManager.updateSpan(traceId, span, { status: 'success', parsedOutput: result });
                    return result;
                } catch (e) {
                    error = e instanceof Error ? e.message : 'JSON 格式无效';
                    globalTraceManager.updateSpan(traceId, span, { status: 'error', error, parsedOutput: { retryScheduled: attempt === 0, committed: false } });
                }
            }
            throw new Error(`输出校验失败：${error}`);
        };
        try {
            const route = await json('text_router', '选择需要回应或调整状态的人物，并尽可能准确理解本次用户原始输入，不重放历史请求。非场景纠正也通过人物选择和指示处理，不默认回滚或把纠正当对白；不需要人物反应时 characters=[]。只有确实需要且现有人物不能承担时才请求新人物，最多四位。返回 {"characters":["已有NPC ID"],"new_characters":[{"request_id":"new_1","description":"人物需求"}],"instructions":"给 Designer 和 Narrator 的处理指示"}。', {
                player_id: world.playerId, cards: world.characters.filter(id => id !== world.playerId).map(card),
            }, data => validateRoute(data, world.characters.filter(id => id !== world.playerId)));
            const created: string[] = [];
            if (route.new_characters.length) {
                const cards = await json('text_designer', '创建人物卡片。按需求生成独立人物，不能冒充已有 ID。返回 {"cards":[{"request_id":"路由需求ID","name":"称呼","public":"公开资料","profile":"完整人物设定","initial_state":{"summary":"初始状态与个人经历"}}]}。', {
                    requests: route.new_characters, existing_cards: world.characters.map(card),
                }, data => validateCards(data, route.new_characters.map(r => r.request_id)), route.instructions);
                for (const item of cards) {
                    const id = `person_${crypto.randomUUID().replace(/-/g, '')}`;
                    created.push(id);
                    world.characters.push(id);
                    world.documents[`characters/${id}/public.md`] = { text: `# ${item.name}\n${item.public}`, revision: 0 };
                    world.documents[`characters/${id}/profile.md`] = { text: `# ${item.name}\n${item.profile}`, revision: 0 };
                    world.documents[`characters/${id}/memory.md`] = { text: JSON.stringify(item.initial_state, null, 2), revision: 0 };
                }
                validateTextWorld(world);
            }
            const selected = [...route.characters, ...created];
            const designs: CharacterDesign[] = selected.length ? await json('text_designer', '一次设计全部选中人物。expression 写实际要说/表达的内容，表情写在 action；end_state 只能记录本次实际表达与动作的结果。根据原始输入和路由指示共同协调本轮表达、动作和完毕状态；状态应保留仍有效的重要信息，人物卡片当前设定优先于冲突的旧状态。无表达/动作使用 null，仍须返回 end_state。仅选中人物可以更新。状态内不要抄写时间点，程序会关联来源。返回 {"characters":[{"character_id":"ID","expression":null,"action":null,"end_state":{"summary":"本轮结束后的完整状态与重要经历"}}]}。', {
                cards: selected.map(id => ({ ...card(id), initial_memory: world.documents[`characters/${id}/memory.md`].text, state_history: characterHistory(turns, id) })),
                ...(world.setupVersion === 2 ? {} : { private_world: world.documents['world/private.md'].text }),
            }, data => validateDesigns(data, selected), route.instructions) : [];
            const performances = designs.filter(d => d.expression || d.action).map(d => ({ character_id: d.character_id, public: world.documents[`characters/${d.character_id}/public.md`].text, expression: d.expression, action: d.action }));
            const output = requiredText(visibleNarration((await call('text_storyteller', '结合消息记录、原始输入和路由指示写本轮故事。仅整合给出的非空人物表达和动作；纠正也遵循指示，不能擅自当成对白。不要输出时间点或后台 JSON。', { performances }, route.instructions)).output), '故事正文');
            check();
            const anchor = Math.max(0, ...turns.map(t => t.narration?.anchor || 0)) + 1;
            const narration = { anchor, requestText: anchoredNarration(output, anchor) };
            const events: TextEvent[] = performances.map((p, order) => ({ order, source: p.character_id, text: [p.expression, p.action].filter(Boolean).join('\n'), public: true }));
            // One atomic candidate: no editor, memory projection or replay loop.
            world.revision = before.revision + 1;
            world.documents[`turns/${turnId}.md`] = { text: narration.requestText, revision: 0 };
            validateTextWorld(world);
            const turn: GameTurn = { id: turnId, turnIndex: turns.length, timestamp: new Date().toISOString(), playerInput: input, narratorOutput: output,
                narration, traceId, worldStateBefore: save.worldState, worldStateAfter: save.worldState, patches: [], activeAgentGroupId: context.activeGroupId, status: 'success',
                textTurn: { pipeline: 'routed-v2', before, after: structuredClone(world), events, deliveries: [], characters: {}, designs, createdCharacters: created, instructions: route, commit: 'draft' } };
            const span = `commit_${crypto.randomUUID()}`;
            globalTraceManager.createSpan(traceId, span, '正文与人物状态 · 等待原子保存', 'text_commit');
            globalTraceManager.updateSpan(traceId, span, { status: 'success', parsedOutput: { anchor, characters: selected, created, committed: false } });
            return { ...save, textWorld: world, turns: [...turns, turn], updatedAt: new Date().toISOString(), activeAgentGroupId: context.activeGroupId };
        } catch (error) {
            if (!context.signal?.aborted) {
                const span = `failure_${crypto.randomUUID()}`;
                globalTraceManager.createSpan(traceId, span, '本轮失败 · 正文与状态均未保存', 'text_failure');
                globalTraceManager.updateSpan(traceId, span, { status: 'error', error: error instanceof Error ? error.message : String(error), parsedOutput: { committed: false } });
            }
            globalTraceManager.endTurnTrace(traceId, context.signal?.aborted ? 'cancelled' : 'error');
            throw error;
        }
    }
}
export const textProcessor = new TextProcessor();
