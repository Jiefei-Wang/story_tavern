import { validateAgentPrompt } from "../engine/template/AgentPrompt";
import { create } from "zustand";
import { AgentDefinition } from "../types";
import { storageService } from "../db/storage";
import { BUILTIN_AGENTS } from "../db/initialData";

interface AgentState {
  agents: AgentDefinition[];
  isLoading: boolean;
  loadAgents: () => Promise<void>;
  saveAgent: (agent: AgentDefinition) => Promise<void>;
  deleteAgent: (id: string) => Promise<void>;
  duplicateAgent: (id: string) => Promise<AgentDefinition | null>;
  resetBuiltinAgents: () => Promise<void>;
}

export const useAgentStore = create<AgentState>((set, get) => ({
  agents: BUILTIN_AGENTS,
  isLoading: false,

  loadAgents: async () => {
    set({ isLoading: true });
    const agents = await storageService.getAgents();
    set({ agents, isLoading: false });
  },

  saveAgent: async (agent: AgentDefinition) => {
    if (agent.prompt !== undefined) validateAgentPrompt(agent);
    agent.updatedAt = new Date().toISOString().split("T")[0];
    await storageService.saveAgent(agent);
    const agents = await storageService.getAgents();
    set({ agents });
  },

  deleteAgent: async (id: string) => {
    await storageService.deleteAgent(id);
    const agents = await storageService.getAgents();
    set({ agents });
  },

  duplicateAgent: async (id: string) => {
    const existing = get().agents.find((a) => a.id === id);
    if (!existing) return null;

    const newId = `${existing.id}_copy_${Date.now().toString().slice(-4)}`;
    const duplicated: AgentDefinition = {
      ...JSON.parse(JSON.stringify(existing)),
      id: newId,
      name: `${existing.name} (副本)`,
      updatedAt: new Date().toISOString().split("T")[0],
    };

    await storageService.saveAgent(duplicated);
    const agents = await storageService.getAgents();
    set({ agents });
    return duplicated;
  },

  resetBuiltinAgents: async () => {
    for (const a of BUILTIN_AGENTS) {
      await storageService.saveAgent(a);
    }
    const agents = await storageService.getAgents();
    set({ agents });
  },
}));
