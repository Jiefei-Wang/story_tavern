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
          if (patches.length > 0) {
            const patchRes = applyPatches(workingWorld, patches);
            if (!patchRes.success) {
              throw new PipelineStageError(
                "patch_application",
                patchRes.error || "Failed to apply admin patches to working world"
              );
            }
            workingWorld = patchRes.newWorld;
            allCommittedPatches.push(...patchRes.appliedPatches);
          }

          globalTraceManager.updateSpan(traceId, blockSpanId, { status: "success" });
        } else if (block.kind === "time_skip") {
          // Time Skip Block
          const skipResult = await agentRuntime.runAgent<WorldResolverResult>({
            ...blockRuntimeOpts,
            agentId: "time_skip",
            context: {
              skipTarget:
                block.to ||
                (block as any).target ||
                (block as any).duration ||
                (block as any).command ||
                playerInput,
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
          if (patches.length > 0) {
            const patchRes = applyPatches(workingWorld, patches);
            if (!patchRes.success) {
              throw new PipelineStageError(
                "patch_application",
                patchRes.error || "Failed to apply time skip patches to working world"
              );
            }
            workingWorld = patchRes.newWorld;
            allCommittedPatches.push(...patchRes.appliedPatches);
          }

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

              // Deterministic reaction budget enforcement
              const validatedIntents: NPCIntent[] = [];
              let currentSpent = 0;
              for (const intent of reactionRes.data.intents || []) {
                const duration = intent.duration ?? estimateIntentDuration(intent);
                if (currentSpent + duration <= budget.available_time) {
                  validatedIntents.push(intent);
                  currentSpent += duration;
                } else {
                  // Intent exceeds budget: reject deterministically
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
          if (patches.length > 0) {
            const patchRes = applyPatches(workingWorld, patches);
            if (!patchRes.success) {
              throw new PipelineStageError(
                "patch_application",
                patchRes.error || "Failed to apply resolver patches atomically"
              );
            }
            workingWorld = patchRes.newWorld;
            allCommittedPatches.push(...patchRes.appliedPatches);
          }

          globalTraceManager.updateSpan(traceId, blockSpanId, { status: "success" });
        } else if (block.kind === "wait") {
          // Wait Block: NPC Reaction window -> World Resolver
          const waitDuration = block.duration || 5.0;
          const waitBudget = {
            available_time: waitDuration,
            response_window: true,
            trigger_event_ids: [block.id],
          };

          // Re-evaluate present scene characters in current workingWorld
          const sceneCharacters = SpatialEngine.getSceneCharacters(workingWorld, false);

          const npcReactions = await Promise.all(
            sceneCharacters.map(async ({ id: npcId, entity: npcEntity }) => {
              const waitObs = [
                {
                  eventId: block.id,
                  saw: true,
                  heard: true,
                  content: "玩家停下动作，静候现场角色的回应。",
                },
              ];

              const reactionRes = await agentRuntime.runAgent<NPCReactionResult>({
                ...blockRuntimeOpts,
                agentId: "npc_reaction",
                context: {
                  npc: { id: npcId, ...npcEntity },
                  observations: waitObs,
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

              // Deterministic reaction budget enforcement
              const validatedIntents: NPCIntent[] = [];
              let currentSpent = 0;
              for (const intent of reactionRes.data.intents || []) {
                const duration = intent.duration ?? estimateIntentDuration(intent);
                if (currentSpent + duration <= waitBudget.available_time) {
                  validatedIntents.push(intent);
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
          if (patches.length > 0) {
            const patchRes = applyPatches(workingWorld, patches);
            if (!patchRes.success) {
              throw new PipelineStageError(
                "patch_application",
                patchRes.error || "Failed to apply wait block patches atomically"
              );
            }
            workingWorld = patchRes.newWorld;
            allCommittedPatches.push(...patchRes.appliedPatches);
          }

          globalTraceManager.updateSpan(traceId, blockSpanId, { status: "success" });
        }
      }

      // Step 5: Narrator (Only committed patches and final working state; NO NPC private thoughts)
      let narrationText = "";
      let narrationError: string | undefined = undefined;

      const narratorResult = await agentRuntime.runAgent<string>({
        ...runtimeOpts,
        agentId: "narrator",
        context: {
          playerInput,
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
