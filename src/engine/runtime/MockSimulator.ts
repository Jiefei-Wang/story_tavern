import {
  AgentDefinition,
  InputCompilerResult,
  JsonPatchOperation,
  NPCReactionResult,
  PerceptionResult,
  WorldResolverResult,
  WorldState,
} from "../../types";

export class MockSimulator {
  static simulate(
    agentId: string,
    context: Record<string, any>,
    agentDef?: AgentDefinition
  ): any {
    switch (agentId) {
      case "input_compiler":
        return this.mockInputCompiler(context.player?.input || context.input || "");
      case "perception":
        return this.mockPerception(context.events || context.blocks || [], context.scene);
      case "npc_reaction":
        return this.mockNpcReaction(context.npc, context.observations, context.reaction);
      case "world_resolver":
        return this.mockWorldResolver(context.events, context.npcReactions, context.scene);
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

  private static mockInputCompiler(input: string): InputCompilerResult {
    const text = input.trim();
    const blocks: any[] = [];
    const lower = text.toLowerCase();

    // 1. Detect and extract Admin Command
    let adminCommand = "";
    let remainingText = text;

    const adminPrefixMatch = text.match(/^(?:admin|管理员|规则|command)[：:]\s*(.*)/i);
    if (adminPrefixMatch) {
      adminCommand = adminPrefixMatch[1].trim();
      remainingText = "";
    } else if (
      lower.includes("admin:") ||
      lower.includes("admin：") ||
      text.includes("管理员：") ||
      text.includes("管理员:")
    ) {
      const match = text.match(/(?:admin|管理员)[：:]\s*(.*)/i);
      if (match) {
        adminCommand = match[1].trim();
        remainingText = text.replace(/(?:admin|管理员)[：:]\s*.*/i, "").trim();
      }
    } else if (
      text.includes("改变天气") ||
      text.includes("修改天气") ||
      text.includes("不能复活") ||
      text.includes("死人不能") ||
      text.includes("禁止魔法") ||
      text.includes("规则：") ||
      text.includes("设定：")
    ) {
      // Inline admin command
      adminCommand = text;
      // If there are also explicit normal actions before it
      if (text.includes("另外") || text.includes("并且") || text.includes("，然后")) {
        const parts = text.split(/[，,]\s*(?:另外|并且|然后)/);
        if (parts.length > 1) {
          remainingText = parts[0].trim();
          adminCommand = parts[1].trim();
        }
      } else if (!text.includes("走") && !text.includes("说") && !text.includes("看") && !text.includes("拿")) {
        // Pure admin rule
        remainingText = "";
      }
    }

    // 2. Detect and extract Time Skip
    let timeSkipTarget = "";
    if (
      remainingText.includes("快进") ||
      remainingText.includes("跳过") ||
      remainingText.includes("第二天") ||
      remainingText.includes("三天")
    ) {
      timeSkipTarget = remainingText.includes("三天") ? "3_days_later" : "next_morning";
      remainingText = remainingText.replace(/(?:然后|并且)?[快进跳过].*/, "").trim();
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
          duration: 2.0,
        });
      }

      // Speech extraction
      const quoteMatch = remainingText.match(/[“"']([^“”"']+)["'”]/);
      const speechContent = quoteMatch
        ? quoteMatch[1]
        : remainingText.includes("说")
        ? remainingText.slice(remainingText.indexOf("说") + 1).replace(/[“"']/g, "")
        : "";

      if (speechContent) {
        normalEvents.push({
          id: "e2",
          type: "speech",
          actor: "player",
          content: speechContent.trim(),
          target: "erin",
          duration: 2.2,
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

  private static mockPerception(events: any[], scene: any): PerceptionResult {
    return {
      npcObservations: {
        erin: [
          {
            eventId: "e1",
            saw: true,
            heard: false,
          },
          {
            eventId: "e2",
            saw: true,
            heard: true,
            content: "今晚离开这里。",
          },
        ],
        guard: [
          {
            eventId: "e1",
            saw: true,
            heard: false,
          },
          {
            eventId: "e2",
            saw: true,
            heard: false, // Guard is too far to hear the whisper
          },
        ],
        tavern_owner: [], // Inside the tavern, saw nothing
      },
    };
  }

  private static mockNpcReaction(
    npc: any,
    observations: any[],
    reactionBudget: any
  ): NPCReactionResult {
    const npcId =
      npc?.id ||
      (npc?.name?.includes("艾琳")
        ? "erin"
        : npc?.name?.includes("卫兵")
        ? "guard"
        : "tavern_owner");

    if (npcId === "erin" || npc?.name?.includes("艾琳")) {
      return {
        thought:
          "他让我今晚离开……难道码头的黑旗走私路线泄露了？我必须小心试探他的底细。",
        mentalUpdates: [{ aspect: "mood", newValue: "alert" }],
        intents: [
          {
            type: "action",
            op: "glance_around",
            target: "guard",
            duration: 0.6,
          },
          {
            type: "speech",
            content: "小声点……你疯了吗？卫兵就在十步之外。你到底知道了什么？",
            target: "player",
            duration: 2.5,
          },
        ],
      };
    }

    if (npcId === "guard" || npc?.name?.includes("卫兵")) {
      return {
        thought: "窗边那两个人在窃窃私语，神色不对劲。待会儿去搜他们的行李。",
        mentalUpdates: [{ aspect: "mood", newValue: "vigilant" }],
        intents: [
          {
            type: "action",
            op: "shift_posture_and_watch",
            target: "player",
            duration: 1.0,
          },
        ],
      };
    }

    // Default neutral
    return {
      thought: null,
      mentalUpdates: [],
      intents: [],
    };
  }

  private static mockWorldResolver(
    events: any[],
    npcReactions: any[],
    scene: any
  ): WorldResolverResult {
    const patches: JsonPatchOperation[] = [
      {
        op: "replace",
        path: "/entities/erin/mentalState/mood",
        value: "alert",
      },
      {
        op: "replace",
        path: "/entities/guard/mentalState/mood",
        value: "vigilant",
      },
      {
        op: "replace",
        path: "/entities/player/location",
        value: "tavern_outside_window",
      },
    ];

    return {
      patches,
      narrationHints: ["艾琳神色紧绷并压低了声线", "卫兵投来警惕的目光"],
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

    return {
      patches: [
        {
          op: "replace",
          path: "/scene/weather",
          value: "snowy",
        },
      ],
      narrationHints: [`管理员指令生效：${command}`],
    };
  }

  private static mockNarrator(context: any): string {
    const input = (context.playerInput || context.player?.input || "").toLowerCase();
    const patches: JsonPatchOperation[] = context.patches || [];

    const isSnow =
      input.includes("雪") ||
      input.includes("snow") ||
      patches.some((p) => p.path === "/scene/weather" && p.value === "snowy");
    const isStorm =
      input.includes("雨") ||
      input.includes("暴风雨") ||
      patches.some((p) => p.path === "/scene/weather" && p.value === "stormy");
    const isResurrection =
      input.includes("复活") ||
      patches.some((p) => p.path === "/rules/magic/resurrection");
    const isSkip = input.includes("第二天") || input.includes("快进");

    const parts: string[] = [];

    // Admin effect prose
    if (isSnow) {
      parts.push(
        `虚空中无形的法则之弦悄然律动。原本清朗的天空瞬间凝滞，凛冽的寒风呼啸而至，苍穹中压下一片厚重的铅灰色云层。转瞬间，鹅毛般的雪花纷纷扬扬洒落下来，在港口酒馆古旧的屋檐与斑驳石板路上积起一层白霜。`
      );
    } else if (isStorm) {
      parts.push(
        `天色骤然变暗，狂暴的疾风裹挟着豆大的雨点倾盆而下，激荡在港口码头的海面上，溅起层层灰白的水雾。`
      );
    } else if (isResurrection) {
      parts.push(
        `虚空中无形的法则之弦猛烈地震颤了一瞬。酒馆外的空气骤然变得冰冷刺骨，某种冥冥之中的永恒禁制悄然落下——在这个世界上，死去的灵魂已无法再被任何魔法唤回人间。`
      );
    } else if (isSkip) {
      parts.push(
        `夜色悄然隐退，港口的晨雾如同白色的纱帐覆盖了整片石板街。次日清晨七点，湿漉漉的冷风吹散了酒气，远方的钟塔敲响了沉闷的晨钟。`
      );
    }

    // Normal action prose if player also performed actions
    if (
      context.events &&
      context.events.some((e: any) => e.type === "action" || e.type === "speech")
    ) {
      parts.push(
        `清晨微凉的海风掠过酒馆粗糙的外墙。你快步走向窗边，借着半开的窗板遮掩，在艾琳身侧压低了声音。\n\n艾琳听到你的话，单薄的肩膀猛地绷紧。她的手指下意识攥紧了衣角，警惕地环视四周，用只有你们两人能听清的细弱气音说道：“小声点……你疯了吗？卫兵就在十步之外。你到底知道了什么？”\n\n十步开外，把守港口要道的卫兵似有所觉，握紧长矛的手微微一动，冰冷而探究的目光如同刀子般朝你们所在的方向扫视过来。`
      );
    } else if (parts.length === 0) {
      parts.push(
        `海风拂过港口酒馆外的空地，一切如常运转。周围的人们各自忙碌着手中的活计。`
      );
    }

    return parts.join("\n\n");
  }
}
