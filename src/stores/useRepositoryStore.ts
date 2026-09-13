import { create } from 'zustand';
import { useMemo } from 'react';
import { validateRepositoryConfiguration, type RepositoryConfiguration, type RepositoryRecord } from '../db/repositoryConfiguration';
import { useAgentStore } from './useAgentStore';
import { useAgentGroupStore } from './useAgentGroupStore';
import { useBackendStore } from './useBackendStore';
import { useGameStore } from './useGameStore';
import type { AgentDefinition, AgentGroup } from '../types';

async function request(method: 'GET' | 'PUT', body?: RepositoryRecord): Promise<RepositoryRecord> {
  const response = await fetch('/__story_repository', { method, headers: { 'X-Story-Local': '1', 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
  if (!response.ok) {
    const result = await response.json().catch(() => null);
    throw new Error(result?.error || '仓库编辑仅在本地开发服务可用');
  }
  const record = await response.json();
  validateRepositoryConfiguration(record.data);
  if (typeof record.revision !== 'string') throw new Error('无效的仓库版本');
  return record;
}

// Merge by domain IDs, preserving fields newer than the repository defaults.
export function mergeRepositoryValue(before: any, next: any): any {
  if (Array.isArray(next)) return next.map((item, index) => mergeRepositoryValue(
    Array.isArray(before) ? item?.id ? before.find(old => old.id === item.id) : item?.agentId ? before.find(old => old.agentId === item.agentId) : before[index] : undefined, item));
  if (!next || typeof next !== 'object') return next;
  return Object.fromEntries(Object.entries({ ...before, ...next }).map(([key, value]) => [key, key in next ? mergeRepositoryValue(before?.[key], value) : value]));
}

interface State {
  target: 'local' | 'repository';
  record: RepositoryRecord | null;
  draft: RepositoryConfiguration | null;
  busy: boolean;
  editorDirty: boolean;
  load: () => Promise<void>;
  edit: (change: (data: RepositoryConfiguration) => void) => void;
  save: (data?: RepositoryConfiguration, revision?: string, signal?: AbortSignal) => Promise<void>;
  apply: () => Promise<void>;
}

export const useRepositoryStore = create<State>((set, get) => ({
  target: 'local', record: null, draft: null, busy: false, editorDirty: false,
  load: async () => {
    if (get().busy) throw new Error('请等待当前操作完成');
    set({ busy: true });
    try { const record = await request('GET'); set({ record, draft: structuredClone(record.data) }); }
    finally { set({ busy: false }); }
  },
  edit: change => {
    if (get().busy || !get().draft) throw new Error('仓库尚未就绪或正在保存');
    const draft = structuredClone(get().draft!); change(draft); set({ draft });
  },
  save: async (data, revision, signal) => {
    const state = get();
    if (state.busy || !state.record || !state.draft) throw new Error('仓库尚未就绪或正在保存');
    signal?.throwIfAborted();
    const next = data || state.draft;
    validateRepositoryConfiguration(next);
    set({ busy: true });
    try {
      // Once dispatched, wait for the write receipt even if cancellation arrives.
      const record = await request('PUT', { data: next, revision: revision ?? state.record.revision });
      set({ record, draft: structuredClone(record.data) });
    } finally { set({ busy: false }); }
  },
  apply: async () => {
    const state = get();
    if (state.busy || !state.record || JSON.stringify(state.draft) !== JSON.stringify(state.record.data)) throw new Error('请先保存仓库修改');
    if (useGameStore.getState().isExecuting) throw new Error('请结束生成后应用配置');
    const data = state.record.data;
    validateRepositoryConfiguration(data);
    const backends = useBackendStore.getState().backends;
    for (const group of Object.values(data.groups)) for (const binding of group.bindings) {
      if (!backends.some(b => b.id === binding.backendId)) throw new Error(`本机缺少 Backend：${binding.backendId}，未应用`);
    }
    set({ busy: true });
    let count = 0;
    try {
      const latest = await request('GET');
      if (latest.revision !== state.record.revision) throw new Error('仓库已变化，请重新载入');
      for (const agent of Object.values(data.agents)) {
        if (useGameStore.getState().isExecuting) throw new Error('游戏正在生成');
        await useAgentStore.getState().saveAgent(mergeRepositoryValue(useAgentStore.getState().agents.find(a => a.id === agent.id), agent)); count++;
      }
      for (const group of Object.values(data.groups)) {
        if (useGameStore.getState().isExecuting) throw new Error('游戏正在生成');
        await useAgentGroupStore.getState().saveGroup(mergeRepositoryValue(useAgentGroupStore.getState().groups.find(g => g.id === group.id), group)); count++;
      }
    } catch (error) { throw new Error(`已应用 ${count} 项，后续停止：${error instanceof Error ? error.message : String(error)}`); }
    finally { set({ busy: false }); }
  },
}));

export function useAgentEditorStore() {
  const local = useAgentStore(); const repo = useRepositoryStore();
  const agents = useMemo(() => Object.values(repo.draft?.agents ?? {}), [repo.draft?.agents]);
  if (repo.target === 'local' || !repo.draft) return local;
  return { ...local, agents,
    saveAgent: async (agent: AgentDefinition) => { repo.edit(data => { data.agents[agent.id] = agent; }); },
    deleteAgent: async (id: string) => { repo.edit(data => { delete data.agents[id]; }); },
    duplicateAgent: async (id: string) => {
      const agent = structuredClone(repo.draft!.agents[id]); if (!agent) return null;
      agent.id = `${id}_copy_${crypto.randomUUID()}`; agent.name += ' (副本)';
      repo.edit(data => { data.agents[agent.id] = agent; }); return agent;
    },
    resetBuiltinAgents: async () => { throw new Error('仓库默认请通过 Git 恢复'); },
  };
}

export function useGroupEditorStore() {
  const local = useAgentGroupStore(); const repo = useRepositoryStore();
  const groups = useMemo(() => Object.values(repo.draft?.groups ?? {}), [repo.draft?.groups]);
  if (repo.target === 'local' || !repo.draft) return local;
  return { ...local, groups, activeGroupId: '',
    setActiveGroup: async () => { throw new Error('请先应用到本机，再在本机配置选择组'); },
    saveGroup: async (group: AgentGroup) => { repo.edit(data => { data.groups[group.id] = group; }); },
    deleteGroup: async (id: string) => { repo.edit(data => { delete data.groups[id]; }); },
    duplicateGroup: async (id: string) => {
      const group = structuredClone(repo.draft!.groups[id]); if (!group) return null;
      group.id = `${id}_copy_${crypto.randomUUID()}`; group.name += ' (副本)';
      repo.edit(data => { data.groups[group.id] = group; }); return group;
    },
    updateBinding: (async (groupId, agentId, updates) => {
      repo.edit(data => {
        const group = data.groups[groupId];
        let binding = group.bindings.find(b => b.agentId === agentId);
        if (!binding) { binding = { agentId, backendId: 'backend_openrouter', model: '' }; group.bindings.push(binding); }
        const overrides = { ...binding.overrides, ...updates.overrides };
        Object.assign(binding, updates, { overrides });
      });
    }) as typeof local.updateBinding,
  };
}
