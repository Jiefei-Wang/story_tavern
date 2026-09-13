// Historical pipeline test fixtures only; never seed the player database.
import { HARBOR_WORLD_DEFINITION } from "../../src/engine/character-schema/HarborSchema";
import { TEXT_AGENTS, addTextBindings } from '../../src/engine/text/Agents';
import { withConversationContract } from "../../src/engine/runtime/ConversationContracts";
import { AgentDefinition, AgentGroup, Backend, GameSave } from "../../src/types";
import { INITIAL_HARBOR_TAVERN_WORLD } from "../../src/engine/world/WorldState";
import { CHARACTER_GENERATOR } from "../../src/engine/characters/CharacterGenerator";
import { ACTION_ADJUDICATOR } from '../../src/engine/world/ActionResolution';
import { CHARACTER_CHANGE_AUDITOR } from '../../src/engine/world/CharacterChangeAuditor';
import { NARRATION_AUDITOR } from '../../src/engine/narration/NarrationAuditor';

export const BUILTIN_AGENTS: AgentDefinition[] = [
  {
    id: "input_compiler",
    name: "Input Compiler",
    description: "将玩家自然语言输入拆解为动作、对白、快进、管理员指令等多意图时序块。",
    tags: ["核心", "输入解析"],
    version: "v1.0",
    updatedAt: "2026-09-11",
    messages: [
      {
        id: "m1",
        role: "system",
        content: `你是一个RPG游戏输入编译器。你的任务是将玩家的自然语言输入拆解为一个或多个 Temporal Block，每个 block 包含具体的事件。
支持的块类型 (kind)：
1. "normal": 普通物理或言语事件块，其 events 数组可包含：
   - "action": 物理动作（如 walk_to, take, open，包含 actor, op, target, duration）
   - "speech": 说话对白（包含 actor, content, target, duration, parallelWith）
2. "wait": 等待NPC反应，设置 responseWindow=true
3. "time_skip": 时间快进（包含 to，例如 "next_morning"）
4. "admin": 仅当整条原始输入以 admin: 或 管理员: 开头时可用（包含 command；兼容大小写和中文冒号）

重要原则：
- 没有上述开头前缀时，绝不输出 admin 块。引号内、句中、后续子句中的 admin 也不授权。
- 改变天气、修改规则、古代掏枪等无权限或不可能的意图仍属于玩家尝试；交由世界规则裁定，不得升级为管理员操作。

输出示例：
{
  "blocks": [
    {
      "id": "b1",
      "kind": "normal",
      "events": [
        { "id": "e1", "type": "action", "actor": "player", "op": "walk_to", "target": "window", "duration": 2.0 },
        { "id": "e2", "type": "speech", "actor": "player", "content": "你听到了吗？", "target": "erin", "duration": 1.5, "parallelWith": ["e1"] }
      ]
    },
    {
      "id": "b2",
      "kind": "wait",
      "responseWindow": true
    }
  ]
}`,
      },
      {
        id: "m2",
        role: "user",
        content: `当前场景: {{json scene}}\n玩家输入: {{player.input}}\n\n请解析输出 JSON:`,
      },
    ],
    inputs: [
      { name: "player.input", type: "string", description: "玩家输入文本", required: true },
      { name: "scene", type: "SceneContext", description: "当前场景信息", required: false },
    ],
    outputSchema: {
      type: "object",
      properties: {
        blocks: {
          type: "array",
          items: {
            type: "object",
            properties: {
              id: { type: "string" },
              kind: { type: "string", enum: ["normal", "wait", "time_skip", "admin"] },
              events: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    id: { type: "string" },
                    type: { type: "string", enum: ["action", "speech"] },
                    actor: { type: "string" },
                    op: { type: "string" },
                    target: { type: "string" },
                    content: { type: "string" },
                    duration: { type: "number", minimum: 0 },
                    parallelWith: { type: "array", items: { type: "string" } },
                  },
                  required: ["id", "type"],
                },
              },
              responseWindow: { type: "boolean" },
              duration: { type: "number", minimum: 0 },
              to: { type: "string" },
              command: { type: "string" },
            },
            required: ["id", "kind"],
          },
        },
      },
      required: ["blocks"],
    },
    defaults: {
      temperature: 0.2,
      maxTokens: 0,
    },
  },
  {
    id: "perception",
    name: "Perception Agent",
    description: "判断场景中发生的物理或语言事件，对各个处于有限视角的NPC分别是否可感知。",
    tags: ["感知", "有限视角"],
    version: "v1.0",
    updatedAt: "2026-09-11",
    messages: [
      {
        id: "m1",
        role: "system",
        content: `你是一个有限视角感知判定引擎。
依据当前场景、事件发生者、事件距离以及声音大小，判断场景中的每个 NPC 看见了什么（saw）、听见了什么（heard）。
输出观察时必须复制事件本身的公开语义字段 actor、type、op、target；不要只输出 eventId。action 的语义只有在 saw=true 时提供，speech 的 content 只有在 heard=true 时提供。不要泄漏未听见的对白或不可见事件。
输出格式：
{
  "npcObservations": {
    "erin": [
      { "eventId": "e1", "saw": true, "heard": false },
      { "eventId": "e2", "saw": true, "heard": true, "content": "对白内容" }
    ],
    "guard": [
      { "eventId": "e1", "saw": true, "heard": false }
    ]
  }
}`,
      },
      {
        id: "m2",
        role: "user",
        content: `场景: {{json scene}}\n人物位置: {{json entities}}\n发生事件: {{json events}}\n\n请输出各 NPC 的观察感知 JSON:`,
      },
    ],
    inputs: [
      { name: "events", type: "GameEvent[]", description: "发生的事件列表", required: true },
      { name: "scene", type: "SceneContext", description: "场景环境", required: true },
      { name: "entities", type: "Record<string, Entity>", description: "场景中实体及位置", required: true },
    ],
    outputSchema: {
      type: "object",
      properties: {
        npcObservations: {
          type: "object",
          additionalProperties: {
            type: "array",
            items: {
              type: "object",
              properties: {
                eventId: { type: "string" },
                saw: { type: "boolean" },
                heard: { type: "boolean" },
                actor: { type: "string" },
                type: { type: "string" },
                op: { type: "string" },
                target: { type: "string" },
                content: { type: "string" },
              },
              required: ["eventId", "saw", "heard"],
            },
          },
        },
      },
      required: ["npcObservations"],
    },
    defaults: {
      temperature: 0.2,
      maxTokens: 0,
    },
  },
  {
    id: "npc_reaction",
    name: "NPC Reaction Agent",
    description: "单 NPC 独立有限视角推演。根据自身记忆、目标、有限观察与反应时间预算做出反应。",
    tags: ["NPC", "心智行为"],
    version: "v1.0",
    updatedAt: "2026-09-11",
    messages: [
      {
        id: "m1",
        role: "system",
        content: `你只能扮演并推演指定的单个 NPC。
绝对不允许获知其他人的内心想法或隐藏世界信息。
你必须严格遵守 reaction.available_time 的时间预算。在短时间内不能进行复杂演说或过多动作。
允许完全不行动或不说话（thought: null, stateUpdates: [], intents: []）。

speech intent 只表达“角色想说什么”，不要写最终小说台词。使用自然语言 SpeechPlan，不要使用 subject/predicate 等复杂语言学 DSL：
{ "summary": "总体语义", "beats": [{ "kind": "answer", "meaning": "必须表达的意思", "required": true }], "goal": "目的", "stance": "立场", "tone": "态度", "verbosity": "brief|normal|detailed|extended", "boundaries": ["不能擅自透露的内容"] }

输出格式：
{
  "thought": "内心的简短独白或想法",
  "stateUpdates": [
    { "path": "attributes.<schema字段ID>", "op": "set", "value": "符合该字段定义的值" }
  ],
  "intents": [
    { "type": "action", "op": "glance_around", "duration": 0.6 },
    { "type": "speech", "speechPlan": { "summary": "想向玩家表达的意思", "beats": [{ "meaning": "必须表达的事实", "required": true }], "tone": "克制", "verbosity": "normal", "boundaries": [] }, "target": "player", "duration": 2.0 }
  ]
}`,
      },
      {
        id: "m2",
        role: "user",
        content: `NPC 自身状态与记忆:\n{{json npc}}\n\n实际观察到的事件:\n{{json observations}}\n\n反应时间预算 (秒):\n{{reaction.available_time}}\n\n请根据有限视角和时间预算做出反应 JSON:`,
      },
    ],
    inputs: [
      { name: "npc", type: "NPCEntity", description: "NPC状态、记忆、目标", required: true },
      { name: "observations", type: "Observation[]", description: "该NPC观察到的事件", required: true },
      { name: "reaction.available_time", type: "number", description: "可用反应时间（秒）", required: true },
    ],
    outputSchema: {
      type: "object",
      properties: {
        thought: { type: ["string", "null"] },
        stateUpdates: {
          type: "array",
          items: {
            type: "object",
            properties: {
              path: { type: "string" },
              op: { type: "string", enum: ["set", "delta", "append"] },
              value: {},
              reason: { type: "string" },
            },
            required: ["path", "op", "value"],
            additionalProperties: false,
          },
        },
        intents: {
          type: "array",
          items: {
            type: "object",
            properties: {
              id: { type: "string" },
              type: { type: "string", enum: ["action", "speech", "wait"] },
              op: { type: "string" },
              target: { type: "string" },
              content: { type: "string" },
              speechPlan: {
                type: "object",
                properties: {
                  summary: { type: "string", minLength: 1 },
                  beats: { type: "array", items: { type: "object", properties: { kind: { type: "string" }, meaning: { type: "string", minLength: 1 }, required: { type: "boolean" } }, required: ["meaning"] } },
                  goal: { type: "string" }, stance: { type: "string" }, tone: { type: "string" }, verbosity: { type: "string", enum: ["brief", "normal", "detailed", "extended"] }, boundaries: { type: "array", items: { type: "string" } },
                },
                required: ["summary"],
                additionalProperties: false,
              },
              duration: { type: "number", minimum: 0 },
            },
            required: ["type"],
          },
        },
      },
      required: ["thought", "intents"],
    },
    defaults: {
      temperature: 0.7,
      maxTokens: 0,
    },
  },
  {
    id: "world_resolver",
    name: "World Resolver",
    description: "裁决动作与物理结果，选择合法人物提议；身体及资源过程由执行后的独立阶段结算。",
    tags: ["世界结算", "RFC6902"],
    version: "v1.0",
    updatedAt: "2026-09-11",
    messages: [
      {
        id: "m1",
        role: "system",
        content: `你是世界结算仲裁者 (World Resolver)。
接收玩家事件与所有 NPC 的意图，验证是否符合规则与物理可行性。
物品、环境和位置等物理结果使用 RFC 6902 JSON Patch。人物属性只通过 acceptedStateUpdates 选择已有候选，由程序生成差异；不得手写 attributes/relationships Patch。
实际进食、休息、施法或使用能力等过程的身体与资源效果，在已接受动作执行后由独立阶段结算。本阶段提交物理结果，不提前结算人物效果。禁止直接重写整个世界。

每个 NPC intent 都必须在 accepted publicEvents 或 rejectedIntents 中出现一次，不能静默吞掉。accepted intent 必须引用 sourceIntentId；speech 只携带并原样保留 speechPlan，不生成 content，Narrator 会负责措辞。action 也必须携带 sourceIntentId。
如果 NPC 的意图在物理与规则上成功发生，必须同时在 publicEvents 中输出对应公开事件（供 Narrator 描述）：
- speech: 包含 actor、type: "speech"、sourceIntentId、target、speechPlan
- action: 包含 actor、type: "action"、sourceIntentId、op、target（可选）
- environment: 环境事件

输出格式：
{
  "patches": [
    { "op": "replace", "path": "/entities/player/location", "value": "tavern_outside_window" }
  ],
  "publicEvents": [
    { "actor": "erin", "type": "speech", "sourceIntentId": "b0_erin_intent_0", "target": "player", "speechPlan": { "summary": "想提醒玩家保持安静" } },
    { "actor": "guard", "type": "action", "sourceIntentId": "b0_guard_intent_0", "op": "watch_player" }
  ],
  "acceptedStateUpdates": [],
  "narrationHints": [
    "艾琳变得警惕",
    "玩家走到了窗边"
  ]
}`,
      },
      {
        id: "m2",
        role: "user",
        content: `发生的玩家事件:\n{{json events}}\n\nNPC 反应与意图:\n{{json npcReactions}}\n\n当前世界实体与规则:\n{{json entities}}\n{{json rules}}\n\n请输出结算后的 RFC 6902 JSON Patch 与 publicEvents:`,
      },
    ],
    inputs: [
      { name: "events", type: "GameEvent[]", description: "玩家执行事件", required: true },
      { name: "npcReactions", type: "NPCReaction[]", description: "NPC意图", required: true },
      { name: "entities", type: "Entities", description: "实体状态", required: true },
      { name: "rules", type: "Rules", description: "世界规则", required: true },
    ],
    outputSchema: {
      type: "object",
      properties: {
        patches: {
          type: "array",
          items: {
            type: "object",
            properties: {
              op: { type: "string", enum: ["add", "remove", "replace", "move", "copy", "test"] },
              path: { type: "string", pattern: "^/" },
              value: {},
              from: { type: "string", pattern: "^/" },
            },
            required: ["op", "path"],
          },
        },
        publicEvents: {
          type: "array",
          items: {
            type: "object",
            properties: {
              id: { type: "string" },
              actor: { type: "string" },
              sourceIntentId: { type: "string", minLength: 1 },
              type: { type: "string", enum: ["action", "speech", "environment"] },
              op: { type: "string" },
              target: { type: "string" },
              content: { type: "string" },
              speechPlan: { type: "object", properties: { summary: { type: "string", minLength: 1 }, beats: { type: "array" }, goal: { type: "string" }, stance: { type: "string" }, tone: { type: "string" }, verbosity: { type: "string" }, boundaries: { type: "array" } }, required: ["summary"], additionalProperties: true },
              duration: { type: "number" },
            },
            required: ["actor", "type"],
          },
        },
        rejectedIntents: {
          type: "array",
          items: { type: "object", properties: { intent: { type: "object" }, reason: { type: "string", minLength: 1 } }, required: ["intent", "reason"] },
        },
        narrationHints: {
          type: "array",
          items: { type: "string" },
        },
      },
      required: ["patches"],
    },
    defaults: {
      temperature: 0.2,
      maxTokens: 0,
    },
  },
  {
    id: "time_skip",
    name: "Time Skip Agent",
    description: "处理时间快进，推演经过时间内的环境演变与状态变化，输出 RFC 6902 Patch。",
    tags: ["时间", "快进"],
    version: "v1.0",
    updatedAt: "2026-09-11",
    messages: [
      {
        id: "m1",
        role: "system",
        content: `你是时间流逝与时空推演引擎。
当玩家执行时间快进时，玩家可能会输入任意自然语言表达的时间跨度或目标（例如：“10分钟”、“半小时”、“1小时”、“1天”、“一周”、“吃完午饭后”、“等到夜幕降临”、“三天后”等）。
你的任务是：
1. 提取并理解玩家意图快进的自然语言时间量级，不要假设用户会遵循固定的时钟格式。
2. 结合当前世界状态中的时钟 (world.clock) 及环境，计算推进后的新时钟。
3. 推演随时间流逝发生的世界状态变化：
   - 时钟更新：replace /clock (例如从 "Day 1, 08:30" 推进到 "Day 1, 09:00")
   - 场景光照与环境自然演变：replace /scene/lighting (如 "morning" -> "noon" -> "dusk" -> "night")
   - NPC 与环境实体的状态更新（如体力恢复、完成手中的事情等）
4. 输出局部精准的 RFC 6902 JSON Patch 数组。

示例：
输入目标：“半小时”，当前 clock: "Day 1, 08:30"
输出：
{
  "patches": [
    { "op": "replace", "path": "/clock", "value": "Day 1, 09:00" },
    { "op": "replace", "path": "/scene/lighting", "value": "bright_morning" }
  ]
}`,
      },
      {
        id: "m2",
        role: "user",
        content: `快进目标表达: {{skipTarget}}\n当前时钟与世界: {{json world}}\n\n请输出时间快进的 RFC 6902 Patch:`,
      },
    ],
    inputs: [
      { name: "skipTarget", type: "string", description: "快进目标（如 next_morning）", required: true },
      { name: "world", type: "WorldState", description: "当前世界状态", required: true },
    ],
    outputSchema: {
      type: "object",
      properties: {
        patches: {
          type: "array",
          items: {
            type: "object",
            properties: {
              op: { type: "string", enum: ["add", "remove", "replace", "move", "copy", "test"] },
              path: { type: "string", pattern: "^/" },
              value: {},
              from: { type: "string", pattern: "^/" },
            },
            required: ["op", "path"],
          },
        },
      },
      required: ["patches"],
    },
    defaults: {
      temperature: 0.3,
      maxTokens: 0,
    },
  },
  {
    id: "admin_patch",
    name: "Admin Patch Agent",
    description: "将管理员自然语言指令转换为局部的 RFC 6902 JSON Patch，精准修改规则、实体或环境。",
    tags: ["管理员", "法则修改"],
    version: "v1.0",
    updatedAt: "2026-09-11",
    messages: [
      {
        id: "m1",
        role: "system",
        content: `你是管理员规则执行引擎。
将管理员指令转换为精准的 RFC 6902 JSON Patch。
绝对不允许重写整个世界。只做局部修改。
例如：
输入：“从现在开始，死人不能被魔法复活。”
输出：
{
  "patches": [
    { "op": "replace", "path": "/rules/magic/resurrection", "value": false }
  ]
}`,
      },
      {
        id: "m2",
        role: "user",
        content: `管理员指令: {{command}}\n当前世界: {{json world}}\n\n请生成对应的 RFC 6902 JSON Patch:`,
      },
    ],
    inputs: [
      { name: "command", type: "string", description: "管理员自然语言指令", required: true },
      { name: "world", type: "WorldState", description: "当前世界状态", required: true },
    ],
    outputSchema: {
      type: "object",
      properties: {
        patches: {
          type: "array",
          items: {
            type: "object",
            properties: {
              op: { type: "string", enum: ["add", "remove", "replace", "move", "copy", "test"] },
              path: { type: "string", pattern: "^/" },
              value: {},
              from: { type: "string", pattern: "^/" },
            },
            required: ["op", "path"],
          },
        },
      },
      required: ["patches"],
    },
    defaults: {
      temperature: 0.1,
      maxTokens: 0,
    },
  },
  {
    id: "narrator",
    name: "Narrator",
    description: "基于本轮已发生的公开物理事件、NPC可观察动作与世界增量，生成沉浸式小说旁白正文。",
    tags: ["旁白", "叙事生成"],
    version: "v1.0",
    updatedAt: "2026-09-11",
    messages: [
      {
        id: "m1",
        role: "system",
        content: `你是小说表现层 Narrator，而不是世界规则层。世界可以是西幻、现代、科幻、赛博朋克、推理、末日、现实题材或用户自定义类型；从 scene、world description、rules、entities 和事件判断风格，没有明确风格时使用中性自然的沉浸式小说语言。
你只能描述玩家能感知到的物理事实、对白、神态与环境变化。
NPC SpeechPlan 是角色已经决定要表达的真实语义意图。你负责把它写成自然对白，可以改变措辞、句式、停顿、语气、修辞、长度和分段，也可以穿插低后果动作与环境描写；但不得改变说话者、对象、核心事实、确定程度、关键立场、required 信息、boundaries 或角色知识边界。若角色撒谎，忠实写出谎言，不得在 prose 中泄漏真相。
根据真实提交的公开事实生成小说正文；不要把结构化事件机械翻译成“某人执行了某动作”。
绝对严禁泄露 NPC 的隐藏内心独白、私有记忆或心智状态！
输出 JSON {segments:[{type:"prose",text,sourceEventIds?}|{type:"speech",sourceIntentId,text}]}。同一 sourceIntentId 可出现多次以支持长对白与动作交错。speech 必须引用 accepted speech 的 sourceIntentId；不得创造没有 authoritative source 的对白或有世界后果的新事件。所有 accepted NPC speech 至少实现一次。`,
      },
      {
        id: "m2",
        role: "user",
        content: `玩家本轮输入:\n{{playerInput}}\n\n本轮已经真实发生且玩家可以观察到的事件（speechPlan 是 NPC 语义权威，不能当作现成台词复制）:\n{{json committedEvents}}\n\n公开世界变化:\n{{json publicPatches}}\n\n当前场景:\n{{json scene}}\n\n公开实体:\n{{json entities}}\n\n请输出自然小说段落的结构化 JSON:`,
      },
    ],
    inputs: [
      { name: "playerInput", type: "string", description: "玩家本轮输入", required: true },
      { name: "committedEvents", type: "CommittedTurnEvent[]", description: "本轮真实发生的公开事件", required: true },
      { name: "publicPatches", type: "Patch[]", description: "公开世界增量", required: true },
      { name: "scene", type: "SceneContext", description: "场景信息", required: true },
      { name: "entities", type: "PublicEntities", description: "公开实体", required: true },
      { name: "events", type: "GameEvent[]", description: "兼容输入", required: false },
      { name: "patches", type: "Patch[]", description: "兼容输入", required: false },
    ],
      outputSchema: null, // withConversationContract supplies the structured schema
    defaults: {
      temperature: 0.8,
      maxTokens: 0,
    },
  },
];

export const DEFAULT_BACKENDS: Backend[] = [
  {
    id: "backend_openrouter",
    name: "OpenRouter",
    baseUrl: "https://openrouter.ai/api/v1",
    authType: "bearer",
    secretRef: "secret_openrouter_default",
    customHeaders: {
      "HTTP-Referer": "https://storytavern.ai",
      "X-Title": "Story Tavern",
    },
    timeoutMs: 60000,
    maxConcurrency: 8,
    enabled: true,
    models: [
      "nvidia/nemotron-3-super-120b-a12b:free",
      "anthropic/claude-3.5-sonnet",
      "openai/gpt-4o",
      "openai/gpt-4o-mini",
      "meta-llama/llama-3.3-70b-instruct",
    ],
    status: "unknown",
  },
  {
    id: "backend_local",
    name: "本地 Qwen (NInfer / Ollama)",
    baseUrl: "http://127.0.0.1:11434/v1",
    authType: "none",
    customHeaders: {},
    timeoutMs: 60000,
    maxConcurrency: 1,
    enabled: true,
    models: ["qwen2.5:7b", "qwen2.5:14b", "llama3.2:3b"],
    status: "offline",
  },
];

export const DEFAULT_AGENT_GROUPS: AgentGroup[] = [
  {
    id: "group_quality",
    name: "Quality (高质量模型组合)",
    description: "全流程采用高质量模型组合，适合沉浸式叙事体验",
    updatedAt: "2026-09-11",
    bindings: [
      {
        agentId: "input_compiler",
        backendId: "backend_openrouter",
        model: "nvidia/nemotron-3-super-120b-a12b:free",
        overrides: { temperature: 0.2 },
      },
      {
        agentId: "perception",
        backendId: "backend_openrouter",
        model: "nvidia/nemotron-3-super-120b-a12b:free",
        overrides: { temperature: 0.2 },
      },
      {
        agentId: "npc_reaction",
        backendId: "backend_openrouter",
        model: "nvidia/nemotron-3-super-120b-a12b:free",
        overrides: { temperature: 0.7 },
      },
      {
        agentId: "world_resolver",
        backendId: "backend_openrouter",
        model: "nvidia/nemotron-3-super-120b-a12b:free",
        overrides: { temperature: 0.2 },
      },
      {
        agentId: "time_skip",
        backendId: "backend_openrouter",
        model: "nvidia/nemotron-3-super-120b-a12b:free",
        overrides: { temperature: 0.3 },
      },
      {
        agentId: "admin_patch",
        backendId: "backend_openrouter",
        model: "nvidia/nemotron-3-super-120b-a12b:free",
        overrides: { temperature: 0.1 },
      },
      {
        agentId: "narrator",
        backendId: "backend_openrouter",
        model: "nvidia/nemotron-3-super-120b-a12b:free",
        overrides: { temperature: 0.8 },
      },
    ],
  },
  {
    id: "group_fast",
    name: "Fast (快速低成本)",
    description: "兼顾速度与体验的组合",
    updatedAt: "2026-09-11",
    bindings: [
      {
        agentId: "input_compiler",
        backendId: "backend_openrouter",
        model: "deepseek/deepseek-v4.1-flash",
        overrides: { reasoningEffort: "none" },
      },
      {
        agentId: "perception",
        backendId: "backend_openrouter",
        model: "deepseek/deepseek-v4.1-flash",
        overrides: { reasoningEffort: "none" },
      },
      {
        agentId: "npc_reaction",
        backendId: "backend_openrouter",
        model: "deepseek/deepseek-v4.1-flash",
        overrides: { reasoningEffort: "none" },
      },
      {
        agentId: "world_resolver",
        backendId: "backend_openrouter",
        model: "deepseek/deepseek-v4.1-flash",
        overrides: { reasoningEffort: "none" },
      },
      {
        agentId: "time_skip",
        backendId: "backend_openrouter",
        model: "deepseek/deepseek-v4.1-flash",
        overrides: { reasoningEffort: "none" },
      },
      {
        agentId: "admin_patch",
        backendId: "backend_openrouter",
        model: "deepseek/deepseek-v4.1-flash",
        overrides: { reasoningEffort: "none" },
      },
      {
        agentId: "narrator",
        backendId: "backend_openrouter",
        model: "deepseek/deepseek-v4.1-flash",
        overrides: { reasoningEffort: "none" },
      },
    ],
  },
  {
    id: "group_local",
    name: "Local (本地离线模型)",
    description: "完全使用本地 NInfer/Ollama 推理，无外部网络依赖",
    updatedAt: "2026-09-11",
    bindings: [
      {
        agentId: "input_compiler",
        backendId: "backend_local",
        model: "qwen2.5:7b",
      },
      {
        agentId: "perception",
        backendId: "backend_local",
        model: "qwen2.5:7b",
      },
      {
        agentId: "npc_reaction",
        backendId: "backend_local",
        model: "qwen2.5:7b",
      },
      {
        agentId: "world_resolver",
        backendId: "backend_local",
        model: "qwen2.5:7b",
      },
      {
        agentId: "time_skip",
        backendId: "backend_local",
        model: "qwen2.5:7b",
      },
      {
        agentId: "admin_patch",
        backendId: "backend_local",
        model: "qwen2.5:7b",
      },
      {
        agentId: "narrator",
        backendId: "backend_local",
        model: "qwen2.5:7b",
      },
    ],
  },
];

export const INITIAL_DEMO_SAVE: GameSave = {
  worldDefinition: HARBOR_WORLD_DEFINITION,
  id: "save_harbor_tavern",
  name: "王城的黄昏 · 港口酒馆",
  createdAt: "2026-09-11T19:30:00.000Z",
  updatedAt: "2026-09-11T19:30:00.000Z",
  worldState: INITIAL_HARBOR_TAVERN_WORLD,
  activeAgentGroupId: "group_quality",
  turns: [
    {
      id: "turn_demo_0",
      turnIndex: 0,
      timestamp: "2026-09-11T19:30:00.000Z",
      playerInput: "(游戏开始)",
      narratorOutput:
        "清晨的阳光斜穿过薄雾，照亮了码头石板街上斑驳的水洼。海风卷着咸腥的潮气与酒馆后厨飘出的烤面包香味扑面而来。艾琳正倚在酒馆外的木栏旁，神色警惕地低头清点着行囊；十步之外，手持长矛的港口卫兵正用锐利的目光审视着每一个经过的旅人。你刚刚抵达这里，属于你的故事由此开始。",
      traceId: "trace_demo_init",
      worldStateBefore: INITIAL_HARBOR_TAVERN_WORLD,
      worldStateAfter: INITIAL_HARBOR_TAVERN_WORLD,
      patches: [],
      activeAgentGroupId: "group_quality",
    },
  ],
};

BUILTIN_AGENTS.push(CHARACTER_GENERATOR);
BUILTIN_AGENTS.push(ACTION_ADJUDICATOR, NARRATION_AUDITOR, CHARACTER_CHANGE_AUDITOR);
for (const group of DEFAULT_AGENT_GROUPS) {
  for (const [id, sourceId] of [['action_adjudicator','world_resolver'], ['narration_auditor','narrator'], ['character_change_auditor','world_resolver']]) {
    const inherited = group.bindings.find(b => b.agentId === sourceId);
    if (inherited) group.bindings.push({ ...structuredClone(inherited), agentId: id });
  }
  const source = group.bindings.find(binding => binding.agentId === 'admin_patch');
  if (source) group.bindings.push({ agentId: 'character_generator', backendId: source.backendId, model: source.model, overrides: { reasoningEffort: source.overrides?.reasoningEffort ?? 'none' } });
}

for (let i = 0; i < BUILTIN_AGENTS.length; i++) BUILTIN_AGENTS[i] = withConversationContract(BUILTIN_AGENTS[i]);
BUILTIN_AGENTS.push(...TEXT_AGENTS);
for (const group of DEFAULT_AGENT_GROUPS) group.bindings = addTextBindings(group).bindings;
