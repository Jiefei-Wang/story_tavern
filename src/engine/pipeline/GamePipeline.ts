import { WorldDefinition, CharacterStateUpdate } from "../../types";
import { HARBOR_WORLD_DEFINITION } from "../character-schema/HarborSchema";
import { assertCharacterSchema, buildCharacterSchemaPrompt, validateCharacterAgainstSchema, validateCharacterUpdate, ChangeLedger } from "../character-schema/CharacterSchema";
import { applyCharacterPatches } from "../character-schema/GuardedPatches";
import { resolveSpeechTargets, updateConversation } from "../world/ConversationRouter";
import { renderNarratorSegments } from "../narration/NarratorComposition";
import {
  AgentDefinition,
  AgentGroup,
  Backend,
  GameEvent,
  GameTurn,
  InputCompilerResult,
  JsonPatchOperation,
  NPCIntent,
  NPCReactionResult,
  PerceptionResult,
  WorldResolverResult,
  WorldState,
} from "../../types";
import { PipelineStageError } from "../errors/PipelineStageError";
import { agentRuntime } from "../runtime/AgentRuntime";
import { explicitAdminCommand } from "../runtime/InputAuthority";
import { captureNpcObservations, recentNpcExperiences, REACTION_CAUSALITY_POLICY, stateUpdateEvidenceError } from '../world/ReactionEvidence';
import { CHARACTER_EFFECT_POLICY, materializeCharacterEffects } from '../world/CharacterEffects';
import { materializeNpcPhysicalEffects, NPC_CONSUMPTION_POLICY, isPhysicalEffectAction } from '../world/NPCPhysicalEffects';
import { normalizeTurnTiming, elapsedSecondsForBlock, advanceClock, waitPlanningSeconds, settledWaitSeconds } from '../scheduling/TurnTiming';
import { resolvePlayerActions } from '../world/ActionResolution';
import { auditNarration, narrationCorrectionInstructions } from '../narration/NarrationAuditor';
import { fitNpcSpeechBudget } from '../scheduling/NpcSpeechBudget';
import { safePipelineError } from '../errors/PipelineStageError';
import { auditCharacterChanges } from '../world/CharacterChangeAuditor';
import { buildSettledCharacterHistory } from '../world/CharacterStateHistory';
import { generateNewCharacters } from "../characters/CharacterGenerator";
import {
  calculateReactionBudget,
} from "../scheduling/TemporalScheduler";
import { globalTraceManager } from "../tracing/TraceManager";
import { applyPatches, cloneWorldState } from "../world/PatchEngine";
import { SpatialEngine } from "../world/SpatialEngine";
import {
  buildNarratorEntityView,
  buildNpcView,
  buildPerceptionView,
  filterPublicPatches,
  sanitizeNpcObservations,
  validatePerceptionAgainstEvents,
  validateResolverCoverage,
  validatePublicEvents,
} from "../world/WorldViews";
import {
  getSafeEventDuration,
  getSafeIntentDuration,
  sanitizeThoughtBudget,
} from "../world/TimingEngine";

export { getSafeIntentDuration };

function normalizeIntent(rawIntent: NPCIntent): NPCIntent {
  if (rawIntent.type !== "speech" || rawIntent.speechPlan) return rawIntent;
  // Compatibility for saved/custom agents from before SpeechPlan. Built-in
  // agent schemas reject this shape; this adapter keeps old user agents from
  // silently losing a reaction while the pipeline migrates.
  if (typeof rawIntent.content === "string" && rawIntent.content.trim()) {
    return {
      ...rawIntent,
      speechPlan: {
        summary: rawIntent.content.trim(),
        beats: [{ meaning: rawIntent.content.trim(), required: true }],
        verbosity: "normal",
      },
    };
  }
  return rawIntent;
}

const CHARACTER_CREATION_POLICY = "人物创建协议：需要新增人物时只输出最小 add Patch，路径 /entities/<唯一新ID>，value 只含 type:character、临时称呼 name 和合法 location。新增人物的真实姓名和世界定义属性将由独立人物生成器生成，不要在本阶段生成这些内容或为新人物编造对白。不要将世界秘密、剧情或其他人的知识赋给新人。只输出必要的简短 JSON。";

export interface ExecutionContext {
  recentTurns?: GameTurn[];
  worldDefinition?: WorldDefinition;
  onTraceStarted?: (traceId: string) => void;
  agents: AgentDefinition[];
  groups: AgentGroup[];
  backends: Backend[];
  activeGroupId: string;
  mockMode: boolean;
  signal?: AbortSignal;
}

export interface PipelineTurnResult {
  turn: GameTurn;
  traceId: string;
  success: boolean;
  cancelled?: boolean;
  error?: string;
}

export class GamePipeline {
  async executeTurn(
    playerInput: string,
    initialWorld: WorldState,
    turnIndex: number,
    execContext: ExecutionContext
  ): Promise<PipelineTurnResult> {
    const uuid =
      typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    const traceId = `trace_${turnIndex}_${uuid}`;

    globalTraceManager.startTurnTrace(traceId, turnIndex, playerInput);
    execContext.onTraceStarted?.(traceId);

    const checkAborted = () => {
      if (execContext.signal?.aborted) {
        const err = new Error("Generation aborted by user");
        err.name = "AbortError";
        throw err;
      }
    };

    checkAborted();

    // Snapshot world state: transaction baseline
    const worldBefore = cloneWorldState(initialWorld);
    let workingWorld = cloneWorldState(initialWorld);

    const schema = (execContext.worldDefinition || HARBOR_WORLD_DEFINITION).characterSchema;
    const turnLedger: ChangeLedger = {};
    const allEvents: GameEvent[] = [];
    const allCommittedPatches: JsonPatchOperation[] = [];
    const allCommittedEvents: import("../../types").CommittedTurnEvent[] = [];
    const allRejectedIntents: Array<{ intent: NPCIntent; reason: string }> = [];
    const npcExperiences: Record<string, import('../../types').NPCExperience[]> = {};
    const visibleObservations: Record<string, import('../../types').NPCObservation[]> = {};
    const reactionContexts: Record<string, ReturnType<typeof buildNpcView> & { recentExperiences: import('../../types').NPCExperience[] }> = {};
    const experienceFor = (npcId: string) => [...recentNpcExperiences(execContext.recentTurns || [], npcId), ...(npcExperiences[npcId] || [])];
    const npcContext = (npcId: string, observations: import('../../types').NPCObservation[], budget: any, events: GameEvent[]) => {
      const recentExperiences = experienceFor(npcId);
      visibleObservations[npcId] = observations;
      captureNpcObservations(npcExperiences, npcId, observations);
      return reactionContexts[npcId] = { ...buildNpcView(workingWorld, npcId, observations, budget, events, schema), recentExperiences };
    };

    // Cache state from preceding normal block for wait block perspective inheritance
    let lastNormalObservations: Record<string, import("../../types").NPCObservation[]> | null = null;
    let lastAffectedNpcIds: string[] = [];
    let lastNormalEvents: GameEvent[] = [];

    const runtimeOpts = {
      groupId: execContext.activeGroupId,
      traceId,
      agents: execContext.agents,
      groups: execContext.groups,
      backends: execContext.backends,
      mockMode: execContext.mockMode,
      signal: execContext.signal,
    };

    try {
      assertCharacterSchema(schema);
      for (const [id, entity] of Object.entries(workingWorld.entities)) if (entity.type === 'character') {
        const result = validateCharacterAgainstSchema(entity, schema, workingWorld);
        if (!result.valid) throw new PipelineStageError('character_schema', `${id}: ${result.errors.join('; ')}`);
      }
      const characterSchemaPrompt = buildCharacterSchemaPrompt(schema);
      const validateReactions = async (reactions: Array<{ npcId: string; reaction: NPCReactionResult }>, parent: string, phase: 'reaction' | 'completed_process' = 'reaction') => Promise.all(reactions.map(async item => {
        let proposedCharacter = structuredClone(workingWorld.entities[item.npcId]);
        const ledger = { ...turnLedger }, event: ChangeLedger = {};
        const accepted: CharacterStateUpdate[] = [], rejected: unknown[] = [], validation: unknown[] = [];
        const proposed = item.reaction.stateUpdates || [];
        if (!Array.isArray(proposed)) throw new PipelineStageError('character_schema', 'stateUpdates must be an array');
        for (const update of proposed) {
          const causeError = execContext.mockMode ? null : stateUpdateEvidenceError(update, visibleObservations[item.npcId] || [], experienceFor(item.npcId));
          if (causeError) { rejected.push({ update, reason: [causeError] }); continue; }
          const result = validateCharacterUpdate(proposedCharacter, update, schema, workingWorld, item.npcId, ledger, event);
          validation.push({ update, ...result, schemaRule: result.errors.join('; ') || 'passed' });
          if (result.valid) { accepted.push(update); proposedCharacter = result.after; }
          else rejected.push({ update, reason: result.errors });
        }
        const before = workingWorld.entities[item.npcId];
        const view = reactionContexts[item.npcId];
        if ((accepted.length || item.reaction.intents.some(intent => intent.type === 'speech')) && !execContext.mockMode) {
          const auditContext = () => ({ npcId: item.npcId, schema, before, recentExperiences: view.recentExperiences, settledStateHistory: buildSettledCharacterHistory(execContext.recentTurns || [], item.npcId, { id: `turn_${turnIndex}_${uuid}`, turnIndex, worldStateBefore: worldBefore, worldStateAfter: workingWorld, patches: allCommittedPatches, npcExperiences }), observations: visibleObservations[item.npcId] || [], intents: item.reaction.intents, proposedStateUpdates: accepted, proposedCharacter, availableTime: view.reaction.available_time, phase, visibleObjects: view.visibleObjects });
          let audit = await auditCharacterChanges(auditContext(), { ...runtimeOpts, parentSpanId: parent });
          if (!audit.success) throw new PipelineStageError('character_schema', audit.error || '人物变化审查失败');
          if (!audit.data.valid) {
            const correction = await agentRuntime.runAgent<NPCReactionResult>({ ...runtimeOpts, parentSpanId: parent, agentId: 'npc_reaction', context: view,
              instructions: REACTION_CAUSALITY_POLICY + '\n本次修正属性提议及有审查问题的发言事实。阶段为' + phase + '。原来的物理动作已经冻结，不得补行动或延长时间。重新输出完整NPCReaction协议，intents数量、顺序、id、type和target原样保留；仅被speechIssues点名的speechPlan可纠正事实，不能改成不同立场或删去必要回应。其他intents原样返回。逐项纠正因果问题，不能用改写reason保留同一个不合理结果。原计划：' + JSON.stringify(item.reaction.intents) + '\n原提议：' + JSON.stringify(accepted) + '\n审查意见：' + JSON.stringify(audit.data) });
            if (!correction.success) throw new PipelineStageError('npc_reaction', correction.error || '人物变化修正失败');
            const speechIssues = audit.data.speechIssues || [];
            if (speechIssues.length) {
              const correctedIntents = item.reaction.intents.map((intent, index) => {
                const replacement = correction.data.intents?.[index];
                if (!speechIssues.some(issue => issue.intentIndex === index) || intent.type !== 'speech' || replacement?.type !== 'speech' || replacement.target !== intent.target) return intent;
                return { ...replacement, id: intent.id, duration: getSafeIntentDuration(replacement) };
              });
              if (correctedIntents.reduce((total, intent) => total + getSafeIntentDuration(intent, view.reaction.available_time), 0) <= view.reaction.available_time) item = { ...item, reaction: { ...item.reaction, intents: correctedIntents } };
            }
            rejected.push(...audit.data.issues.map(issue => ({ update: accepted[issue.updateIndex], reason: [issue.reason], corrected: true })));
            accepted.length = 0;
            proposedCharacter = structuredClone(before);
            const correctionLedger = { ...turnLedger }, correctionEvent: ChangeLedger = {};
            for (const update of correction.data.stateUpdates || []) {
              const causeError = stateUpdateEvidenceError(update, visibleObservations[item.npcId] || [], experienceFor(item.npcId));
              if (causeError) { rejected.push({ update, reason: [causeError] }); continue; }
              const result = validateCharacterUpdate(proposedCharacter, update, schema, workingWorld, item.npcId, correctionLedger, correctionEvent);
              if (result.valid) { accepted.push(update); proposedCharacter = result.after; }
              else rejected.push({ update, reason: result.errors });
            }
            audit = await auditCharacterChanges(auditContext(), { ...runtimeOpts, parentSpanId: parent });
            if (!audit.success) throw new PipelineStageError('character_schema', audit.error || '人物变化复核失败');
            if (!audit.data.valid) {
              const invalidSpeech = new Set((audit.data.speechIssues || []).map(issue => issue.intentIndex));
              if (invalidSpeech.size) {
                rejected.push(...(audit.data.speechIssues || []).map(issue => ({ intent: item.reaction.intents[issue.intentIndex], reason: [issue.reason] })));
                item = { ...item, reaction: { ...item.reaction, intents: item.reaction.intents.filter((_, index) => !invalidSpeech.has(index)) } };
              }
              // Recompute the surviving proposal set; a rejected delta must never
              // remain embedded in the candidate character shown to the Resolver.
              const invalid = new Set(audit.data.issues.map(issue => issue.updateIndex));
              const survivors = accepted.filter((update, index) => {
                if (!invalid.has(index)) return true;
                rejected.push({ update, reason: [audit.data.issues.find(issue => issue.updateIndex === index)!.reason] });
                return false;
              });
              accepted.length = 0;
              proposedCharacter = structuredClone(before);
              const survivorLedger = { ...turnLedger }, survivorEvent: ChangeLedger = {};
              for (const update of survivors) {
                const result = validateCharacterUpdate(proposedCharacter, update, schema, workingWorld, item.npcId, survivorLedger, survivorEvent);
                if (result.valid) { accepted.push(update); proposedCharacter = result.after; }
                else rejected.push({ update, reason: result.errors });
              }
            }
          }
        }
        const spanId = `${parent}_${item.npcId}_state_updates`;
        globalTraceManager.createSpan(traceId, spanId, `Character state proposals: ${item.npcId}`, 'character_update_validation', parent);
        globalTraceManager.updateSpan(traceId, spanId, { status: 'success', parsedOutput: { proposed, accepted, rejected, validation, before: workingWorld.entities[item.npcId], after: proposedCharacter, committed: false } });
        return { ...item, reaction: { ...item.reaction, stateUpdates: accepted }, proposedCharacter };
      }));
      const resolverInstructions = (reactions: Array<{ npcId: string; reaction: NPCReactionResult }>) => CHARACTER_CREATION_POLICY + "\n" + characterSchemaPrompt +
        '\n' + CHARACTER_EFFECT_POLICY + '\n' + NPC_CONSUMPTION_POLICY +
        "\nResolver 输出硬协议：输入 events 是玩家事件，程序会单独记录它们；publicEvents 绝不重复输出玩家 action/speech。publicEvents 只输出下列 NPC intent 的接受结果（以及确实发生的 environment）。NPC 没有 intent 就不生成 NPC action/speech。sourceIntentId 必须精确取自下表 id，不能取 e1/e2 等玩家 eventId。所有类型都必须原样保留 target（intent 没有 target 则 publicEvent 必须省略 target，绝不补 player）。action 原样保留 op，speech 原样保留整个 speechPlan。每条 intent 接受或拒绝一次。Patch 路径必须以 /entities/<id>/、/scene/、/rules/ 或 /clock 开始，不能写 /<id>/。\n权威 NPC intent 清单：" + JSON.stringify(reactions.flatMap(r => r.reaction.intents.map(intent => ({ npcId: r.npcId, ...intent })))) +
        "\n若接受，直接使用以下公开事件模板，不增删 op/target/speechPlan 的键；若不接受在 rejectedIntents 中说明理由：" + JSON.stringify(reactions.flatMap(r => r.reaction.intents.filter(i => i.type !== 'wait').map(i => ({ actor: r.npcId, type: i.type, sourceIntentId: i.id, ...(i.target !== undefined ? { target: i.target } : {}), ...(i.op !== undefined ? { op: i.op } : {}), ...(i.type === 'speech' ? { speechPlan: i.speechPlan } : {}) }))));
      const commitPatches = (patches: JsonPatchOperation[], parent: string, proposedPatches: JsonPatchOperation[]) => {
        // Generator diff compaction must not erase transient policy violations or cumulative numeric travel.
        const pendingLedger = { ...turnLedger };
        const originalValidation = applyCharacterPatches(workingWorld, proposedPatches, schema, pendingLedger, true);
        const result = originalValidation.success ? applyCharacterPatches(workingWorld, patches, schema, { ...turnLedger }) : originalValidation;
        if (result.success) Object.assign(turnLedger, pendingLedger);
        const spanId = `${parent}_character_patch_validation`;
        globalTraceManager.createSpan(traceId, spanId, 'Character Schema commit gate', 'character_patch_validation', parent);
        globalTraceManager.updateSpan(traceId, spanId, { status: result.success ? 'success' : 'error', error: result.error, inputContext: { proposed: proposedPatches, generated: patches }, parsedOutput: { accepted: result.appliedPatches, rejected: result.success ? [] : patches, reason: result.error, schemaRule: result.error || 'all constraints passed', before: workingWorld.entities, after: result.newWorld.entities } });
        return result;
      };
      const recordStateSources = (reactions: Array<{npcId: string; reaction: NPCReactionResult}>, applied: JsonPatchOperation[]) => {
        for (const {npcId,reaction} of reactions) for (const update of reaction.stateUpdates || []) {
          const path = '/entities/' + npcId.replace(/~/g,'~0').replace(/\//g,'~1') + '/' + update.path.split('.').map(s => s.replace(/~/g,'~0').replace(/\//g,'~1')).join('/');
          if (!applied.some(p => p.path === path || p.path.startsWith(path+'/'))) continue;
          for (const id of update.sourceEventIds || []) {
            const evidence = npcExperiences[npcId]?.find(e => e.id === id);
            if (evidence && !evidence.appliedStatePaths?.includes(update.path)) (evidence.appliedStatePaths ||= []).push(update.path);
          }
        }
      };
      checkAborted();
      // Explicit command syntax is deterministic; only free-form input needs an LLM.
      const adminCommand = explicitAdminCommand(playerInput);
      if (adminCommand === "") {
        throw new PipelineStageError("input_compiler", "管理员指令不能为空，请在 admin: 后输入具体命令");
      }
      const explicitInput: InputCompilerResult | null = adminCommand !== null
        ? { blocks: [{ id: "explicit_admin", kind: "admin", command: adminCommand }] }
        : null;
      if (explicitInput) {
        const spanId = `span_explicit_input_${uuid}`;
        globalTraceManager.createSpan(traceId, spanId, "Explicit Admin Command", "input_parser");
        globalTraceManager.updateSpan(traceId, spanId, {
          status: "success", inputContext: { playerInput }, parsedOutput: explicitInput,
        });
      }
      const compilerResult = explicitInput ? { success: true, data: explicitInput, error: undefined } : await agentRuntime.runAgent<InputCompilerResult>({
        ...runtimeOpts,
        agentId: "input_compiler",
        context: {
          player: { input: playerInput },
          scene: workingWorld.scene,
          conversation: workingWorld.conversation ?? {},
          entities: buildNarratorEntityView(workingWorld, schema),
        },
      });

      if (!compilerResult.success || !compilerResult.data?.blocks) {
        throw new PipelineStageError(
          "input_compiler",
          compilerResult.error || "Input Compiler failed to produce valid temporal blocks"
        );
      }

      const blocks = normalizeTurnTiming(compilerResult.data.blocks, playerInput);
      // Check the complete plan before any block executes, including custom/mock compilers.
      if (adminCommand === null && blocks.some(block => block.kind === "admin")) {
        throw new PipelineStageError("input_compiler", "未授权的管理员路由：只有以 admin: 或 管理员: 开头的原始输入才允许管理员指令");
      }

      // Process each temporal block sequentially within transaction
      for (let blockIndex = 0; blockIndex < blocks.length; blockIndex++) {
        checkAborted();
        const block = blocks[blockIndex];
        const blockSpanId = `span_block_${block.id || blockIndex}_${uuid}`;

        globalTraceManager.createSpan(
          traceId,
          blockSpanId,
          `TemporalBlock [${block.kind}]`,
          "temporal_block",
          undefined,
          undefined,
          block.id,
          blockIndex
        );

        const blockRuntimeOpts = {
          ...runtimeOpts,
          parentSpanId: blockSpanId,
          blockId: block.id,
          blockIndex,
        };

        const committedStart = allCommittedEvents.length;
        const blockWorldBefore = cloneWorldState(workingWorld);
        const previousLocation = workingWorld.scene.location;
        const previousClock = workingWorld.clock;
        const previousConversation = { ...workingWorld.conversation };
        try {
          if (block.kind === "admin") {
            // Admin Patch Block
            const adminResult = await agentRuntime.runAgent<WorldResolverResult>({
              ...blockRuntimeOpts,
              agentId: "admin_patch",
              instructions: CHARACTER_CREATION_POLICY + "\n" + characterSchemaPrompt + '\n这是用户显式授权的作者配置编辑，不是故事角色申请权限。按command修改指定配置字段；不要用NPC访客权限或室内没有天气阻止作者设置weather。仅修改要求字段，其他人物、历史、权限不变。不能输出把旧值写回的假成功。',
              context: {
                command: block.command || playerInput,
                world: workingWorld,
                characterSchemaPrompt,
              },
            });

            if (!adminResult.success) {
              throw new PipelineStageError(
                "admin_patch",
                adminResult.error || "Admin Patch Agent execution failed"
              );
            }

            const proposedPatches = adminResult.data?.patches || [];
            const patches = await generateNewCharacters(workingWorld, proposedPatches, playerInput, blockRuntimeOpts, schema);
            let applied: JsonPatchOperation[] = [];
            if (patches.length > 0 || proposedPatches.length > 0) {
              const patchRes = commitPatches(patches, blockSpanId, proposedPatches);
              if (!patchRes.success) {
                throw new PipelineStageError(
                  "patch_application",
                  patchRes.error || "Failed to apply admin patches to working world"
                );
              }
              workingWorld = patchRes.newWorld;
              applied = patchRes.appliedPatches;
              allCommittedPatches.push(...applied);
            }

            allCommittedEvents.push({
              id: `turn_${turnIndex}_b${blockIndex}_event_${allCommittedEvents.length}`,
              type: "admin_change",
              blockId: block.id,
              source: block.command || playerInput,
              public: true,
              patches: filterPublicPatches(applied, schema, blockWorldBefore, workingWorld),
            });

            // Cache invalidation: admin breaks immediate normal -> wait sequence
            lastNormalObservations = null;
            lastAffectedNpcIds = [];

            globalTraceManager.updateSpan(traceId, blockSpanId, { status: "success" });
          } else if (block.kind === "time_skip") {
            // Time Skip Block
            const skipTarget = block.duration !== undefined ? `等待${block.duration}秒；只模拟这段时间内已成立的过程` :
              block.to ||
              (block as any).target ||
              (block as any).duration ||
              (block as any).command ||
              playerInput;

            const skipResult = await agentRuntime.runAgent<WorldResolverResult>({
              ...blockRuntimeOpts,
              agentId: "time_skip",
              instructions: CHARACTER_CREATION_POLICY + "\n" + characterSchemaPrompt,
              context: {
                skipTarget,
                world: workingWorld,
                characterSchemaPrompt,
              },
            });

            if (!skipResult.success) {
              throw new PipelineStageError(
                "time_skip",
                skipResult.error || "Time Skip Agent execution failed"
              );
            }

            const proposedPatches = skipResult.data?.patches || [];
            const patches = await generateNewCharacters(workingWorld, proposedPatches, playerInput, blockRuntimeOpts, schema);
            let applied: JsonPatchOperation[] = [];
            if (patches.length > 0 || proposedPatches.length > 0) {
              const patchRes = commitPatches(patches, blockSpanId, proposedPatches);
              if (!patchRes.success) {
                throw new PipelineStageError(
                  "patch_application",
                  patchRes.error || "Failed to apply time skip patches to working world"
                );
              }
              workingWorld = patchRes.newWorld;
              applied = patchRes.appliedPatches;
              allCommittedPatches.push(...applied);
            }

            allCommittedEvents.push({
              id: `turn_${turnIndex}_b${blockIndex}_event_${allCommittedEvents.length}`,
              type: "time_skip",
              blockId: block.id,
              source: skipTarget,
              public: true,
              patches: filterPublicPatches(applied, schema, blockWorldBefore, workingWorld),
            });

            // Cache invalidation: time skip breaks immediate normal -> wait sequence
            lastNormalObservations = null;
            lastAffectedNpcIds = [];

            globalTraceManager.updateSpan(traceId, blockSpanId, { status: "success" });
          } else if (block.kind === "normal") {
            // Normal Block: Events -> Perception -> NPC Reaction -> World Resolver
            const originalEvents = (block.events || []).map(e => ({ ...e, id: `t${turnIndex}_b${blockIndex}_${e.id}` }));
            const attemptedEvents = resolveSpeechTargets(originalEvents, workingWorld, playerInput);
            const resolution = await resolvePlayerActions(attemptedEvents, workingWorld, playerInput, blockRuntimeOpts);
            const events = resolution.events;
            const actionSpan = `${blockSpanId}_action_outcomes`;
            globalTraceManager.createSpan(traceId, actionSpan, 'Player action outcomes', 'action_resolution', blockSpanId);
            globalTraceManager.updateSpan(traceId, actionSpan, {status:'success',inputContext:{attempts:attemptedEvents},parsedOutput:{outcomes:resolution.outcomes,patches:resolution.patches}});
            workingWorld = resolution.world;
            allCommittedPatches.push(...resolution.patches);
            lastNormalEvents = events;
            globalTraceManager.updateSpan(traceId, blockSpanId, { inputContext: { conversation: workingWorld.conversation ?? {}, resolvedEvents: events } });
            allEvents.push(...events);

            // 2. Perception Agent (Strict Fail-Fast, with isolated perception view)
            checkAborted();
            const perceptionView = buildPerceptionView(workingWorld, schema);
            const perceptionResult = await agentRuntime.runAgent<PerceptionResult>({
              ...blockRuntimeOpts,
              agentId: "perception",
              context: {
                events,
                scene: perceptionView.scene,
                entities: perceptionView.entities,
              },
            });

            if (!perceptionResult.success) {
              throw new PipelineStageError(
                "perception",
                perceptionResult.error || "Perception Agent failed to execute"
              );
            }

            if (
              !perceptionResult.data ||
              typeof perceptionResult.data.npcObservations !== "object" ||
              perceptionResult.data.npcObservations === null
            ) {
              throw new PipelineStageError(
                "perception",
                "Perception Agent returned invalid or missing npcObservations structure"
              );
            }

            // Semantic validation: eventIds in observations must exist in current block events!
            validatePerceptionAgainstEvents(perceptionResult.data, events);

            const observations = Object.fromEntries(Object.entries(perceptionResult.data.npcObservations).map(([id, list]) => [id, sanitizeNpcObservations(id, list, events)]));
            const budget = calculateReactionBudget(block);

            // Finite perspective: determine eligible scene characters
            const sceneCharacters = SpatialEngine.getSceneCharacters(workingWorld, false);

            // Only NPCs who are in scene AND perceived the event (saw === true || heard === true) can react
            const targetNpcIds = sceneCharacters
              .map((c) => c.id)
              .filter((npcId) => {
                const obsList = observations[npcId];
                return (
                  Array.isArray(obsList) &&
                  obsList.some((obs) => obs.saw === true || obs.heard === true)
                );
              });

            // Cache for immediately subsequent wait block inheritance
            lastNormalObservations = observations;
            lastAffectedNpcIds = [...targetNpcIds];
            // A following response window is where the NPC finishes responding. Do not
            // independently reconsider and settle the same player event twice.
            const deferToResponseWindow = blocks[blockIndex + 1]?.kind === 'wait';

            // Step 3: Parallel NPC Reactions
            const rawNpcReactions = await Promise.all(
              (deferToResponseWindow ? [] : targetNpcIds).map(async (npcId) => {
                const obsList = observations[npcId] || [];
                const sanitizedObs = sanitizeNpcObservations(npcId, obsList, events);
                const npcView = npcContext(npcId, sanitizedObs, budget, events);

                const reactionOptions = {
                  ...blockRuntimeOpts,
                  agentId: "npc_reaction",
                  instructions: REACTION_CAUSALITY_POLICY + '\n' + NPC_CONSUMPTION_POLICY + "\n优先表达必要回应，避免无意义小动作挤占预算。短时间请简洁说明核心，不能用缩短摘要隐瞒长篇讲话。没有回应必要时可以没有 intents。",
                  context: npcView,
                };
                const reactionRes = await agentRuntime.runAgent<NPCReactionResult>(reactionOptions);

                if (!reactionRes.success || !reactionRes.data) {
                  throw new PipelineStageError(
                    "npc_reaction",
                    reactionRes.error || `NPC reaction failed for character '${npcId}'`
                  );
                }

                const bounded = await fitNpcSpeechBudget({
                  original: reactionRes.data, seconds: budget.available_time, maySpeak: npcView.interaction.maySpeak,
                  idPrefix: `b${blockIndex}_${npcId}_intent`, normalize: normalizeIntent,
                  retry: (instructions, retrySpanId) => agentRuntime.runAgent<NPCReactionResult>({ ...reactionOptions, parentSpanId: retrySpanId || blockSpanId, instructions: reactionOptions.instructions + '\n' + instructions }),
                  trace: { traceId, parentSpanId: blockSpanId, npcId, blockId: block.id, blockIndex },
                });
                const validatedIntents = bounded.reaction.intents;

                const filterSpanId = `${blockSpanId}_${npcId}_filter`;
                globalTraceManager.createSpan(traceId, filterSpanId, `NPC intent permissions: ${npcId}`, "intent_filter", blockSpanId);
                globalTraceManager.updateSpan(traceId, filterSpanId, {
                  status: "success", inputContext: npcView,
                  parsedOutput: { rawIntents: reactionRes.data.intents, acceptedIntents: validatedIntents,
                    filteredIntents: bounded.filteredIntents.map(rejection => rejection.intent),
                    rejections: bounded.filteredIntents, firstAttempt: bounded.firstAttempt, retryAttempt: bounded.retryAttempt, retryReason: bounded.retryReason,
                    reason: npcView.interaction.maySpeak ? "speech permitted; time budget enforced" : "speech intent filtered because maySpeak=false" },
                });
                const boundedThought = sanitizeThoughtBudget(
                  reactionRes.data.thought,
                  budget.available_time
                );

                return {
                  npcId,
                  reaction: {
                    ...reactionRes.data,
                    thought: boundedThought,
                    intents: validatedIntents,
                  },
                };
              })
            );

            const npcReactions = await validateReactions(rawNpcReactions, blockSpanId);

            // Step 4: World Resolver
            checkAborted();
            const resolverResult = deferToResponseWindow ? { success: true, data: { patches: [], publicEvents: [], acceptedStateUpdates: [] } as WorldResolverResult, error: undefined } : await agentRuntime.runAgent<WorldResolverResult>({
              ...blockRuntimeOpts,
              agentId: "world_resolver",
              instructions: resolverInstructions(npcReactions),
              context: {
                events,
                npcReactions,
                characterSchemaPrompt,
                scene: workingWorld.scene,
                entities: workingWorld.entities,
                rules: workingWorld.rules,
                reactionBudget: budget,
              },
            });

            if (!resolverResult.success) {
              throw new PipelineStageError(
                "world_resolver",
                resolverResult.error || "World Resolver failed to resolve state changes"
              );
            }

            // Validate publicEvents returned by World Resolver
            const validationSpan = `${blockSpanId}_public_validation`;
            globalTraceManager.createSpan(traceId, validationSpan, "Public event provenance validation", "public_event_validation", blockSpanId);
            try {
              validatePublicEvents(resolverResult.data?.publicEvents, applyPatches(workingWorld, resolverResult.data?.patches || []).newWorld, npcReactions);
              validateResolverCoverage(resolverResult.data?.publicEvents, resolverResult.data?.rejectedIntents, npcReactions);
              allRejectedIntents.push(...(resolverResult.data?.rejectedIntents || []));
              globalTraceManager.updateSpan(traceId, validationSpan, { status: "success", parsedOutput: { publicEvents: resolverResult.data?.publicEvents, validation: "passed" } });
            } catch (error) {
              globalTraceManager.updateSpan(traceId, validationSpan, { status: "error", error: String(error), parsedOutput: resolverResult.data?.publicEvents });
              throw error;
            }

            const characterPatches = materializeCharacterEffects(resolverResult.data, workingWorld, npcReactions, schema);
            const proposedPatches = [...characterPatches, ...materializeNpcPhysicalEffects({ ...resolverResult.data, patches: characterPatches }, workingWorld, npcReactions)];
            const patches = await generateNewCharacters(workingWorld, proposedPatches, playerInput, blockRuntimeOpts, schema);
            let applied: JsonPatchOperation[] = [];
            if (patches.length > 0 || proposedPatches.length > 0) {
              const patchRes = commitPatches(patches, blockSpanId, proposedPatches);
              if (!patchRes.success) {
                throw new PipelineStageError(
                  "patch_application",
                  patchRes.error || "Failed to apply resolver patches atomically"
                );
              }
              workingWorld = patchRes.newWorld;
              applied = patchRes.appliedPatches;
              allCommittedPatches.push(...applied);
            }

            // Record committed player events
            recordStateSources(npcReactions, applied);
            for (const ev of events) {
              allCommittedEvents.push({
              id: `turn_${turnIndex}_b${blockIndex}_event_${allCommittedEvents.length}`,
                type: ev.type === "speech" ? "player_speech" : "player_action",
                actor: ev.actor || "player",
                blockId: block.id,
                source: ev,
                content: ev.content,
                sourceIntentId: ev.type === "speech" ? ev.id : undefined,
                op: ev.op,
                target: ev.target,
                outcome: ev.outcome,
                public: true,
                patches: filterPublicPatches(applied, schema, blockWorldBefore, workingWorld),
              });
            }

            // Record committed NPC public events from World Resolver
            if (resolverResult.data?.publicEvents && resolverResult.data.publicEvents.length > 0) {
              for (const pubEv of resolverResult.data.publicEvents) {
                allCommittedEvents.push({
              id: `turn_${turnIndex}_b${blockIndex}_event_${allCommittedEvents.length}`,
                  type:
                    pubEv.type === "speech"
                      ? "npc_speech"
                      : pubEv.type === "action"
                      ? "npc_action"
                      : "environment",
                  actor: pubEv.actor,
                  blockId: block.id,
                  source: { ...pubEv, duration: npcReactions.find(r => r.npcId === pubEv.actor)?.reaction.intents.find(i => i.id === pubEv.sourceIntentId)?.duration },
                  content: pubEv.content,
                  sourceIntentId: pubEv.sourceIntentId,
                  speechPlan: pubEv.speechPlan,
                  op: pubEv.op,
                  target: pubEv.target,
                  outcome: { status: 'success', summary: pubEv.speechPlan?.summary || pubEv.content || pubEv.op || '已提交事件', reason: '本事件来自已接受的NPC意图' },
                  public: true,
                });
              }
            }

            globalTraceManager.updateSpan(traceId, blockSpanId, { status: "success" });
          } else if (block.kind === "wait") {
            // Wait Block: NPC Reaction window -> World Resolver
            let waitDuration =
              typeof block.duration === "number" &&
              Number.isFinite(block.duration) &&
              block.duration >= 0
                ? block.duration
                : 5.0;

            const waitBudget = {
              available_time: waitPlanningSeconds(block),
              response_window: true,
              trigger_event_ids: [block.id],
            };

            // Re-evaluate present scene characters in current workingWorld
            const sceneCharacters = SpatialEngine.getSceneCharacters(workingWorld, false);
            const targetNpcList: Array<{
              id: string;
              entity: any;
              obsList: import("../../types").NPCObservation[];
            }> = [];

            if (lastNormalObservations && lastAffectedNpcIds.length > 0) {
              // Method 1: Inherit from preceding normal block - only NPCs who saw/heard previous event get response window!
              for (const sc of sceneCharacters) {
                if (lastAffectedNpcIds.includes(sc.id)) {
                  const prevObs = lastNormalObservations[sc.id] || [];
                  const waitObs: import("../../types").NPCObservation[] = [
                    ...prevObs,
                    {
                      eventId: `t${turnIndex}_b${blockIndex}_${block.id}`,
                      saw: true,
                      heard: false,
                      actor: "player",
                      type: "action",
                      op: "wait",
                      target: "scene",
                      content: "观察到之前的事件后，见玩家停下动作，静候现场角色的回应。",
                      duration: block.waitOrigin === 'implicit_response' ? undefined : waitDuration,
                    },
                  ];
                  targetNpcList.push({ id: sc.id, entity: sc.entity, obsList: waitObs });
                }
              }
            } else {
              // Standalone wait block: scene NPCs observe player waiting
              for (const sc of sceneCharacters) {
                if (SpatialEngine.isEntityInScene(sc.id, sc.entity, workingWorld)) {
                  const waitObs: import("../../types").NPCObservation[] = [
                    {
                      eventId: `t${turnIndex}_b${blockIndex}_${block.id}`,
                      saw: true,
                      heard: false,
                      actor: "player",
                      type: "action",
                      op: "wait",
                      target: "scene",
                      content: "玩家在现场保持沉默，似乎在等待某种回应。",
                      duration: block.waitOrigin === 'implicit_response' ? undefined : waitDuration,
                    },
                  ];
                  targetNpcList.push({ id: sc.id, entity: sc.entity, obsList: waitObs });
                }
              }
            }

            const rawNpcReactions = await Promise.all(
              targetNpcList.map(async ({ id: npcId, entity: npcEntity, obsList }) => {
                const npcView = npcContext(npcId, obsList, waitBudget, lastNormalObservations ? lastNormalEvents : []);
                const reactionOptions = {
                  ...blockRuntimeOpts,
                  agentId: "npc_reaction",
                  instructions: REACTION_CAUSALITY_POLICY + '\n' + NPC_CONSUMPTION_POLICY + (lastNormalObservations ? '\n这是刚才事件之后的回应窗口，回应observations里的当前具体内容。未回应的提问需要回应；recentExperiences中已处理的旧事不是本轮新事。' : `\n这是独立经过${waitDuration}秒的时间窗口，不是重复询问。即使没有新对白，你仍可依据自身需要、已有物品与经历自主完成未完成的计划。maySpeak=false仅禁止讲话，不禁止行动；静坐休息也是有持续时间的action。足够长的时间应推演真实的进食/休息/消耗及合理效果，不能因玩家没说话冻结过程；若选择不做应有角色依据。此阶段仅安排过程action，不提前结算自身动作的生理收益或能力消耗；真实接受执行后另有过程效果结算阶段。`),
                  context: npcView,
                };
                if (block.waitOrigin === 'implicit_response') reactionOptions.instructions += '\n这是用户未指定等待秒数的自然回应窗口。reaction.available_time=30秒只是本次计划的上限，不是已经过去30秒。围绕当前交谈完成合理简短回应，保留必要含义；不必用满预算，也不要为凑时间安排休息或长过程。最终仅按真正接受的动作与发言耗时推进，至少保留5秒基础停顿。';
                const reactionRes = await agentRuntime.runAgent<NPCReactionResult>(reactionOptions);

                if (!reactionRes.success || !reactionRes.data) {
                  throw new PipelineStageError(
                    "npc_reaction",
                    reactionRes.error || `NPC wait reaction failed for '${npcId}'`
                  );
                }

                const bounded = await fitNpcSpeechBudget({
                  original: reactionRes.data, seconds: waitBudget.available_time, maySpeak: npcView.interaction.maySpeak,
                  idPrefix: `b${blockIndex}_${npcId}_intent`, normalize: normalizeIntent,
                  retry: (instructions, retrySpanId) => agentRuntime.runAgent<NPCReactionResult>({ ...reactionOptions, parentSpanId: retrySpanId || blockSpanId, instructions: reactionOptions.instructions + '\n' + instructions }),
                  trace: { traceId, parentSpanId: blockSpanId, npcId, blockId: block.id, blockIndex },
                });
                const validatedIntents = bounded.reaction.intents;

                const filterSpanId = `${blockSpanId}_${npcId}_filter`;
                globalTraceManager.createSpan(traceId, filterSpanId, `NPC intent permissions: ${npcId}`, "intent_filter", blockSpanId);
                globalTraceManager.updateSpan(traceId, filterSpanId, {
                  status: "success", inputContext: npcView,
                  parsedOutput: { rawIntents: reactionRes.data.intents, acceptedIntents: validatedIntents,
                    filteredIntents: bounded.filteredIntents.map(rejection => rejection.intent),
                    rejections: bounded.filteredIntents, firstAttempt: bounded.firstAttempt, retryAttempt: bounded.retryAttempt, retryReason: bounded.retryReason,
                    reason: npcView.interaction.maySpeak ? "speech permitted; time budget enforced" : "speech intent filtered because maySpeak=false" },
                });
                const boundedThought = sanitizeThoughtBudget(
                  reactionRes.data.thought,
                  waitBudget.available_time
                );

                return {
                  npcId,
                  reaction: {
                    ...reactionRes.data,
                    thought: boundedThought,
                    intents: validatedIntents,
                  },
                };
              })
            );

            const npcReactions = await validateReactions(rawNpcReactions, blockSpanId);

            // Resolve reactions from wait window
            const resolverResult = await agentRuntime.runAgent<WorldResolverResult>({
              ...blockRuntimeOpts,
              agentId: "world_resolver",
              instructions: resolverInstructions(npcReactions) + (block.waitOrigin === 'implicit_response' ? '\n当前wait为隐式对话回应窗口，events.duration只是5秒基础停顿，reactionBudget.available_time是30秒计划上限。根据真实NPC intents接受或拒绝，程序随后以实际接受耗时结算时间，不能擅自推进30秒。' : ''),
              context: {
                events: [
                  {
                    id: block.id,
                    type: "action",
                    actor: "player",
                    op: "wait",
                    duration: waitDuration,
                  },
                ],
                npcReactions,
                characterSchemaPrompt,
                scene: workingWorld.scene,
                entities: workingWorld.entities,
                rules: workingWorld.rules,
                reactionBudget: waitBudget,
              },
            });

            if (!resolverResult.success) {
              throw new PipelineStageError(
                "world_resolver",
                resolverResult.error || "World Resolver failed during wait block"
              );
            }

            // Validate publicEvents returned by World Resolver
            const validationSpan = `${blockSpanId}_public_validation`;
            globalTraceManager.createSpan(traceId, validationSpan, "Public event provenance validation", "public_event_validation", blockSpanId);
            try {
              validatePublicEvents(resolverResult.data?.publicEvents, applyPatches(workingWorld, resolverResult.data?.patches || []).newWorld, npcReactions);
              validateResolverCoverage(resolverResult.data?.publicEvents, resolverResult.data?.rejectedIntents, npcReactions);
              allRejectedIntents.push(...(resolverResult.data?.rejectedIntents || []));
              globalTraceManager.updateSpan(traceId, validationSpan, { status: "success", parsedOutput: { publicEvents: resolverResult.data?.publicEvents, validation: "passed" } });
            } catch (error) {
              globalTraceManager.updateSpan(traceId, validationSpan, { status: "error", error: String(error), parsedOutput: resolverResult.data?.publicEvents });
              throw error;
            }

            const characterPatches = materializeCharacterEffects(resolverResult.data, workingWorld, npcReactions, schema);
            const proposedPatches = [...characterPatches, ...materializeNpcPhysicalEffects({ ...resolverResult.data, patches: characterPatches }, workingWorld, npcReactions)];
            const patches = await generateNewCharacters(workingWorld, proposedPatches, playerInput, blockRuntimeOpts, schema);
            let applied: JsonPatchOperation[] = [];
            if (patches.length > 0 || proposedPatches.length > 0) {
              const patchRes = commitPatches(patches, blockSpanId, proposedPatches);
              if (!patchRes.success) {
                throw new PipelineStageError(
                  "patch_application",
                  patchRes.error || "Failed to apply wait block patches atomically"
                );
              }
              workingWorld = patchRes.newWorld;
              applied = patchRes.appliedPatches;
              allCommittedPatches.push(...applied);
            }

            waitDuration = settledWaitSeconds(block, npcReactions, resolverResult.data.publicEvents || []);
            block.duration = waitDuration;
            const waitObservationId = `t${turnIndex}_b${blockIndex}_${block.id}`;
            for (const { id: npcId, obsList } of targetNpcList) {
              for (const observation of obsList) if (observation.eventId === waitObservationId) observation.duration = waitDuration;
              const experience = npcExperiences[npcId]?.find(item => item.id === waitObservationId);
              if (experience) experience.observation.duration = waitDuration;
            }
            globalTraceManager.updateSpan(traceId, blockSpanId, { inputContext: { block: structuredClone(block), waitTiming: { origin: block.waitOrigin, planningCeilingSeconds: waitBudget.available_time, settledSeconds: waitDuration } } });
            recordStateSources(npcReactions, applied);
            allCommittedEvents.push({
              id: `turn_${turnIndex}_b${blockIndex}_event_${allCommittedEvents.length}`,
              type: "wait",
              actor: "player",
              blockId: block.id,
              source: { duration: waitDuration, timeSemantics: 'inclusive_block_window', includesNpcEventsInBlock: true },
              public: true,
              patches: filterPublicPatches(applied, schema, blockWorldBefore, workingWorld),
            });

            // Record committed NPC public events from wait block
            if (resolverResult.data?.publicEvents && resolverResult.data.publicEvents.length > 0) {
              for (const pubEv of resolverResult.data.publicEvents) {
                allCommittedEvents.push({
              id: `turn_${turnIndex}_b${blockIndex}_event_${allCommittedEvents.length}`,
                  type:
                    pubEv.type === "speech"
                      ? "npc_speech"
                      : pubEv.type === "action"
                      ? "npc_action"
                      : "environment",
                  actor: pubEv.actor,
                  blockId: block.id,
                  source: { ...pubEv, duration: npcReactions.find(r => r.npcId === pubEv.actor)?.reaction.intents.find(i => i.id === pubEv.sourceIntentId)?.duration },
                  content: pubEv.content,
                  sourceIntentId: pubEv.sourceIntentId,
                  speechPlan: pubEv.speechPlan,
                  op: pubEv.op,
                  target: pubEv.target,
                  outcome: { status: 'success', summary: pubEv.speechPlan?.summary || pubEv.content || pubEv.op || '已提交事件', reason: '本事件来自已接受的NPC意图' },
                  public: true,
                });
              }
            }

            // Cache invalidation: wait execution finishes the sequence, cannot be reused by next wait
            lastNormalObservations = null;
            lastAffectedNpcIds = [];

            globalTraceManager.updateSpan(traceId, blockSpanId, { status: "success" });
          }
          // Clock belongs to the scheduler, not the resolver's prose or numeric guesses.
          if (block.kind === 'normal' || block.kind === 'wait' || (block.kind === 'time_skip' && block.duration !== undefined)) {
            const nextClock = advanceClock(previousClock, elapsedSecondsForBlock(block));
            if (workingWorld.clock !== nextClock) {
              workingWorld.clock = nextClock;
              allCommittedPatches.push({ op: 'replace', path: '/clock', value: nextClock });
            }
          }
          for (const event of allCommittedEvents.slice(committedStart)) {
            if (event.actor && (event.type === 'npc_speech' || event.type === 'npc_action')) captureNpcObservations(npcExperiences, event.actor, [{
              eventId: event.id, actor: event.actor, type: event.type === 'npc_speech' ? 'speech' : 'action',
              saw: true, heard: event.type === 'npc_speech', content: event.speechPlan?.summary || event.content,
              op: event.op, target: event.target, duration: (event.source as any)?.duration, outcome: event.outcome,
            }]);
          }
          // Complete resource/body effects in the same transaction, after the
          // physical action has actually been accepted. A plan alone grants no benefit.
          const processEvents = allCommittedEvents.slice(committedStart).filter(event => event.type === 'npc_action' && event.actor && isPhysicalEffectAction({ type: 'action', op: event.op, target: event.target }));
          if (processEvents.length && !execContext.mockMode) {
            const effectSpan = `${blockSpanId}_completed_process`;
            globalTraceManager.createSpan(traceId, effectSpan, 'Completed physical process effects', 'completed_process_effects', blockSpanId);
            const reactions = await Promise.all([...new Set(processEvents.map(event => event.actor!))].map(async npcId => {
              const events = processEvents.filter(event => event.actor === npcId);
              const observations = events.map(event => ({ eventId: event.id, actor: npcId, type: 'action' as const, saw: true, heard: false, op: event.op, target: event.target, duration: (event.source as any)?.duration, outcome: event.outcome }));
              const view = npcContext(npcId, observations, { available_time: 0, response_window: false }, []);
              const result = await agentRuntime.runAgent<NPCReactionResult>({ ...blockRuntimeOpts, parentSpanId: effectSpan, agentId: 'npc_reaction', context: view,
                instructions: REACTION_CAUSALITY_POLICY + '\n当前阶段：已经完成的物理过程效果结算。observations里的动作已经真实执行，duration单位秒；当前状态是动作后的提交状态，但本阶段尚未结算这些过程的生理或资源效果。只按本世界Schema和真实动作时长提出相应身体、资源、能力状态更新；部分进食也可产生相应有限效果，不能直接当吃完整餐。intents必须为空，不再执行动作或发言。不要重新评价礼物、道歉、信任或亲近，不记录重复故事，不虚构未定义字段。不要求所有数值都变化；若所有相关状态都不变，thought须说明具体依据，而不能以动作还没发生为由跳过。sourceEventIds仅使用本次已完成动作的eventId。' });
              if (!result.success) throw new PipelineStageError('npc_reaction', result.error || '过程效果结算失败');
              if (result.data.intents?.length) throw new PipelineStageError('npc_reaction', '过程结算阶段不允许新增动作或发言');
              return { npcId, reaction: result.data };
            }));
            const checked = await validateReactions(reactions, effectSpan, 'completed_process');
            const effectPatches = materializeCharacterEffects({ patches: [], publicEvents: [], acceptedStateUpdates: checked.flatMap(({ npcId, reaction }) => (reaction.stateUpdates || []).map((_, updateIndex) => ({ npcId, updateIndex }))) }, workingWorld, checked, schema);
            const applied = commitPatches(effectPatches, effectSpan, effectPatches);
            if (!applied.success) throw new PipelineStageError('patch_application', applied.error || '过程效果提交失败');
            workingWorld = applied.newWorld;
            allCommittedPatches.push(...applied.appliedPatches);
            recordStateSources(checked, applied.appliedPatches);
            globalTraceManager.updateSpan(traceId, effectSpan, { status: 'success', parsedOutput: { proposed: reactions, patches: applied.appliedPatches } });
          }
          workingWorld.conversation = previousConversation;
          if (block.kind === "time_skip" || workingWorld.scene.location !== previousLocation ||
              (block.kind === "admin" && workingWorld.clock !== previousClock)) workingWorld.conversation = {};
          updateConversation(workingWorld, allCommittedEvents.slice(committedStart));
        } catch (blockErr: any) {
          const isBlockAbort = blockErr?.name === "AbortError" || execContext.signal?.aborted;
          globalTraceManager.updateSpan(traceId, blockSpanId, {
            status: isBlockAbort ? "cancelled" : "error",
            error: isBlockAbort ? "Generation aborted by user" : blockErr?.message || String(blockErr),
          });
          throw blockErr;
        }
      }

      // Step 5: Narrator (Isolated public view: committed events & public patches, NO NPC private thoughts or memory)
      checkAborted();
      let narrationText = "";
      let narrationError: string | undefined = undefined;
      let compositionSegments: unknown;

      const publicPatches = filterPublicPatches(allCommittedPatches, schema, worldBefore, workingWorld);
      const pureAdminChange = adminCommand !== null && blocks.every(block => block.kind === "admin")
        && allCommittedEvents.length > 0 && allCommittedEvents.every(event => event.type === "admin_change");
      if (pureAdminChange) {
        // Configuration changes are not in-world actions. A deterministic receipt
        // cannot invent weather scenery, NPC consent, or disclose private values.
        narrationText = allCommittedPatches.length > 0 ? "管理员修改已应用。" : "管理员请求已处理，没有状态变更。";
      } else {
        // A future mixed turn may contain admin changes and story events. Never send
        // the administrator's raw command (which can name private fields) to Narrator.
        const narratorEvents = allCommittedEvents.map(event => event.type === "admin_change"
          ? { ...event, source: "管理员配置更新" } : event);
        const narratorEntities = buildNarratorEntityView(workingWorld, schema);
        // Setup prose can contain obsolete inventory assertions or hidden plot. Current
        // structured state and adjudicated events, not that prose, define observable facts.
        const narratorScene = { ...buildPerceptionView(workingWorld, schema).scene, clock: workingWorld.clock, turnStartedAt: worldBefore.clock };

        const narratorOptions = {
          ...runtimeOpts,
          agentId: "narrator",
          instructions: `时间核对：所有duration和timeline时长单位均为秒。scene.turnStartedAt和scene.clock是本轮前后真实时钟；不得把几秒写成几分钟，也不能从时间流逝推断没有事件支持的动作。\n本轮允许用于 speech segment 的来源仅有：${JSON.stringify(allCommittedEvents.filter(e => e.type === 'npc_speech' || e.type === 'player_speech').map(e => ({ sourceIntentId: e.sourceIntentId || e.id, actor: e.actor, type: e.type })))}。action/environment/wait 的 ID 绝不能用在 speech segment。没有 NPC speech 时，不生成 NPC 对白。只描述已提供的人物与事件，不添加陌生人、老板、证据或新世界事实。`,
          context: {
            playerInput: adminCommand === null ? playerInput : undefined,
            committedEvents: narratorEvents,
            publicPatches,
            patches: publicPatches, // For backwards compatibility
            events: allEvents,      // For backwards compatibility
            scene: narratorScene,
            entities: narratorEntities,
            rules: workingWorld.rules,
          },
        };
        let narratorResult = await agentRuntime.runAgent<import('../../types').NarratorResult>(narratorOptions);

        try {
          if (!narratorResult.success) throw new Error(narratorResult.error || "Narrator generation failed");
          // Rendering verifies references before any semantic audit; malformed replies are not published.
          renderNarratorSegments(narratorResult.data, allCommittedEvents);
          const auditContext = { scene: narratorScene, entities: narratorEntities, committedEvents: narratorEvents, publicPatches };
          let audit = await auditNarration(narratorResult.data, auditContext, runtimeOpts);
          if (!audit.success) throw new Error(audit.error || '旁白事实核查失败');
          if (!audit.data.grounded) {
            narratorResult = await agentRuntime.runAgent<import('../../types').NarratorResult>({ ...narratorOptions, instructions: narratorOptions.instructions + '\n' + narrationCorrectionInstructions(audit.data) });
            if (!narratorResult.success) throw new Error(narratorResult.error || '旁白修正失败');
            renderNarratorSegments(narratorResult.data, allCommittedEvents);
            audit = await auditNarration(narratorResult.data, auditContext, runtimeOpts);
            if (!audit.success || !audit.data.grounded) throw new Error('旁白仍与已裁决事实不一致，未展示未经确认的结果');
          }
          narrationText = renderNarratorSegments(narratorResult.data, allCommittedEvents);
        } catch (error) {
          // Narration failure does not roll back an already committed world.
          narrationError = error instanceof Error ? error.message : String(error);
          narrationText = "（旁白生成失败，请查看调试记录。）";
        }
        compositionSegments = narratorResult.data;
      }
      const compositionSpan = `composition_${uuid}`;
      globalTraceManager.createSpan(traceId, compositionSpan, "Narrator composition validation", "narrator_validation");
      globalTraceManager.updateSpan(traceId, compositionSpan, {
        status: narrationError ? "error" : "success", error: narrationError,
        inputContext: pureAdminChange
          ? { mode: "admin_receipt", appliedPatchCount: allCommittedPatches.length }
          : { committedEvents: allCommittedEvents, segments: compositionSegments },
        parsedOutput: { renderedOutput: narrationText },
      });

      globalTraceManager.endTurnTrace(traceId, "success");

      const gameTurn: GameTurn = {
        id: `turn_${turnIndex}_${uuid}`,
        turnIndex,
        timestamp: new Date().toISOString(),
        playerInput,
        narratorOutput: narrationText,
        traceId,
        worldStateBefore: worldBefore,
        worldStateAfter: workingWorld, // All blocks succeeded -> commit
        patches: allCommittedPatches,
        activeAgentGroupId: execContext.activeGroupId,
        committedEvents: allCommittedEvents,
        rejectedIntents: allRejectedIntents,
        npcExperiences,
        status: "success",
        narrationError,
      };

      return {
        turn: gameTurn,
        traceId,
        success: true,
      };
    } catch (err: any) {
      const isAbort = err?.name === "AbortError" || execContext.signal?.aborted;
      if (isAbort) {
        globalTraceManager.cancelTurnTrace(traceId);
        return {
          turn: {
            id: `turn_${turnIndex}_cancel_${uuid}`,
            turnIndex,
            timestamp: new Date().toISOString(),
            playerInput,
            narratorOutput: "生成已暂停",
            traceId,
            worldStateBefore: worldBefore,
            worldStateAfter: worldBefore,
            patches: [],
            activeAgentGroupId: execContext.activeGroupId,
            status: "error",
            error: "Generation aborted by user",
          },
          traceId,
          success: false,
          cancelled: true,
        };
      }

      // Transaction Rollback: Any block failure rollbacks working state to worldBefore!
      globalTraceManager.endTurnTrace(traceId, "error");
      const errorMsg = err?.message || String(err);

      return {
        turn: {
          id: `turn_${turnIndex}_err_${uuid}`,
          turnIndex,
          timestamp: new Date().toISOString(),
          playerInput,
          narratorOutput: safePipelineError(err, traceId),
          traceId,
          worldStateBefore: worldBefore,
          worldStateAfter: worldBefore, // Pure rollback to initial state
          patches: [], // No partial state commits in committed turn
          activeAgentGroupId: execContext.activeGroupId,
          status: "error",
          error: errorMsg,
        },
        traceId,
        success: false,
        error: errorMsg,
      };
    }
  }
}

export const gamePipeline = new GamePipeline();
