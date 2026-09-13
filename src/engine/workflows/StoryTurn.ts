import type { AgentDefinition, AgentGroup, Backend, GameSave, GameTurn } from '../../types';
import { agentRuntime, extractJsonPayload, type RunAgentOptions, type RunAgentResult } from '../runtime/AgentRuntime';
import { DEFAULT_STORY_WORKFLOW, runWorkflow, type Workflow, type PreparedStep } from './Workflow';
import { STORY_TASKS } from '../template/AgentPrompt';
import { globalTraceManager } from '../tracing/TraceManager';
import { validateTextWorld } from '../text/Documents';
import { addTextBindings, ROUTED_AGENTS } from '../text/Agents';
import { anchoredNarration, characterHistory, historyMessages, prepareHistory, visibleNarration } from '../text/History';
import { requiredText, validateCards, validateOutlines, validateRoute } from '../text/RoutedProtocol';
import type { CharacterDesign, CharacterRoute, TextEvent } from '../text/types';
import { setupPromptData } from '../text/Setup';

export interface StoryContext {
  agents: AgentDefinition[]; groups: AgentGroup[]; backends: Backend[]; activeGroupId: string;
  mockMode: boolean; signal?: AbortSignal; onTraceStarted?: (traceId: string) => void;
  workflow?: Workflow;
  recentTurns?: GameTurn[];
}

/** Game data adapters and transaction candidate; all model scheduling lives in runWorkflow. */
export class StoryWorkflow {
  constructor(private readonly runner: (options: RunAgentOptions) => Promise<RunAgentResult> = options => agentRuntime.runAgent(options)) {}

  async execute(save: GameSave, input: string, context: StoryContext): Promise<GameSave> {
    if (!save.textWorld) throw new Error('请先迁移为文本存档');
    validateTextWorld(save.textWorld);
    if (context.mockMode) throw new Error('故事组合需要已配置的 Backend，不自动回退 Mock');
    requiredText(input, '用户输入');
    const before = structuredClone(save.textWorld), world = structuredClone(before);
    const turns = prepareHistory(save.turns), history = historyMessages(turns);
    const agents = [...context.agents];
    for (const agent of ROUTED_AGENTS) if (!agents.some(a => a.id === agent.id)) agents.push(agent);
    const groups = context.groups.map(addTextBindings);
    const turnId = `text_${crypto.randomUUID()}`, traceId = `trace_${turnId}`;
    const card = (id: string) => ({ character_id: id, public: world.documents[`characters/${id}/public.md`].text, profile: world.documents[`characters/${id}/profile.md`].text });
    let route: CharacterRoute = { characters: [], new_characters: [], regenerate_characters: [], instructions: '' };
    const created: string[] = [];
    let designs: CharacterDesign[] = [];
    const selected = () => [...route.characters, ...created];
    const performances = () => designs.filter(d => d.expression_outline || d.action).map(d => ({ character_id: d.character_id, public: world.documents[`characters/${d.character_id}/public.md`].text, expression_outline: d.expression_outline, action: d.action }));
    const requests = () => [
      ...route.new_characters.map(r => ({ ...r, character_id: null as string | null })),
      ...route.regenerate_characters.map((r, i) => ({ request_id: `regenerate.${i}`, description: r.description, character_id: r.character_id })),
    ];
    const json = (data: unknown) => typeof data === 'string' ? extractJsonPayload(data) : data;
    const stages: Record<NonNullable<Workflow['steps'][number]['storyStage']>, () => PreparedStep> = {
      route: () => ({ context: { task: STORY_TASKS.text_router, material: { player_id: world.playerId, cards: world.characters.map(card) } }, jsonObject: true,
        validate: data => validateRoute(json(data), world.characters.filter(id => id !== world.playerId), world.characters), accept: data => { route = data; } }),
      cards: () => ({ context: { task: STORY_TASKS.text_character_designer, material: {
        requests: requests(), existing_cards: world.characters.map(id => ({ ...card(id), initial_memory: world.documents[`characters/${id}/memory.md`].text, state_history: characterHistory(turns, id) })),
      } }, skip: !requests().length, jsonObject: true,
        validate: data => validateCards(json(data), requests().map(r => r.request_id)),
        accept: (cards: ReturnType<typeof validateCards>) => {
          for (const item of cards) {
            const existing = requests().find(r => r.request_id === item.request_id)!.character_id;
            const id = existing ?? `person_${crypto.randomUUID().replace(/-/g, '')}`;
            if (!existing) { created.push(id); world.characters.push(id); }
            for (const [kind, text] of Object.entries({ public: `# ${item.name}\n${item.public}`, profile: `# ${item.name}\n${item.profile}`, memory: JSON.stringify(item.initial_state, null, 2) })) {
              const path = `characters/${id}/${kind}.md`, previous = world.documents[path];
              world.documents[path] = { ...previous, text, revision: previous ? previous.revision + 1 : 0 };
            }
          }
          validateTextWorld(world);
        } }),
      outlines: () => ({ context: { task: STORY_TASKS.text_outline_designer, material: {
        cards: selected().map(id => ({ ...card(id), initial_memory: world.documents[`characters/${id}/memory.md`].text, state_history: characterHistory(turns, id) })),
        ...(world.setupVersion === 2 ? {} : { private_world: world.documents['world/private.md'].text }),
      } }, skip: !selected().length, jsonObject: true,
        validate: data => validateOutlines(json(data), selected()), accept: data => { designs = data; } }),
      narration: () => ({ context: { task: STORY_TASKS.text_storyteller, material: { performances: performances(), updated_cards: route.regenerate_characters.map(r => ({ character_id: r.character_id, public: world.documents[`characters/${r.character_id}/public.md`].text })) } },
        validate: data => requiredText(visibleNarration(requiredText(data, '故事正文')), '故事正文') }),
    };
    const workflow = context.workflow || DEFAULT_STORY_WORKFLOW;
    try {
      const output = requiredText(visibleNarration(await runWorkflow(workflow, input, {
        agents, groups, backends: context.backends, groupId: context.activeGroupId, signal: context.signal,
        traceId, finishTrace: false, onTraceStarted: context.onTraceStarted,
        context: { ...setupPromptData(world), history, input },
        prepareStep: step => {
          const prepared = stages[step.storyStage!]();
          return { ...prepared, context: { ...setupPromptData(world), history, input, routingInstructions: route.instructions, retry: '', ...prepared.context } };
        },
      }, this.runner)), '故事正文');
      context.signal?.throwIfAborted();
      const anchor = Math.max(0, ...turns.map(t => t.narration?.anchor || 0)) + 1;
      const narration = { anchor, requestText: anchoredNarration(output, anchor) };
      const events: TextEvent[] = performances().map((p, order) => ({ order, source: p.character_id, text: [p.expression_outline, p.action].filter(Boolean).join('\n'), public: true }));
      world.revision = before.revision + 1;
      world.documents[`turns/${turnId}.md`] = { text: narration.requestText, revision: 0 };
      validateTextWorld(world);
      const turn: GameTurn = { id: turnId, turnIndex: turns.length, timestamp: new Date().toISOString(), playerInput: input, narratorOutput: output,
        narration, traceId, worldStateBefore: save.worldState, worldStateAfter: save.worldState, patches: [], activeAgentGroupId: context.activeGroupId, status: 'success',
        textTurn: { pipeline: 'workflow-v1', workflowId: workflow.id, before, after: structuredClone(world), events, deliveries: [], characters: {}, designs, createdCharacters: created, instructions: route, commit: 'draft' } };
      const span = `commit_${crypto.randomUUID()}`;
      globalTraceManager.createSpan(traceId, span, '正文与人物状态 · 等待原子保存', 'text_commit');
      globalTraceManager.updateSpan(traceId, span, { status: 'success', parsedOutput: { anchor, characters: selected(), created, committed: false } });
      return { ...save, textWorld: world, turns: [...turns, turn], updatedAt: new Date().toISOString(), activeAgentGroupId: context.activeGroupId };
    } catch (error) {
      globalTraceManager.endTurnTrace(traceId, context.signal?.aborted ? 'cancelled' : 'error');
      throw error;
    }
  }
}
export const storyWorkflow = new StoryWorkflow();
