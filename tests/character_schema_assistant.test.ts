import test from "node:test";
import assert from "node:assert/strict";
import {
  readAssistantConfiguration,
  executeAssistantChanges,
  planAssistantChanges,
  Resources,
} from "../src/engine/assistantConfiguration";
import { assistantReplySchema } from "../src/engine/modelAssistant";
import { useAgentStore } from "../src/stores/useAgentStore";
import { useAgentGroupStore } from "../src/stores/useAgentGroupStore";
import { useBackendStore } from "../src/stores/useBackendStore";
import { useSettingsStore } from "../src/stores/useSettingsStore";
import { useGameStore } from "../src/stores/useGameStore";
import {
  INITIAL_DEMO_SAVE,
  BUILTIN_AGENTS,
  DEFAULT_AGENT_GROUPS,
  DEFAULT_BACKENDS,
} from "../src/db/initialData";
import { storageService, DEFAULT_SETTINGS } from "../src/db/storage";

test("assistant exposes world field contract, validates domain rules and persists schema without changing history or other saves", async () => {
  const memory = new Map<string, string>();
  const descriptor = Object.getOwnPropertyDescriptor(
    globalThis,
    "localStorage",
  );
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: (k: string) => memory.get(k) ?? null,
      setItem: (k: string, v: string) => memory.set(k, v),
      removeItem: (k: string) => memory.delete(k),
    },
  });
  try {
    useAgentStore.setState({ agents: BUILTIN_AGENTS });
    useAgentGroupStore.setState({
      groups: DEFAULT_AGENT_GROUPS,
      activeGroupId: "group_quality",
    });
    useBackendStore.setState({ backends: DEFAULT_BACKENDS });
    useSettingsStore.setState({ settings: DEFAULT_SETTINGS });
    const save = structuredClone(INITIAL_DEMO_SAVE),
      other = {
        ...structuredClone(save),
        id: "other",
        name: "未保存的另一个存档",
      };
    useGameStore.setState({
      saves: [save, other],
      activeSave: save,
      isExecuting: false,
    });
    const snapshot = readAssistantConfiguration();
    assert.match(JSON.stringify(snapshot.capabilities), /maxPerTurn/);
    assert.match(JSON.stringify(snapshot.capabilities), /append_only/);
    const prefix = `/${save.id}/worldDefinition/characterSchema`;
    const reply = (patches: any[]) =>
      assistantReplySchema.parse({
        reply: "",
        actions: [{ type: "patch_config", resource: "saves", patches }],
      });
    const edit = reply([
      {
        op: "replace",
        path: `${prefix}/relationship/fields/0/label`,
        value: "信赖",
      },
    ]);
    await executeAssistantChanges(
      edit,
      snapshot,
      new AbortController().signal,
      () => {},
    );
    assert.equal(
      useGameStore.getState().activeSave!.worldDefinition.characterSchema
        .relationship!.fields[0].label,
      "信赖",
    );
    assert.equal(
      (await storageService.getSaves())[0].worldDefinition.characterSchema
        .relationship!.fields[0].label,
      "信赖",
    );
    assert.deepEqual(useGameStore.getState().activeSave!.turns, save.turns);
    assert.equal(
      useGameStore.getState().saves.find((s) => s.id === "other"),
      other,
    );
    const current = readAssistantConfiguration();
    assert.throws(() =>
      planAssistantChanges(
        reply([
          {
            op: "replace",
            path: `${prefix}/relationship/fields/0/changePolicy/maxPerTurn`,
            value: -1,
          },
        ]),
        current.resources as Resources,
      ),
    );
    const controller = new AbortController();
    controller.abort();
    await assert.rejects(
      executeAssistantChanges(
        reply([
          {
            op: "replace",
            path: `${prefix}/relationship/fields/0/label`,
            value: "应取消",
          },
        ]),
        current,
        controller.signal,
        () => {},
      ),
    );
    await assert.rejects(
      executeAssistantChanges(
        edit,
        snapshot,
        new AbortController().signal,
        () => {},
      ),
      /配置已变化/,
    );
    // Deleting a populated field must fail before any persisted change, including historical baselines.
    await assert.rejects(
      executeAssistantChanges(
        reply([{ op: "remove", path: `${prefix}/sections/1/fields/0` }]),
        current,
        new AbortController().signal,
        () => {},
      ),
    );
    assert.equal(
      useGameStore.getState().activeSave!.worldDefinition.characterSchema
        .sections[1].fields[0].id,
      "mood",
    );
  } finally {
    if (descriptor)
      Object.defineProperty(globalThis, "localStorage", descriptor);
    else Reflect.deleteProperty(globalThis, "localStorage");
  }
});
