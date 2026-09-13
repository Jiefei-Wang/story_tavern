import type { AgentDefinition, AgentGroup, Backend } from '../types';
import { ROUTED_AGENTS } from '../engine/text/Agents';
import { REFUSAL_DETECTOR } from '../engine/evaluation/RefusalDetector';

/** Repository-owned defaults used by both desktop and browser initialization. */
export const BUILTIN_AGENTS: AgentDefinition[] = [...ROUTED_AGENTS, REFUSAL_DETECTOR];
export const RETIRED_AGENT_IDS = new Set([
  'input_compiler', 'perception', 'npc_reaction', 'world_resolver', 'time_skip',
  'admin_patch', 'narrator', 'character_generator', 'action_adjudicator',
  'narration_auditor', 'character_change_auditor',
  'text_organizer', 'text_character', 'text_narrator', 'text_editor',
]);

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
  { id: 'group_fast', name: 'Fast (快速低成本)', description: '当前故事流程与独立模型安全拒绝检测', bindings: BUILTIN_AGENTS.map(a => ({ agentId:a.id, backendId:'backend_openrouter', model:'deepseek/deepseek-v4.1-flash', overrides:{reasoningEffort:'none'} })) },
  { id: 'group_quality', name: 'Quality (高质量模型组合)', description: '当前故事流程与独立模型安全拒绝检测', bindings: BUILTIN_AGENTS.map(a => ({ agentId:a.id, backendId:'backend_openrouter', model:'nvidia/nemotron-3-super-120b-a12b:free' })) },
  { id: 'group_local', name: 'Local (本地离线模型)', description: '本地推理的当前故事流程与独立模型安全拒绝检测', bindings: BUILTIN_AGENTS.map(a => ({ agentId:a.id, backendId:'backend_local', model:'qwen2.5:7b' })) },
];
