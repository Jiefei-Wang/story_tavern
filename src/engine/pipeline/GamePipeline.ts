import {
  AgentDefinition,
  AgentGroup,
  Backend,
  GameEvent,
  GameTurn,
  InputCompilerResult,
  JsonPatchOperation,
  NPCReactionResult,
  PerceptionResult,
  WorldResolverResult,
  WorldState,
} from "../../types";
import { agentRuntime } from "../runtime/AgentRuntime";
import { calculateReactionBudget } from "../scheduling/TemporalScheduler";
import { globalTraceManager } from "../tracing/TraceManager";
import { applyPatches, cloneWorldState } from "../world/PatchEngine";

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
    const traceId = `trace_${Date.now()}_turn_${turnIndex}`;
    globalTraceManager.startTurnTrace(traceId, turnIndex, playerInput);

    let currentWorld = cloneWorldState(initialWorld);
    const allEvents: GameEvent[] = [];
    const allPatches: JsonPatchOperation[] = [];

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
          scene: currentWorld.scene,
        },
      });

      if (!compilerResult.success || !compilerResult.data?.blocks) {
        throw new Error(compilerResult.error || "Input Compiler failed to process input");
      }

      const blocks = compilerResult.data.blocks;

      // Process each temporal block
      for (const block of blocks) {
        if (block.kind === "admin") {
          // Admin Patch
          const adminResult = await agentRuntime.runAgent<WorldResolverResult>({
            ...runtimeOpts,
            agentId: "admin_patch",
            context: {
              command: block.command || playerInput,
              world: currentWorld,
            },
          });

          if (adminResult.success && adminResult.data?.patches) {
            const patchRes = applyPatches(currentWorld, adminResult.data.patches);
            if (patchRes.success) {
              currentWorld = patchRes.newWorld;
              allPatches.push(...adminResult.data.patches);
            }
          }
        } else if (block.kind === "time_skip") {
          // Time Skip
          const skipResult = await agentRuntime.runAgent<WorldResolverResult>({
            ...runtimeOpts,
            agentId: "time_skip",
            context: {
              skipTarget:
                block.to ||
                (block as any).target ||
                (block as any).duration ||
                (block as any).command ||
                playerInput,
              world: currentWorld,
            },
          });

          if (skipResult.success && skipResult.data?.patches) {
            const patchRes = applyPatches(currentWorld, skipResult.data.patches);
            if (patchRes.success) {
              currentWorld = patchRes.newWorld;
              allPatches.push(...skipResult.data.patches);
            }
          }
        } else if (block.kind === "normal") {
          const events = block.events || [];
          allEvents.push(...events);

          // Step 2: Perception Agent
          const perceptionResult = await agentRuntime.runAgent<PerceptionResult>({
            ...runtimeOpts,
            agentId: "perception",
            context: {
              events,
              scene: currentWorld.scene,
              entities: currentWorld.entities,
            },
          });

          const observations = perceptionResult.data?.npcObservations || {};
          const budget = calculateReactionBudget(block);

          // Step 3: NPC Reaction (Parallel execution via Promise.all)
          // Find NPCs with observations or characters in scene
          const sceneNpcs = Object.entries(currentWorld.entities)
            .filter(([id, ent]) => ent.type === "character" && id !== "player")
            .map(([id]) => id);

          const affectedNpcIds = sceneNpcs.filter(
            (id) => observations[id] && observations[id].length > 0
          );

          // Fallback to all scene characters if perception returned empty
          const targetNpcIds = affectedNpcIds.length > 0 ? affectedNpcIds : sceneNpcs.slice(0, 2);

          const npcReactions = await Promise.all(
            targetNpcIds.map(async (npcId) => {
              const npcEntity = currentWorld.entities[npcId];
              const obsList = observations[npcId] || [];

              const reactionRes = await agentRuntime.runAgent<NPCReactionResult>({
                ...runtimeOpts,
                agentId: "npc_reaction",
                context: {
                  npc: { id: npcId, ...npcEntity },
                  observations: obsList,
                  scene: currentWorld.scene,
                  reaction: budget,
                },
              });

              return {
                npcId,
                reaction: reactionRes.data,
              };
            })
          );

          // Step 4: World Resolver
          const resolverResult = await agentRuntime.runAgent<WorldResolverResult>({
            ...runtimeOpts,
            agentId: "world_resolver",
            context: {
              events,
              npcReactions,
              scene: currentWorld.scene,
              entities: currentWorld.entities,
              rules: currentWorld.rules,
            },
          });

          if (resolverResult.success && resolverResult.data?.patches) {
            const patchRes = applyPatches(currentWorld, resolverResult.data.patches);
            if (patchRes.success) {
              currentWorld = patchRes.newWorld;
              allPatches.push(...resolverResult.data.patches);
            }
          }
        }
      }

      // Step 5: Narrator
      const narratorResult = await agentRuntime.runAgent<string>({
        ...runtimeOpts,
        agentId: "narrator",
        context: {
          playerInput,
          events: allEvents,
          patches: allPatches,
          scene: currentWorld.scene,
          entities: currentWorld.entities,
        },
      });

      let narrationText = "";
      if (narratorResult.success) {
        const d: any = narratorResult.data;
        if (typeof d === "string") {
          narrationText = d;
        } else if (d?.narration) {
          narrationText = d.narration;
        } else {
          narrationText = JSON.stringify(d);
        }
      } else {
        narrationText = `(旁白生成出现异常: ${narratorResult.error})`;
      }

      // Clean up any stray "Narrator:" prefixes
      narrationText = narrationText.replace(/^(旁白|Narrator|NARRATOR)[:：]\s*/i, "");

      globalTraceManager.endTurnTrace(traceId, "success");

      const gameTurn: GameTurn = {
        id: `turn_${turnIndex}_${Date.now()}`,
        turnIndex,
        timestamp: new Date().toISOString(),
        playerInput,
        narratorOutput: narrationText,
        traceId,
        worldStateBefore: initialWorld,
        worldStateAfter: currentWorld,
        patches: allPatches,
        activeAgentGroupId: execContext.activeGroupId,
      };

      return {
        turn: gameTurn,
        traceId,
        success: true,
      };
    } catch (err: any) {
      globalTraceManager.endTurnTrace(traceId, "error");
      return {
        turn: {
          id: `turn_${turnIndex}_err`,
          turnIndex,
          timestamp: new Date().toISOString(),
          playerInput,
          narratorOutput: `执行过程中出现错误: ${err?.message || String(err)}`,
          traceId,
          worldStateBefore: initialWorld,
          worldStateAfter: currentWorld,
          patches: allPatches,
          activeAgentGroupId: execContext.activeGroupId,
        },
        traceId,
        success: false,
        error: err?.message || String(err),
      };
    }
  }
}

export const gamePipeline = new GamePipeline();
