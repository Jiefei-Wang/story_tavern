import { z } from "zod";
import * as jsonpatch from "fast-json-patch";
import { assistantAgentSchema, assistantGroupSchema, assistantReplySchema, Configuration } from "./modelAssistant";
import { useAgentStore } from "../stores/useAgentStore";
import { useAgentGroupStore } from "../stores/useAgentGroupStore";
import { useBackendStore } from "../stores/useBackendStore";
import { useSettingsStore } from "../stores/useSettingsStore";
import { useGameStore } from "../stores/useGameStore";
import { storageService } from "../db/storage";
import { validateWorldState } from "./world/WorldValidator";
import { assertCharacterSchema, validateCharacterAgainstSchema } from "./character-schema/CharacterSchema";
import { migrateGameSave } from "./character-schema/Migration";
import { worldDefinitionAuthoringContract } from "./character-schema/AuthoringContract";
import { Backend, GameSave, WorldDefinition, WorldState } from "../types";

type Document = Record<string, any>;
export type Resources = Record<string, Document>;
const applyPatch = jsonpatch.default?.applyPatch || jsonpatch.applyPatch;
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const id = z.string().trim().min(1);
const record = z.record(z.string(), z.unknown());
const backendSchema = z.object({ id, name: id, baseUrl: z.url().refine(url => /^https?:\/\//.test(url), "只支持 HTTP/HTTPS"), authType: z.enum(["none", "bearer"]), timeoutMs: z.number().int().positive(), maxConcurrency: z.number().int().positive(), enabled: z.boolean(), models: z.array(id).optional(), defaultModel: z.string().optional() }).passthrough();
const settingsSchema = z.object({ language: z.enum(["zh-CN", "en-US"]), theme: z.enum(["light", "system"]), developerMode: z.boolean(), mockLlmMode: z.boolean(), autosave: z.boolean(), logLevel: z.enum(["debug", "info", "warn", "error"]) }).passthrough();

export interface ConfigurationResource {
  description: string;
  schema: z.ZodType;
  read: () => Document;
  validate?: (value: Document, all: Resources) => void;
  save: (value: Document, before: Document, report: (message: string) => void, signal: AbortSignal) => Promise<void>;
}
const keyed = (items: { id: string }[]) => Object.fromEntries(items.map(item => [item.id, item]));

async function saveCollection(next: Document, before: Document, save: (value: any) => Promise<void>, remove: (id: string) => Promise<void>, report: (message: string) => void, signal: AbortSignal) {
  for (const [key, value] of Object.entries(next)) {
    if (same(value, before[key])) continue;
    signal.throwIfAborted(); await save(value); report(`已保存：${value.name || key}`);
  }
  for (const key of Object.keys(before)) {
    if (key in next) continue;
    signal.throwIfAborted(); await remove(key); report(`已删除：${before[key].name || key}`);
  }
}

/** The single runtime capability catalog. New domains register read/schema/validate/save here. */
export const assistantResources: Record<string, ConfigurationResource> = {
  backends: {
    description: "Backend 服务（ID → 对象）。可增删改地址、认证方式、启用状态、模型列表、超时与并发；凭证和自定义认证头在 Backend 表单管理，已有值保留。",
    schema: z.record(id, backendSchema),
    read: () => keyed(useBackendStore.getState().backends.map(({ secretRef, customHeaders, ...b }) => b)),
    validate: value => { for (const b of Object.values(value)) if ("secretRef" in b || "customHeaders" in b) throw new Error("请在 Backend 表单管理凭证与请求头"); },
    save: async (next, before, report, signal) => saveCollection(next, before, async b => {
      const existing = useBackendStore.getState().backends.find(old => old.id === b.id);
      await useBackendStore.getState().saveBackend({ ...existing, customHeaders: existing?.customHeaders || {}, ...b } as Backend);
    }, useBackendStore.getState().deleteBackend, report, signal),
  },
  agents: {
    description: "Agent 定义（ID → 对象），包括消息、输入、输出 Schema、默认参数；支持增删改。action_adjudicator 是玩家动作裁决，narration_auditor 是旁白事实核查，character_change_auditor 是单个人物属性变化的独立因果审查，model_refusal_detector 是安全拒绝检测；这些角色均通过本资源管理，执行时保留强制权限/数据协议。",
    schema: z.record(id, assistantAgentSchema), read: () => keyed(useAgentStore.getState().agents),
    save: (next, before, report, signal) => saveCollection(next, before, useAgentStore.getState().saveAgent, useAgentStore.getState().deleteAgent, report, signal),
  },
  groups: {
    description: "Agent 组（ID → 对象），包括名称、说明和 bindings；绑定引用必须存在。",
    schema: z.record(id, assistantGroupSchema), read: () => keyed(useAgentGroupStore.getState().groups),
    validate: (value, all) => {
      for (const group of Object.values(value)) {
        const seen = new Set<string>();
        for (const b of group.bindings) {
          if (!all.agents[b.agentId] || !all.backends[b.backendId]) throw new Error(`组 ${group.name} 的 Agent/Backend 引用不存在`);
          if (seen.has(b.agentId)) throw new Error(`重复绑定：${b.agentId}`);
          seen.add(b.agentId);
        }
      }
    },
    save: (next, before, report, signal) => saveCollection(next, before, useAgentGroupStore.getState().saveGroup, useAgentGroupStore.getState().deleteGroup, report, signal),
  },
  settings: {
    description: "应用设置：语言、主题、开发者模式、模拟模式、自动保存、日志等级，以及后续已持久化字段。迁移标记和数据目录不可修改。",
    schema: settingsSchema, read: () => ({ ...useSettingsStore.getState().settings }),
    save: async (value, before, report) => {
      await storageService.saveSettings(value as any);
      useSettingsStore.setState({ settings: value as any }); report("已保存系统设置");
    },
  },
  saves: {
    description: "所有存档的作者配置（ID → 对象）：name、activeAgentGroupId、worldState、worldDefinition。人物自定义字段在 worldState.entities.<id>.attributes；可选多维关系在 relationships.<targetId>。每个存档有独立 worldDefinition.characterSchema（sections 仅分组，包含字段类型、默认值、visibility、updatePolicy、freedom、changePolicy）。Schema 不放入 worldState。修改定义必须同时保持当前人物和所有历史分支有效；不能写历史回合，不能删除关系定义却保留关系数据。无损小改可使用局部 Patch；整套系统更换请使用人物页面“以此 Schema 创建新世界”。",
    schema: z.record(id, z.object({ id, name: id, activeAgentGroupId: id, worldState: record, worldDefinition: worldDefinitionAuthoringContract.optional() }).passthrough()),
    read: () => keyed(useGameStore.getState().saves.map(save => {
      const current = useGameStore.getState().activeSave?.id === save.id ? useGameStore.getState().activeSave! : save;
      const { turns, createdAt, updatedAt, ...config } = current;
      return config;
    })),
    validate: (value, all) => {
      for (const save of Object.values(value)) {
        if (!all.groups[save.activeAgentGroupId]) throw new Error(`存档 ${save.name} 引用的 Agent 组不存在`);
        validateWorldState(save.worldState);
        if (save.worldDefinition) {
          const definition = save.worldDefinition as WorldDefinition;
          if (!Number.isInteger(definition.version) || definition.version < 1) throw new Error("世界定义版本无效");
          assertCharacterSchema(definition.characterSchema);
          for (const entity of Object.values((save.worldState as WorldState).entities)) {
            if (entity.type !== "character") continue;
            const result = validateCharacterAgainstSchema(entity, definition.characterSchema, save.worldState);
            if (!result.valid) throw new Error(result.errors.join("；"));
          }
        }
      }
    },
    save: async (next, before, report, signal) => {
      for (const [key, value] of Object.entries(next)) {
        if (same(value, before[key])) continue;
        signal.throwIfAborted();
        if (useGameStore.getState().isExecuting) throw new Error("游戏正在生成，请结束生成后修改世界配置");
        const state = useGameStore.getState();
        const existing = state.activeSave?.id === key ? state.activeSave : state.saves.find(s => s.id === key);
        if (!existing) throw new Error("存档已被移除");
        const updated = migrateGameSave({ ...value, id: existing.id, turns: existing.turns, createdAt: existing.createdAt, updatedAt: new Date().toISOString() });
        await storageService.saveGame(updated);
        useGameStore.setState(s => ({ saves: s.saves.map(old => old.id === key ? updated : old), activeSave: s.activeSave?.id === key ? updated : s.activeSave }));
        report(`已保存存档配置：${updated.name}`);
      }
    },
  },
  selection: {
    description: "当前 Agent 组 activeGroupId、当前存档 activeSaveId（可为 null）。",
    schema: z.object({ activeGroupId: id, activeSaveId: id.nullable() }).passthrough(),
    read: () => ({ activeGroupId: useAgentGroupStore.getState().activeGroupId, activeSaveId: useGameStore.getState().activeSave?.id || null }),
    validate: (value, all) => {
      if (!all.groups[value.activeGroupId]) throw new Error("当前 Agent 组不存在");
      if (value.activeSaveId && !all.saves[value.activeSaveId]) throw new Error("当前存档不存在");
    },
    save: async (value, before, report) => {
      useAgentGroupStore.getState().setActiveGroup(value.activeGroupId);
      if (value.activeSaveId) useGameStore.getState().selectSave(value.activeSaveId);
      else useGameStore.setState({ activeSave: null, currentTraceId: null });
      report("已更新当前组和存档");
    },
  },
  assistant: {
    description: "AI 助手自身的 backendId 和 model，变更从下一次对话请求生效。",
    schema: z.object({ backendId: z.string(), model: z.string() }).passthrough(),
    read: () => ({ backendId: localStorage.getItem("model_assistant_backend") || "", model: localStorage.getItem("model_assistant_model") || "" }),
    validate: (value, all) => { if (value.backendId && !all.backends[value.backendId]?.enabled) throw new Error("助手 Backend 不存在或未启用"); },
    save: async (value, before, report) => {
      localStorage.setItem("model_assistant_backend", value.backendId); localStorage.setItem("model_assistant_model", value.model);
      report("已保存 AI 助手设置（下一条消息生效）");
    },
  },
};

export function readAssistantConfiguration(): Configuration {
  const resources = structuredClone(Object.fromEntries(Object.entries(assistantResources).map(([key, resource]) => [key, resource.read()])));
  return {
    agents: [], groups: [], backends: [], activeGroupId: resources.selection.activeGroupId,
    resources,
    capabilities: Object.fromEntries(Object.entries(assistantResources).map(([key, resource]) => [key, { description: resource.description, schema: z.toJSONSchema(resource.schema) }])),
  };
}

function rejectUnsafeKeys(value: unknown): void {
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    if (["__proto__", "prototype", "constructor"].includes(key)) throw new Error("配置包含不安全的键");
    rejectUnsafeKeys(child);
  }
}

// Legacy whole-object actions preserve fields introduced by newer versions, including array members.
export function preserveUnknownFields(before: any, next: any): any {
  if (Array.isArray(next)) return next.map((item, index) => {
    const previous = !Array.isArray(before) ? undefined : item?.id ? before.find(old => old?.id === item.id)
      : item?.agentId ? before.find(old => old?.agentId === item.agentId) : before[index];
    return preserveUnknownFields(previous, item);
  });
  if (!next || typeof next !== "object") return next;
  const merged = { ...(before && typeof before === "object" && !Array.isArray(before) ? before : {}), ...next };
  for (const key of Object.keys(next)) merged[key] = preserveUnknownFields(before?.[key], next[key]);
  return merged;
}

export function planAssistantChanges(reply: z.infer<typeof assistantReplySchema>, before: Resources): Resources {
  const next = structuredClone(before);
  rejectUnsafeKeys(reply);
  for (const action of reply.actions) {
    if (action.type === "patch_config") {
      if (!Object.prototype.hasOwnProperty.call(assistantResources, action.resource) || !Object.prototype.hasOwnProperty.call(next, action.resource)) throw new Error(`未知配置资源：${action.resource}`);
      for (const patch of action.patches) {
        if (!patch.path.startsWith("/") || /~(?![01])/u.test(patch.path)) throw new Error("需要合法 JSON Pointer 路径");
        const parts = patch.path.split("/").slice(1).map(p => p.replace(/~1/g, "/").replace(/~0/g, "~"));
        if (parts.some(p => ["__proto__", "prototype", "constructor"].includes(p))) throw new Error("不安全的配置路径");
      }
      next[action.resource] = applyPatch(next[action.resource], action.patches, true, false, true).newDocument;
    } else if (action.type === "set_active_group") next.selection.activeGroupId = action.id;
    else {
      const target = action.type === "save_agent" ? next.agents : next.groups;
      target[action.value.id] = preserveUnknownFields(target[action.value.id], action.value);
    }
  }
  for (const [key, resource] of Object.entries(assistantResources)) {
    resource.schema.parse(next[key]); // Validate, but never use the parsed copy to strip future fields.
    if (["agents", "groups", "backends", "saves"].includes(key)) {
      for (const [entryId, value] of Object.entries(next[key])) if (entryId !== value.id) throw new Error("配置 ID 与集合键必须一致");
    }
    // Legacy saves can lack newer fields; validate changed world documents only.
    if (key !== "saves" || !same(next.saves, before.saves)) resource.validate?.(next[key], next);
  }
  for (const key of ["characterGenerationMigrated", "behaviorGroundingMigrated", "behaviorGroundingVersion", "dataDirectory"]) if (!same(next.settings[key], before.settings[key])) throw new Error(`不可修改内部设置：${key}`);
  if (!same(Object.keys(next.saves).sort(), Object.keys(before.saves).sort())) throw new Error("请在存档管理中创建或删除存档，助手可修改已有存档的全部配置");
  for (const save of Object.values(next.saves)) {
    if (!next.groups[save.activeAgentGroupId]) throw new Error("不能删除仍被存档引用的 Agent 组");
    if (["turns", "createdAt", "updatedAt"].some(key => key in save)) throw new Error("历史回合和存档时间不是可编辑配置");
  }
  return next;
}

export async function executeAssistantChanges(reply: z.infer<typeof assistantReplySchema>, snapshot: Configuration, signal: AbortSignal, report: (message: string) => void) {
  if (!reply.actions.length) return;
  const before = snapshot.resources as Resources;
  if (!same(readAssistantConfiguration().resources, before)) throw new Error("配置已变化，本次未保存，请重新发送指令");
  if (useGameStore.getState().isExecuting) throw new Error("游戏正在生成，请结束生成后修改配置");
  const next = planAssistantChanges(reply, before);
  // Run the storage migration/validation before any writes, including historical compatibility.
  for (const [key, value] of Object.entries(next.saves)) {
    if (same(value, before.saves[key])) continue;
    const state = useGameStore.getState();
    const existing = state.activeSave?.id === key ? state.activeSave : state.saves.find(s => s.id === key);
    if (!existing) throw new Error("存档已被移除");
    migrateGameSave({ ...value, turns: existing.turns, createdAt: existing.createdAt, updatedAt: existing.updatedAt });
  }
  let expected = before;
  for (const [key, resource] of Object.entries(assistantResources)) {
    if (same(next[key], before[key])) continue;
    signal.throwIfAborted();
    if (useGameStore.getState().isExecuting || !same(readAssistantConfiguration().resources, expected)) throw new Error("执行期间配置发生变化，后续修改已停止");
    await resource.save(next[key], before[key], report, signal);
    expected = readAssistantConfiguration().resources as Resources;
  }
}
