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
  mockLlmMode: false,
  autosave: true,
  logLevel: "info",
};

function safeJsonParse<T>(raw: string, recordName: string): T {
  try {
    return JSON.parse(raw);
  } catch (err: any) {
    throw new Error(`Failed to parse stored JSON for ${recordName}: ${err.message}`);
  }
}

class MemoryStorage {
  private store: Map<string, string> = new Map();

  getItem(key: string): string | null {
    return this.store.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.store.set(key, String(value));
  }

  removeItem(key: string): void {
    this.store.delete(key);
  }

  clear(): void {
    this.store.clear();
  }
}

const memoryStorage = new MemoryStorage();

export class StorageService {
  isTauri(): boolean {
    return typeof window !== "undefined" && Boolean((window as any).__TAURI_INTERNALS__);
  }

  private getStorage(): {
    getItem: (key: string) => string | null;
    setItem: (key: string, value: string) => void;
    removeItem: (key: string) => void;
  } {
    if (typeof localStorage !== "undefined" && typeof localStorage.getItem === "function") {
      try {
        localStorage.getItem("__storage_test__");
        return localStorage;
      } catch {}
    }
    return memoryStorage;
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
      } else {
        const storage = this.getStorage();
        storage.setItem("secret_backend_openrouter", defaultOpenRouterKey);
        storage.setItem("openrouter_key", defaultOpenRouterKey);
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
      const items = await invoke<Array<{ key: string; value: string }>>("db_kv_list", {
        table: "backends",
      });
      return items.map((i) => safeJsonParse<Backend>(i.value, `Backend '${i.key}'`));
    }
    const raw = this.getStorage().getItem("story_tavern_backends");
    if (!raw) return [];
    const list = safeJsonParse<Backend[]>(raw, "story_tavern_backends");
    return Array.isArray(list) ? list : [];
  }

  async saveBackend(backend: Backend): Promise<void> {
    const immutableBackend = { ...backend };
    if (this.isTauri()) {
      await invoke("db_kv_set", {
        table: "backends",
        key: immutableBackend.id,
        value: JSON.stringify(immutableBackend),
      });
      return;
    }
    const list = await this.getBackends();
    const idx = list.findIndex((b) => b.id === immutableBackend.id);
    if (idx >= 0) list[idx] = immutableBackend;
    else list.push(immutableBackend);
    this.getStorage().setItem("story_tavern_backends", JSON.stringify(list));
  }

  async deleteBackend(id: string): Promise<void> {
    const allBackends = await this.getBackends();
    const target = allBackends.find((b) => b.id === id);

    if (this.isTauri()) {
      await invoke("db_kv_delete", { table: "backends", key: id });
    } else {
      const list = allBackends.filter((b) => b.id !== id);
      this.getStorage().setItem("story_tavern_backends", JSON.stringify(list));
    }

    // If target had a secretRef, check if any remaining backend still uses it
    if (target?.secretRef) {
      const remaining = (await this.getBackends()).filter((b) => b.id !== id);
      const isShared = remaining.some((b) => b.secretRef === target.secretRef);
      if (!isShared && this.isTauri()) {
        try {
          await invoke("secret_delete", { secretRef: target.secretRef });
        } catch (e) {
          console.warn("Failed to delete orphaned secret:", e);
        }
      }
    }
  }

  // --- Agents ---
  async getAgents(): Promise<AgentDefinition[]> {
    if (this.isTauri()) {
      const items = await invoke<Array<{ key: string; value: string }>>("db_kv_list", {
        table: "agents",
      });
      return items.map((i) => safeJsonParse<AgentDefinition>(i.value, `Agent '${i.key}'`));
    }
    const raw = this.getStorage().getItem("story_tavern_agents");
    if (!raw) return [];
    const list = safeJsonParse<AgentDefinition[]>(raw, "story_tavern_agents");
    return Array.isArray(list) ? list : [];
  }

  async saveAgent(agent: AgentDefinition): Promise<void> {
    const immutableAgent = { ...agent };
    if (this.isTauri()) {
      await invoke("db_kv_set", {
        table: "agents",
        key: immutableAgent.id,
        value: JSON.stringify(immutableAgent),
      });
      return;
    }
    const list = await this.getAgents();
    const idx = list.findIndex((a) => a.id === immutableAgent.id);
    if (idx >= 0) list[idx] = immutableAgent;
    else list.push(immutableAgent);
    this.getStorage().setItem("story_tavern_agents", JSON.stringify(list));
  }

  async deleteAgent(id: string): Promise<void> {
    if (this.isTauri()) {
      await invoke("db_kv_delete", { table: "agents", key: id });
      return;
    }
    const list = (await this.getAgents()).filter((a) => a.id !== id);
    this.getStorage().setItem("story_tavern_agents", JSON.stringify(list));
  }

  // --- Agent Groups ---
  async getAgentGroups(): Promise<AgentGroup[]> {
    if (this.isTauri()) {
      const items = await invoke<Array<{ key: string; value: string }>>("db_kv_list", {
        table: "agent_groups",
      });
      return items.map((i) => safeJsonParse<AgentGroup>(i.value, `AgentGroup '${i.key}'`));
    }
    const raw = this.getStorage().getItem("story_tavern_agent_groups");
    if (!raw) return [];
    const list = safeJsonParse<AgentGroup[]>(raw, "story_tavern_agent_groups");
    return Array.isArray(list) ? list : [];
  }

  async saveAgentGroup(group: AgentGroup): Promise<void> {
    const immutableGroup = { ...group };
    if (this.isTauri()) {
      await invoke("db_kv_set", {
        table: "agent_groups",
        key: immutableGroup.id,
        value: JSON.stringify(immutableGroup),
      });
      return;
    }
    const list = await this.getAgentGroups();
    const idx = list.findIndex((g) => g.id === immutableGroup.id);
    if (idx >= 0) list[idx] = immutableGroup;
    else list.push(immutableGroup);
    this.getStorage().setItem("story_tavern_agent_groups", JSON.stringify(list));
  }

  async deleteAgentGroup(id: string): Promise<void> {
    if (this.isTauri()) {
      await invoke("db_kv_delete", { table: "agent_groups", key: id });
      return;
    }
    const list = (await this.getAgentGroups()).filter((g) => g.id !== id);
    this.getStorage().setItem("story_tavern_agent_groups", JSON.stringify(list));
  }

  // --- Saves ---
  async getSaves(): Promise<GameSave[]> {
    if (this.isTauri()) {
      const items = await invoke<Array<{ key: string; value: string }>>("db_kv_list", {
        table: "saves",
      });
      return items.map((i) => safeJsonParse<GameSave>(i.value, `GameSave '${i.key}'`));
    }
    const raw = this.getStorage().getItem("story_tavern_saves");
    if (!raw) return [];
    const list = safeJsonParse<GameSave[]>(raw, "story_tavern_saves");
    return Array.isArray(list) ? list : [];
  }

  async saveGame(save: GameSave): Promise<void> {
    const immutableSave = { ...save };
    if (this.isTauri()) {
      await invoke("db_kv_set", {
        table: "saves",
        key: immutableSave.id,
        value: JSON.stringify(immutableSave),
      });
      return;
    }
    const list = await this.getSaves();
    const idx = list.findIndex((s) => s.id === immutableSave.id);
    if (idx >= 0) list[idx] = immutableSave;
    else list.push(immutableSave);
    this.getStorage().setItem("story_tavern_saves", JSON.stringify(list));
  }

  // --- Traces Persistence ---
  async saveTrace(trace: TurnTrace): Promise<void> {
    const immutableTrace = { ...trace };
    if (this.isTauri()) {
      await invoke("db_kv_set", {
        table: "traces",
        key: immutableTrace.id,
        value: JSON.stringify(immutableTrace),
      });
      return;
    }
    const raw = this.getStorage().getItem("story_tavern_traces");
    const list: TurnTrace[] = raw ? safeJsonParse<TurnTrace[]>(raw, "story_tavern_traces") : [];
    const idx = list.findIndex((t) => t.id === immutableTrace.id);
    if (idx >= 0) list[idx] = immutableTrace;
    else list.unshift(immutableTrace);
    // Keep last 100 in browser
    if (list.length > 100) list.pop();
    this.getStorage().setItem("story_tavern_traces", JSON.stringify(list));
  }

  async getTraces(limit = 100): Promise<TurnTrace[]> {
    if (this.isTauri()) {
      const items = await invoke<Array<{ key: string; value: string }>>("db_kv_list", {
        table: "traces",
      });
      const parsed = items.map((i) => safeJsonParse<TurnTrace>(i.value, `Trace '${i.key}'`));
      parsed.sort((a, b) => b.startedAt - a.startedAt);
      return parsed.slice(0, limit);
    }
    const raw = this.getStorage().getItem("story_tavern_traces");
    if (!raw) return [];
    const list = safeJsonParse<TurnTrace[]>(raw, "story_tavern_traces");
    return Array.isArray(list) ? list.slice(0, limit) : [];
  }

  async getTrace(id: string): Promise<TurnTrace | undefined> {
    if (this.isTauri()) {
      const val = await invoke<string | null>("db_kv_get", {
        table: "traces",
        key: id,
      });
      if (!val) return undefined;
      return safeJsonParse<TurnTrace>(val, `Trace '${id}'`);
    }
    const traces = await this.getTraces();
    return traces.find((t) => t.id === id);
  }

  // --- Settings ---
  async getSettings(): Promise<AppSettings> {
    if (this.isTauri()) {
      const val = await invoke<string | null>("db_kv_get", {
        table: "settings",
        key: "app_settings",
      });
      if (val) {
        const parsed = safeJsonParse<Partial<AppSettings>>(val, "app_settings");
        return { ...DEFAULT_SETTINGS, ...parsed };
      }
      return DEFAULT_SETTINGS;
    }
    const raw = this.getStorage().getItem("story_tavern_settings");
    if (raw) {
      const parsed = safeJsonParse<Partial<AppSettings>>(raw, "story_tavern_settings");
      return { ...DEFAULT_SETTINGS, ...parsed };
    }
    return DEFAULT_SETTINGS;
  }

  async saveSettings(settings: AppSettings): Promise<void> {
    const immutableSettings = { ...settings };
    if (this.isTauri()) {
      await invoke("db_kv_set", {
        table: "settings",
        key: "app_settings",
        value: JSON.stringify(immutableSettings),
      });
      return;
    }
    this.getStorage().setItem("story_tavern_settings", JSON.stringify(immutableSettings));
  }

  // --- Keyring Secret Ops ---
  async setSecret(secretRef: string, secretVal: string): Promise<void> {
    if (this.isTauri()) {
      await invoke("secret_set", { secretRef, secretVal });
    } else {
      this.getStorage().setItem(`secret_${secretRef}`, secretVal);
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
