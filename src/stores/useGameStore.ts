import { createStorySave, getStoryWorkflow } from '../engine/library/Library';
import { useLibraryStore } from './useLibraryStore';
import { editSaveSchema } from "../engine/character-schema/EditSchema";
import { CharacterSchemaDefinition } from "../types";
import { create } from "zustand";
import { GameSave, GameTurn, WorldState } from "../types";
import { safePipelineError } from '../engine/errors/PipelineStageError';
import { storageService } from "../db/storage";
import { useAgentStore } from "./useAgentStore";
import { useAgentGroupStore } from "./useAgentGroupStore";
import { useBackendStore } from "./useBackendStore";
import { useSettingsStore } from "./useSettingsStore";
import { globalTraceManager } from "../engine/tracing/TraceManager";
import { migrateToText } from '../engine/text/Migration';
import { storyWorkflow } from '../engine/workflows/StoryTurn';

interface GameState {
  migrateActiveToText: () => Promise<void>;
  saveCharacterSchema: (schema: CharacterSchemaDefinition, newWorld?: boolean) => Promise<void>;
  activeSave: GameSave | null;
  saves: GameSave[];
  isExecuting: boolean;
  executionError: string | null;
  currentTraceId: string | null;
  pendingPlayerInput: string | null;
  loadSaves: () => Promise<void>;
  selectSave: (saveId: string) => void;
  createNewSave: (name?: string) => Promise<GameSave>;
  deleteSave: (saveId: string) => Promise<void>;
  manualSaveGame: () => Promise<void>;
  sendPlayerInput: (input: string) => Promise<boolean>;
  retryTurn: (turnIndex?: number) => Promise<boolean>;
  switchTurnVariation: (turnIndex: number, variationIndex: number) => Promise<void>;
  cancelGeneration: () => string | null;
}

let activeAbortController: AbortController | null = null;
let textCommitInProgress = false;

export const useGameStore = create<GameState>((set, get) => ({
  migrateActiveToText: async () => {
    const {activeSave,isExecuting} = get(); if (!activeSave || isExecuting || activeSave.textWorld) return;
    set({isExecuting:true});
    try {
      const candidate = migrateToText(activeSave);
      await storageService.commitTextGame(candidate,null);
      set(s=>({saves:s.saves.map(old=>old.id===candidate.id?candidate:old),activeSave:s.activeSave?.id===candidate.id?candidate:s.activeSave}));
    } finally {set({isExecuting:false});}
  },
  saveCharacterSchema: async (schema, newWorld = false) => {
    const { activeSave, isExecuting } = get();
    if (!activeSave || isExecuting) throw new Error('请等待当前回合完成再编辑 Schema');
    const candidate = editSaveSchema(activeSave, schema, newWorld);
    set({ isExecuting: true });
    try {
      await storageService.saveGame(candidate);
      set({ saves: newWorld ? [...get().saves, candidate] : get().saves.map(s => s.id === candidate.id ? candidate : s), activeSave: get().activeSave?.id === activeSave.id ? candidate : get().activeSave });
    } finally { set({ isExecuting: false }); }
  },
  activeSave: null,
  saves: [],
  isExecuting: false,
  executionError: null,
  currentTraceId: null,
  pendingPlayerInput: null,

  loadSaves: async () => {
    const saves = await storageService.getSaves();
    saves.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    const active = saves.length > 0 ? saves[0] : null;
    set({ saves, activeSave: active, currentTraceId: active?.turns[active.turns.length - 1]?.traceId ?? null });
  },

  selectSave: (saveId: string) => {
    const save = get().saves.find((s) => s.id === saveId);
    if (save) {
      set({ activeSave: save, executionError: null, currentTraceId: save.turns[save.turns.length - 1]?.traceId ?? null });
    }
  },

  createNewSave: async (storyId?: string) => {
    if (get().isExecuting) throw new Error('请等待当前操作完成');
    const { record } = useLibraryStore.getState();
    const id = storyId || record.data.selectedStoryId;
    if (!id) throw new Error('请先选择故事');
    const activeGroupId = useAgentGroupStore.getState().activeGroupId || 'group_quality';
    const newSave = createStorySave(record.data, id, activeGroupId);
    set({ isExecuting: true });
    try {
      await storageService.commitTextGame(newSave, null);
      set(s => ({ saves: [newSave, ...s.saves], activeSave: newSave, executionError: null, currentTraceId: null }));
      return newSave;
    } finally { set({ isExecuting: false }); }
  },

  deleteSave: async (saveId: string) => {
    await storageService.deleteGame(saveId);
    const saves = get().saves.filter((save) => save.id !== saveId);
    const currentActive = get().activeSave;
    const nextActive = currentActive?.id === saveId ? (saves.length > 0 ? saves[0] : null) : currentActive;
    set({ saves, activeSave: nextActive, currentTraceId: nextActive?.turns[nextActive.turns.length - 1]?.traceId ?? null });
  },

  manualSaveGame: async () => {
    const { activeSave } = get();
    if (!activeSave) return;
    await storageService.saveGame(activeSave);
    // Keep unsaved progress in other saves intact.
  },

  sendPlayerInput: async (input: string) => {
    const { activeSave, isExecuting } = get();
    if (!activeSave || isExecuting || !input.trim()) return false;

    const abortController = new AbortController();
    activeAbortController = abortController;

    set({ isExecuting: true, executionError: null, pendingPlayerInput: input });

    const agents = useAgentStore.getState().agents;
    const groups = useAgentGroupStore.getState().groups;
    const backends = useBackendStore.getState().backends;
    const activeGroupId = useAgentGroupStore.getState().activeGroupId;
    const previousTraceId = activeSave.turns[activeSave.turns.length - 1]?.traceId ?? null;
    let runningTextTraceId: string | null = null;

    try {
      if (!activeSave.textWorld) throw new Error('旧状态管线已退役，请先迁移为文本存档');
      {
        const candidate = await storyWorkflow.execute(activeSave,input,{workflow:getStoryWorkflow(useLibraryStore.getState().record.data),agents,groups,backends,activeGroupId,mockMode:useSettingsStore.getState().settings.mockLlmMode,signal:abortController.signal,onTraceStarted:traceId=>{
          runningTextTraceId = traceId;
          if (get().activeSave?.id === activeSave.id && !abortController.signal.aborted) set({currentTraceId:traceId});
        }});
        abortController.signal.throwIfAborted();
        if (!get().saves.some(s=>s.id===activeSave.id)) throw new Error('存档已被移除');
        textCommitInProgress = true;
        try { await storageService.commitTextGame(candidate,activeSave.textWorld.revision); }
        finally {textCommitInProgress=false;}
        const traceId = candidate.turns[candidate.turns.length-1].traceId;
        for (const span of globalTraceManager.getTrace(traceId)?.spans || []) {
          if (span.type === 'text_commit') globalTraceManager.updateSpan(traceId, span.id, { name: '正文与人物状态 · 已保存', parsedOutput: { ...(span.parsedOutput as object), committed: true } });
        }
        globalTraceManager.endTurnTrace(traceId,'success');
        const trace = globalTraceManager.getTrace(traceId); if (trace) await storageService.saveTrace(trace).catch(()=>{});
        set(s=>({saves:s.saves.map(old=>old.id===candidate.id?candidate:old),activeSave:s.activeSave?.id===candidate.id?candidate:s.activeSave,isExecuting:false,pendingPlayerInput:null,executionError:null}));
        return true;
      }
    } catch (err: any) {
      if (runningTextTraceId) {
        if (!abortController.signal.aborted && globalTraceManager.isActiveTrace(runningTextTraceId)) {
          const failureId = `failure_${crypto.randomUUID()}`;
          globalTraceManager.createSpan(runningTextTraceId, failureId, '回合失败 · 未提交保存', 'text_failure');
          globalTraceManager.updateSpan(runningTextTraceId, failureId, { status: 'error', error: err instanceof Error ? err.message : String(err) });
        }
        globalTraceManager.endTurnTrace(runningTextTraceId,abortController.signal.aborted?'cancelled':'error');
        const failedTrace = globalTraceManager.getTrace(runningTextTraceId);
        if (failedTrace) await storageService.saveTrace(failedTrace).catch(() => {});
      }
      const isAbort = err?.name === "AbortError" || abortController.signal.aborted;
      if (activeAbortController === abortController) {
        activeAbortController = null;
      }
      set({
        isExecuting: false,
        pendingPlayerInput: null,
        executionError: isAbort ? null : (get().activeSave?.id === activeSave.id ? safePipelineError(err) : get().executionError),
        currentTraceId: isAbort ? (get().activeSave?.id === activeSave.id ? previousTraceId : get().currentTraceId) : get().currentTraceId,
      });
      return false;
    } finally {
      if (activeAbortController === abortController) {
        activeAbortController = null;
      }
    }
  },

  retryTurn: async () => { set({executionError:'已提交回合保留在历史中；请继续输入，或在独立存档中比较其他回应。'}); return false; },

  cancelGeneration: () => {
    const { pendingPlayerInput, activeSave } = get();
    if (textCommitInProgress) return null; // The atomic storage operation has already begun.
    const savedInput = pendingPlayerInput;
    if (activeSave?.textWorld && activeAbortController) {activeAbortController.abort();return savedInput;}

    if (activeAbortController) {
      activeAbortController.abort();
      activeAbortController = null;
    }

    const previousTraceId = activeSave?.turns[activeSave.turns.length - 1]?.traceId ?? null;

    set({
      isExecuting: false,
      pendingPlayerInput: null,
      executionError: null,
      currentTraceId: previousTraceId,
    });

    return savedInput;
  },

  // Historical variations remain readable; the retired state pipeline cannot replay them.
  switchTurnVariation: async () => {},
}));
