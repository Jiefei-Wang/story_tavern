import { useRepositoryStore } from '../stores/useRepositoryStore';
import { repositorySchema, validateRepositoryConfiguration } from '../db/repositoryConfiguration';
import { getAgentPrompt, validateAgentPrompt } from "./template/AgentPrompt";
import { readPreference, writePreference } from '../db/preferences';
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
import {validateTextWorld} from './text/Documents';
import { librarySchema, validateLibrary, emptyLibrary, type Library } from './library/Library';
import { useLibraryStore } from '../stores/useLibraryStore';
import { validateWorkflows, workflowsSchema } from './workflows/Workflow';

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
  workflows: {
    description: '文本与游戏组合（ID → 流程），保存复用配置库原子提交，立即同步文本组合页面。字段 id/name/steps/output；steps 为最多32个顺序步骤，每步有唯一 id、agentId、inputs（输入名 → 来源）。来源为 {from:"input"} 或 {from:"step",stepId:"前面步骤ID",pointer:"JSON Pointer"}，空 pointer 读取完整结果。可重复调用同一 Agent，可汇合多个先前输出；禁止前向引用、循环和不安全路径。运行时选择模型组，要求所有 Agent 已绑定启用的 Backend 和模型。输入按 Agent inputs 校验，输出按 outputSchema 校验，最终 output 必须选出非空文本。只传显式输入，不自动提供存档或凭证；配置操作不运行模型，结果和运行状态不是配置。游戏通过 library.storyWorkflowId 选择组合，null 或缺失使用内置默认故事组合；从下一回合生效，历史不重写。storyStage 可为 route/cards/outlines/narration，必须依次各一次，程序提供材料、按需跳过和领域校验；这些阶段仅游戏可运行，Agent 可替换，普通步骤可穿插。from:context 配合 pointer 可显式读取游戏提供的 world/characters/player/history/input，独立运行没有游戏上下文。默认组合可在页面复制后编辑。旧配置缺少 workflows 视为空集合，未知字段保留。',
    schema: workflowsSchema,
    read: () => structuredClone(useLibraryStore.getState().record.data.workflows || {}),
    validate: (value, all) => validateWorkflows(value, Object.values(all.agents)),
    save: async (value, before, report, signal) => {
      const state = useLibraryStore.getState();
      if (!same(state.record.data.workflows || {}, before)) throw new Error('流程配置已变化，请重新读取');
      await state.save({ ...state.record.data, workflows: value }, state.record.revision, signal);
      report('已保存文本组合配置');
    },
  },
  repositoryDefaults: {
    description: '仓库默认 Agent 与 Agent 组，独立于本机 agents/groups。仅本地开发服务可写；available=false 时不可操作。data.agents 和 data.groups 按 ID 索引，支持局部 JSON Patch，revision/available 只读。保留五个核心 Agent 与 Fast/Quality/Local 组；绑定只允许 backend_openrouter/backend_local。不能保存凭证。保存写入仓库 JSON 并即时同步编辑页，不应用到本机；用户可在界面点击应用到本机，或明确要求修改本机 agents/groups。存在界面未保存仓库草稿时拒绝助手保存。',
    schema: z.object({ available: z.boolean(), revision: z.string().optional(), data: repositorySchema.optional() }).strict(),
    read: () => {
      const record = useRepositoryStore.getState().record;
      return record ? { available: true, ...structuredClone(record) } : { available: false };
    },
    validate: value => { if (value.available) validateRepositoryConfiguration(value.data); },
    save: async (value, before, report, signal) => {
      const state = useRepositoryStore.getState();
      if (!before.available || value.available !== before.available || value.revision !== before.revision) throw new Error('仓库不可用或修改了只读版本字段');
      if (state.editorDirty || !same(state.draft, state.record?.data)) throw new Error('界面有未保存的仓库草稿，请先保存或重新载入');
      await state.save(value.data, before.revision, signal);
      report('已保存仓库默认配置；未应用到本机');
    },
  },
  library: {
    description: '故事工坊独立配置库：characters（ID → 角色：name、setting、details、initialMemory、可选 image），worlds（ID → 世界：name、summary、description、可选 image），stories（ID → 故事：name、summary、worldId、playerId、supportingIds、opening），selectedStoryId（首页所选故事或 null），storyWorkflowId（游戏所用 workflows ID；null 或缺失使用默认故事组合）。三种配置共用一次原子提交，以保证引用始终有效。支持创建、编辑、删除与选择故事。主角必须存在且不得同时为配角，配角可为空且不能重复；删除角色或世界前须解除故事引用。世界只有 description 进入模型消息，名字、概要、图片只展示；故事 summary 只展示，opening 直接作为首条正文。新开局复制配置，公共库修改不改变已有存档；剧情新增人物留在本局。image 可为空、HTTP(S) 图片地址或不超过约 1 MB 的 PNG/JPEG/WebP data URL。角色设定、详细资料、初始记忆都参与定义。保存即时刷新 UI，不写历史、凭证或运行状态。',
    schema: librarySchema.omit({ workflows: true }),
    read: () => { const { workflows, ...data } = useLibraryStore.getState().record.data; return structuredClone(data); },
    validate: (value, all) => { if ('workflows' in value) throw new Error('请通过 workflows 资源修改文本组合'); validateLibrary({ ...value, workflows: all.workflows }); },
    save: async (value, before, report, signal) => {
      const state = useLibraryStore.getState();
      const { workflows, ...data } = state.record.data;
      if (!same(data, before)) throw new Error('配置库已变化，请重新读取');
      await state.save({ ...value, ...(workflows ? { workflows } : {}) } as Library, state.record.revision, signal);
      report('已保存角色、世界与故事配置');
    },
  },
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
    description: "Agent 定义（ID → 对象）。仓库静态默认仅含 text_router、text_character_designer、text_outline_designer、text_storyteller、model_refusal_detector；旧流程定义已退役，初始化不再恢复。包括完整 prompt 与默认生成参数；messages/inputs 为旧配置兼容数据，不是当前编辑入口。Router 仅解释需求与安排角色；Character Designer 按需创建或重新生成人物卡，Outline Designer 设计交互思维、表达概要和动作，Narrator 扩写正文。两个新角色可通过 agents 与 agentGroups 局部 JSON Patch 独立配置；旧 text_designer 已显式迁移并删除：缺少的新绑定先继承旧连接，已有新绑定保留；旧 ID 的助手操作会报资源不存在，请改用两个新 ID。游戏输入可要求重新生成一个或多个人物（regenerate_characters），保留 ID 与历史；运行时 thought/expression_outline/end_state 不属于可写配置。文本默认流程使用 text_router、text_character_designer、text_outline_designer、text_storyteller，新回合版本 workflow-v1，旧 routed-v2 历史保留。prompt 是完整请求模板，支持 {{world}}、{{characters}}、{{player}}、{{history}}、{{input}}、{{task}}、{{material}}、{{routingInstructions}}、{{retry}}，支持点路径及 {{json material}}。只有模板引用的材料会进入请求，不再额外拼接世界、历史和本轮材料；输出协议仍由程序验证。检测器仅提供 {{responseText}} 与 {{retry}}。新增或修改 prompt 时校验变量；旧 messages 编辑会显式转换为 prompt，其他未知字段保留。",
    schema: z.record(id, assistantAgentSchema), read: () => keyed(useAgentStore.getState().agents.map(a => ({ ...a, prompt: getAgentPrompt(a) }))),
    validate: value => { for (const agent of Object.values(value)) if (agent.prompt !== undefined) validateAgentPrompt(agent); },
    save: (next, before, report, signal) => saveCollection(next, before, useAgentStore.getState().saveAgent, useAgentStore.getState().deleteAgent, report, signal),
  },
  groups: {
    description: "Agent 组（ID → 对象）。默认 Fast、Quality、Local 各绑定上述四个 Agent；旧流程与 group_unit_test 组会在初始化清理，存档当前组引用切至 Fast，历史不改。包括名称、说明和 bindings；绑定引用必须存在。",
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
    description: "已有存档的展示配置与 activeAgentGroupId。当前故事存档通过 storyInfo 保存标题与简介快照；修改 name 或 storyInfo 不影响公共故事库。worldState/worldDefinition 是引擎占位数据，文本存档不得修改，世界与人物设定请使用 textSaves。不能创建删除存档或写历史。",
    schema: z.record(id, z.object({ id, name: id, activeAgentGroupId: id, worldState: record, worldDefinition: worldDefinitionAuthoringContract.optional() }).passthrough()),
    read: () => keyed(useGameStore.getState().saves.map(save => {
      const current = useGameStore.getState().activeSave?.id === save.id ? useGameStore.getState().activeSave! : save;
      const { turns, createdAt, updatedAt, textWorld, legacyBackup, ...config } = current;
      delete (config as any).textSnapshot;
      return config;
    })),
    validate: (value, all) => {
      for (const save of Object.values(value)) {
        if (!all.groups[save.activeAgentGroupId]) throw new Error(`存档 ${save.name} 引用的 Agent 组不存在`);
        if (all.textSaves?.[save.id]) continue;
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
        const updated = migrateGameSave({ ...existing, ...value, id: existing.id, turns: existing.turns, createdAt: existing.createdAt, updatedAt: new Date().toISOString() });
        await storageService.saveGame(updated);
        useGameStore.setState(s => ({ saves: s.saves.map(old => old.id === key ? updated : old), activeSave: s.activeSave?.id === key ? updated : s.activeSave }));
        report(`已保存存档配置：${updated.name}`);
      }
    },
  },
  textSaves: {
    description: '本局作者配置（存档 ID → 对象）：characters、playerId、documents。世界自由文本位于 world/description.md，scene 固定引用该文档；新人物必须同时创建 characters/<id>/public.md（名字）、profile.md（设定和详细资料）、memory.md（初始记忆）。主角必须存在且人物 ID 不可重复，名字和设定非空。修改仅影响本局后续请求，不改变公共配置库、历史或其他存档。不能写 turns、锚点、Designer 状态、版本、备份、凭证或运行任务。characterMode 不控制生成轮数。保存后即时刷新本局详情。',
    schema: z.record(id,z.object({id,characterMode:z.enum(['three','combined']),scene:id,characters:z.array(id),playerId:id,documents:z.record(z.string(),z.object({text:z.string(),revision:z.number().int().nonnegative()}).passthrough())}).passthrough()),
    read: () => keyed(useGameStore.getState().saves.map(s=>useGameStore.getState().activeSave?.id===s.id?useGameStore.getState().activeSave!:s).filter(s=>s.textWorld).map(s=>({id:s.id,characterMode:s.textWorld!.characterMode,scene:s.textWorld!.scene,characters:s.textWorld!.characters,playerId:s.textWorld!.playerId,documents:Object.fromEntries(Object.entries(s.textWorld!.documents).filter(([p])=>!p.startsWith('turns/')))}))),
    validate: value => {
      for (const [key,item] of Object.entries(value)) {
        const state=useGameStore.getState(), save=state.activeSave?.id===key?state.activeSave:state.saves.find(s=>s.id===key);
        if (!save?.textWorld || item.id!==key) throw new Error('文本存档引用不存在');
        if (['narration','anchor','anchors','designs','state_history','thought','expression_outline','end_state','turns','pipeline'].some(key=>key in item)) throw new Error('锚点与人物运行状态属于只读历史');
        if (Object.keys(item.documents).some(p=>p.startsWith('turns/'))) throw new Error('历史记录不可写');
        for (const [path,doc] of Object.entries(item.documents) as [string,any][]) if (doc.revision!==(save.textWorld.documents[path]?.revision??0)) throw new Error('文档版本不可通过配置修改');
        validateTextWorld({...save.textWorld,...item,documents:{...Object.fromEntries(Object.entries(save.textWorld.documents).filter(([p])=>p.startsWith('turns/'))),...item.documents}});
      }
    },
    save: async (next,before,report,signal) => {
      for (const [key,item] of Object.entries(next)) {
        if (same(item,before[key])) continue;
        signal.throwIfAborted();
        const state=useGameStore.getState(),existing=state.activeSave?.id===key?state.activeSave:state.saves.find(s=>s.id===key);
        if (!existing?.textWorld || state.isExecuting) throw new Error('存档已变化或正在生成');
        const candidate=structuredClone(existing), world=candidate.textWorld!;
        world.characterMode=item.characterMode;world.characters=item.characters;world.playerId=item.playerId;world.scene=item.scene;
        world.documents={...Object.fromEntries(Object.entries(world.documents).filter(([p])=>p.startsWith('turns/'))),...structuredClone(item.documents)};
        for(const [path,doc] of Object.entries(world.documents)) if(doc.text!==existing.textWorld.documents[path]?.text) doc.revision=(existing.textWorld.documents[path]?.revision??-1)+1;
        world.revision++;
        validateTextWorld(world);signal.throwIfAborted();
        await storageService.commitTextGame(candidate,existing.textWorld.revision);
        useGameStore.setState(s=>({saves:s.saves.map(old=>old.id===key?candidate:old),activeSave:s.activeSave?.id===key?candidate:s.activeSave}));
        report(`文本存档已保存：${candidate.name}`);
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
      await useAgentGroupStore.getState().setActiveGroup(value.activeGroupId);
      if (value.activeSaveId) useGameStore.getState().selectSave(value.activeSaveId);
      else useGameStore.setState({ activeSave: null, currentTraceId: null });
      report("已更新当前组和存档");
    },
  },
  assistant: {
    description: "AI 助手自身的 backendId 和 model，变更从下一次对话请求生效。",
    schema: z.object({ backendId: z.string(), model: z.string() }).passthrough(),
    read: () => ({ backendId: readPreference("model_assistant_backend") || "", model: readPreference("model_assistant_model") || "" }),
    validate: (value, all) => { if (value.backendId && !all.backends[value.backendId]?.enabled) throw new Error("助手 Backend 不存在或未启用"); },
    save: async (value, before, report) => {
      await writePreference("model_assistant_backend", value.backendId); await writePreference("model_assistant_model", value.model);
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
  next.textSaves ??= {}; // Older assistant snapshots predate the text resource.
  next.library ??= emptyLibrary();
  next.repositoryDefaults ??= { available: false };
  next.workflows ??= {};
  rejectUnsafeKeys(reply);
  const explicitPrompts = new Set<string>();
  for (const action of reply.actions) {
    if (action.type === "patch_config") {
      if (!Object.prototype.hasOwnProperty.call(assistantResources, action.resource) || !Object.prototype.hasOwnProperty.call(next, action.resource)) throw new Error(`未知配置资源：${action.resource}`);
      for (const patch of action.patches) {
        if (!patch.path.startsWith("/") || /~(?![01])/u.test(patch.path)) throw new Error("需要合法 JSON Pointer 路径");
        const parts = patch.path.split("/").slice(1).map(p => p.replace(/~1/g, "/").replace(/~0/g, "~"));
        if (action.resource === 'agents' && (parts[1] === 'prompt' || parts.length === 1 && 'value' in patch && patch.value && typeof patch.value === 'object' && 'prompt' in patch.value)) explicitPrompts.add(parts[0]);
        if (parts.some(p => ["__proto__", "prototype", "constructor"].includes(p))) throw new Error("不安全的配置路径");
      }
      next[action.resource] = applyPatch(next[action.resource], action.patches, true, false, true).newDocument;
    } else if (action.type === "set_active_group") next.selection.activeGroupId = action.id;
    else {
      if (action.type === "save_agent" && action.value.prompt !== undefined) explicitPrompts.add(action.value.id);
      const target = action.type === "save_agent" ? next.agents : next.groups;
      target[action.value.id] = preserveUnknownFields(target[action.value.id], action.value);
    }
  }
  // Old actions still edit messages; migrate them only when prompt was not changed explicitly.
  for (const [key, agent] of Object.entries(next.agents)) {
    if (!explicitPrompts.has(key) && !same(agent.messages, before.agents[key]?.messages) && same(agent.prompt, before.agents[key]?.prompt))
      agent.prompt = getAgentPrompt({ ...agent, prompt: undefined } as any);
  }
  if (!same(next.repositoryDefaults, before.repositoryDefaults ?? { available: false })) {
    if (!before.repositoryDefaults?.available || next.repositoryDefaults.available !== true || next.repositoryDefaults.revision !== before.repositoryDefaults.revision) throw new Error('仓库不可用或修改了只读版本字段');
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
  if (!same(Object.keys(next.textSaves).sort(),Object.keys(before.textSaves || {}).sort())) throw new Error('请通过存档管理创建、删除或迁移文本存档');
  for (const key of Object.keys(next.textSaves)) {
    for (const field of ['worldState','worldDefinition']) if (!same(next.saves[key]?.[field],before.saves[key]?.[field])) throw new Error('文本存档请修改 textSaves，不可修改旧世界归档');
    if (Object.keys(next.textSaves[key]).some(k=>!Object.keys(before.textSaves[key]).includes(k))) throw new Error('不能增加内部文本存档字段');
  }
  for (const save of Object.values(next.saves)) {
    if (!next.groups[save.activeAgentGroupId]) throw new Error("不能删除仍被存档引用的 Agent 组");
    if (["turns", "createdAt", "updatedAt", "textWorld", "legacyBackup", "textSnapshot"].some(key => key in save)) throw new Error("历史回合和存档时间不是可编辑配置");
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
    migrateGameSave({ ...existing, ...value, turns: existing.turns, createdAt: existing.createdAt, updatedAt: existing.updatedAt });
  }
  let expected = before;
  let librarySaved = false;
  for (const [key, resource] of Object.entries(assistantResources)) {
    if (key === 'library' && librarySaved) continue;
    if (same(next[key], before[key])) continue;
    signal.throwIfAborted();
    if (useGameStore.getState().isExecuting || !same(readAssistantConfiguration().resources, expected)) throw new Error("执行期间配置发生变化，后续修改已停止");
    if (key === 'workflows') {
      // Selection and definitions share one revision: removing the selected flow cannot leave a dangling reference.
      const state = useLibraryStore.getState();
      await state.save({ ...next.library, workflows: next.workflows } as Library, state.record.revision, signal);
      report('已保存文本组合与故事配置');
      librarySaved = true;
      expected = readAssistantConfiguration().resources as Resources;
      continue;
    }
    await resource.save(next[key], before[key], report, signal);
    expected = readAssistantConfiguration().resources as Resources;
  }
}
