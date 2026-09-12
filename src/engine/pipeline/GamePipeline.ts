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
import { generateNewCharacters } from "../characters/CharacterGenerator";
import {
  calculateReactionBudget,
  estimateIntentDuration,
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
  validatePublicEvents,
} from "../world/WorldViews";
import {
  getSafeEventDuration,
  getSafeIntentDuration,
  sanitizeThoughtBudget,
} from "../world/TimingEngine";

export { getSafeIntentDuration };

const CHARACTER_CREATION_POLICY = "人物创建协议：需要新增人物时只输出最小 add Patch，路径 /entities/<唯一新ID>，value 只含 type:character、临时称呼 name 和合法 location。新增人物的真实姓名、外貌、个人经历、目标、记忆和关系将由独立人物生成器生成，不要在本阶段生成这些内容或为新人物编造对白。不要将世界秘密、剧情或其他人的知识赋给新人。只输出必要的简短 JSON。";

export interface ExecutionContext {
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

    const allEvents: GameEvent[] = [];
    const allCommittedPatches: JsonPatchOperation[] = [];
    const allCommittedEvents: import("../../types").CommittedTurnEvent[] = [];

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
      checkAborted();
      // Explicit command syntax is deterministic; only free-form input needs an LLM.
      const adminMatch = /^\s*(?:admin|管理员)\s*[:：]([\s\S]*)$/i.exec(playerInput);
      if (adminMatch && !adminMatch[1].trim()) {
        throw new PipelineStageError("input_compiler", "管理员指令不能为空，请在 admin: 后输入具体命令");
      }
      const explicitInput: InputCompilerResult | null = adminMatch
        ? { blocks: [{ id: "explicit_admin", kind: "admin", command: adminMatch[1].trim() }] }
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
          entities: buildNarratorEntityView(workingWorld),
        },
      });

      if (!compilerResult.success || !compilerResult.data?.blocks) {
        throw new PipelineStageError(
          "input_compiler",
          compilerResult.error || "Input Compiler failed to produce valid temporal blocks"
        );
      }

      const blocks = compilerResult.data.blocks;

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
        const previousLocation = workingWorld.scene.location;
        const previousClock = workingWorld.clock;
        const previousConversation = { ...workingWorld.conversation };
        try {
          if (block.kind === "admin") {
            // Admin Patch Block
            const adminResult = await agentRuntime.runAgent<WorldResolverResult>({
              ...blockRuntimeOpts,
              agentId: "admin_patch",
              instructions: CHARACTER_CREATION_POLICY,
              context: {
                command: block.command || playerInput,
                world: workingWorld,
              },
            });

            if (!adminResult.success) {
              throw new PipelineStageError(
                "admin_patch",
                adminResult.error || "Admin Patch Agent execution failed"
              );
            }

            const patches = await generateNewCharacters(workingWorld, adminResult.data?.patches || [], playerInput, blockRuntimeOpts);
            let applied: JsonPatchOperation[] = [];
            if (patches.length > 0) {
              const patchRes = applyPatches(workingWorld, patches);
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
              patches: filterPublicPatches(applied),
            });

            // Cache invalidation: admin breaks immediate normal -> wait sequence
            lastNormalObservations = null;
            lastAffectedNpcIds = [];

            globalTraceManager.updateSpan(traceId, blockSpanId, { status: "success" });
          } else if (block.kind === "time_skip") {
            // Time Skip Block
            const skipTarget =
              block.to ||
              (block as any).target ||
              (block as any).duration ||
              (block as any).command ||
              playerInput;

            const skipResult = await agentRuntime.runAgent<WorldResolverResult>({
              ...blockRuntimeOpts,
              agentId: "time_skip",
              instructions: CHARACTER_CREATION_POLICY,
              context: {
                skipTarget,
                world: workingWorld,
              },
            });

            if (!skipResult.success) {
              throw new PipelineStageError(
                "time_skip",
                skipResult.error || "Time Skip Agent execution failed"
              );
            }

            const patches = await generateNewCharacters(workingWorld, skipResult.data?.patches || [], playerInput, blockRuntimeOpts);
            let applied: JsonPatchOperation[] = [];
            if (patches.length > 0) {
              const patchRes = applyPatches(workingWorld, patches);
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
              patches: filterPublicPatches(applied),
            });

            // Cache invalidation: time skip breaks immediate normal -> wait sequence
            lastNormalObservations = null;
            lastAffectedNpcIds = [];

            globalTraceManager.updateSpan(traceId, blockSpanId, { status: "success" });
          } else if (block.kind === "normal") {
            // Normal Block: Events -> Perception -> NPC Reaction -> World Resolver
            const events = resolveSpeechTargets(block.events || [], workingWorld);
            lastNormalEvents = events;
            globalTraceManager.updateSpan(traceId, blockSpanId, { inputContext: { conversation: workingWorld.conversation ?? {}, resolvedEvents: events } });
            allEvents.push(...events);

            // 2. Perception Agent (Strict Fail-Fast, with isolated perception view)
            checkAborted();
            const perceptionView = buildPerceptionView(workingWorld);
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

            const observations = perceptionResult.data.npcObservations;
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

            // Step 3: Parallel NPC Reactions
            const npcReactions = await Promise.all(
              targetNpcIds.map(async (npcId) => {
                const obsList = observations[npcId] || [];
                const sanitizedObs = sanitizeNpcObservations(npcId, obsList, events);
                const npcView = buildNpcView(workingWorld, npcId, sanitizedObs, budget, events);

                const reactionRes = await agentRuntime.runAgent<NPCReactionResult>({
                  ...blockRuntimeOpts,
                  agentId: "npc_reaction",
                  context: npcView,
                });

                if (!reactionRes.success || !reactionRes.data) {
                  throw new PipelineStageError(
                    "npc_reaction",
                    reactionRes.error || `NPC reaction failed for character '${npcId}'`
                  );
                }

                // Deterministic reaction budget enforcement with getSafeIntentDuration
                const validatedIntents: NPCIntent[] = [];
                let currentSpent = 0;
                for (const [index, rawIntent] of (reactionRes.data.intents || []).entries()) {
                  const intent = { ...rawIntent, id: `b${blockIndex}_${npcId}_intent_${index}` };
                  if (intent.type === "speech" && !npcView.interaction.maySpeak) continue;
                  const duration = getSafeIntentDuration(intent);
                  if (currentSpent + duration <= budget.available_time) {
                    validatedIntents.push({ ...intent, duration });
                    currentSpent += duration;
                  }
                }

                const filterSpanId = `${blockSpanId}_${npcId}_filter`;
                globalTraceManager.createSpan(traceId, filterSpanId, `NPC intent permissions: ${npcId}`, "intent_filter", blockSpanId);
                globalTraceManager.updateSpan(traceId, filterSpanId, {
                  status: "success", inputContext: npcView,
                  parsedOutput: { rawIntents: reactionRes.data.intents, acceptedIntents: validatedIntents,
                    filteredIntents: (reactionRes.data.intents || []).filter(i => i.type === "speech" && !npcView.interaction.maySpeak),
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

            // Step 4: World Resolver
            checkAborted();
            const resolverResult = await agentRuntime.runAgent<WorldResolverResult>({
              ...blockRuntimeOpts,
              agentId: "world_resolver",
              instructions: CHARACTER_CREATION_POLICY,
              context: {
                events,
                npcReactions,
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
              globalTraceManager.updateSpan(traceId, validationSpan, { status: "success", parsedOutput: { publicEvents: resolverResult.data?.publicEvents, validation: "passed" } });
            } catch (error) {
              globalTraceManager.updateSpan(traceId, validationSpan, { status: "error", error: String(error), parsedOutput: resolverResult.data?.publicEvents });
              throw error;
            }

            const patches = await generateNewCharacters(workingWorld, resolverResult.data?.patches || [], playerInput, blockRuntimeOpts);
            let applied: JsonPatchOperation[] = [];
            if (patches.length > 0) {
              const patchRes = applyPatches(workingWorld, patches);
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
            for (const ev of events) {
              allCommittedEvents.push({
              id: `turn_${turnIndex}_b${blockIndex}_event_${allCommittedEvents.length}`,
                type: ev.type === "speech" ? "player_speech" : "player_action",
                actor: ev.actor || "player",
                blockId: block.id,
                source: ev,
                content: ev.content,
                op: ev.op,
                target: ev.target,
                public: true,
                patches: filterPublicPatches(applied),
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
                  source: pubEv,
                  content: pubEv.content,
                  op: pubEv.op,
                  target: pubEv.target,
                  public: true,
                });
              }
            }

            globalTraceManager.updateSpan(traceId, blockSpanId, { status: "success" });
          } else if (block.kind === "wait") {
            // Wait Block: NPC Reaction window -> World Resolver
            const waitDuration =
              typeof block.duration === "number" &&
              Number.isFinite(block.duration) &&
              block.duration > 0
                ? block.duration
                : 5.0;

            const waitBudget = {
              available_time: waitDuration,
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
                      eventId: block.id,
                      saw: true,
                      heard: false,
                      content: "观察到之前的事件后，见玩家停下动作，静候现场角色的回应。",
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
                      eventId: block.id,
                      saw: true,
                      heard: false,
                      content: "玩家在现场保持沉默，似乎在等待某种回应。",
                    },
                  ];
                  targetNpcList.push({ id: sc.id, entity: sc.entity, obsList: waitObs });
                }
              }
            }

            const npcReactions = await Promise.all(
              targetNpcList.map(async ({ id: npcId, entity: npcEntity, obsList }) => {
                const npcView = buildNpcView(workingWorld, npcId, obsList, waitBudget, lastNormalObservations ? lastNormalEvents : []);
                const reactionRes = await agentRuntime.runAgent<NPCReactionResult>({
                  ...blockRuntimeOpts,
                  agentId: "npc_reaction",
                  context: npcView,
                });

                if (!reactionRes.success || !reactionRes.data) {
                  throw new PipelineStageError(
                    "npc_reaction",
                    reactionRes.error || `NPC wait reaction failed for '${npcId}'`
                  );
                }

                // Deterministic reaction budget enforcement using unified getSafeIntentDuration
                const validatedIntents: NPCIntent[] = [];
                let currentSpent = 0;
                for (const [index, rawIntent] of (reactionRes.data.intents || []).entries()) {
                  const intent = { ...rawIntent, id: `b${blockIndex}_${npcId}_intent_${index}` };
                  if (intent.type === "speech" && !npcView.interaction.maySpeak) continue;
                  const duration = getSafeIntentDuration(intent);
                  if (currentSpent + duration <= waitBudget.available_time) {
                    validatedIntents.push({ ...intent, duration });
                    currentSpent += duration;
                  }
                }

                const filterSpanId = `${blockSpanId}_${npcId}_filter`;
                globalTraceManager.createSpan(traceId, filterSpanId, `NPC intent permissions: ${npcId}`, "intent_filter", blockSpanId);
                globalTraceManager.updateSpan(traceId, filterSpanId, {
                  status: "success", inputContext: npcView,
                  parsedOutput: { rawIntents: reactionRes.data.intents, acceptedIntents: validatedIntents,
                    filteredIntents: (reactionRes.data.intents || []).filter(i => i.type === "speech" && !npcView.interaction.maySpeak),
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

            // Resolve reactions from wait window
            const resolverResult = await agentRuntime.runAgent<WorldResolverResult>({
              ...blockRuntimeOpts,
              agentId: "world_resolver",
              instructions: CHARACTER_CREATION_POLICY,
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
              globalTraceManager.updateSpan(traceId, validationSpan, { status: "success", parsedOutput: { publicEvents: resolverResult.data?.publicEvents, validation: "passed" } });
            } catch (error) {
              globalTraceManager.updateSpan(traceId, validationSpan, { status: "error", error: String(error), parsedOutput: resolverResult.data?.publicEvents });
              throw error;
            }

            const patches = await generateNewCharacters(workingWorld, resolverResult.data?.patches || [], playerInput, blockRuntimeOpts);
            let applied: JsonPatchOperation[] = [];
            if (patches.length > 0) {
              const patchRes = applyPatches(workingWorld, patches);
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

            allCommittedEvents.push({
              id: `turn_${turnIndex}_b${blockIndex}_event_${allCommittedEvents.length}`,
              type: "wait",
              actor: "player",
              blockId: block.id,
              source: { duration: waitDuration },
              public: true,
              patches: filterPublicPatches(applied),
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
                  source: pubEv,
                  content: pubEv.content,
                  op: pubEv.op,
                  target: pubEv.target,
                  public: true,
                });
              }
            }

            // Cache invalidation: wait execution finishes the sequence, cannot be reused by next wait
            lastNormalObservations = null;
            lastAffectedNpcIds = [];

            globalTraceManager.updateSpan(traceId, blockSpanId, { status: "success" });
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

      const publicPatches = filterPublicPatches(allCommittedPatches);
      const narratorEntities = buildNarratorEntityView(workingWorld);

      const narratorResult = await agentRuntime.runAgent<import("../../types").NarratorResult>({
        ...runtimeOpts,
        agentId: "narrator",
        context: {
          playerInput,
          committedEvents: allCommittedEvents,
          publicPatches,
          patches: publicPatches, // For backwards compatibility
          events: allEvents,      // For backwards compatibility
          scene: workingWorld.scene,
          entities: narratorEntities,
        },
      });

      try {
        if (!narratorResult.success) throw new Error(narratorResult.error || "Narrator generation failed");
        narrationText = renderNarratorSegments(narratorResult.data, allCommittedEvents);
      } catch (error) {
        // Narration failure does not roll back an already committed world.
        narrationError = error instanceof Error ? error.message : String(error);
        narrationText = "（旁白生成失败，请查看调试记录。）";
      }
      const compositionSpan = `composition_${uuid}`;
      globalTraceManager.createSpan(traceId, compositionSpan, "Narrator composition validation", "narrator_validation");
      globalTraceManager.updateSpan(traceId, compositionSpan, {
        status: narrationError ? "error" : "success", error: narrationError,
        inputContext: { committedEvents: allCommittedEvents, segments: narratorResult.data },
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
          narratorOutput: `执行中断: ${errorMsg}`,
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
