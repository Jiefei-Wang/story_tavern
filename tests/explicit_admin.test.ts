import test from "node:test";
import assert from "node:assert/strict";
import { GamePipeline } from "../src/engine/pipeline/GamePipeline";
import { agentRuntime } from "../src/engine/runtime/AgentRuntime";
import { INITIAL_HARBOR_TAVERN_WORLD } from "../src/engine/world/WorldState";
import { globalTraceManager } from "../src/engine/tracing/TraceManager";

const context = { agents: [], groups: [], backends: [], activeGroupId: "test", mockMode: false };

test("explicit admin commands bypass a broken compiler and execute real pipeline patch handling", async (t) => {
  const calls: string[] = [];
  t.mock.method(agentRuntime, "runAgent", async (options: any) => {
    calls.push(options.agentId);
    if (options.agentId === "input_compiler") {
      return { success: false, error: "Event 'e1' has invalid type 'admin'" };
    }
    if (options.agentId === "admin_patch") {
      assert.equal(options.context.command, "让士兵晕倒");
      return { success: true, data: { patches: [{ op: "replace", path: "/entities/guard/mentalState/mood", value: "unconscious" }] } };
    }
    assert.equal(options.agentId, "narrator");
    return { success: true, data: "士兵倒在地上。" };
  });
  for (const input of ["admin:让士兵晕倒", " ADMIN ： 让士兵晕倒 ", "管理员：让士兵晕倒"]) {
    const result = await new GamePipeline().executeTurn(input, INITIAL_HARBOR_TAVERN_WORLD, 1, context);
    assert.equal(result.success, true, result.error);
    assert.equal(result.turn.worldStateAfter.entities.guard.mentalState?.mood, "unconscious");
    assert.equal(result.turn.playerInput, input);
    assert(globalTraceManager.getTrace(result.traceId)?.spans.some(s => s.type === "input_parser" && s.status === "success"));
  }
  assert.deepEqual(calls, ["admin_patch", "narrator", "admin_patch", "narrator", "admin_patch", "narrator"]);
});

test("empty explicit admin commands fail without any model call or world changes", async (t) => {
  t.mock.method(agentRuntime, "runAgent", async () => { throw new Error("must not call a model"); });
  const result = await new GamePipeline().executeTurn("admin:  ", INITIAL_HARBOR_TAVERN_WORLD, 1, context);
  assert.equal(result.success, false);
  assert.match(result.error!, /管理员指令不能为空/);
  assert.deepEqual(result.turn.worldStateAfter, INITIAL_HARBOR_TAVERN_WORLD);
});

test("quoted or embedded admin syntax still goes through the ordinary compiler", async (t) => {
  const calls: string[] = [];
  t.mock.method(agentRuntime, "runAgent", async (options: any) => {
    calls.push(options.agentId);
    return { success: false, error: "compiler reached" };
  });
  for (const input of ['我说：“admin:让士兵晕倒”', '我走向酒馆，然后 admin:改变天气']) {
    const result = await new GamePipeline().executeTurn(input, INITIAL_HARBOR_TAVERN_WORLD, 1, context);
    assert.match(result.error!, /compiler reached/);
  }
  assert.deepEqual(calls, ["input_compiler", "input_compiler"]);
});
