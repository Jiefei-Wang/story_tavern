import type { AgentDefinition, AgentGroup } from '../../types';
const definition = (id: string, name: string, prompt: string): AgentDefinition => ({ id, name, version: 'text-first-v1', description: '文本优先流程；保留短提示词，自然文本输出。', messages: [{ id: `${id}_system`, role: 'system', content: prompt }, { id: `${id}_task`, role: 'user', content: '{{task}}\n\n{{json material}}' }], inputs: [{ name: 'task', type: 'string', required: true }, { name: 'material', type: 'object', required: true }], outputSchema: null, defaults: { temperature: 0.7, maxTokens: 3000 } });
export const TEXT_AGENTS: AgentDefinition[] = [
    definition('text_organizer', 'Organizer · 信息组织', '整理输入、时序与实际感知。已陈述的自身行动默认发生，意愿和尝试不等于成功；发言不等于事实。只安排已有授权 ID，不裁决物品资格、不决定人物心理。感知只描述实际获得的内容；不认识的物品用外观描述。按本次任务要求返回小型 JSON。'),
    definition('text_character', '人物 · 自然回应', '扮演此人物，只依据自己的设定、经历、已知常识和本轮感知。保持个人知识与表达特点。完成当前轮次的简短认知摘要、言语概要或动作概要；可沉默、犹疑、误解或不行动。输出自然文本，不提供隐藏推理链，不文学化。'),
    definition('text_narrator', 'Narrator · 故事正文', '把给定时间线和人物言行写成连贯自然故事。保持不确定性、人物意图和知识边界，允许自由措辞与氛围，不新增承诺、线索、物品转移、身份确认或持久后果。不揭示未提供的秘密。只输出正文。'),
    definition('text_editor', '文本编辑 · 受限工具', '通过 document_command 工具在本次授权范围内读文档并精确替换。普通记录只记已发生变化，不改规则、人物设定，不把发言和猜测写成客观事实。先 read 后 replace，old_text 唯一匹配。失败后依据真实工具结果处理，不能声称修改成功。完成后调用 done。'),
];
// Separate IDs preserve customized v1 definitions and model bindings as archives.
// Fixed system messages precede history; changing per-turn material is appended last.
export const ROUTED_AGENTS: AgentDefinition[] = [
    definition('text_router', '命令路由 · 人物选择', '尽可能准确理解最后一条消息中明确标注的用户原始输入；历史请求只供参考，不要重新执行历史请求。结合故事记录区分对白、行动、纠正、场景调整和呈现要求。用户否定的物件不在记录中、无法判断所指时，指示 Narrator 简短澄清，人物可选空；不要无视纠正继续旧剧情。不能仅因为名单里只有一位女性，就把路上未指名女孩认定为她。只选择本轮需要回应或调整状态的人物；需要新人物时提出创建需求。给 Designer 和 Narrator 清楚的处理指示，不能把对故事的纠正当角色对白。不要替人物设计反应或直接写故事。时间点是程序添加的历史索引，不是故事内容，不生成新时间点。按任务返回小型 JSON。'),
    definition('text_designer', 'Designer · 人物设计', '依据用户输入、命令路由指示、人物卡片和带时间点的历史状态，一次共同设计选中人物本轮的表达、动作和完毕状态。时间点表示状态来源，不表示人物知道该时间点的全部故事；保持各人物知识边界。协调互相回应，不生成多轮草稿或工具调用。expression 是要表达或说出的具体内容，不是面部表情；表情和肢体动作归 action。不行动、不表达可用 null。end_state 必须与实际给出的 expression/action 一致，不能记入未输出的发言、承诺或离场。完毕状态保留仍有效的重要经历与状态，纠正需求按路由指示处理。创建任务只创建人物卡片。只返回当前任务要求的 JSON；不生成时间点。'),
    definition('text_storyteller', 'Narrator · 故事整合', '依据用户原始输入、命令路由指示、故事消息记录和 Designer 已确定的表达与动作，写出本轮连贯正文。遵循路由对用户需求的解释，不把纠正或呈现要求写成角色对白。只处理本次用户输入，不重放历史请求。人物表达与动作不能擅自改变；不为未参与人物添加回应，不新增对白、约定或离场结果。可补充合理环境与描写，不擅自替玩家作决定，不泄露未公开的私人状态。时间点仅用于定位历史，不在正文中输出或解释它。只返回故事正文。'),
].map(agent => ({ ...agent, version: 'routed-v2', description: '命令路由 → Designer → Narrator；固定提示词后追加带锚点历史和本轮材料。', messages: [agent.messages[0]], inputs: [] }));
TEXT_AGENTS.push(...ROUTED_AGENTS);

export function addTextBindings(group: AgentGroup): AgentGroup {
    const sources: Record<string, string[]> = { text_organizer: ['input_compiler'], text_character: ['npc_reaction'], text_narrator: ['narrator'], text_editor: ['admin_patch'], text_router: ['text_organizer', 'input_compiler'], text_designer: ['text_character', 'npc_reaction'], text_storyteller: ['text_narrator', 'narrator'] };
    const bindings = [...group.bindings];
    for (const agent of TEXT_AGENTS) {
        if (bindings.some(b => b.agentId === agent.id))
            continue;
        const source = sources[agent.id]?.map(id => bindings.find(b => b.agentId === id)).find(Boolean);
        if (source)
            bindings.push({ ...structuredClone(source), agentId: agent.id });
    }
    return { ...group, bindings };
}
