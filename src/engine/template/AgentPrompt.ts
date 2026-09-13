import type { AgentDefinition } from '../../types';
import { inspectPlaceholders, renderTemplate } from './PlaceholderEngine';

export const STORY_AGENT_IDS = ['text_router', 'text_character_designer', 'text_outline_designer', 'text_storyteller', 'text_designer'];
export const isStoryAgent = (id: string) => STORY_AGENT_IDS.includes(id);

export const STORY_PROMPT_DATA = `世界定义：
{{world}}

配角定义：
{{characters}}

玩家定义（自主言行由玩家决定）：
{{player}}

故事历史（仅供参考，不重新执行历史请求）：
{{history}}

用户原始输入：
{{input}}

命令路由指示：
{{routingInstructions}}

本次任务与输出要求：
{{task}}

本轮材料：
{{material}}

格式重试反馈（为空时忽略）：
{{retry}}`;

/** Old records are projected without dropping archived messages or unknown fields. */
export function getAgentPrompt(agent: AgentDefinition): string {
  if (agent.prompt !== undefined) return agent.prompt;
  const messages = isStoryAgent(agent.id) ? agent.messages.filter(m => m.role === 'system') : agent.messages;
  return messages.map(m => m.content).join('\n\n') + (isStoryAgent(agent.id) ? '\n\n' + STORY_PROMPT_DATA : agent.id === 'model_refusal_detector' ? '\n\n{{retry}}' : '');
}

export const STORY_TASKS: Record<string, string> = {
  "text_router": "选择需要回应或调整状态的人物，并尽可能准确理解本次用户原始输入，不重放历史请求。非场景纠正也通过人物选择和指示处理，不默认回滚或把纠正当对白；不需要人物反应时 characters=[]。只解释需求和安排角色，不安排剧情方向或节奏。不涉及人物交互时 characters=[] 直接交 Narrator。只有确实需要且现有人物不能承担时才请求新人物，最多四位。用户明确要求重新生成一个或多个人物卡/设定时使用 regenerate_characters（包括玩家）；仅重做反应不重生卡片。返回 {\"characters\":[\"已有NPC ID\"],\"new_characters\":[{\"request_id\":\"new_1\",\"description\":\"人物需求\"}],\"regenerate_characters\":[{\"character_id\":\"已有ID\",\"description\":\"用户要求重做的设定\"}],\"instructions\":\"仅解释需求的指引\"}。",
  "text_character_designer": "创建或重新生成人物卡片。character_id=null 是新人物；有 character_id 时只按需求重做该人物，保留未要求修改的设定和重要经历，不更换身份。返回 {\"cards\":[{\"request_id\":\"路由需求ID\",\"name\":\"称呼\",\"public\":\"公开资料\",\"profile\":\"完整人物设定\",\"initial_state\":{\"summary\":\"初始状态与个人经历\"}}]}。",
  "text_outline_designer": "一次设计全部选中人物的交互与剧情方向。thought 是简短人物内心意图；expression_outline 是表达概要而非完整对白，表情写在 action；end_state 只能记录设计中确定发生的言行结果。根据原始输入和路由指示共同协调本轮表达、动作和完毕状态；状态应保留仍有效的重要信息，人物卡片当前设定优先于冲突的旧状态。无表达/动作使用 null，仍须返回 end_state。仅选中人物可以更新。状态内不要抄写时间点，程序会关联来源。返回 {\"characters\":[{\"character_id\":\"ID\",\"thought\":null,\"expression_outline\":null,\"action\":null,\"end_state\":{\"summary\":\"本轮结束后的完整状态与重要经历\"}}]}。",
  "text_storyteller": "结合消息记录、原始输入和路由指示写本轮故事。将非空表达概要展开为完整对白，整合具体动作；不能改变意图或新增决定、承诺、持久后果；纠正也遵循指示，不能擅自当成对白。不要输出时间点或后台 JSON。"
};

export const STORY_VARIABLES = {
  world: '本局世界描述', characters: '配角定义列表', player: '玩家定义', history: '带时间锚点的历史消息列表',
  input: '本轮用户原始输入', task: '本阶段任务及输出协议', material: '本阶段材料，可通过点路径选择字段',
  routingInstructions: 'Router 对当前输入的解释；Router 阶段为空', retry: '格式校验失败反馈；首次请求为空',
};

export function validateAgentPrompt(agent: AgentDefinition): void {
  const prompt = getAgentPrompt(agent);
  if (!prompt.trim()) throw new Error('Prompt 不能为空');
  const matches = inspectPlaceholders(prompt, {});
  const tokens = prompt.match(/\{\{[\s\S]*?\}\}/g) || [];
  if (tokens.some(token => !matches.some(match => match.raw === token)) || prompt.replace(/\{\{[\s\S]*?\}\}/g, '').includes('{{'))
    throw new Error('变量格式无效，请使用 {{name}}、{{json name}} 或点路径');
  for (const match of matches) {
    const parts = match.path.split('.');
    if (parts.some(p => ['__proto__', 'prototype', 'constructor'].includes(p))) throw new Error(`不安全的变量：${match.path}`);
    if (isStoryAgent(agent.id) && !Object.prototype.hasOwnProperty.call(STORY_VARIABLES, parts[0])) throw new Error(`当前 Agent 不提供变量：${match.path}`);
    if (agent.id === 'model_refusal_detector' && !['responseText', 'retry'].includes(parts[0])) throw new Error('检测器仅提供 responseText 和 retry 变量');
  }
}

/** One pass only: braces inside injected user data remain data, never templates. */
export function renderAgentPrompt(agent: AgentDefinition, context: Record<string, unknown>): string {
  validateAgentPrompt(agent);
  context = { retry: '', ...context };
  const prompt = getAgentPrompt(agent);
  const missing = inspectPlaceholders(prompt, context).filter(m => {
    let value: any = context;
    for (const key of m.path.split('.')) {
      if (value === null || typeof value !== 'object' || !Object.prototype.hasOwnProperty.call(value, key)) return true;
      value = value[key];
    }
    return value === undefined;
  }).map(m => m.path);
  if (missing.length) throw new Error(`缺少 Prompt 变量：${[...new Set(missing)].join('、')}`);
  return renderTemplate(prompt, context);
}

export function samplePromptContext(agent: AgentDefinition): Record<string, unknown> {
  if (agent.id === 'model_refusal_detector') return { responseText: '艾琳向你问好。', retry: '' };
  if (!isStoryAgent(agent.id)) return { input: '你好' };
  const card = { character_id: 'erin', public: '艾琳，港口旅人。', profile: '准备乘船离开。', initial_memory: '刚来到酒馆。', state_history: [] };
  const material = agent.id === 'text_router' ? { player_id: 'player', cards: [card] }
    : agent.id === 'text_character_designer' ? { requests: [{ request_id: 'new_1', character_id: null, description: '一位船长' }], existing_cards: [card] }
    : agent.id === 'text_storyteller' ? { performances: [{ character_id: 'erin', public: card.public, expression_outline: '问候玩家', action: null }], updated_cards: [] }
    : { cards: [card] };
  return { world: '清晨的港口酒馆。', characters: [{ id: 'erin', name: '艾琳', definition: card.profile, initialMemory: card.initial_memory }],
    player: { id: 'player', name: '旅人', definition: '途经港口。', initialMemory: '' },
    history: [{ role: 'assistant', content: '你走进酒馆。\n\n【时间点 1】' }], input: '你好',
    task: STORY_TASKS[agent.id] || STORY_TASKS.text_outline_designer, material, routingInstructions: '', retry: '' };
}
