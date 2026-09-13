import repositoryDefaults from '../../db/repositoryDefaults.json';
import type { AgentDefinition, AgentGroup } from '../../types';
const definition = (id: string, name: string, prompt: string): AgentDefinition => ({ id, name, version: 'text-first-v1', description: '文本优先流程；保留短提示词，自然文本输出。', messages: [{ id: `${id}_system`, role: 'system', content: prompt }, { id: `${id}_task`, role: 'user', content: '{{task}}\n\n{{json material}}' }], inputs: [{ name: 'task', type: 'string', required: true }, { name: 'material', type: 'object', required: true }], outputSchema: null, defaults: { temperature: 0.7, maxTokens: 3000 } });
export const TEXT_AGENTS: AgentDefinition[] = [
    definition('text_organizer', 'Organizer · 信息组织', '整理输入、时序与实际感知。已陈述的自身行动默认发生，意愿和尝试不等于成功；发言不等于事实。只安排已有授权 ID，不裁决物品资格、不决定人物心理。感知只描述实际获得的内容；不认识的物品用外观描述。按本次任务要求返回小型 JSON。'),
    definition('text_character', '人物 · 自然回应', '扮演此人物，只依据自己的设定、经历、已知常识和本轮感知。保持个人知识与表达特点。完成当前轮次的简短认知摘要、言语概要或动作概要；可沉默、犹疑、误解或不行动。输出自然文本，不提供隐藏推理链，不文学化。'),
    definition('text_narrator', 'Narrator · 故事正文', '把给定时间线和人物言行写成连贯自然故事。保持不确定性、人物意图和知识边界，允许自由措辞与氛围，不新增承诺、线索、物品转移、身份确认或持久后果。不揭示未提供的秘密。只输出正文。'),
    definition('text_editor', '文本编辑 · 受限工具', '通过 document_command 工具在本次授权范围内读文档并精确替换。普通记录只记已发生变化，不改规则、人物设定，不把发言和猜测写成客观事实。先 read 后 replace，old_text 唯一匹配。失败后依据真实工具结果处理，不能声称修改成功。完成后调用 done。'),
];
// Separate IDs preserve customized v1 definitions and model bindings as archives.
// Legacy behavior text is projected into an editable full Prompt by getAgentPrompt.
export const ROUTED_AGENTS: AgentDefinition[] = Object.values(repositoryDefaults.agents).filter(a => a.id.startsWith('text_')) as AgentDefinition[];
TEXT_AGENTS.push(...ROUTED_AGENTS);

export function addTextBindings(group: AgentGroup): AgentGroup {
    const sources: Record<string, string[]> = { text_organizer: ['input_compiler'], text_character: ['npc_reaction'], text_narrator: ['narrator'], text_editor: ['admin_patch'], text_router: ['text_organizer', 'input_compiler'], text_designer: ['text_character', 'npc_reaction'], text_character_designer: ['text_designer', 'text_character', 'npc_reaction'], text_outline_designer: ['text_designer', 'text_character', 'npc_reaction'], text_storyteller: ['text_narrator', 'narrator'] };
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
