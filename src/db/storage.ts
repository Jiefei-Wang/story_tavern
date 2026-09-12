import { invoke } from "@tauri-apps/api/core";
import {
  AgentDefinition,
  AgentGroup,
  AppSettings,
  Backend,
  GameSave,
  TurnTrace,
} from "../types";
import {
  BUILTIN_AGENTS,
  DEFAULT_AGENT_GROUPS,
  DEFAULT_BACKENDS,
  INITIAL_DEMO_SAVE,
} from "./initialData";

export const DEFAULT_SETTINGS: AppSettings = {
  language: "zh-CN",
  theme: "light",
  developerMode: true,
  mockLlmMode: false, // Default to REAL LLM mode!
  autosave: true,
  logLevel: "info",
};

export class StorageService {
  private isTauri(): boolean {
    return typeof window !== "undefined" && Boolean((window as any).__TAURI_INTERNALS__);
  }

  async initDatabase(): Promise<void> {
    const defaultOpenRouterKey =
      (import.meta as any)?.env?.VITE_OPENROUTER_KEY ||
      (globalThis as any)?.process?.env?.OPENROUTER_KEY ||
      (globalThis as any)?.process?.env?.openrouter_key ||
      "";

    if (defaultOpenRouterKey) {
      if (this.isTauri()) {
        try {
          // Initialize OpenRouter secret into Windows Credential Manager if key provided
          await invoke("secret_set", {
            secretRef: "backend_openrouter",
            secretVal: defaultOpenRouterKey,
          });
          await invoke("secret_set", {
            secretRef: "secret_openrouter_default",
            secretVal: defaultOpenRouterKey,
          });
        } catch (e) {
          console.warn("Failed to seed default secret via Tauri:", e);
        }
      } else if (typeof localStorage !== "undefined") {
        localStorage.setItem("secret_backend_openrouter", defaultOpenRouterKey);
        localStorage.setItem("openrouter_key", defaultOpenRouterKey);
      }
    }

    // Seed backends if empty
    const backends = await this.getBackends();
    if (backends.length === 0) {
      for (const b of DEFAULT_BACKENDS) {
        await this.saveBackend(b);
      }
    }

    // Seed agents if empty
    const agents = await this.getAgents();
    if (agents.length === 0) {
      for (const a of BUILTIN_AGENTS) {
        await this.saveAgent(a);
      }
    }

    // Seed groups if empty
    const groups = await this.getAgentGroups();
    if (groups.length === 0) {
      for (const g of DEFAULT_AGENT_GROUPS) {
        await this.saveAgentGroup(g);
      }
    }

    // Seed saves if empty
    const saves = await this.getSaves();
    if (saves.length === 0) {
      await this.saveGame(INITIAL_DEMO_SAVE);
    }
  }

  // --- Backends ---
  async getBackends(): Promise<Backend[]> {
    if (this.isTauri()) {
      try {
        const items = await invoke<Array<{ key: string; value: string }>>("db_kv_list", {
          table: "backends",
        });
        return items.map((i) => JSON.parse(i.value));
      } catch (e) {
        console.warn("db_kv_list backends failed, fallback to local:", e);
      }
    }
    const raw = localStorage.getItem("story_tavern_backends");
    return raw ? JSON.parse(raw) : [];
  }

  async saveBackend(backend: Backend): Promise<void> {
    if (this.isTauri()) {
      try {
        await invoke("db_kv_set", {
          table: "backends",
          key: backend.id,
          value: JSON.stringify(backend),
        });
        return;
      } catch (e) {
        console.warn("db_kv_set backend failed, fallback to local:", e);
      }
    }
    const list = await this.getBackends();
    const idx = list.findIndex((b) => b.id === backend.id);
    if (idx >= 0) list[idx] = backend;
    else list.push(backend);
    localStorage.setItem("story_tavern_backends", JSON.stringify(list));
  }

  async deleteBackend(id: string): Promise<void> {
    if (this.isTauri()) {
      try {
        await invoke("db_kv_delete", { table: "backends", key: id });
        return;
      } catch (e) {
        console.warn("db_kv_delete backend failed:", e);
      }
    }
    const list = (await this.getBackends()).filter((b) => b.id !== id);
    localStorage.setItem("story_tavern_backends", JSON.stringify(list));
  }

  // --- Agents ---
  async getAgents(): Promise<AgentDefinition[]> {
    if (this.isTauri()) {
      try {
        const items = await invoke<Array<{ key: string; value: string }>>("db_kv_list", {
          table: "agents",
        });
        return items.map((i) => JSON.parse(i.value));
      } catch (e) {
        console.warn("db_kv_list agents failed:", e);
      }
    }
    const raw = localStorage.getItem("story_tavern_agents");
    return raw ? JSON.parse(raw) : [];
  }

  async saveAgent(agent: AgentDefinition): Promise<void> {
    if (this.isTauri()) {
      try {
        await invoke("db_kv_set", {
          table: "agents",
          key: agent.id,
          value: JSON.stringify(agent),
        });
        return;
      } catch (e) {
        console.warn("db_kv_set agent failed:", e);
      }
    }
    const list = await this.getAgents();
    const idx = list.findIndex((a) => a.id === agent.id);
    if (idx >= 0) list[idx] = agent;
    else list.push(agent);
    localStorage.setItem("story_tavern_agents", JSON.stringify(list));
  }

  async deleteAgent(id: string): Promise<void> {
    if (this.isTauri()) {
      try {
        await invoke("db_kv_delete", { table: "agents", key: id });
        return;
      } catch (e) {
        console.warn("db_kv_delete agent failed:", e);
      }
    }
    const list = (await this.getAgents()).filter((a) => a.id !== id);
    localStorage.setItem("story_tavern_agents", JSON.stringify(list));
  }

  // --- Agent Groups ---
  async getAgentGroups(): Promise<AgentGroup[]> {
    if (this.isTauri()) {
      try {
        const items = await invoke<Array<{ key: string; value: string }>>("db_kv_list", {
          table: "agent_groups",
        });
        return items.map((i) => JSON.parse(i.value));
      } catch (e) {
        console.warn("db_kv_list agent_groups failed:", e);
      }
    }
    const raw = localStorage.getItem("story_tavern_agent_groups");
    return raw ? JSON.parse(raw) : [];
  }

  async saveAgentGroup(group: AgentGroup): Promise<void> {
    if (this.isTauri()) {
      try {
        await invoke("db_kv_set", {
          table: "agent_groups",
          key: group.id,
          value: JSON.stringify(group),
        });
        return;
      } catch (e) {
        console.warn("db_kv_set agent_group failed:", e);
      }
    }
    const list = await this.getAgentGroups();
    const idx = list.findIndex((g) => g.id === group.id);
    if (idx >= 0) list[idx] = group;
    else list.push(group);
    localStorage.setItem("story_tavern_agent_groups", JSON.stringify(list));
  }

  async deleteAgentGroup(id: string): Promise<void> {
    if (this.isTauri()) {
      try {
        await invoke("db_kv_delete", { table: "agent_groups", key: id });
        return;
      } catch (e) {
        console.warn("db_kv_delete agent_group failed:", e);
      }
    }
    const list = (await this.getAgentGroups()).filter((g) => g.id !== id);
    localStorage.setItem("story_tavern_agent_groups", JSON.stringify(list));
  }

  // --- Saves ---
  async getSaves(): Promise<GameSave[]> {
    if (this.isTauri()) {
      try {
        const items = await invoke<Array<{ key: string; value: string }>>("db_kv_list", {
          table: "saves",
        });
        return items.map((i) => JSON.parse(i.value));
      } catch (e) {
        console.warn("db_kv_list saves failed:", e);
      }
    }
    const raw = localStorage.getItem("story_tavern_saves");
    return raw ? JSON.parse(raw) : [];
  }

  async saveGame(save: GameSave): Promise<void> {
    if (this.isTauri()) {
      try {
        await invoke("db_kv_set", {
          table: "saves",
          key: save.id,
          value: JSON.stringify(save),
        });
        return;
      } catch (e) {
        console.warn("db_kv_set save failed:", e);
      }
    }
    const list = await this.getSaves();
    const idx = list.findIndex((s) => s.id === save.id);
    if (idx >= 0) list[idx] = save;
    else list.push(save);
    localStorage.setItem("story_tavern_saves", JSON.stringify(list));
  }

  // --- Settings ---
  async getSettings(): Promise<AppSettings> {
    if (this.isTauri()) {
      try {
        const val = await invoke<string | null>("db_kv_get", {
          table: "settings",
          key: "app_settings",
        });
        if (val) {
          const parsed = JSON.parse(val);
          return { ...DEFAULT_SETTINGS, ...parsed, mockLlmMode: false };
        }
      } catch (e) {
        console.warn("db_kv_get settings failed:", e);
      }
    }
    const raw = localStorage.getItem("story_tavern_settings");
    if (raw) {
      const parsed = JSON.parse(raw);
      return { ...DEFAULT_SETTINGS, ...parsed, mockLlmMode: false };
    }
    return DEFAULT_SETTINGS;
  }

  async saveSettings(settings: AppSettings): Promise<void> {
    if (this.isTauri()) {
      try {
        await invoke("db_kv_set", {
          table: "settings",
          key: "app_settings",
          value: JSON.stringify(settings),
        });
        return;
      } catch (e) {
        console.warn("db_kv_set settings failed:", e);
      }
    }
    localStorage.setItem("story_tavern_settings", JSON.stringify(settings));
  }

  // --- Keyring Secret Ops ---
  async setSecret(secretRef: string, secretVal: string): Promise<void> {
    if (this.isTauri()) {
      await invoke("secret_set", { secretRef, secretVal });
    }
  }

  async getDbPath(): Promise<string> {
    if (this.isTauri()) {
      try {
        return await invoke<string>("db_get_path");
      } catch (e) {
        return "SQLite in AppData";
      }
    }
    return "Browser LocalStorage";
  }
}

export const storageService = new StorageService();
