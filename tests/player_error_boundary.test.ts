import test from "node:test";
import assert from "node:assert/strict";
import { useGameStore } from "../src/stores/useGameStore";
import { useSettingsStore } from "../src/stores/useSettingsStore";
import { gamePipeline } from "../src/engine/pipeline/GamePipeline";
import { INITIAL_DEMO_SAVE } from "../src/db/initialData";
import type { GameTurn } from "../src/types";

test("send and retry banners never display raw result.error or thrown world dumps, while diagnostic error data remains available", async t => {
  const previousGame = useGameStore.getState();
  const previousSettings = useSettingsStore.getState();
  const secret = "PRIVATE_BANNER_CANARY_92841";
  const rawError = `Patch operation failed: {"entities":{"witness":{"attributes":{"privateNote":"${secret}"}}}}`;
  try {
    useSettingsStore.setState({ settings: { ...previousSettings.settings, autosave: false } });
    for (const operation of ["send", "retry"] as const) for (const mode of ["result", "throw"] as const) {
      const save = structuredClone(INITIAL_DEMO_SAVE);
      const baseline: GameTurn = {
        id: "banner_baseline", turnIndex: 1, timestamp: "2026-09-12T12:00:00Z", playerInput: "向证人问候",
        narratorOutput: "证人回应了问候。", traceId: "banner_previous", worldStateBefore: structuredClone(save.worldState), worldStateAfter: structuredClone(save.worldState), patches: [], activeAgentGroupId: save.activeAgentGroupId,
      };
      save.turns = [baseline];
      useGameStore.setState({ activeSave: save, saves: [save], isExecuting: false, executionError: null, pendingPlayerInput: null });
      const rawResult = { success: false, traceId: `banner_${operation}_${mode}`, error: rawError, turn: { ...baseline, id: "banner_failed", status: "error" as const, error: rawError, narratorOutput: "本轮处理未完成。" } };
      const mock = t.mock.method(gamePipeline, "executeTurn", async () => {
        if (mode === "throw") throw new Error(rawError);
        return rawResult;
      });
      const completed = operation === "send" ? await useGameStore.getState().sendPlayerInput("继续询问") : await useGameStore.getState().retryTurn(0);
      mock.mock.restore();
      assert.equal(completed, false);
      const state = useGameStore.getState();
      assert.match(state.executionError || "", /未完成/);
      assert.doesNotMatch(state.executionError || "", /PRIVATE_BANNER_CANARY|entities|privateNote|Patch operation failed/);
      assert.deepEqual(state.activeSave!.worldState, save.worldState);
      if (operation === "retry") assert.deepEqual(state.activeSave!.turns, [baseline]);
      assert.equal(rawResult.error, rawError);
      if (operation === "send" && mode === "result") assert.equal(state.activeSave!.turns.at(-1)!.error, rawError);
    }
  } finally {
    useGameStore.setState(previousGame, true);
    useSettingsStore.setState(previousSettings, true);
  }
});
