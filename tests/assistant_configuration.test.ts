import test from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";
import { assistantResources, executeAssistantChanges, planAssistantChanges, readAssistantConfiguration, Resources } from "../src/engine/assistantConfiguration";
import { assistantReplySchema } from "../src/engine/modelAssistant";
import { useAgentStore } from "../src/stores/useAgentStore";
import { useAgentGroupStore } from "../src/stores/useAgentGroupStore";
import { useBackendStore } from "../src/stores/useBackendStore";
import { useSettingsStore } from "../src/stores/useSettingsStore";
import { useGameStore } from "../src/stores/useGameStore";
import { storageService } from "../src/db/storage";

function fixture(): Resources {
  return {
    agents: { a: { id: "a", name: "Agent", description: "", messages: [{ id: "s", role: "system", content: "Hello", futureMessage: true }], inputs: [], outputSchema: null, defaults: { futureParameter: "keep" }, futureAgent: { nested: true } } },
    groups: { g: { id: "g", name: "Group", bindings: [{ agentId: "a", backendId: "b", model: "m" }] } },
    backends: { b: { id: "b", name: "Backend", baseUrl: "http://localhost/v1", authType: "none", enabled: true, timeoutMs: 1000, maxConcurrency: 1 } },
    settings: { language: "zh-CN", theme: "light", developerMode: true, mockLlmMode: false, autosave: true, logLevel: "info", futureSetting: { enabled: true } },
    saves: { s: { id: "s", name: "Save", activeAgentGroupId: "g", worldState: { clock: "2026-01-01T00:00:00Z", scene: { location: "tavern", weather: "clear", lighting: "day" }, entities: { player: { type: "character", name: "Player" } }, rules: { futureRule: 3 } } } },
    selection: { activeGroupId: "g", activeSaveId: "s" }, assistant: { backendId: "b", model: "m" },
  };
}
function reply(...actions: unknown[]) { return assistantReplySchema.parse({ reply: "", actions }); }
const patch = (resource: string, path: string, value: unknown) => ({ type: "patch_config", resource, patches: [{ op: "replace", path, value }] });

test("whole-game patches preserve future fields and support old saves", () => {
  const before = fixture();
  const next = planAssistantChanges(reply(patch("settings", "/autosave", false), patch("backends", "/b/maxConcurrency", 8), patch("saves", "/s/worldState/scene/weather", "rain"), patch("agents", "/a/messages/0/content", "New prompt")), before);
  assert.equal(next.settings.autosave, false);
  assert.equal(next.backends.b.maxConcurrency, 8);
  assert.equal(next.saves.s.worldState.scene.weather, "rain");
  assert.equal(next.agents.a.messages[0].futureMessage, true);
  assert.deepEqual(next.agents.a.futureAgent, before.agents.a.futureAgent);
  assert.equal(before.saves.s.worldState.scene.weather, "clear");
});

test("legacy save action preserves unknown nested fields", () => {
  const before = fixture();
  const value = structuredClone(before.agents.a);
  delete value.futureAgent; delete value.defaults.futureParameter; delete value.messages[0].futureMessage;
  value.name = "Renamed";
  const next = planAssistantChanges(reply({ type: "save_agent", value }), before);
  assert.equal(next.agents.a.name, "Renamed");
  assert.deepEqual(next.agents.a.futureAgent, { nested: true });
  assert.equal(next.agents.a.defaults.futureParameter, "keep");
  assert.equal(next.agents.a.messages[0].futureMessage, true);
});

test("rejects dangling references, world corruption, internal writes and prototype paths before saving", () => {
  const invalid = [
    { type: "patch_config", resource: "backends", patches: [{ op: "remove", path: "/b" }] },
    { type: "patch_config", resource: "saves", patches: [{ op: "remove", path: "/s/worldState/entities/player" }] },
    patch("backends", "/b/maxConcurrency", 0),
    { type: "patch_config", resource: "backends", patches: [{ op: "add", path: "/b/secretRef", value: "secret" }] },
    { type: "patch_config", resource: "saves", patches: [{ op: "add", path: "/s/turns", value: [] }] },
    { type: "patch_config", resource: "settings", patches: [{ op: "add", path: "/dataDirectory", value: "x" }] },
    { type: "patch_config", resource: "settings", patches: [{ op: "add", path: "/__proto__/polluted", value: true }] },
    patch("unknown", "/x", true),
  ];
  for (const action of invalid) assert.throws(() => planAssistantChanges(reply(action), fixture()));
  assert.equal(({} as any).polluted, undefined);
});

test("new resource registration automatically exposes its schema and supports patching", () => {
  assistantResources.future = { description: "Future feature", schema: z.object({ enabled: z.boolean() }).passthrough(), read: () => ({ enabled: true }), save: async () => {} };
  try {
    const before = { ...fixture(), future: { enabled: true, untouched: 42 } };
    const next = planAssistantChanges(reply(patch("future", "/enabled", false)), before);
    assert.deepEqual(next.future, { enabled: false, untouched: 42 });
  } finally { delete assistantResources.future; }
});

test("executor persists and syncs settings/world/backend while preserving secrets and turns; detects conflicts and cancellation", async () => {
  const memory = new Map<string, string>();
  const oldStorage = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: { getItem: (key: string) => memory.get(key) ?? null, setItem: (key: string, value: string) => memory.set(key, value), removeItem: (key: string) => memory.delete(key) } });
  const before = fixture();
  try {
    useAgentStore.setState({ agents: Object.values(before.agents) as any });
    useAgentGroupStore.setState({ groups: Object.values(before.groups) as any, activeGroupId: "g" });
    useBackendStore.setState({ backends: [{ ...before.backends.b, secretRef: "private-ref", customHeaders: { "X-Private": "private-header" } }] as any });
    useSettingsStore.setState({ settings: before.settings as any });
    const save = { ...before.saves.s, worldDefinition: { version: 1, characterSchema: { version: 1, sections: [{ id: "general", label: "基础", fields: [] }] } }, turns: [{ id: "history-keep", worldStateBefore: before.saves.s.worldState, worldStateAfter: before.saves.s.worldState }], createdAt: "original", updatedAt: "original" } as any;
    useGameStore.setState({ saves: [save], activeSave: save, isExecuting: false });
    localStorage.setItem("model_assistant_backend", "b"); localStorage.setItem("model_assistant_model", "m");
    const snapshot = readAssistantConfiguration();
    assert.ok(!JSON.stringify(snapshot).includes("private-ref"));
    assert.ok(!JSON.stringify(snapshot).includes("private-header"));
    const outcomes: string[] = [];
    await executeAssistantChanges(reply(patch("settings", "/autosave", false), patch("saves", "/s/worldState/scene/weather", "rain"), patch("backends", "/b/maxConcurrency", 8)), snapshot, new AbortController().signal, s => outcomes.push(s));
    assert.equal((await storageService.getSettings()).autosave, false);
    assert.equal(useSettingsStore.getState().settings.autosave, false);
    const originalSaveSettings = storageService.saveSettings;
    const partial: string[] = [];
    storageService.saveSettings = async () => { throw new Error("disk full"); };
    try {
      await assert.rejects(executeAssistantChanges(reply(patch("backends", "/b/maxConcurrency", 9), patch("settings", "/autosave", true)), readAssistantConfiguration(), new AbortController().signal, message => partial.push(message)), /disk full/);
      assert.equal(partial.length, 1);
      assert.equal(useBackendStore.getState().backends[0].maxConcurrency, 9);
      assert.equal(useSettingsStore.getState().settings.autosave, false);
    } finally { storageService.saveSettings = originalSaveSettings; }
    assert.equal((await storageService.getBackends())[0].secretRef, "private-ref");
    assert.deepEqual((await storageService.getSaves())[0].turns, save.turns);
    assert.equal(useGameStore.getState().activeSave?.worldState.scene.weather, "rain");
    assert.equal(outcomes.length, 3);
    await assert.rejects(executeAssistantChanges(reply(patch("settings", "/autosave", true)), snapshot, new AbortController().signal, () => {}), /配置已变化/);
    const controller = new AbortController(); controller.abort();
    await assert.rejects(executeAssistantChanges(reply(patch("settings", "/autosave", true)), readAssistantConfiguration(), controller.signal, () => {}));
    assert.equal(useSettingsStore.getState().settings.autosave, false);
  } finally {
    if (oldStorage) Object.defineProperty(globalThis, "localStorage", oldStorage);
    else Reflect.deleteProperty(globalThis, "localStorage");
  }
});

test('Prompt patch persists and refreshes UI; legacy edits, unknown fields, cancel, conflict and failures remain safe', async t => {
  const memory = new Map<string, string>();
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: (k: string) => memory.get(k) ?? null, setItem: (k: string, v: string) => memory.set(k, v), removeItem: (k: string) => memory.delete(k) } });
  const before = fixture();
  try {
    useAgentStore.setState({ agents: Object.values(before.agents) as any });
    useAgentGroupStore.setState({ groups: Object.values(before.groups) as any, activeGroupId: 'g' });
    useBackendStore.setState({ backends: Object.values(before.backends) as any });
    useSettingsStore.setState({ settings: before.settings as any });
    useGameStore.setState({ saves: [], activeSave: null, isExecuting: false });
    const snapshot = readAssistantConfiguration(), receipts: string[] = [];
    assert.equal((snapshot.resources as Resources).agents.a.prompt, 'Hello');
    const change = reply(patch('agents', '/a/prompt', '<input>{{input}}</input>'));
    await executeAssistantChanges(change, snapshot, new AbortController().signal, message => receipts.push(message));
    const saved = (await storageService.getAgents()).find(a => a.id === 'a')!;
    assert.equal(saved.prompt, '<input>{{input}}</input>');
    assert.deepEqual((saved as any).futureAgent, before.agents.a.futureAgent);
    assert.equal((saved.messages[0] as any).futureMessage, true);
    assert.equal(useAgentStore.getState().agents.find(a => a.id === 'a')!.prompt, saved.prompt);
    assert.equal(receipts.length, 1);
    await assert.rejects(executeAssistantChanges(change, snapshot, new AbortController().signal, () => {}), /配置已变化/);
    const cancelled = new AbortController(); cancelled.abort();
    await assert.rejects(executeAssistantChanges(reply(patch('agents', '/a/prompt', 'cancelled')), readAssistantConfiguration(), cancelled.signal, () => {}));
    const legacy = { ...saved, messages: [{ ...saved.messages[0], content: 'legacy changed' }] };
    delete legacy.prompt;
    const planned = planAssistantChanges(reply({ type: 'save_agent', value: legacy }), readAssistantConfiguration().resources as Resources);
    assert.equal(planned.agents.a.prompt, 'legacy changed');
    const invalid = structuredClone(readAssistantConfiguration().resources as Resources);
    invalid.agents.text_router = { ...saved, id: 'text_router', prompt: '{{secretRef}}' };
    assert.throws(() => planAssistantChanges(reply(), invalid), /不提供变量/);
    t.mock.method(storageService, 'saveAgent', async () => { throw new Error('prompt disk failure'); });
    await assert.rejects(executeAssistantChanges(reply(patch('agents', '/a/prompt', 'failed')), readAssistantConfiguration(), new AbortController().signal, message => receipts.push(message)), /prompt disk failure/);
    assert.equal(receipts.length, 1);
    assert.equal(useAgentStore.getState().agents.find(a => a.id === 'a')!.prompt, saved.prompt);
  } finally {
    if (descriptor) Object.defineProperty(globalThis, 'localStorage', descriptor); else Reflect.deleteProperty(globalThis, 'localStorage');
  }
});
