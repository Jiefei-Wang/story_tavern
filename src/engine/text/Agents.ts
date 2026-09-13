import repositoryDefaults from '../../db/repositoryDefaults.json';
import type { AgentDefinition, AgentGroup } from '../../types';

export const ROUTED_AGENTS: AgentDefinition[] = Object.values(repositoryDefaults.agents).filter(a => a.id.startsWith('text_')) as AgentDefinition[];
// Compatibility export for older configuration importers; no retired agent definitions are restored.
export const TEXT_AGENTS = ROUTED_AGENTS;

/** Explicit binding migration only. Model execution always uses the selected workflow. */
export function addTextBindings(group: AgentGroup): AgentGroup {
  const sources: Record<string, string[]> = {
    text_router: ['text_organizer', 'input_compiler'],
    text_character_designer: ['text_designer', 'text_character', 'npc_reaction'],
    text_outline_designer: ['text_designer', 'text_character', 'npc_reaction'],
    text_storyteller: ['text_narrator', 'narrator'],
  };
  const bindings = [...group.bindings];
  for (const agent of ROUTED_AGENTS) {
    if (bindings.some(b => b.agentId === agent.id)) continue;
    const source = sources[agent.id]?.map(id => bindings.find(b => b.agentId === id)).find(Boolean);
    if (source) bindings.push({ ...structuredClone(source), agentId: agent.id });
  }
  return { ...group, bindings };
}
