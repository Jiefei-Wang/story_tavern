import { STORY_TASKS } from "../template/AgentPrompt";
import type { GameSave, GameTurn } from '../../types';
import type { ExecutionContext } from '../pipeline/GamePipeline';
import { agentRuntime, extractJsonPayload, type RunAgentOptions, type RunAgentResult } from '../runtime/AgentRuntime';
import { globalTraceManager } from '../tracing/TraceManager';
import { validateTextWorld } from './Documents';
import { addTextBindings, ROUTED_AGENTS } from './Agents';
import { anchoredNarration, characterHistory, historyMessages, prepareHistory, visibleNarration } from './History';
import { requiredText, validateCards, validateOutlines, validateRoute } from './RoutedProtocol';
import type { CharacterDesign, TextEvent } from './types';
import { setupPromptData } from './Setup';

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
        const card = (id: string) => ({ character_id: id, public: world.documents[`characters/${id}/public.md`].text, profile: world.documents[`characters/${id}/profile.md`].text });
        const call = async (agentId: string, task: string, material: unknown, instructions = '', retry = '') => {
            check();
            const result = await this.runner({ agentId, groupId: context.activeGroupId, agents, groups, backends: context.backends,
                context: { ...setupPromptData(world), history, task, material, input, routingInstructions: instructions, retry }, promptMode: true,
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
            const route = await json('text_router', STORY_TASKS.text_router, {
                player_id: world.playerId, cards: world.characters.map(card),
            }, data => validateRoute(data, world.characters.filter(id => id !== world.playerId), world.characters));
            const created: string[] = [];
            if (route.new_characters.length || route.regenerate_characters.length) {
                const requests = [
                    ...route.new_characters.map(r => ({ ...r, character_id: null as string | null })),
                    ...route.regenerate_characters.map((r, i) => ({ request_id: `regenerate.${i}`, description: r.description, character_id: r.character_id })),
                ];
                const cards = await json('text_character_designer', STORY_TASKS.text_character_designer, {
                    requests, existing_cards: world.characters.map(id => ({ ...card(id), initial_memory: world.documents[`characters/${id}/memory.md`].text, state_history: characterHistory(turns, id) })),
                }, data => validateCards(data, requests.map(r => r.request_id)), route.instructions);
                for (const item of cards) {
                    const existing = requests.find(r => r.request_id === item.request_id)!.character_id;
                    const id = existing ?? `person_${crypto.randomUUID().replace(/-/g, '')}`;
                    if (!existing) { created.push(id); world.characters.push(id); }
                    for (const [kind, text] of Object.entries({ public: `# ${item.name}\n${item.public}`, profile: `# ${item.name}\n${item.profile}`, memory: JSON.stringify(item.initial_state, null, 2) })) {
                        const path = `characters/${id}/${kind}.md`, previous = world.documents[path];
                        world.documents[path] = { ...previous, text, revision: previous ? previous.revision + 1 : 0 };
                    }
                }
                validateTextWorld(world);
            }
            const selected = [...route.characters, ...created];
            const designs: CharacterDesign[] = selected.length ? await json('text_outline_designer', STORY_TASKS.text_outline_designer, {
                cards: selected.map(id => ({ ...card(id), initial_memory: world.documents[`characters/${id}/memory.md`].text, state_history: characterHistory(turns, id) })),
                ...(world.setupVersion === 2 ? {} : { private_world: world.documents['world/private.md'].text }),
            }, data => validateOutlines(data, selected), route.instructions) : [];
            const performances = designs.filter(d => d.expression_outline || d.action).map(d => ({ character_id: d.character_id, public: world.documents[`characters/${d.character_id}/public.md`].text, expression_outline: d.expression_outline, action: d.action }));
            const output = requiredText(visibleNarration((await call('text_storyteller', STORY_TASKS.text_storyteller, { performances, updated_cards: route.regenerate_characters.map(r => ({ character_id: r.character_id, public: world.documents[`characters/${r.character_id}/public.md`].text })) }, route.instructions)).output), '故事正文');
            check();
            const anchor = Math.max(0, ...turns.map(t => t.narration?.anchor || 0)) + 1;
            const narration = { anchor, requestText: anchoredNarration(output, anchor) };
            const events: TextEvent[] = performances.map((p, order) => ({ order, source: p.character_id, text: [p.expression_outline, p.action].filter(Boolean).join('\n'), public: true }));
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
