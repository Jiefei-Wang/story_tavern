import { z } from 'zod';
import type { AgentDefinition, AgentGroup } from '../types';
import { assistantAgentSchema, assistantGroupSchema } from '../engine/agentConfigurationSchema';
import { validateAgentPrompt } from '../engine/template/AgentPrompt';
import { DEFAULT_BACKENDS, RETIRED_AGENT_IDS } from './initialData';

export const repositorySchema = z.object({
  agents: z.record(z.string(), assistantAgentSchema),
  groups: z.record(z.string(), assistantGroupSchema),
}).passthrough();
export interface RepositoryConfiguration {
  agents: Record<string, AgentDefinition>;
  groups: Record<string, AgentGroup>;
  [key: string]: unknown;
}
export interface RepositoryRecord { data: RepositoryConfiguration; revision: string }

export function validateRepositoryConfiguration(value: unknown): asserts value is RepositoryConfiguration {
  repositorySchema.parse(value); // Keep the original data, including future fields.
  const data = value as RepositoryConfiguration;
  const inspect = (value: unknown) => {
    if (!value || typeof value !== 'object') return;
    for (const [key, child] of Object.entries(value)) {
      if (['__proto__', 'prototype', 'constructor'].includes(key)) throw new Error('不安全的配置键');
      if (/^(secretRef|api[_-]?key|authorization|customHeaders|credentials|access[_-]?token)$/i.test(key)) throw new Error('仓库配置不能包含凭证或认证头');
      inspect(child);
    }
  };
  inspect(data);
  for (const [id, agent] of Object.entries(data.agents)) {
    if (RETIRED_AGENT_IDS.has(id)) throw new Error(`Agent 已退役：${id}`);
    if (agent.id !== id) throw new Error('Agent ID 与集合键不一致');
    validateAgentPrompt(agent);
  }
  // These IDs are addressed by the runtime and initialization migration.
  for (const id of ['text_router', 'text_character_designer', 'text_outline_designer', 'text_storyteller', 'model_refusal_detector']) {
    if (!data.agents[id]) throw new Error(`必须保留内置 Agent：${id}`);
  }
  for (const id of ['group_fast', 'group_quality', 'group_local']) {
    if (!data.groups[id]) throw new Error(`必须保留默认组：${id}`);
  }
  for (const [id, group] of Object.entries(data.groups)) {
    if (id === 'group_unit_test') throw new Error('group_unit_test 已退役，请使用其他 ID');
    if (group.id !== id) throw new Error('组 ID 与集合键不一致');
    const seen = new Set<string>();
    for (const binding of group.bindings) {
      if (!data.agents[binding.agentId]) throw new Error(`Agent 引用不存在：${binding.agentId}`);
      if (!DEFAULT_BACKENDS.some(b => b.id === binding.backendId)) throw new Error(`仓库组只能引用默认 Backend：${binding.backendId}`);
      if (seen.has(binding.agentId)) throw new Error(`重复绑定：${binding.agentId}`);
      seen.add(binding.agentId);
    }
  }
}
