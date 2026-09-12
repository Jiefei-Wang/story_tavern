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
import {
  calculateReactionBudget,
  estimateIntentDuration,
} from "../scheduling/TemporalScheduler";
import { globalTraceManager } from "../tracing/TraceManager";
import { applyPatches, cloneWorldState } from "../world/PatchEngine";
import { SpatialEngine } from "../world/SpatialEngine";

export interface ExecutionContext {
  agents: AgentDefinition[];
  groups: AgentGroup[];
  backends: Backend[];
  activeGroupId: string;
  mockMode: boolean;
}

export interface PipelineTurnResult {
  turn: GameTurn;
  traceId: string;
  success: boolean;
  error?: string;
}

export function getSafeIntentDuration(intent: NPCIntent): number {
  const d = intent.duration;
  if (typeof d === "number" && Number.isFinite(d) && d > 0) {
    return d;
  }
  return estimateIntentDuration({ ...intent, duration: undefined });
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

    // Snapshot world state: transaction baseline
    const worldBefore = cloneWorldState(initialWorld);
    let workingWorld = cloneWorldState(initialWorld);

    const allEvents: GameEvent[] = [];
    const allCommittedPatches: JsonPatchOperation[] = [];
    const allCommittedEvents: import("../../types").CommittedTurnEvent[] = [];

    // Cache state from preceding normal block for wait block perspective inheritance
    let lastNormalObservations: Record<string, import("../../types").NPCObservation[]> | null = null;
    let lastAffectedNpcIds: string[] = [];

    const runtimeOpts = {
      groupId: execContext.activeGroupId,
      traceId,
      agents: execContext.agents,
      groups: execContext.groups,
      backends: execContext.backends,
      mockMode: execContext.mockMode,
    };

    try {
      // Step 1: Input Compiler
      const compilerResult = await agentRuntime.runAgent<InputCompilerResult>({
        ...runtimeOpts,
        agentId: "input_compiler",
        context: {
          player: { input: playerInput },
          scene: workingWorld.scene,
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

        try {
          if (block.kind === "admin") {
            // Admin Patch Block
            const adminResult = await agentRuntime.runAgent<WorldResolverResult>({
              ...blockRuntimeOpts,
              agentId: "admin_patch",
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

            const patches = adminResult.data?.patches || [];
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
              type: "admin_change",
              blockId: block.id,
              source: block.command || playerInput,
              patches: applied,
            });

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

            const patches = skipResult.data?.patches || [];
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
              type: "time_skip",
              blockId: block.id,
              source: skipTarget,
              patches: applied,
            });

            globalTraceManager.updateSpan(traceId, blockSpanId, { status: "success" });
          } else if (block.kind === "normal") {
            // Normal Block: Events -> Perception -> NPC Reaction -> World Resolver
            const events = block.events || [];
            allEvents.push(...events);

            // 2. Perception Agent (Strict Fail-Fast)
            const perceptionResult = await agentRuntime.runAgent<PerceptionResult>({
              ...blockRuntimeOpts,
              agentId: "perception",
              context: {
                events,
                scene: workingWorld.scene,
                entities: workingWorld.entities,
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

            // Cache for subsequent wait block inheritance
            lastNormalObservations = observations;
            lastAffectedNpcIds = [...targetNpcIds];

            // Step 3: Parallel NPC Reactions
            const npcReactions = await Promise.all(
              targetNpcIds.map(async (npcId) => {
                const npcEntity = workingWorld.entities[npcId];
                const obsList = observations[npcId] || [];

                const reactionRes = await agentRuntime.runAgent<NPCReactionResult>({
                  ...blockRuntimeOpts,
                  agentId: "npc_reaction",
                  context: {
                    npc: { id: npcId, ...npcEntity },
                    observations: obsList,
                    scene: workingWorld.scene,
                    reaction: budget,
                  },
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
                for (const intent of reactionRes.data.intents || []) {
                  const duration = getSafeIntentDuration(intent);
                  if (currentSpent + duration <= budget.available_time) {
                    validatedIntents.push({ ...intent, duration });
                    currentSpent += duration;
                  }
                }

                return {
                  npcId,
                  reaction: {
                    ...reactionRes.data,
                    intents: validatedIntents,
                  },
                };
              })
            );

            // Step 4: World Resolver
            const resolverResult = await agentRuntime.runAgent<WorldResolverResult>({
              ...blockRuntimeOpts,
              agentId: "world_resolver",
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

            const patches = resolverResult.data?.patches || [];
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

            for (const ev of events) {
              allCommittedEvents.push({
                type: ev.type === "speech" ? "player_speech" : "player_action",
                blockId: block.id,
                source: ev,
                patches: applied,
              });
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
                const reactionRes = await agentRuntime.runAgent<NPCReactionResult>({
                  ...blockRuntimeOpts,
                  agentId: "npc_reaction",
                  context: {
                    npc: { id: npcId, ...npcEntity },
                    observations: obsList,
                    scene: workingWorld.scene,
                    reaction: waitBudget,
                  },
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
                for (const intent of reactionRes.data.intents || []) {
                  const duration = getSafeIntentDuration(intent);
                  if (currentSpent + duration <= waitBudget.available_time) {
                    validatedIntents.push({ ...intent, duration });
                    currentSpent += duration;
                  }
                }

                return {
                  npcId,
                  reaction: {
                    ...reactionRes.data,
                    intents: validatedIntents,
                  },
                };
              })
            );

            // Resolve reactions from wait window
            const resolverResult = await agentRuntime.runAgent<WorldResolverResult>({
              ...blockRuntimeOpts,
              agentId: "world_resolver",
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

            const patches = resolverResult.data?.patches || [];
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
              type: "wait",
              blockId: block.id,
              source: { duration: waitDuration },
              patches: applied,
            });

            globalTraceManager.updateSpan(traceId, blockSpanId, { status: "success" });
          }
        } catch (blockErr: any) {
          globalTraceManager.updateSpan(traceId, blockSpanId, {
            status: "error",
            error: blockErr?.message || String(blockErr),
          });
          throw blockErr;
        }
      }

      // Step 5: Narrator (Committed events & patches, final working state; NO NPC private thoughts)
      let narrationText = "";
      let narrationError: string | undefined = undefined;

      const narratorResult = await agentRuntime.runAgent<string>({
        ...runtimeOpts,
        agentId: "narrator",
        context: {
          playerInput,
          committedEvents: allCommittedEvents,
          events: allEvents,
          patches: allCommittedPatches,
          scene: workingWorld.scene,
          entities: workingWorld.entities,
        },
      });

      if (narratorResult.success) {
        const d: any = narratorResult.data;
        if (typeof d === "string") {
          narrationText = d;
        } else if (d?.narration) {
          narrationText = d.narration;
        } else {
          narrationText = JSON.stringify(d);
        }
        narrationText = narrationText.replace(/^(旁白|Narrator|NARRATOR)[:：]\s*/i, "");
      } else {
        // Physical world state committed successfully; narrator failure does NOT rollback world
        narrationError = narratorResult.error || "Narrator generation failed";
        narrationText = `(旁白生成出现异常: ${narrationError})`;
      }

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
