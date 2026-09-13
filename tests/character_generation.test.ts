import test from "node:test";
import assert from "node:assert/strict";
import { generateNewCharacters } from "../src/engine/characters/CharacterGenerator";
import { agentRuntime } from "../src/engine/runtime/AgentRuntime";
import { INITIAL_HARBOR_TAVERN_WORLD } from "../src/engine/world/WorldState";
import { applyPatches } from "../src/engine/world/PatchEngine";
import { buildNpcView, buildPerceptionView, filterPublicPatches } from "../src/engine/world/WorldViews";
import { StorageService } from "../src/db/storage";

const options = { groupId: "test", agents: [], groups: [], backends: [] };
const profile = (ordinal: number) => ({ name: ordinal === 1 ? "莉娅" : "苏珊", attributes: { appearance: "漂亮的成年女子，穿着蓝色斗篷", occupation: "花商", background: "在小镇种花长大", personality: "热情", goal: "卖完鲜花", mood: "curious" } });

test("new characters generate concurrently from whitelisted context and discard leaked draft memories", async (t) => {
  const world = structuredClone(INITIAL_HARBOR_TAVERN_WORLD);
  world.scene.description = "SECRET_MAIN_PLOT";
  world.entities.erin.attributes!.memory = "SECRET_MAIN_PLOT";
  world.rules.plot = "SECRET_MAIN_PLOT";
  let active = 0, peak = 0;
  t.mock.method(agentRuntime, "runAgent", async (opts: any) => {
    assert.equal(opts.agentId, "character_generator");
    assert.deepEqual(Object.keys(opts.context).sort(), ["characterSchema", "characterSchemaPrompt", "count", "environment", "ordinal", "request"]);
    assert(!JSON.stringify(opts.context).includes("SECRET_MAIN_PLOT"));
    peak = Math.max(peak, ++active);
    await new Promise(r => setTimeout(r, 10));
    active--;
    return { success: true, data: profile(opts.context.ordinal) };
  });
  const patches = await generateNewCharacters(world, [
    { op: "add", path: "/entities/girl1", value: { type: "character", name: "漂亮女孩", memory: "SECRET_MAIN_PLOT", goal: "SECRET_MAIN_PLOT" } },
    { op: "add", path: "/entities/girl2", value: { type: "character", name: "漂亮女孩", background: "SECRET_MAIN_PLOT" } },
  ], "让我遇到两位漂亮女孩", options);
  assert.equal(peak, 2);
  assert(!JSON.stringify(patches).includes("SECRET_MAIN_PLOT"));
  const result = applyPatches(world, patches);
  assert.equal(result.success, true);
  assert.equal(result.newWorld.entities.girl1.name, "莉娅");
  assert.equal(result.newWorld.entities.girl2.name, "苏珊");
  const npc = buildNpcView(result.newWorld, "girl1", [], { available_time: 1, response_window: false });
  assert(!JSON.stringify(npc).includes("SECRET_MAIN_PLOT"));
  assert.equal(npc.npc.attributes?.background, "在小镇种花长大");
  assert.deepEqual(npc.npc.relationships, {});
  assert(!world.entities.girl1);
  const publicData = JSON.stringify(filterPublicPatches(patches));
  assert(publicData.includes("蓝色斗篷"));
  assert(!publicData.includes("在小镇种花长大"));
  assert(!JSON.stringify(buildPerceptionView(result.newWorld)).includes("在小镇种花长大"));
});

test("updates to existing characters do not regenerate identities", async (t) => {
  t.mock.method(agentRuntime, "runAgent", async () => { throw Error("unexpected generation"); });
  const patches = [{ op: "replace" as const, path: "/entities/guard/attributes/mood", value: "unconscious" }];
  assert.deepEqual(await generateNewCharacters(INITIAL_HARBOR_TAVERN_WORLD, patches, "卫兵晕倒", options), patches);
});

test("failed parallel generation waits for siblings and never mutates the original world", async (t) => {
  const before = structuredClone(INITIAL_HARBOR_TAVERN_WORLD);
  let siblingFinished = false;
  t.mock.method(agentRuntime, "runAgent", async (opts: any) => {
    if (opts.context.ordinal === 1) return { success: false, error: "model unavailable" };
    await new Promise(r => setTimeout(r, 10)); siblingFinished = true;
    return { success: true, data: profile(2) };
  });
  await assert.rejects(generateNewCharacters(before, [1, 2].map(i => ({ op: "add", path: `/entities/new${i}`, value: { type: "character" } })), "遇到两个人", options), /model unavailable/);
  assert.equal(siblingFinished, true);
  assert.deepEqual(before, INITIAL_HARBOR_TAVERN_WORLD);
});
