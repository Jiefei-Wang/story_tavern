import { AgentDefinition } from "../../types";
import { NARRATOR_SCHEMA } from "../narration/NarratorComposition";
import { NARRATION_FACT_PRIORITY_POLICY } from "../narration/NarrationGroundingPolicy";

/** Apply the protocol to saved/custom built-ins too, without overwriting user settings. */
export function withConversationContract(agent: AgentDefinition): AgentDefinition {
  if (agent.version?.endsWith("+conversation-v1") && !["narrator", "npc_reaction", "input_compiler"].includes(agent.id)) return agent;
  const policies: Record<string, string> = {
    input_compiler: "Speech target 优先级：用户明确指定的对象 > conversation.focusNpcId > 空字符串。明确转头问卫兵时使用 guard，不得继续使用 focus。明确指定但缺席或没有实体的称呼保留为target，不得换成focus或创建NPC；目标不在场会由世界处理为无人回应。群体提问 target=all。只生成玩家事件。",
    npc_reaction: "听见不等于被询问。interaction.addressed 表示玩家面向你；interaction.maySpeak=false 时禁止任何 speech intent，但允许 thought、stateUpdates、非语言 action 或完全不反应。speech intent 只描述角色想表达的语义计划，不要写成最终台词：必须使用 speechPlan.summary/beats/goal/stance/tone/verbosity/boundaries。recentExperiences 是你先前实际经历的上下文，不是本轮新事件。每条 stateUpdates 必须用 sourceEventIds 引用本轮 observations 中实际可见的 eventId，不能把历史再当新原因重复计分。属性的含义与变化依据当前世界 Schema，不自行假设某项关系字段必然存在。",
    world_resolver: "每个 NPC intent 必须明确 accepted 或 rejected；不得静默吞掉。accepted action/speech 必须在 publicEvents 中引用 sourceIntentId。accepted speech 只能携带并原样保留该 intent 的 speechPlan、actor、target，不得生成或改写 content。Narrator 会负责语言实现。旁观者没有 intents 时仍应处理合理 stateUpdates。conversation 是程序管理状态，不得修改。",
    admin_patch: "conversation 是程序管理状态，不得修改。新增 NPC 不代表该 NPC 已经说话。",
    time_skip: "conversation 是程序管理状态，不得修改。",
  };
  if (agent.id === "narrator") return {
    ...agent, version: `${(agent.version || "v1").replace(/(?:\+conversation-v1)+$/, "")}+conversation-v1`, outputSchema: NARRATOR_SCHEMA,
    inputs: [
      { name: "playerInput", type: "string", required: true },
      { name: "committedEvents", type: "CommittedTurnEvent[]", required: true },
      { name: "publicPatches", type: "Patch[]", required: false },
      { name: "scene", type: "SceneContext", required: false },
      { name: "entities", type: "PublicEntities", required: false },
      { name: "rules", type: "Rules", required: false },
    ],
    messages: [
      { id: "composition_system", role: "system", content: `你是小说表现层，而不是世界规则层。输出 JSON {segments:[...]}，每段只能是 prose 或 speech。accepted NPC speech event 中的 speechPlan 是角色已经决定要表达的真实语义意图；你必须把它写成自然、符合人物身份和当前场景的对白。你可以改变用词、句式、停顿、语气、修辞、长度、分段、信息顺序，并允许 prose→speech→prose→speech。只可描写已知公开环境和已被授权事件的表现方式，不能凭“低后果”自行添加人物动作、表情所暗示的确定情绪、物品使用或新世界事实。
玩家原输入只是请求，不是已发生事实。committedEvents 中 outcome.status=failed 表示尝试确实失败，不能写成动作完成；source 是原尝试而不是成功证据。outcome.status=success 的裁决与公开状态变化才支持实际结果；缺少结果的行动只能描述为尝试，不推断成功。关键结果句的 prose 使用 sourceEventIds 引用对应已裁决事件，失败也可引用但必须保持失败语义。口头承诺、提出给予、询问或邀请，不等于已经交接物品、消耗资源或完成动作。对白中的主张不自动变成旁白确认的客观事实。
你不能改变说话者、对象、核心事实、确定程度、关键立场、required 信息、boundaries、角色知道与不知道的边界，也不能新增动作、人物、地点、任务、承诺、秘密或对白。若角色撒谎，忠实写出其谎言；不得用 narrator prose 泄漏客观真相。brief 不要扩写成演讲，extended 可以写成长对白。speech 必须带 {sourceIntentId: accepted speech event 的 sourceIntentId, text:自然对白}；同一 sourceIntentId 可出现多次。prose 只能是表现层叙事，不得成为未授权对白或新事件。所有已接受且未失败的 NPC speech 至少实现一次。` },
      { id: "composition_user", role: "user", content: "公开场景：{{json scene}}\n公开实体：{{json entities}}\n权威公开事件与裁决（以 outcome 区分成功与失败；source 只是原尝试，speechPlan 是对白语义权威）：\n{{json committedEvents}}\n公开世界变化：\n{{json publicPatches}}\n请生成自然小说段落的结构化 JSON：" },
      { id: "composition_fact_priority", role: "system", content: NARRATION_FACT_PRIORITY_POLICY },
    ],
  };
  if (!policies[agent.id]) return agent;
  if (agent.id === 'input_compiler') policies.input_compiler += '\n动作涉及物品与目的地两个对象时，item是实际操作的物品ID，target是目标或目的地；例如把已有杯子放在桌面，使用item=cup、target=table。只使用事件Schema列出的字段，不自造object、objectId等物品别名；不得把玩家声称的新物品当已有实体。\n用户动作中明确面向某个在场NPC听其讲解、回答或继续发言，也是在请求该NPC回应，不能因没有引号对白而丢掉。必须保留为独立action：op=listen_to、target=该现有NPC的精确ID、content=用户原文中的听取请求，并附responseRequest:{target:同一NPC ID,sourceText:逐字来自原输入的当前听取请求片段}。它不是玩家已经说出的话，不得编造speech或NPC已经讲过。只匹配当前在场的指定人物；不能用all/group，不为缺席者创建人物。仅听环境声、旁听别人对话、偷听、历史回忆、引用、假设、否定或将来打算不附responseRequest。为真正的回应请求保留后续wait回应窗口。';
  if (agent.id === 'npc_reaction') policies.npc_reaction += '\ninteraction.addressed也可来自玩家明确面向你听取讲解的listen_to动作，不要求玩家先说出一句对白。若观察含该成功动作且maySpeak=true，应针对其content表达的当前讲解/回答请求决定回应；不能以玩家没有说话为由忽略请求。它不证明你先前已经讲过，也不授权其他旁观者讲话。';
  const outputSchema = structuredClone(agent.outputSchema);
  if (agent.id === 'input_compiler') {
    const eventSchema = (outputSchema as any)?.properties?.blocks?.items?.properties?.events?.items;
    if (eventSchema?.properties) {
      eventSchema.additionalProperties = false;
      eventSchema.properties.item = { type: 'string', minLength: 1 };
      eventSchema.properties.details = { type: 'object' };
      eventSchema.properties.audibility = { enum: ['normal', 'whisper'] };
      eventSchema.properties.audience = { type: 'array', items: { type: 'string' } };
      eventSchema.properties.responseRequest = { type: 'object', additionalProperties: false, properties: { target: { type: 'string', minLength: 1 }, sourceText: { type: 'string', minLength: 1 } }, required: ['target', 'sourceText'] };
    }
  }
  const extra = agent.id === "input_compiler"
    ? [{ name: "conversation", type: "ConversationState", required: false }, { name: "entities", type: "PublicEntities", required: false }]
    : agent.id === "npc_reaction" ? [{ name: "interaction", type: "InteractionContext", required: true }, { name: "recentExperiences", type: "array", required: false }, { name: "scene", type: "SceneContext", required: false }, { name: "visibleObjects", type: "object", required: false }] : [];
  return {
    ...agent, version: `${(agent.version || "v1").replace(/(?:\+conversation-v1)+$/, "")}+conversation-v1`,
    outputSchema,
    inputs: [...agent.inputs, ...extra.filter(e => !agent.inputs.some(i => i.name === e.name))],
    messages: [...agent.messages.filter(message => !["conversation_policy", "conversation_context"].includes(message.id)),
      { id: "conversation_policy", role: "system", content: policies[agent.id] },
      ...(extra.length ? [{ id: "conversation_context", role: "user" as const,
        content: extra.map(e => `${e.name}: {{json ${e.name}}}`).join("\n") }] : []),
    ],
  };
}
