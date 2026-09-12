import { create } from "zustand";
import { GameSave, GameTurn, WorldState } from "../types";
import { INITIAL_HARBOR_TAVERN_WORLD } from "../engine/world/WorldState";
import { gamePipeline } from "../engine/pipeline/GamePipeline";
import { storageService } from "../db/storage";
import { useAgentStore } from "./useAgentStore";
import { useAgentGroupStore } from "./useAgentGroupStore";
import { useBackendStore } from "./useBackendStore";
import { useSettingsStore } from "./useSettingsStore";

interface GameState {
  activeSave: GameSave | null;
  saves: GameSave[];
  isExecuting: boolean;
  executionError: string | null;
  currentTraceId: string | null;
  loadSaves: () => Promise<void>;
  selectSave: (saveId: string) => void;
  createNewSave: (name?: string) => Promise<GameSave>;
  sendPlayerInput: (input: string) => Promise<boolean>;
  retryTurn: (turnIndex?: number) => Promise<boolean>;
  switchTurnVariation: (turnIndex: number, variationIndex: number) => Promise<void>;
}

export const useGameStore = create<GameState>((set, get) => ({
  activeSave: null,
  saves: [],
  isExecuting: false,
  executionError: null,
  currentTraceId: null,

  loadSaves: async () => {
    const saves = await storageService.getSaves();
    const active = saves.length > 0 ? saves[0] : null;
    set({ saves, activeSave: active });
  },

  selectSave: (saveId: string) => {
    const save = get().saves.find((s) => s.id === saveId);
    if (save) {
      set({ activeSave: save, executionError: null });
    }
  },

  createNewSave: async (name: string = "新游戏") => {
    const newSave: GameSave = {
      id: `save_${Date.now()}`,
      name: `${name} · ${new Date().toLocaleTimeString("zh-CN")}`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      worldState: JSON.parse(JSON.stringify(INITIAL_HARBOR_TAVERN_WORLD)),
      activeAgentGroupId: useAgentGroupStore.getState().activeGroupId || "group_quality",
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
          activeAgentGroupId: "group_quality",
        },
      ],
    };

    await storageService.saveGame(newSave);
    const saves = await storageService.getSaves();
    set({ saves, activeSave: newSave, executionError: null });
    return newSave;
  },

  sendPlayerInput: async (input: string) => {
    const { activeSave, isExecuting } = get();
    if (!activeSave || isExecuting || !input.trim()) return false;

    set({ isExecuting: true, executionError: null });

    const agents = useAgentStore.getState().agents;
    const groups = useAgentGroupStore.getState().groups;
    const backends = useBackendStore.getState().backends;
    const activeGroupId = useAgentGroupStore.getState().activeGroupId;
    const mockMode = useSettingsStore.getState().settings.mockLlmMode;

    const currentWorld = activeSave.worldState;
    const nextTurnIndex = activeSave.turns.length;

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
        }
      );

      const updatedSave: GameSave = {
        ...activeSave,
        worldState: result.turn.worldStateAfter,
        turns: [...activeSave.turns, result.turn],
        updatedAt: new Date().toISOString(),
      };

      await storageService.saveGame(updatedSave);

      const saves = get().saves.map((s) => (s.id === updatedSave.id ? updatedSave : s));
      set({
        activeSave: updatedSave,
        saves,
        isExecuting: false,
        currentTraceId: result.traceId,
        executionError: result.success ? null : result.error || "Turn failed",
      });

      return result.success;
    } catch (err: any) {
      set({
        isExecuting: false,
        executionError: err?.message || String(err),
      });
      return false;
    }
  },

  retryTurn: async (turnIndex?: number) => {
    const { activeSave, isExecuting } = get();
    if (!activeSave || isExecuting || activeSave.turns.length === 0) return false;

    const targetIndex = turnIndex !== undefined ? turnIndex : activeSave.turns.length - 1;
    if (targetIndex < 0 || targetIndex >= activeSave.turns.length) return false;

    const targetTurn = activeSave.turns[targetIndex];
    const playerInput = targetTurn.playerInput;
    if (!playerInput || playerInput === "(游戏开始)" || playerInput === "(新游戏开始)") return false;

    set({ isExecuting: true, executionError: null });

    const agents = useAgentStore.getState().agents;
    const groups = useAgentGroupStore.getState().groups;
    const backends = useBackendStore.getState().backends;
    const activeGroupId = useAgentGroupStore.getState().activeGroupId;
    const mockMode = useSettingsStore.getState().settings.mockLlmMode;

    const initialWorld = targetTurn.worldStateBefore;

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
        }
      );

      // Branching: Initialize or update variations
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

      const newTurns = [...activeSave.turns];
      newTurns[targetIndex] = updatedTurn;

      const newWorldState =
        targetIndex === activeSave.turns.length - 1
          ? result.turn.worldStateAfter
          : activeSave.worldState;

      const updatedSave: GameSave = {
        ...activeSave,
        worldState: newWorldState,
        turns: newTurns,
        updatedAt: new Date().toISOString(),
      };

      await storageService.saveGame(updatedSave);

      const saves = get().saves.map((s) => (s.id === updatedSave.id ? updatedSave : s));
      set({
        activeSave: updatedSave,
        saves,
        isExecuting: false,
        currentTraceId: result.traceId,
        executionError: result.success ? null : result.error || "Retry failed",
      });

      return result.success;
    } catch (err: any) {
      set({
        isExecuting: false,
        executionError: err?.message || String(err),
      });
      return false;
    }
  },

  switchTurnVariation: async (turnIndex: number, variationIndex: number) => {
    const { activeSave } = get();
    if (!activeSave || turnIndex < 0 || turnIndex >= activeSave.turns.length) return;

    const targetTurn = activeSave.turns[turnIndex];
    if (
      !targetTurn.variations ||
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

    const newTurns = [...activeSave.turns];
    newTurns[turnIndex] = updatedTurn;

    const newWorldState =
      turnIndex === activeSave.turns.length - 1
        ? selectedVariation.worldStateAfter
        : activeSave.worldState;

    const updatedSave: GameSave = {
      ...activeSave,
      worldState: newWorldState,
      turns: newTurns,
      updatedAt: new Date().toISOString(),
    };

    await storageService.saveGame(updatedSave);

    const saves = get().saves.map((s) => (s.id === updatedSave.id ? updatedSave : s));
    set({
      activeSave: updatedSave,
      saves,
      currentTraceId: selectedVariation.traceId,
    });
  },
}));
