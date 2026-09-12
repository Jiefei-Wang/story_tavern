import { AgentDefinition } from "../../types";
import { NARRATION_TEXTS, NARRATOR_SCHEMA } from "../narration/NarratorComposition";

/** Apply the protocol to saved/custom built-ins too, without overwriting user settings. */
export function withConversationContract(agent: AgentDefinition): AgentDefinition {
  if (agent.version?.endsWith("+conversation-v1")) return agent;
  const policies: Record<string, string> = {
    input_compiler: "Speech target 优先级：明确指定的有效人物 ID > conversation.focusNpcId > 空字符串。明确转头问卫兵时使用 guard，不得继续使用 focus。禁止猜测不存在的 NPC。群体提问 target=all。只生成玩家事件。",
    npc_reaction: "听见不等于被询问。interaction.addressed 表示玩家面向你；interaction.maySpeak=false 时禁止任何 speech intent，但允许 thought、mentalUpdates、非语言 action 或完全不反应。",
    world_resolver: "每个 speech publicEvent 必须引用本次 npcReactions 中真实 speech intent 的 sourceIntentId，actor 必须为该 NPC，content 与 target 必须原样保留。不得创造对白。旁观者没有 intents 时仍应处理合理 mentalUpdates。conversation 是程序管理状态，不得修改。",
    admin_patch: "conversation 是程序管理状态，不得修改。新增 NPC 不代表该 NPC 已经说话。",
    time_skip: "conversation 是程序管理状态，不得修改。",
  };
  if (agent.id === "narrator") return {
    ...agent, version: `${agent.version || "v1"}+conversation-v1`, outputSchema: NARRATOR_SCHEMA,
    inputs: [
      { name: "committedEvents", type: "CommittedTurnEvent[]", required: true },
      { name: "publicPatches", type: "Patch[]", required: false },
      { name: "scene", type: "SceneContext", required: false },
    ],
    messages: [
      { id: "composition_system", role: "system", content: `输出 JSON {segments: [...]}。只能组合已 committed 的公开事实。对白只可通过 {type:event_ref,eventId:真实事件ID} 引用，不得改写或发明。narration 禁止引号、人物说道/问道/回答及任何直接对白。为程序保证事实边界，{type:narration,text:...} 的 text 只能选自 ${JSON.stringify(NARRATION_TEXTS)}。不必添加连接句。不得重复事件。` },
      { id: "composition_user", role: "user", content: "已提交公开事件：\n{{json committedEvents}}\n请按时间顺序组合 event_ref。" },
    ],
  };
  if (!policies[agent.id]) return agent;
  const extra = agent.id === "input_compiler"
    ? [{ name: "conversation", type: "ConversationState", required: false }, { name: "entities", type: "PublicEntities", required: false }]
    : agent.id === "npc_reaction" ? [{ name: "interaction", type: "InteractionContext", required: true }] : [];
  return {
    ...agent, version: `${agent.version || "v1"}+conversation-v1`,
    inputs: [...agent.inputs, ...extra.filter(e => !agent.inputs.some(i => i.name === e.name))],
    messages: [...agent.messages,
      { id: "conversation_policy", role: "system", content: policies[agent.id] },
      ...(extra.length ? [{ id: "conversation_context", role: "user" as const,
        content: extra.map(e => `${e.name}: {{json ${e.name}}}`).join("\n") }] : []),
    ],
  };
}
