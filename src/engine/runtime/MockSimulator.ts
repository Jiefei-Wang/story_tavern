import { explicitAdminCommand } from "./InputAuthority";
import { mockActionResolution } from '../world/ActionResolution';
import { characterFields, sampleFields } from "../character-schema/CharacterSchema";
import { HARBOR_WORLD_DEFINITION } from "../character-schema/HarborSchema";
import {
  AgentDefinition,
  InputCompilerResult,
  JsonPatchOperation,
  NPCReactionResult,
  PerceptionResult,
  WorldResolverResult,
  WorldState,
} from "../../types";
import { SpatialEngine } from "../world/SpatialEngine";

export class MockSimulator {
  static simulate(
    agentId: string,
    context: Record<string, any>,
    agentDef?: AgentDefinition
  ): any {
    switch (agentId) {
      case 'action_adjudicator': return mockActionResolution(context.events || [], context.world, context.playerInput || '');
      case 'narration_auditor': return { grounded: true, issues: [] };
      case 'character_change_auditor': return { valid: true, issues: [] }; // Test double; semantic review requires the real auditor.
      case "character_generator":
        return { name: `莉娅·海风${context.ordinal || 1}`, attributes: sampleFields(characterFields(context.characterSchema || HARBOR_WORLD_DEFINITION.characterSchema)) };
      case "input_compiler":
        return this.mockInputCompiler(context.player?.input || context.input || "", context);
      case "perception":
        return this.mockPerception(
          context.events || context.blocks || [],
          context.scene,
          context.entities
        );
      case "npc_reaction":
        {
        const reaction = this.mockNpcReaction(context.npc, context.observations, context.reaction);
        if (!context.interaction?.maySpeak) reaction.intents = reaction.intents.filter(i => i.type !== "speech");
        return reaction;
        }
      case "world_resolver":
        return this.mockWorldResolver(context.events, context.npcReactions, context.scene, context.entities);
      case "time_skip":
        return this.mockTimeSkip(context.skipTarget || "next_morning", context.world);
      case "admin_patch":
        return this.mockAdminPatch(context.command || context.player?.input || "");
      case "narrator":
        return this.mockNarrator(context);
      default:
        return { message: `Mock response for ${agentId}` };
    }
  }

  private static mockInputCompiler(input: string, context: any = {}): InputCompilerResult {
    const text = input.trim();
    const blocks: any[] = [];
    // Match the pipeline's explicit authority boundary; never infer administration.
    const adminCommand = explicitAdminCommand(input);
    let remainingText = adminCommand === null ? text : "";

    // 2. Detect and extract Time Skip (Correct regex: do not use character class [快进跳过])
    let timeSkipTarget = "";
    if (
      remainingText.includes("快进") ||
      remainingText.includes("跳过") ||
      remainingText.includes("第二天") ||
      remainingText.includes("三天")
    ) {
      timeSkipTarget = remainingText.includes("三天") ? "3_days_later" : "next_morning";
      remainingText = remainingText.replace(/(?:然后|并且)?(快进|跳过).*/, "").trim();
    }

    // 3. Parse normal events from remaining text
    const normalEvents: any[] = [];
    if (remainingText) {
      if (
        remainingText.includes("走") ||
        remainingText.includes("靠近") ||
        remainingText.includes("去") ||
        remainingText.includes("到")
      ) {
        normalEvents.push({
          id: "e1",
          type: "action",
          actor: "player",
          op: "walk_to",
          target: remainingText.includes("艾琳")
            ? "erin"
            : remainingText.includes("窗")
            ? "window"
            : "tavern_door",
          duration: 1.5,
        });
      }

      // Speech extraction
      const quoteMatch = remainingText.match(/[“"']([^“”"']+)["'”]/);
      const speechContent = quoteMatch
        ? quoteMatch[1]
        : remainingText.includes("说")
        ? remainingText.slice(remainingText.indexOf("说") + 1).replace(/[“"']/g, "")
        : /[？?]/.test(remainingText) ? remainingText : "";

      if (speechContent) {
        normalEvents.push({
          id: "e2",
          type: "speech",
          actor: "player",
          content: speechContent.trim(),
          target: /你们|大家/.test(remainingText) ? "all" : Object.entries(context.entities || {}).find(([id, ent]: [string, any]) => ent.type === "character" && id !== "player" && (remainingText.includes(id) || (ent.name && remainingText.includes(ent.name)) || (id === "guard" && remainingText.includes("卫兵")) || (id === "erin" && remainingText.includes("艾琳"))))?.[0] || context.conversation?.focusNpcId || "",
          duration: 2.0,
          parallelWith: normalEvents.length > 0 ? ["e1"] : [],
        });
      } else if (normalEvents.length === 0 && !adminCommand && !timeSkipTarget) {
        normalEvents.push({
          id: "e1",
          type: "action",
          actor: "player",
          op: "interact",
          target: "scene",
          content: remainingText,
          duration: 1.5,
        });
      }
    }

    // Add normal block if we have normal events
    if (normalEvents.length > 0) {
      blocks.push({
        id: `b_${blocks.length + 1}`,
        kind: "normal",
        events: normalEvents,
      });
    }

    // Add wait block if player requested waiting for response
    if (text.includes("等") || text.includes("回答") || text.includes("看她")) {
      blocks.push({
        id: `b_${blocks.length + 1}`,
        kind: "wait",
        responseWindow: true,
        duration: 4.0,
      });
    }

    // Add time skip block if present
    if (timeSkipTarget) {
      blocks.push({
        id: `b_${blocks.length + 1}`,
        kind: "time_skip",
        to: timeSkipTarget,
      });
    }

    // Add admin block if present
    if (adminCommand) {
      blocks.push({
        id: `b_${blocks.length + 1}`,
        kind: "admin",
        command: adminCommand,
      });
    }

    return { blocks };
  }

  private static mockPerception(
    events: any[],
    scene: any,
    entities?: Record<string, any>
  ): PerceptionResult {
    const observations: Record<string, any[]> = {};
    if (!Array.isArray(events) || events.length === 0) {
      return { npcObservations: {} };
    }

    const dummyWorld: WorldState = {
      clock: "1342-06-12T08:00:00",
      scene: scene || { location: "tavern_outside", weather: "clear", lighting: "morning" },
      entities: entities || {},
      rules: {},
    };

    const sceneChars = SpatialEngine.getSceneCharacters(dummyWorld, false);
    const sceneCharIds = sceneChars.map((c) => c.id);

    // If entities were not passed, use defaults for tavern_outside
    const targetNpcIds =
      sceneCharIds.length > 0
        ? sceneCharIds
        : ["erin", "guard"];

    for (const npcId of targetNpcIds) {
      const npcObs: any[] = [];

      for (const ev of events) {
        if (ev.type === "speech") {
          // If addressed to this NPC, they hear it clearly
          if (!ev.details?.isPrivate || ev.target === npcId) {
            npcObs.push({
              eventId: ev.id,
              saw: true,
              heard: true,
              actor: ev.actor,
              type: ev.type,
              op: ev.op,
              target: ev.target,
              content: ev.content || "...",
            });
          } else {
            // Other NPCs in the scene see them speaking but might not hear the whisper
            npcObs.push({
              eventId: ev.id,
              saw: true,
              heard: false,
              actor: ev.actor,
              type: ev.type,
              op: ev.op,
              target: ev.target,
            });
          }
        } else {
          // Actions in same scene are seen
          npcObs.push({
            eventId: ev.id,
            saw: true,
            heard: false,
            actor: ev.actor,
            type: ev.type,
            op: ev.op,
            target: ev.target,
          });
        }
      }

      observations[npcId] = npcObs;
    }

    // Characters clearly outside scene have empty observations
    if (entities) {
      for (const [id, ent] of Object.entries(entities)) {
        if (ent.type === "character" && id !== "player" && !targetNpcIds.includes(id)) {
          observations[id] = [];
        }
      }
    }

    return { npcObservations: observations };
  }

  private static mockNpcReaction(
    npc: any,
    observations: any[],
    reactionBudget: any
  ): NPCReactionResult {
    // Finite Perspective: If NPC observed nothing, they do not react!
    const obsList = Array.isArray(observations) ? observations : [];
    const hasPerceived = obsList.some((obs: any) => obs.saw === true || obs.heard === true);

    if (!hasPerceived) {
      return {
        thought: null,
        stateUpdates: [],
        intents: [],
      };
    }

    const availableTime =
      typeof reactionBudget?.available_time === "number"
        ? reactionBudget.available_time
        : 2.5;

    const npcId =
      npc?.id ||
      (npc?.name?.includes("艾琳")
        ? "erin"
        : npc?.name?.includes("卫兵")
        ? "guard"
        : "tavern_owner");

    // Erin reaction
    if (npcId === "erin" || npc?.name?.includes("艾琳")) {
      const heardSpeech = obsList.some((o) => o.heard && o.content);

      if (availableTime < 1.0) {
        // Budget constraint: short glance only
        return {
          thought: "他突然靠近……我警惕地扫了他一眼。",
          stateUpdates: [],
          intents: [
            {
              type: "action",
              op: "glance_around",
              target: "guard",
              duration: 0.5,
            },
          ],
        };
      }

      return {
        thought: heardSpeech
          ? "他让我今晚离开……难道码头的黑旗走私路线泄露了？我必须小心试探他的底细。"
          : "他朝我走了过来，神色看起来有话要说。",
        stateUpdates: [],
        intents: [
          {
            type: "action",
            op: "glance_around",
            target: "guard",
            duration: 0.6,
          },
          {
            type: "speech",
            speechPlan: {
              summary: "提醒玩家压低声音，因为卫兵就在附近，并试探玩家究竟知道了什么。",
              beats: [
                { kind: "warning", meaning: "提醒玩家不要大声说话，卫兵就在附近。", required: true },
                { kind: "question", meaning: "询问玩家到底知道了什么。", required: true },
              ],
              goal: "warn_and_probe",
              stance: "警惕而急切",
              tone: "压低声音，紧张",
              verbosity: "normal",
              boundaries: ["不要透露自己的秘密记忆"],
            },
            target: "player",
            duration: Math.min(2.0, Math.max(1.5, availableTime - 0.6)),
          },
        ],
      };
    }

    // Guard reaction
    if (npcId === "guard" || npc?.name?.includes("卫兵")) {
      return {
        thought: "窗边那两个人在窃窃私语，神色不对劲。待会儿去搜他们的行李。",
        stateUpdates: [],
        intents: [
          {
            type: "action",
            op: "shift_posture_and_watch",
            target: "player",
            duration: Math.min(1.0, availableTime),
          },
        ],
      };
    }

    return {
      thought: null,
      stateUpdates: [],
      intents: [],
    };
  }

  private static mockWorldResolver(
    events: any[],
    npcReactions: any[],
    scene: any,
    entities?: Record<string, any>
  ): WorldResolverResult {
    const patches: JsonPatchOperation[] = [];
    const narrationHints: string[] = [];
    const publicEvents: import("../../types").PublicWorldEvent[] = [];

    // Process player movement
    if (Array.isArray(events)) {
      const walkEvent = events.find((e) => e.op === "walk_to" && e.actor === "player");
      if (walkEvent) {
        patches.push({
          op: "replace",
          path: "/entities/player/location",
          value: "tavern_outside_window",
        });
      }
    }

    // Process NPC reactions
    if (Array.isArray(npcReactions)) {
      for (const reactionItem of npcReactions) {
        const npcId = reactionItem.npcId;
        const rx = reactionItem.reaction;
        if (!rx) continue;

        // Attribute operations are materialized by the same deterministic builder as live runs.

        // Convert successful NPC intents into authoritative publicEvents
        for (const intent of rx.intents || []) {
          if (intent.type === "speech") {
            publicEvents.push({
              actor: npcId,
              type: "speech",
              sourceIntentId: intent.id,
              speechPlan: intent.speechPlan,
              target: intent.target,
              duration: intent.duration,
            });
          } else if (intent.type === "action") {
            publicEvents.push({
              actor: npcId,
              type: "action",
              sourceIntentId: intent.id,
              op: intent.op,
              target: intent.target,
              duration: intent.duration,
            });
          } else if (intent.type === "wait") {
            publicEvents.push({ actor: npcId, type: "action", sourceIntentId: intent.id, op: "wait", duration: intent.duration });
          }
        }

        if (npcId === "erin") {
          narrationHints.push("艾琳神色紧绷并压低了声线");
        } else if (npcId === "guard") {
          narrationHints.push("卫兵投来警惕的目光");
        }
      }
    }

    return {
      patches,
      publicEvents,
      narrationHints,
      acceptedStateUpdates: (npcReactions || []).flatMap(r => (r.reaction.stateUpdates || []).map((_: unknown, updateIndex: number) => ({npcId:r.npcId,updateIndex}))),
    };
  }

  private static mockTimeSkip(target: string, world?: WorldState): WorldResolverResult {
    return {
      patches: [
        {
          op: "replace",
          path: "/clock",
          value: "1342-06-13T07:00:00",
        },
        {
          op: "replace",
          path: "/scene/lighting",
          value: "dawn",
        },
        {
          op: "replace",
          path: "/scene/weather",
          value: "foggy",
        },
      ],
      narrationHints: ["时间流逝到了次日清晨，浓雾笼罩了码头"],
    };
  }

  private static mockAdminPatch(command: string): WorldResolverResult {
    const cmd = command.toLowerCase();

    if (cmd.includes("复活")) {
      return {
        patches: [
          {
            op: "replace",
            path: "/rules/magic/resurrection",
            value: false,
          },
        ],
        narrationHints: ["世界法则被篡改：死者不再能被复活。"],
      };
    }

    if (cmd.includes("雪") || cmd.includes("snow")) {
      return {
        patches: [
          {
            op: "replace",
            path: "/scene/weather",
            value: "snowy",
          },
        ],
        narrationHints: ["管理员指令生效：天气变更为下雪天。"],
      };
    }

    if (
      cmd.includes("雨") ||
      cmd.includes("rain") ||
      cmd.includes("暴风雨") ||
      cmd.includes("storm")
    ) {
      return {
        patches: [
          {
            op: "replace",
            path: "/scene/weather",
            value: "stormy",
          },
        ],
        narrationHints: ["管理员指令生效：天气变更为暴风雨。"],
      };
    }

    if (cmd.includes("晴") || cmd.includes("clear") || cmd.includes("sunny")) {
      return {
        patches: [
          {
            op: "replace",
            path: "/scene/weather",
            value: "clear",
          },
        ],
        narrationHints: ["管理员指令生效：天气变更为晴天。"],
      };
    }

    if (cmd.includes("夜") || cmd.includes("晚上") || cmd.includes("night")) {
      return {
        patches: [
          {
            op: "replace",
            path: "/scene/lighting",
            value: "night",
          },
        ],
        narrationHints: ["管理员指令生效：光照变更为夜晚。"],
      };
    }

    // Do NOT default to snow! Fail or return empty unsupported patch set
    return {
      patches: [],
      narrationHints: [`未知的管理员指令: ${command}，未产生生效的世界变更。`],
    };
  }

  private static mockNarrator(context: any): import("../../types").NarratorResult {
    const segments: any[] = [];
    for (const event of context.committedEvents || []) {
      if (event.type === "npc_speech" && event.sourceIntentId) {
        const plan = event.speechPlan;
        const beats = plan?.beats?.filter((beat: any) => beat.required !== false) || [];
        if (beats.length === 0) segments.push({ type: "speech", sourceIntentId: event.sourceIntentId, text: plan?.summary || "" });
        else beats.forEach((beat: any, index: number) => {
          if (index > 0) segments.push({ type: "prose", text: "她稍稍停顿了一下。" });
          segments.push({ type: "speech", sourceIntentId: event.sourceIntentId, text: beat.meaning });
        });
      } else if (event.type === "player_speech" && event.sourceIntentId) {
        segments.push({ type: "speech", sourceIntentId: event.sourceIntentId, text: event.content || "" });
      } else if (event.type === "npc_action") {
        segments.push({ type: "prose", text: `${event.actor || "现场的人"}的动作让空气中的气氛微妙地变了。`, sourceEventIds: [event.id] });
      } else if (event.type === "player_action") {
        segments.push({ type: "prose", text: "你的动作打破了片刻的静默。", sourceEventIds: [event.id] });
      } else {
        segments.push({ type: "prose", text: event.type === "wait" ? "你静候着回应。" : "周围的情形悄然发生了变化。", sourceEventIds: [event.id] });
      }
    }
    return { segments };
  }
}
