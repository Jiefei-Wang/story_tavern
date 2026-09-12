import { create } from "zustand";
import { GameSave, GameTurn, WorldState } from "../types";
import { INITIAL_HARBOR_TAVERN_WORLD } from "../engine/world/WorldState";
import { gamePipeline } from "../engine/pipeline/GamePipeline";
import { storageService } from "../db/storage";
import { useAgentStore } from "./useAgentStore";
import { useAgentGroupStore } from "./useAgentGroupStore";
import { useBackendStore } from "./useBackendStore";
import { useSettingsStore } from "./useSettingsStore";
import { globalTraceManager } from "../engine/tracing/TraceManager";

interface GameState {
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

export const useGameStore = create<GameState>((set, get) => ({
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

  createNewSave: async (name: string = "新游戏") => {
    const activeGroupId = useAgentGroupStore.getState().activeGroupId || "group_quality";
    const newSave: GameSave = {
      id: `save_${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}_${Math.random().toString(36).slice(2)}`}`,
      name: `${name} · ${new Date().toLocaleTimeString("zh-CN")}`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      worldState: JSON.parse(JSON.stringify(INITIAL_HARBOR_TAVERN_WORLD)),
      activeAgentGroupId: activeGroupId,
      turns: [
        {
          id: `turn_init_${Date.now()}`,
          turnIndex: 0,
          timestamp: new Date().toISOString(),
          playerInput: "(新游戏开始)",
          narratorOutput:
            "晨光划破了港口上空的薄雾。咸涩的海潮伴随着木橹划水的声音缓缓荡开。你站在海港酒馆外的粗木栅栏前，微凉的海风扬起你的衣角。艾琳、酒馆老板与卫兵各自伫立在晨光中，一段新的旅程正在你的眼前展开。",
          traceId: "trace_init",
          worldStateBefore: INITIAL_HARBOR_TAVERN_WORLD,
          worldStateAfter: INITIAL_HARBOR_TAVERN_WORLD,
          patches: [],
          activeAgentGroupId: activeGroupId,
          status: "success",
        },
      ],
    };

    await storageService.saveGame(newSave);
    const saves = [...get().saves, newSave];
    set({ saves, activeSave: newSave, executionError: null, currentTraceId: null });
    return newSave;
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
    const mockMode = useSettingsStore.getState().settings.mockLlmMode;
    const autosave = useSettingsStore.getState().settings.autosave;

    const currentWorld = activeSave.worldState;
    const nextTurnIndex = activeSave.turns.length;
    const previousTraceId = activeSave.turns[activeSave.turns.length - 1]?.traceId ?? null;

    try {
      const result = await gamePipeline.executeTurn(
        input,
        currentWorld,
        nextTurnIndex,
        {
          agents,
          groups,
          backends,
          activeGroupId,
          mockMode,
          signal: abortController.signal,
          onTraceStarted: (traceId) => {
            if (get().activeSave?.id === activeSave.id && !abortController.signal.aborted) {
              set({ currentTraceId: traceId });
            }
          },
        }
      );

      if (result.cancelled || abortController.signal.aborted) {
        if (activeAbortController === abortController) {
          activeAbortController = null;
        }
        set({
          isExecuting: false,
          pendingPlayerInput: null,
          executionError: null,
          currentTraceId: get().activeSave?.id === activeSave.id ? previousTraceId : get().currentTraceId,
        });
        return false;
      }

      // Persist completed trace to SQLite
      const trace = globalTraceManager.getTrace(result.traceId);
      if (trace && result.success) {
        await storageService.saveTrace(trace).catch((err) =>
          console.warn("Failed to persist trace:", err)
        );
      }

      // Rollback invariant: Only commit worldStateAfter if turn was completely successful!
      const updatedSave: GameSave = {
        ...activeSave,
        worldState: result.success ? result.turn.worldStateAfter : activeSave.worldState,
        turns: [...activeSave.turns, result.turn],
        updatedAt: new Date().toISOString(),
        activeAgentGroupId: activeGroupId,
      };

      // A save may have been deleted while the model was running.
      if (!get().saves.some((save) => save.id === activeSave.id)) {
        set({ isExecuting: false, pendingPlayerInput: null });
        return false;
      }

      if (autosave) {
        await storageService.saveGame(updatedSave);
      }

      const saves = get().saves.map((s) => (s.id === updatedSave.id ? updatedSave : s));
      set({
        activeSave: get().activeSave?.id === updatedSave.id ? updatedSave : get().activeSave,
        saves,
        isExecuting: false,
        pendingPlayerInput: null,
        currentTraceId: get().activeSave?.id === activeSave.id ? result.traceId : get().currentTraceId,
        executionError: get().activeSave?.id === activeSave.id
          ? (result.success ? null : result.error || "Turn execution failed") : get().executionError,
      });

      return result.success;
    } catch (err: any) {
      const isAbort = err?.name === "AbortError" || abortController.signal.aborted;
      if (activeAbortController === abortController) {
        activeAbortController = null;
      }
      set({
        isExecuting: false,
        pendingPlayerInput: null,
        executionError: isAbort ? null : (get().activeSave?.id === activeSave.id ? err?.message || String(err) : get().executionError),
        currentTraceId: isAbort ? (get().activeSave?.id === activeSave.id ? previousTraceId : get().currentTraceId) : get().currentTraceId,
      });
      return false;
    } finally {
      if (activeAbortController === abortController) {
        activeAbortController = null;
      }
    }
  },

  retryTurn: async (turnIndex?: number) => {
    const { activeSave, isExecuting } = get();
    if (!activeSave || isExecuting || activeSave.turns.length === 0) return false;

    const targetIndex = turnIndex !== undefined ? turnIndex : activeSave.turns.length - 1;
    if (!Number.isInteger(targetIndex) || targetIndex < 0 || targetIndex >= activeSave.turns.length) return false;

    const targetTurn = activeSave.turns[targetIndex];
    const playerInput = targetTurn.playerInput;
    if (!playerInput || playerInput === "(游戏开始)" || playerInput === "(新游戏开始)") return false;

    const abortController = new AbortController();
    activeAbortController = abortController;

    set({ isExecuting: true, executionError: null, pendingPlayerInput: playerInput });

    const agents = useAgentStore.getState().agents;
    const groups = useAgentGroupStore.getState().groups;
    const backends = useBackendStore.getState().backends;
    const activeGroupId = useAgentGroupStore.getState().activeGroupId;
    const mockMode = useSettingsStore.getState().settings.mockLlmMode;
    const autosave = useSettingsStore.getState().settings.autosave;

    const initialWorld = targetTurn.worldStateBefore;
    const previousTraceId = activeSave.turns[activeSave.turns.length - 1]?.traceId ?? null;

    try {
      const result = await gamePipeline.executeTurn(
        playerInput,
        initialWorld,
        targetTurn.turnIndex,
        {
          agents,
          groups,
          backends,
          activeGroupId,
          mockMode,
          signal: abortController.signal,
          onTraceStarted: (traceId) => {
            if (get().activeSave?.id === activeSave.id && !abortController.signal.aborted) {
              set({ currentTraceId: traceId });
            }
          },
        }
      );

      if (result.cancelled || abortController.signal.aborted) {
        if (activeAbortController === abortController) {
          activeAbortController = null;
        }
        set({
          isExecuting: false,
          pendingPlayerInput: null,
          executionError: null,
          currentTraceId: get().activeSave?.id === activeSave.id ? previousTraceId : get().currentTraceId,
        });
        return false;
      }

      const trace = globalTraceManager.getTrace(result.traceId);
      if (trace && result.success) {
        await storageService.saveTrace(trace).catch((err) =>
          console.warn("Failed to persist trace:", err)
        );
      }

      // Retry Failure Protection: If turn execution failed, DO NOT mutate history or world state!
      if (!result.success) {
        set({
          isExecuting: false,
          pendingPlayerInput: null,
          currentTraceId: get().activeSave?.id === activeSave.id ? result.traceId : get().currentTraceId,
          executionError: get().activeSave?.id === activeSave.id ? result.error || "Retry failed" : get().executionError,
        });
        return false;
      }

      // ONLY ON SUCCESS: Branching, variations, truncation and world state update
      const existingVariations: GameTurn[] =
        targetTurn.variations && targetTurn.variations.length > 0
          ? [...targetTurn.variations]
          : [{ ...targetTurn }];

      const newVariation: GameTurn = {
        ...result.turn,
        id: `turn_${Date.now()}_var_${existingVariations.length}`,
      };

      const updatedVariations = [...existingVariations, newVariation];
      const newActiveVariationIndex = updatedVariations.length - 1;

      const updatedTurn: GameTurn = {
        ...newVariation,
        variations: updatedVariations,
        activeVariationIndex: newActiveVariationIndex,
      };

      // Causal consistency: Truncate any turns after targetIndex, branching a new timeline!
      const newTurns = activeSave.turns.slice(0, targetIndex + 1);
      newTurns[targetIndex] = updatedTurn;

      const newWorldState = result.turn.worldStateAfter;

      const updatedSave: GameSave = {
        ...activeSave,
        worldState: newWorldState,
        turns: newTurns,
        updatedAt: new Date().toISOString(),
        activeAgentGroupId: activeGroupId,
      };

      // A save may have been deleted while the model was running.
      if (!get().saves.some((save) => save.id === activeSave.id)) {
        set({ isExecuting: false, pendingPlayerInput: null });
        return false;
      }

      if (autosave) {
        await storageService.saveGame(updatedSave);
      }

      const saves = get().saves.map((s) => (s.id === updatedSave.id ? updatedSave : s));
      set({
        activeSave: get().activeSave?.id === updatedSave.id ? updatedSave : get().activeSave,
        saves,
        isExecuting: false,
        pendingPlayerInput: null,
        currentTraceId: get().activeSave?.id === activeSave.id ? result.traceId : get().currentTraceId,
        executionError: null,
      });

      return true;
    } catch (err: any) {
      const isAbort = err?.name === "AbortError" || abortController.signal.aborted;
      if (activeAbortController === abortController) {
        activeAbortController = null;
      }
      set({
        isExecuting: false,
        pendingPlayerInput: null,
        executionError: isAbort ? null : (get().activeSave?.id === activeSave.id ? err?.message || String(err) : get().executionError),
        currentTraceId: isAbort ? (get().activeSave?.id === activeSave.id ? previousTraceId : get().currentTraceId) : get().currentTraceId,
      });
      return false;
    } finally {
      if (activeAbortController === abortController) {
        activeAbortController = null;
      }
    }
  },

  cancelGeneration: () => {
    const { pendingPlayerInput, activeSave } = get();
    const savedInput = pendingPlayerInput;

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

  switchTurnVariation: async (turnIndex: number, variationIndex: number) => {
    const { activeSave, isExecuting } = get();
    if (isExecuting || !Number.isInteger(turnIndex) || !activeSave || turnIndex < 0 || turnIndex >= activeSave.turns.length) return;

    const targetTurn = activeSave.turns[turnIndex];
    if (
      !Number.isInteger(variationIndex) ||
      !targetTurn.variations ||
      variationIndex === (targetTurn.activeVariationIndex ?? 0) ||
      variationIndex < 0 ||
      variationIndex >= targetTurn.variations.length
    ) {
      return;
    }

    const selectedVariation = targetTurn.variations[variationIndex];

    const updatedTurn: GameTurn = {
      ...selectedVariation,
      variations: targetTurn.variations,
      activeVariationIndex: variationIndex,
    };

    // Causal consistency: Truncate any turns after turnIndex, establishing chosen variation as head of timeline!
    const newTurns = activeSave.turns.slice(0, turnIndex + 1);
    newTurns[turnIndex] = updatedTurn;

    const newWorldState = selectedVariation.worldStateAfter;

    const updatedSave: GameSave = {
      ...activeSave,
      worldState: newWorldState,
      turns: newTurns,
      updatedAt: new Date().toISOString(),
    };

    set({ isExecuting: true });
    try {
      const autosave = useSettingsStore.getState().settings.autosave;
      if (autosave) {
        await storageService.saveGame(updatedSave);
      }

      const saves = get().saves.map((s) => (s.id === updatedSave.id ? updatedSave : s));
      set({
        activeSave: get().activeSave?.id === updatedSave.id ? updatedSave : get().activeSave,
        saves,
        currentTraceId: get().activeSave?.id === updatedSave.id ? selectedVariation.traceId : get().currentTraceId,
      });
    } finally {
      set({ isExecuting: false });
    }
  },
}));
