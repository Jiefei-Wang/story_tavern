import test from "node:test";
import assert from "node:assert/strict";
import { Configuration, requestAssistant, validateAssistantReply } from "../src/engine/modelAssistant";

const config: Configuration = {
  agents: [{ id: "a", name: "Agent", description: "", messages: [{ id: "s", role: "system", content: "Hello" }], inputs: [], outputSchema: null, defaults: {} }],
  groups: [{ id: "g", name: "Group", bindings: [] }],
  backends: [{ id: "b", name: "Backend", baseUrl: "http://localhost/v1", authType: "none", customHeaders: { "X-Private": "private-header" }, secretRef: "private-reference", enabled: true, timeoutMs: 1000, maxConcurrency: 1 }],
  activeGroupId: "g",
};
const saveGroup = (agentId = "a", backendId = "b") => ({ type: "save_group", value: { id: "g", name: "Group", bindings: [{ agentId, backendId, model: "manual-model", overrides: { maxTokens: 0, temperature: 0.3 } }] } });

test("accepts manual models and newly created agents in the same batch", () => {
  const result = validateAssistantReply({ reply: "调整配置", actions: [saveGroup("new"), { type: "save_agent", value: { ...config.agents[0], id: "new" } }] }, config);
  assert.equal(result.actions.length, 2);
});

test("rejects invalid references, duplicate writes and unsafe operation types", () => {
  for (const actions of [[saveGroup("missing")], [saveGroup("a", "missing")], [saveGroup(), saveGroup()], [{ type: "delete_backend", id: "b" }], [{ type: "set_active_group", id: "missing" }]]) {
    assert.throws(() => validateAssistantReply({ reply: "", actions }, config));
  }
  assert.throws(() => validateAssistantReply({ reply: "", actions: [saveGroup()] }, { ...config, backends: [{ ...config.backends[0], enabled: false }] }));
});

test("rejects invalid parameter values and duplicate bindings", () => {
  const action = saveGroup();
  action.value.bindings[0].overrides.temperature = 10;
  assert.throws(() => validateAssistantReply({ reply: "", actions: [action] }, config));
  const duplicate = saveGroup();
  duplicate.value.bindings.push(duplicate.value.bindings[0]);
  assert.throws(() => validateAssistantReply({ reply: "", actions: [duplicate] }, config));
});

test("uses selected backend/model and omits backend credentials from model context", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    assert.equal(url, "http://localhost/v1/chat/completions");
    const body = JSON.parse(String(options?.body));
    assert.equal(body.model, "selected-model");
    assert.equal(body.stream, false);
    assert.ok(!JSON.stringify(body).includes("private-header"));
    assert.ok(!JSON.stringify(body).includes("private-reference"));
    return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ reply: "已分析", actions: [] }) } }] }));
  };
  try {
    const result = await requestAssistant(config.backends[0], "selected-model", [{ role: "user", content: "分析配置" }], config, new AbortController().signal);
    assert.equal(result.reply, "已分析");
    const controller = new AbortController();
    controller.abort();
    await assert.rejects(requestAssistant(config.backends[0], "selected-model", [], config, controller.signal));
  } finally { globalThis.fetch = original; }
});
