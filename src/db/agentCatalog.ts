import { BUILTIN_AGENTS, DEFAULT_AGENT_GROUPS, RETIRED_AGENT_IDS } from './initialData';
import type { StorageService } from './storage';

type CatalogStorage = Pick<StorageService, 'getAgents' | 'saveAgent' | 'deleteAgent' | 'getAgentGroups' | 'saveAgentGroup' | 'deleteAgentGroup' | 'getSaves' | 'saveGame'>;

/** Remove retired configuration, never restore legacy prompts or inherit legacy bindings. */
export async function reconcileAgentCatalog(storage: CatalogStorage) {
  const agents = await storage.getAgents();
  for (const agent of BUILTIN_AGENTS) {
    if (!agents.some(a => a.id === agent.id)) await storage.saveAgent(structuredClone(agent));
  }
  const groups = await storage.getAgentGroups();
  // Split roles inherit the exact former Designer connection, without replacing
  // existing new bindings. Remove the obsolete role only after migrating bindings.
  for (const group of groups) {
    const source = group.bindings.find(b => b.agentId === 'text_designer');
    if (!source) continue;
    for (const agentId of ['text_character_designer', 'text_outline_designer']) {
      if (!group.bindings.some(b => b.agentId === agentId)) {
        group.bindings.push({ ...structuredClone(source), agentId });
      }
    }
    group.bindings = group.bindings.filter(b => b.agentId !== 'text_designer');
    await storage.saveAgentGroup(group);
  }
  const removedGroups = new Set(groups.filter(g =>
    !DEFAULT_AGENT_GROUPS.some(d => d.id === g.id) &&
    (g.id === 'group_unit_test' || g.bindings.some(b => RETIRED_AGENT_IDS.has(b.agentId)))
  ).map(g => g.id));
  for (const defaults of DEFAULT_AGENT_GROUPS) {
    const existing = groups.find(g => g.id === defaults.id);
    const bindings = defaults.bindings.map(b => structuredClone(existing?.bindings.find(e => e.agentId === b.agentId) ?? b));
    const next = existing ? { ...existing, bindings } : structuredClone(defaults);
    if (JSON.stringify(next) !== JSON.stringify(existing)) await storage.saveAgentGroup(next);
  }
  // Reassign only the current group reference; keep historical turn references as history.
  if (removedGroups.size) {
    for (const save of await storage.getSaves()) {
      if (removedGroups.has(save.activeAgentGroupId)) await storage.saveGame({ ...save, activeAgentGroupId: 'group_fast' });
    }
    for (const id of removedGroups) await storage.deleteAgentGroup(id);
  }
  for (const agent of agents) if (RETIRED_AGENT_IDS.has(agent.id)) await storage.deleteAgent(agent.id);
}
