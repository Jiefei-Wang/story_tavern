import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useGameStore } from "../stores/useGameStore";
import { useSettingsStore } from "../stores/useSettingsStore";
import { useBackendStore } from "../stores/useBackendStore";
import { globalTraceManager } from "../engine/tracing/TraceManager";

let initialized = false;
export async function initializeTestControl() {
  if (initialized) return;
  initialized = true;
  const unlisten = await listen<{ id: string; action: string; input?: string; index?: number; variation?: number; enabled?: boolean }>("test-control-request", async ({ payload }) => {
    try {
      const game = useGameStore.getState();
      let result: unknown;
      switch (payload.action) {
        case "state": result = { activeSave: game.activeSave, saves: game.saves.map(s => ({ id: s.id, name: s.name })), isExecuting: game.isExecuting, error: game.executionError, dataDirectory: useSettingsStore.getState().dataDirectory }; break;
        case "newGame": result = await game.createNewSave("API 实机测试"); break;
        case "send": result = await game.sendPlayerInput(payload.input ?? ""); break;
        case "sendAsync": void game.sendPlayerInput(payload.input ?? ""); result = true; break;
        case "progress": result = { isExecuting: game.isExecuting, error: game.executionError, trace: game.currentTraceId ? globalTraceManager.getTrace(game.currentTraceId) : null }; break;
        case "retry": result = await game.retryTurn(payload.index); break;
        case "variation": await game.switchTurnVariation(payload.index ?? -1, payload.variation ?? -1); result = true; break;
        case "save": await game.manualSaveGame(); result = true; break;
        case "mock": await useSettingsStore.getState().setMockMode(payload.enabled === true); result = true; break;
        case "connection": {
          const store = useBackendStore.getState();
          result = await store.testConnection(store.backends.find(b => b.id === "backend_openrouter") ?? store.backends[0]);
          break;
        }
        default: throw new Error("Unsupported control action");
      }
      await invoke("test_control_reply", { id: payload.id, result: { result } });
    } catch (error) {
      await invoke("test_control_reply", { id: payload.id, result: { error: String(error) } });
    }
  });
  try {
    if (!await invoke<boolean>("test_control_start")) unlisten();
  } catch (error) { unlisten(); console.warn("Test control unavailable", error); }
}
