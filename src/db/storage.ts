import { migrateGameSave } from "../engine/character-schema/Migration";
import { reconcileAgentCatalog } from './agentCatalog';
import { validateTextWorld } from '../engine/text/Documents';
import { defaultLibrary, validateLibrary, type LibraryRecord } from '../engine/library/Library';
import { invoke, hasLocalHost, isNative, clearBrowserDatabase } from './host';
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
  private initialization: Promise<void> | undefined;
  isTauri(): boolean {
    return isNative();
  }

  usesLocalService(): boolean {
    return hasLocalHost();
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

  // Browser collection updates must read and write without yielding: two
  // concurrent async callers would otherwise overwrite each other's changes.
  private readBrowserList<T>(key: string): T[] {
    const raw = this.getStorage().getItem(key);
    if (!raw) return [];
    const list = safeJsonParse<T[]>(raw, key);
    return Array.isArray(list) ? list : [];
  }

  async initDatabase(): Promise<void> {
    if (this.initialization) return this.initialization;
    this.initialization = this.initializeDatabase();
    try {await this.initialization;} finally {this.initialization=undefined;}
  }

  private async initializeDatabase(): Promise<void> {
    if (this.usesLocalService()) {
      await invoke('db_get_path'); // Fail closed: never fall back to browser storage.
      if (!isNative()) clearBrowserDatabase();
    }

    // Seed backends if empty
    const backends = await this.getBackends();
    if (backends.length === 0) {
      for (const b of DEFAULT_BACKENDS) {
        await this.saveBackend(b);
      }
    }

    // New library-based games replace pre-library saves. Inspect metadata before hydration.
    if (this.usesLocalService()) {
      const items = await invoke<Array<{key:string;value:string}>>('db_kv_list', {table:'saves'});
      for (const item of items) if (safeJsonParse<GameSave>(item.value, 'save').textWorld?.setupVersion !== 2) await this.deleteGame(item.key);
    } else {
      const saves = this.readBrowserList<GameSave>('story_tavern_saves');
      this.getStorage().setItem('story_tavern_saves', JSON.stringify(saves.filter(s => s.textWorld?.setupVersion === 2)));
    }
    await reconcileAgentCatalog(this);
    if (!(await this.getLibrary())) await this.commitLibrary({revision:0,data:defaultLibrary()}, -1);
  }

  async getLibrary(): Promise<LibraryRecord | null> {
    const raw = this.usesLocalService() ? await invoke<string|null>('db_kv_get', {table:'settings',key:'story_library_v2'}) : this.getStorage().getItem('story_tavern_library_v2');
    if (!raw) return null;
    const record = safeJsonParse<LibraryRecord>(raw, 'story library');
    if (!Number.isInteger(record.revision) || record.revision < 0) throw new Error('配置库版本无效');
    validateLibrary(record.data);
    return record;
  }

  async commitLibrary(record: LibraryRecord, expectedRevision: number, signal?: AbortSignal): Promise<void> {
    validateLibrary(record.data);
    if (record.revision !== expectedRevision + 1) throw new Error('配置库版本无效');
    const value = JSON.stringify(record);
    signal?.throwIfAborted();
    if (this.usesLocalService()) { await invoke('library_commit', {value,expectedRevision}); return; }
    const write = () => {
      signal?.throwIfAborted();
      const raw = this.getStorage().getItem('story_tavern_library_v2');
      const previous = raw ? safeJsonParse<LibraryRecord>(raw, 'story library') : null;
      if ((previous?.revision ?? -1) !== expectedRevision) throw new Error('配置库版本冲突，请重新载入');
      this.getStorage().setItem('story_tavern_library_v2', value);
    };
    if (typeof window !== 'undefined' && typeof navigator !== 'undefined' && navigator.locks) await navigator.locks.request('story_tavern_library_v2', write);
    else write();
  }

  // --- Backends ---
  async getBackends(): Promise<Backend[]> {
    if (this.usesLocalService()) {
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
    if (this.usesLocalService()) {
      await invoke("db_kv_set", {
        table: "backends",
        key: immutableBackend.id,
        value: JSON.stringify(immutableBackend),
      });
      return;
    }
    const list = this.readBrowserList<Backend>('story_tavern_backends');
    const idx = list.findIndex((b) => b.id === immutableBackend.id);
    if (idx >= 0) list[idx] = immutableBackend;
    else list.push(immutableBackend);
    this.getStorage().setItem("story_tavern_backends", JSON.stringify(list));
  }

  async deleteBackend(id: string): Promise<void> {
    const allBackends = this.usesLocalService() ? await this.getBackends() : this.readBrowserList<Backend>('story_tavern_backends');
    const target = allBackends.find((b) => b.id === id);

    if (this.usesLocalService()) {
      await invoke("db_kv_delete", { table: "backends", key: id });
    } else {
      const list = allBackends.filter((b) => b.id !== id);
      this.getStorage().setItem("story_tavern_backends", JSON.stringify(list));
    }

    // If target had a secretRef, check if any remaining backend still uses it
    if (target?.secretRef) {
      const remaining = (await this.getBackends()).filter((b) => b.id !== id);
      const isShared = remaining.some((b) => b.secretRef === target.secretRef);
      if (!isShared && this.usesLocalService()) {
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
    if (this.usesLocalService()) {
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
    if (this.usesLocalService()) {
      await invoke("db_kv_set", {
        table: "agents",
        key: immutableAgent.id,
        value: JSON.stringify(immutableAgent),
      });
      return;
    }
    const list = this.readBrowserList<AgentDefinition>('story_tavern_agents');
    const idx = list.findIndex((a) => a.id === immutableAgent.id);
    if (idx >= 0) list[idx] = immutableAgent;
    else list.push(immutableAgent);
    this.getStorage().setItem("story_tavern_agents", JSON.stringify(list));
  }

  async deleteAgent(id: string): Promise<void> {
    if (this.usesLocalService()) {
      await invoke("db_kv_delete", { table: "agents", key: id });
      return;
    }
    const list = (this.readBrowserList<AgentDefinition>('story_tavern_agents')).filter((a) => a.id !== id);
    this.getStorage().setItem("story_tavern_agents", JSON.stringify(list));
  }

  // --- Agent Groups ---
  async getAgentGroups(): Promise<AgentGroup[]> {
    if (this.usesLocalService()) {
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
    if (this.usesLocalService()) {
      await invoke("db_kv_set", {
        table: "agent_groups",
        key: immutableGroup.id,
        value: JSON.stringify(immutableGroup),
      });
      return;
    }
    const list = this.readBrowserList<AgentGroup>('story_tavern_agent_groups');
    const idx = list.findIndex((g) => g.id === immutableGroup.id);
    if (idx >= 0) list[idx] = immutableGroup;
    else list.push(immutableGroup);
    this.getStorage().setItem("story_tavern_agent_groups", JSON.stringify(list));
  }

  async deleteAgentGroup(id: string): Promise<void> {
    if (this.usesLocalService()) {
      await invoke("db_kv_delete", { table: "agent_groups", key: id });
      return;
    }
    const list = (this.readBrowserList<AgentGroup>('story_tavern_agent_groups')).filter((g) => g.id !== id);
    this.getStorage().setItem("story_tavern_agent_groups", JSON.stringify(list));
  }

  // --- Saves ---
  async getSaves(): Promise<GameSave[]> {
    if (this.usesLocalService()) {
      const items = await invoke<Array<{ key: string; value: string }>>("text_save_list");
      const raw = items.map(i => safeJsonParse<GameSave>(i.value, `GameSave '${i.key}'`));
      const migrated = raw.map(migrateGameSave);
      // Validate the entire batch before persisting any upgraded record.
      await Promise.all(migrated.map((save, index) => raw[index].worldDefinition ? Promise.resolve() : invoke('db_kv_set', { table: 'saves', key: items[index].key, value: JSON.stringify(save) })));
      return migrated;
    }
    const raw = this.getStorage().getItem("story_tavern_saves");
    if (!raw) return [];
    const list = safeJsonParse<GameSave[]>(raw, "story_tavern_saves");
    if (!Array.isArray(list)) throw new Error('存档列表格式无效，原数据未修改');
    const migrated = list.map(migrateGameSave);
    if (list.some(save => !save.worldDefinition)) this.getStorage().setItem('story_tavern_saves', JSON.stringify(migrated));
    return migrated;
  }

  async saveGame(save: GameSave): Promise<void> {
    if (save.textWorld) {
      const stored = (await this.getSaves()).find(s => s.id === save.id);
      const canonical=(value:any):any=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value;
      const comparable=(value:GameSave)=>{const {textSnapshot,...rest}=value as GameSave&{textSnapshot?:string};return canonical(rest);};
      if (stored?.textWorld && JSON.stringify(comparable(stored))===JSON.stringify(comparable(save))) return;
      const next = structuredClone(save);
      if (stored?.textWorld && stored.textWorld.revision !== save.textWorld.revision) throw new Error('文本存档版本冲突');
      next.textWorld!.revision = (stored?.textWorld?.revision ?? -1) + 1;
      await this.commitTextGame(next,stored?.textWorld?.revision ?? null);
      save.textWorld!.revision = next.textWorld!.revision;
      return;
    }
    const immutableSave = migrateGameSave(save);
    if (this.usesLocalService()) {
      await invoke("db_kv_set", {
        table: "saves",
        key: immutableSave.id,
        value: JSON.stringify(immutableSave),
      });
      return;
    }
    const list = this.readBrowserList<GameSave>('story_tavern_saves');
    const idx = list.findIndex((s) => s.id === immutableSave.id);
    if (idx >= 0) list[idx] = immutableSave;
    else list.push(immutableSave);
    this.getStorage().setItem("story_tavern_saves", JSON.stringify(list));
  }

  async commitTextGame(save: GameSave, expectedRevision: number | null): Promise<void> {
    if (!save.textWorld) throw new Error('缺少文本存档');
    validateTextWorld(save.textWorld);
    if (save.textWorld.revision !== (expectedRevision ?? -1) + 1) throw new Error('新版本必须递增一次');
    const candidate = structuredClone(save);
    if (candidate.turns.at(-1)?.textTurn) candidate.turns.at(-1)!.textTurn!.commit = 'saved';
    if (this.usesLocalService()) {
      await invoke('text_save_commit',{value:JSON.stringify(candidate),expectedRevision});
    } else {
      const write = () => {
        const list = this.readBrowserList<GameSave>('story_tavern_saves');
        const at = list.findIndex(s => s.id === candidate.id);
        if ((list[at]?.textWorld?.revision ?? null) !== expectedRevision) throw new Error('文本存档版本冲突');
        if (at >= 0) list[at] = candidate; else list.push(candidate);
        this.getStorage().setItem('story_tavern_saves',JSON.stringify(list));
      };
      if (typeof window !== 'undefined' && typeof navigator !== 'undefined' && navigator.locks) await navigator.locks.request('story_tavern_text_save',write);
      else write();
    }
    if (save.turns.at(-1)?.textTurn) save.turns.at(-1)!.textTurn!.commit = 'saved';
  }

  async deleteGame(saveId: string): Promise<void> {
    if (this.usesLocalService()) {
      await invoke("db_kv_delete", {
        table: "saves",
        key: saveId,
      });
      return;
    }
    const list = this.readBrowserList<GameSave>('story_tavern_saves');
    const filtered = list.filter((s) => s.id !== saveId);
    this.getStorage().setItem("story_tavern_saves", JSON.stringify(filtered));
  }

  // --- Traces Persistence ---
  async saveTrace(trace: TurnTrace): Promise<void> {
    const immutableTrace = { ...trace };
    if (this.usesLocalService()) {
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
    if (this.usesLocalService()) {
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
    if (this.usesLocalService()) {
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
    if (this.usesLocalService()) {
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
    if (this.usesLocalService()) {
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
    if (this.usesLocalService()) {
      await invoke("secret_set", { secretRef, secretVal });
    } else {
      this.getStorage().setItem(`secret_${secretRef}`, secretVal);
    }
  }

  async deleteSecret(secretRef: string): Promise<void> {
    if (this.usesLocalService()) {
      await invoke("secret_delete", { secretRef });
    } else {
      this.getStorage().removeItem(`secret_${secretRef}`);
    }
  }

  async getDbPath(): Promise<string> {
    if (this.usesLocalService()) {
      try {
        return await invoke<string>("db_get_path");
      } catch (e) {
        return "SQLite in AppData";
      }
    }
    return "Test memory storage";
  }
}

export const storageService = new StorageService();
