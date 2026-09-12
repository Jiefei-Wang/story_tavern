import test from "node:test";
import assert from "node:assert/strict";
import { StorageService, DEFAULT_SETTINGS } from "../src/db/storage";
import { INITIAL_DEMO_SAVE, BUILTIN_AGENTS } from "../src/db/initialData";
import { useGameStore } from "../src/stores/useGameStore";
import { useSettingsStore } from "../src/stores/useSettingsStore";
import { useAgentStore } from "../src/stores/useAgentStore";
import { gamePipeline } from "../src/engine/pipeline/GamePipeline";

test("reload resumes the most recently saved game instead of the first seeded save", async () => {
  const storage = new StorageService();
  const recent = { ...structuredClone(INITIAL_DEMO_SAVE), id: "recent", updatedAt: "2099-01-01T00:00:00.000Z" };
  await storage.saveGame({ ...recent, id: "old", updatedAt: "2000-01-01T00:00:00.000Z" });
  await storage.saveGame(recent);
  await useGameStore.getState().loadSaves();
  assert.equal(useGameStore.getState().activeSave?.id, recent.id);
  assert.equal(useGameStore.getState().currentTraceId, recent.turns[recent.turns.length - 1].traceId);
  await storage.deleteGame(recent.id);
});

test("concurrent browser saves and deletion preserve unrelated records", async () => {
  const storage = new StorageService();
  const a = { ...structuredClone(INITIAL_DEMO_SAVE), id: "concurrent_a" };
  const b = { ...structuredClone(INITIAL_DEMO_SAVE), id: "concurrent_b" };
  await Promise.all([storage.saveGame(a), storage.saveGame(b)]);
  assert.ok((await storage.getSaves()).some(s => s.id === a.id));
  assert.ok((await storage.getSaves()).some(s => s.id === b.id));
  await Promise.all([storage.deleteGame(a.id), storage.saveGame({ ...b, name: "updated" })]);
  const saves = await storage.getSaves();
  assert.ok(!saves.some(s => s.id === a.id));
  assert.equal(saves.find(s => s.id === b.id)?.name, "updated");
});

test("save management preserves unsaved progress in other saves", async () => {
  useGameStore.setState({ saves: [], activeSave: null, isExecuting: false });
  const a = await useGameStore.getState().createNewSave("A");
  const dirty = { ...a, name: "unsaved progress" };
  useGameStore.setState({ activeSave: dirty, saves: [dirty] });
  const b = await useGameStore.getState().createNewSave("B");
  assert.equal(useGameStore.getState().saves.find(s => s.id === a.id), dirty);
  await useGameStore.getState().manualSaveGame();
  assert.equal(useGameStore.getState().saves.find(s => s.id === a.id), dirty);
  await useGameStore.getState().deleteSave(b.id);
  assert.equal(useGameStore.getState().activeSave, dirty);
});

test("selecting current variation or invalid indexes does not truncate history", async () => {
  const save = structuredClone(INITIAL_DEMO_SAVE);
  const turn = save.turns[0];
  turn.variations = [{ ...turn }, { ...turn, id: "alternative" }];
  turn.activeVariationIndex = 0;
  save.turns.push({ ...turn, id: "later" });
  useGameStore.setState({ activeSave: save, saves: [save], isExecuting: false });
  await useGameStore.getState().switchTurnVariation(0, 0);
  await useGameStore.getState().switchTurnVariation(NaN, 1);
  await useGameStore.getState().switchTurnVariation(0, 0.5);
  assert.equal(await useGameStore.getState().retryTurn(NaN), false);
  assert.equal(useGameStore.getState().activeSave, save);
  useGameStore.setState({ isExecuting: true });
  await useGameStore.getState().switchTurnVariation(0, 1);
  assert.equal(useGameStore.getState().activeSave, save);
  useGameStore.setState({ isExecuting: false });
});

for (const operation of ["send", "retry"] as const) {
  test(`${operation} completing after save selection preserves the selected save`, async (t) => {
    useSettingsStore.setState({ settings: { ...DEFAULT_SETTINGS, autosave: false, mockLlmMode: true } });
    useAgentStore.setState({ agents: BUILTIN_AGENTS });
    const a = structuredClone(INITIAL_DEMO_SAVE);
    a.id = "running";
    a.turns[0].playerInput = "hello";
    const b = { ...structuredClone(a), id: "selected" };
    useGameStore.setState({ activeSave: a, saves: [a, b], isExecuting: false });
    let finish!: () => void;
    const gate = new Promise<void>(resolve => { finish = resolve; });
    t.mock.method(gamePipeline, "executeTurn", async () => {
      await gate;
      return { success: true, traceId: "completed", turn: { ...a.turns[0], id: "new", traceId: "completed" } };
    });
    const pending = operation === "send"
      ? useGameStore.getState().sendPlayerInput("hello")
      : useGameStore.getState().retryTurn(0);
    useGameStore.getState().selectSave(b.id);
    finish();
    assert.equal(await pending, true);
    assert.equal(useGameStore.getState().activeSave, b);
    assert.equal(useGameStore.getState().currentTraceId, b.turns[0].traceId);
    assert.equal(useGameStore.getState().saves.find(s => s.id === a.id)?.turns.at(-1)?.traceId, "completed");
  });
}
