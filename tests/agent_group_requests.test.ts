import test from "node:test";
import assert from "node:assert/strict";
import { agentRuntime } from "../src/engine/runtime/AgentRuntime";
import { parseExtraBody } from "../src/pages/AgentGroups/ExtraBodyEditor";
import { REASONING_EFFORT_OPTIONS, AgentDefinition, AgentGroup } from "../src/types";
import { DEFAULT_BACKENDS } from "./fixtures/legacyInitialData";
import { useAgentGroupStore } from "../src/stores/useAgentGroupStore";
import { storageService } from "../src/db/storage";

test("all effort levels and legacy none reach the HTTP request; manual extraBody wins", async (t) => {
  const requests: any[] = [];
  t.mock.method(globalThis, "fetch", async (_url: unknown, init: RequestInit) => {
    requests.push(JSON.parse(init.body as string));
    return new Response(JSON.stringify({ choices: [{ message: { content: "ok" }, finish_reason: "stop" }] }));
  });
  const agent: AgentDefinition = { id: "test", name: "test", description: "Request configuration test", messages: [{ id: "m", role: "user", content: "hello" }], inputs: [], outputSchema: null,
    defaults: { extraBody: { seed: 1, metadata: { source: "agent" } } } };
  const group: AgentGroup = { id: "request-test", name: "test", bindings: [{ agentId: "test", backendId: "test", model: "test" }] };
  const backend = { ...DEFAULT_BACKENDS[0], id: "test", baseUrl: "https://example.test/v1", authType: "none" as const };
  const run = async () => {
    const result = await agentRuntime.runAgent({ agentId: "test", groupId: group.id, context: {}, agents: [agent], groups: [group], backends: [backend] });
    assert.equal(result.success, true, result.error);
    return requests.at(-1);
  };
  assert.equal((await run()).reasoning_effort, "none");
  assert.equal("max_tokens" in requests.at(-1), false);
  agent.defaults.maxTokens = 500;
  assert.equal((await run()).max_tokens, 500);
  group.bindings[0].overrides = { maxTokens: 0 };
  assert.equal("max_tokens" in await run(), false);
  group.bindings[0].overrides = { maxTokens: 2400 };
  assert.equal((await run()).max_tokens, 2400);
  for (const option of REASONING_EFFORT_OPTIONS) {
    group.bindings[0].overrides = { reasoningEffort: option.value };
    assert.equal((await run()).reasoning_effort, option.value);
  }
  group.bindings[0].overrides = { reasoningEffort: "ultra", extraBody: { reasoning_effort: "low", seed: 2, metadata: { source: "group" }, custom: [true, null] } };
  const body = await run();
  assert.equal(body.reasoning_effort, "low");
  assert.equal(body.seed, 2);
  assert.deepEqual(body.metadata, { source: "group" });
  assert.deepEqual(body.custom, [true, null]);
  assert.equal(body.extraBody, undefined);
});

test("extraBody editor accepts nested JSON and clearing, rejects invalid objects and reserved fields", () => {
  assert.deepEqual(parseExtraBody(''), {});
  assert.deepEqual(parseExtraBody('{"thinking":{"budget":123},"enabled":false}'), { thinking: { budget: 123 }, enabled: false });
  for (const input of ['{', '[]', 'null', '1', '"text"', '{"model":"x"}', '{"STREAM":false}']) {
    assert.throws(() => parseExtraBody(input));
  }
});

test("group binding settings persist, preserve other overrides, copy and clear extraBody", async () => {
  const store = useAgentGroupStore;
  const group: AgentGroup = { id: "persist-effort", name: "test", bindings: [{ agentId: "a", backendId: "b", model: "m", overrides: { temperature: 0 } }] };
  await store.getState().saveGroup(group);
  await store.getState().updateBinding(group.id, "a", { overrides: { reasoningEffort: "ultra", extraBody: { seed: 42 } } });
  await store.getState().updateBinding(group.id, "a", { overrides: { maxTokens: 3000 } });
  const saved = (await storageService.getAgentGroups()).find(g => g.id === group.id)!;
  assert.deepEqual(saved.bindings[0].overrides, { temperature: 0, reasoningEffort: "ultra", extraBody: { seed: 42 }, maxTokens: 3000 });
  const copied = await store.getState().duplicateGroup(group.id);
  assert.deepEqual(copied!.bindings, saved.bindings);
  await store.getState().updateBinding(group.id, "a", { overrides: { extraBody: {} } });
  const cleared = (await storageService.getAgentGroups()).find(g => g.id === group.id)!;
  assert.deepEqual(cleared.bindings[0].overrides?.extraBody, {});
  assert.equal(cleared.bindings[0].overrides?.reasoningEffort, "ultra");
  await storageService.deleteAgentGroup(group.id);
  await storageService.deleteAgentGroup(copied!.id);
});
