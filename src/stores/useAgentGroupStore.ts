import { readPreference, writePreference } from '../db/preferences';
import { create } from "zustand";
import { AgentBinding, AgentGroup } from "../types";
import { storageService } from "../db/storage";

interface AgentGroupState {
  groups: AgentGroup[];
  activeGroupId: string;
  isLoading: boolean;
  loadGroups: () => Promise<void>;
  setActiveGroup: (id: string) => Promise<void>;
  saveGroup: (group: AgentGroup) => Promise<void>;
  deleteGroup: (id: string) => Promise<void>;
  duplicateGroup: (id: string) => Promise<AgentGroup | null>;
  updateBinding: (
    groupId: string,
    agentId: string,
    updates: Partial<AgentBinding>
  ) => Promise<void>;
}

function normalizeOverrides(
  existing?: AgentBinding["overrides"],
  updates?: AgentBinding["overrides"]
): AgentBinding["overrides"] {
  const merged: Record<string, any> = {
    ...(existing || {}),
    ...(updates || {}),
  };

  const cleaned: Record<string, any> = {};
  for (const [k, v] of Object.entries(merged)) {
    if (v !== undefined && v !== null && v !== "") {
      cleaned[k] = v;
    }
  }

  return Object.keys(cleaned).length > 0 ? (cleaned as any) : undefined;
}

import { DEFAULT_AGENT_GROUPS } from "../db/initialData";

export const useAgentGroupStore = create<AgentGroupState>((set, get) => ({
  groups: DEFAULT_AGENT_GROUPS,
  activeGroupId: "group_fast",
  isLoading: false,

  loadGroups: async () => {
    set({ isLoading: true });
    const groups = await storageService.getAgentGroups();

    let storedId = readPreference("story_tavern_active_group");
    // Verify storedId actually exists in loaded groups
    if (!storedId || !groups.some((g) => g.id === storedId)) {
      storedId = groups.some(g => g.id === 'group_fast') ? 'group_fast' : groups[0]?.id || 'group_fast';
      await writePreference("story_tavern_active_group", storedId);
    }

    set({ groups, activeGroupId: storedId, isLoading: false });
  },

  setActiveGroup: async (id: string) => {
    const { groups } = get();
    if (groups.some((g) => g.id === id)) {
      await writePreference("story_tavern_active_group", id);
      set({ activeGroupId: id });
    }
  },

  saveGroup: async (group: AgentGroup) => {
    const updatedGroup: AgentGroup = {
      ...group,
      updatedAt: new Date().toISOString().split("T")[0],
    };
    await storageService.saveAgentGroup(updatedGroup);
    const groups = await storageService.getAgentGroups();
    set({ groups });
  },

  deleteGroup: async (id: string) => {
    await storageService.deleteAgentGroup(id);
    const groups = await storageService.getAgentGroups();
    let active = get().activeGroupId;

    if (active === id) {
      active = groups.length > 0 ? groups[0].id : "group_quality";
      await writePreference("story_tavern_active_group", active);
    }

    set({ groups, activeGroupId: active });
  },

  duplicateGroup: async (id: string) => {
    const existing = get().groups.find((g) => g.id === id);
    if (!existing) return null;

    const newId = `group_${Date.now().toString().slice(-6)}`;
    const duplicated: AgentGroup = {
      ...JSON.parse(JSON.stringify(existing)),
      id: newId,
      name: `${existing.name} (副本)`,
      updatedAt: new Date().toISOString().split("T")[0],
    };

    await storageService.saveAgentGroup(duplicated);
    const groups = await storageService.getAgentGroups();
    set({ groups });
    return duplicated;
  },

  updateBinding: async (groupId, agentId, updates) => {
    const group = get().groups.find((g) => g.id === groupId);
    if (!group) return;

    const bindings = [...group.bindings];
    const idx = bindings.findIndex((b) => b.agentId === agentId);

    if (idx >= 0) {
      const existing = bindings[idx];
      const newOverrides = normalizeOverrides(existing.overrides, updates.overrides);
      bindings[idx] = {
        ...existing,
        ...updates,
        overrides: newOverrides,
      };
    } else {
      const newOverrides = normalizeOverrides(undefined, updates.overrides);
      bindings.push({
        agentId,
        backendId: updates.backendId || "backend_openrouter",
        model: updates.model || "nvidia/nemotron-3-super-120b-a12b:free",
        overrides: newOverrides,
      });
    }

    const updatedGroup: AgentGroup = {
      ...group,
      bindings,
      updatedAt: new Date().toISOString().split("T")[0],
    };

    await storageService.saveAgentGroup(updatedGroup);
    const groups = await storageService.getAgentGroups();
    set({ groups });
  },
}));
