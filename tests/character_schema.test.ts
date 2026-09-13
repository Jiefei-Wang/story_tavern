import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  field,
  textField,
  memoryField,
  definition,
  worldFor,
  scenarios,
} from "./fixtures/characterWorlds";
import {
  validateCharacterSchemaDefinition,
  validateCharacterAgainstSchema,
  validateCharacterUpdate,
  buildCharacterSchemaPrompt,
  createDefaultCharacterAttributes,
  getPrivateCharacterFields,
  getPublicCharacterFields,
} from "../src/engine/character-schema/CharacterSchema";
import { applyCharacterPatches } from "../src/engine/character-schema/GuardedPatches";
import { migrateGameSave } from "../src/engine/character-schema/Migration";
import { editSaveSchema } from "../src/engine/character-schema/EditSchema";
import { HARBOR_WORLD_DEFINITION } from "../src/engine/character-schema/HarborSchema";
import {
  buildNarratorEntityView,
  buildNpcView,
  buildPerceptionView,
  filterPublicPatches,
} from "../src/engine/world/WorldViews";
import { GamePipeline } from "../src/engine/pipeline/GamePipeline";
import { agentRuntime } from "../src/engine/runtime/AgentRuntime";
import { globalTraceManager } from "../src/engine/tracing/TraceManager";
import { generateNewCharacters } from "../src/engine/characters/CharacterGenerator";
import { CharacterFields } from "../src/pages/Characters/CharacterFields";
import {
  INITIAL_DEMO_SAVE,
  BUILTIN_AGENTS,
  DEFAULT_AGENT_GROUPS,
} from "./fixtures/legacyInitialData";
import {
  CharacterFieldDefinition,
  CharacterStateUpdate,
  GameSave,
  JsonPatchOperation,
} from "../src/types";
import { withCharacterContract } from "../src/engine/character-schema/AgentContract";
import { SchemaValidator } from "../src/engine/schema/SchemaValidator";
import { withAttributeDefaults } from "../src/engine/character-schema/CharacterSchema";
import { StorageService } from "../src/db/storage";

const strict = definition(
  [
    field("stress"),
    textField("birthplace", { default: "港口", updatePolicy: "immutable" }),
    textField("occupation", { default: "侦探", updatePolicy: "setup_only" }),
    {
      id: "mood",
      label: "情绪",
      type: "enum",
      default: "calm",
      enumValues: ["calm", "angry", "afraid"],
      visibility: "private",
      updatePolicy: "dynamic",
      freedom: "strict",
    },
    memoryField("memories"),
  ],
  ["trust", "fear", "respect"].map((id) =>
    field(id, {
      changePolicy: { mode: "delta", maxPerEvent: 0.15, maxPerTurn: 0.2 },
    }),
  ),
);

test("A/N: survival character, defaults, prompt and rendered UI need no relationships or fixed ontology", () => {
  const schema = definition([field("health"), field("hunger")]);
  const world = worldFor(schema);
  assert.equal(
    validateCharacterAgainstSchema(world.entities.erin, schema, world).valid,
    true,
  );
  const markup = renderToStaticMarkup(
    React.createElement(CharacterFields, {
      fields: schema.sections[0].fields,
      values: world.entities.erin.attributes!,
    }),
  );
  assert.match(markup, /health/);
  assert.match(markup, /hunger/);
  assert.doesNotMatch(markup, /好感度|mood|goal|memory/);
  assert.equal(world.entities.erin.relationships, undefined);
  assert.equal(
    validateCharacterAgainstSchema(
      { ...world.entities.erin, relationships: {} },
      schema,
    ).valid,
    false,
  );
  assert.doesNotMatch(
    buildCharacterSchemaPrompt(schema),
    /attributes\.mood|attributes\.memory/,
  );
});

test("B: multidimensional relationships validate and preserve independent dimensions", () => {
  const world = worldFor(strict);
  const result = validateCharacterUpdate(
    world.entities.erin,
    { path: "relationships.player.trust", op: "delta", value: 0.1 },
    strict,
    world,
  );
  assert.equal(result.valid, true, result.errors.join(";"));
  assert.deepEqual(result.after.relationships?.player, {
    trust: 0.5,
    fear: 0.4,
    respect: 0.4,
  });
});

for (const [name, update, rule] of [
  [
    "C strict enum",
    { path: "attributes.mood", op: "set", value: "excited" },
    /enum/,
  ],
  [
    "D numeric range",
    { path: "attributes.stress", op: "set", value: 2 },
    /maximum|less than/,
  ],
  [
    "E immutable",
    { path: "attributes.birthplace", op: "set", value: "山城" },
    /immutable/,
  ],
  [
    "F setup_only",
    { path: "attributes.occupation", op: "set", value: "警官" },
    /setup_only/,
  ],
  [
    "G replace history",
    { path: "attributes.memories", op: "set", value: [] },
    /append/,
  ],
  [
    "H free payload envelope",
    {
      path: "attributes.memories",
      op: "append",
      value: { text: "任意自然语言", importance: 0.3, invented: true },
    },
    /additional|not allowed/,
  ],
  [
    "I maxPerEvent",
    { path: "relationships.player.trust", op: "delta", value: 0.8 },
    /maxPerEvent/,
  ],
  ["unknown field", { path: "attributes.hack", op: "set", value: 1 }, /不存在/],
  [
    "unknown relationship dimension",
    { path: "relationships.player.hack", op: "set", value: 1 },
    /不存在/,
  ],
  [
    "unknown target",
    { path: "relationships.ghost.trust", op: "delta", value: 0.1 },
    /不存在/,
  ],
  [
    "non-character target",
    { path: "relationships.door.trust", op: "delta", value: 0.1 },
    /不存在/,
  ],
  [
    "arbitrary RFC6902 path",
    { path: "/entities/guard/attributes/stress", op: "set", value: 0.2 },
    /非法/,
  ],
  [
    "prototype path",
    { path: "attributes.__proto__.polluted", op: "set", value: true },
    /非法/,
  ],
  [
    "delta mode cannot set",
    { path: "relationships.player.trust", op: "set", value: 0.5 },
    /delta/,
  ],
] as const)
  test(name, () => {
    const world = worldFor(strict);
    world.entities.door = { type: "object" };
    const before = structuredClone(world);
    const result = validateCharacterUpdate(
      world.entities.erin,
      update as CharacterStateUpdate,
      strict,
      world,
    );
    assert.equal(result.valid, false);
    assert.match(result.errors.join(";"), rule);
    assert.deepEqual(world, before);
  });

test("G/H: append free text entries, reject replace/delete prefix and malformed structure", () => {
  const world = worldFor(strict);
  const update = {
    path: "attributes.memories",
    op: "append" as const,
    value: {
      text: "风把她的旧日回忆吹进一片无边的蓝；这是自由文本。",
      importance: 0.7,
    },
  };
  const result = validateCharacterUpdate(
    world.entities.erin,
    update,
    strict,
    world,
  );
  assert.equal(result.valid, true, result.errors.join(";"));
  world.entities.erin = result.after;
  for (const patch of [
    { op: "remove", path: "/entities/erin/attributes/memories/0" },
    {
      op: "replace",
      path: "/entities/erin/attributes/memories/0/text",
      value: "改写过去",
    },
    {
      op: "replace",
      path: "/entities/erin/attributes",
      value: { ...result.after.attributes, memories: [] },
    },
  ] as JsonPatchOperation[]) {
    const applied = applyCharacterPatches(world, [patch], strict);
    assert.equal(applied.success, false);
    assert.match(applied.error!, /append_only/);
  }
  assert.equal(
    validateCharacterUpdate(
      world.entities.erin,
      { ...update, value: { text: "missing importance" } },
      strict,
      world,
    ).valid,
    false,
  );
});

test("append-only free text and primitive type checks never accept arbitrary JSON", () => {
  const schema = definition([
    textField("log", {
      updatePolicy: "append_only",
      freedom: "free",
      default: "过去。",
    }),
    field("count", { type: "integer", default: 0 }),
    { ...textField("flag"), type: "boolean", default: false },
  ]);
  const world = worldFor(schema);
  assert.equal(
    validateCharacterUpdate(
      world.entities.erin,
      { path: "attributes.log", op: "append", value: "今天。" },
      schema,
      world,
    ).after.attributes?.log,
    "过去。今天。",
  );
  for (const [path, value] of [
    ["attributes.log", {}],
    ["attributes.count", 0.5],
    ["attributes.flag", "true"],
  ] as const)
    assert.equal(
      validateCharacterUpdate(
        world.entities.erin,
        { path, op: "set", value },
        schema,
        world,
      ).valid,
      false,
    );
  assert.equal(
    applyCharacterPatches(
      world,
      [{ op: "replace", path: "/entities/erin/attributes/log", value: "覆盖" }],
      schema,
    ).success,
    false,
  );
});

test("J/K: nested private values never reach public views, parents, list items or other NPCs", () => {
  const schema = definition(
    [
      field("stress"),
      textField("appearance", { visibility: "public" }),
      field("reputation", { visibility: "public" }),
      {
        ...textField("profile"),
        type: "object",
        default: undefined,
        visibility: "public",
        fields: [
          textField("publicName", { visibility: "public" }),
          textField("secret"),
        ],
      },
      {
        ...memoryField("memories"),
        visibility: "public",
        item: {
          ...memoryField("x").item!,
          visibility: "public",
          fields: [
            textField("text", { visibility: "public" }),
            textField("secret"),
          ],
        },
      },
    ],
    [field("trust"), field("respect", { visibility: "public" })],
  );
  const world = worldFor(schema);
  world.entities.erin.attributes = {
    stress: 0.9,
    appearance: "蓝衣",
    reputation: 0.6,
    profile: { publicName: "艾琳", secret: "SECRET_nested" },
    memories: [{ text: "公开事件", secret: "SECRET_memory" }],
  };
  world.entities.player.attributes!.appearance = "另一人";
  const publicData = JSON.stringify([
    buildPerceptionView(world, schema),
    buildNarratorEntityView(world, schema),
    getPublicCharacterFields(world.entities.erin, schema),
  ]);
  assert.doesNotMatch(publicData, /SECRET_|stress|trust/);
  assert.match(publicData, /蓝衣|reputation/);
  assert.match(publicData, /公开事件/);
  assert.match(publicData, /respect/);
  assert.match(
    JSON.stringify(getPrivateCharacterFields(world.entities.erin, schema)),
    /SECRET_nested/,
  );
  const other = buildNpcView(
    world,
    "player",
    [],
    { available_time: 1, response_window: false },
    [],
    schema,
  );
  assert.doesNotMatch(JSON.stringify(other), /SECRET_nested|SECRET_memory/);
  const self = buildNpcView(
    world,
    "erin",
    [],
    { available_time: 1, response_window: false },
    [],
    schema,
  );
  assert.match(JSON.stringify(self.npc), /SECRET_memory/);
  const patches: JsonPatchOperation[] = [
    { op: "replace", path: "/entities/erin", value: world.entities.erin },
    {
      op: "replace",
      path: "/entities/erin/attributes/profile",
      value: world.entities.erin.attributes.profile,
    },
    {
      op: "copy",
      from: "/entities/erin/attributes/profile/secret",
      path: "/entities/erin/attributes/appearance",
    },
  ];
  assert.doesNotMatch(
    JSON.stringify(filterPublicPatches(patches, schema)),
    /SECRET_/,
  );
});

test("L: whole entity/root replacement, remove+add, copy/move, type laundering cannot bypass commit gate", () => {
  const world = worldFor(strict);
  for (const patches of [
    [
      {
        op: "replace",
        path: "/entities/erin",
        value: {
          ...world.entities.erin,
          attributes: { ...world.entities.erin.attributes, hack: 1 },
        },
      },
    ],
    [
      {
        op: "replace",
        path: "/entities",
        value: {
          ...world.entities,
          erin: {
            ...world.entities.erin,
            attributes: {
              ...world.entities.erin.attributes,
              birthplace: "别处",
            },
          },
        },
      },
    ],
    [
      { op: "remove", path: "/entities/erin" },
      {
        op: "add",
        path: "/entities/erin",
        value: {
          ...world.entities.erin,
          attributes: { ...world.entities.erin.attributes, birthplace: "别处" },
        },
      },
    ],
    [
      { op: "replace", path: "/entities/erin/type", value: "object" },
      {
        op: "replace",
        path: "/entities/erin/attributes/birthplace",
        value: "别处",
      },
      { op: "replace", path: "/entities/erin/type", value: "character" },
    ],
    [
      {
        op: "copy",
        from: "/entities/player/attributes/occupation",
        path: "/entities/erin/attributes/birthplace",
      },
    ],
    [
      {
        op: "move",
        from: "/entities/erin/attributes/birthplace",
        path: "/entities/erin/attributes/occupation",
      },
    ],
  ] as JsonPatchOperation[][]) {
    const result = applyCharacterPatches(world, patches, strict);
    assert.equal(result.success, false, JSON.stringify(patches));
    assert.deepEqual(result.newWorld, world);
  }
});

test("nested immutable fields and numeric limits survive parent replacement and optional creation", () => {
  const schema = definition([
    {
      ...textField("profile"),
      type: "object",
      default: undefined,
      fields: [
        textField("identity", { updatePolicy: "immutable", default: "same" }),
        field("stress", { changePolicy: { maxPerEvent: 0.1 } }),
      ],
    },
  ]);
  const world = worldFor(schema);
  for (const value of [
    { identity: "changed", stress: 0.4 },
    { identity: "same", stress: 0.8 },
  ])
    assert.equal(
      applyCharacterPatches(
        world,
        [{ op: "replace", path: "/entities/erin/attributes/profile", value }],
        schema,
      ).success,
      false,
    );
});

test("per-event and per-turn absolute cumulative budgets reject split/oscillating writes atomically", () => {
  const world = worldFor(strict),
    ledger = {};
  const p = (value: number): JsonPatchOperation => ({
    op: "replace",
    path: "/entities/erin/relationships/player/trust",
    value,
  });
  assert.equal(
    applyCharacterPatches(world, [p(0.5), p(0.4)], strict, ledger).success,
    false,
  );
  assert.deepEqual(ledger, {});
  const one = applyCharacterPatches(world, [p(0.5)], strict, ledger);
  assert.equal(one.success, true);
  const two = applyCharacterPatches(one.newWorld, [p(0.4)], strict, ledger);
  assert.equal(two.success, true);
  const three = applyCharacterPatches(two.newWorld, [p(0.45)], strict, ledger);
  assert.equal(three.success, false);
  assert.match(three.error!, /maxPerTurn/);
});

test("schema definition rejects malformed IDs, duplicates, defaults, combinations and pathological recursion", () => {
  const badFields: any[] = [
    field("x", { min: 2, max: 1 }),
    field("x", { default: 2 }),
    field("x", { type: "enum", enumValues: [] }),
    field("x", { updatePolicy: "append_only" }),
    { ...textField("x"), type: "list" },
    { ...textField("x"), type: "object" },
    field("__proto__"),
    field("x", { changePolicy: { maxPerTurn: -1 } }),
    { ...textField("x"), freedom: "unlimited" },
    { ...textField("x"), required: "true" },
    { ...textField("x"), surprise: 1 },
  ];
  for (const f of badFields)
    assert.equal(
      validateCharacterSchemaDefinition(definition([f])).valid,
      false,
      JSON.stringify(f),
    );
  assert.equal(
    validateCharacterSchemaDefinition(definition([field("x"), field("x")]))
      .valid,
    false,
  );
  assert.equal(
    validateCharacterSchemaDefinition(definition([], [field("x"), field("x")]))
      .valid,
    false,
  );
  const recursive: any = { ...textField("x"), type: "list" };
  recursive.item = recursive;
  assert.equal(
    validateCharacterSchemaDefinition(definition([recursive])).valid,
    false,
  );
  assert.equal(
    validateCharacterSchemaDefinition(
      definition(Array.from({ length: 257 }, (_, i) => field(`x${i}`))),
    ).valid,
    false,
  );
  assert.equal(
    validateCharacterSchemaDefinition(HARBOR_WORLD_DEFINITION.characterSchema)
      .valid,
    true,
  );
});

test("M/F: generator obeys current schema and creation policies without reading private world data", async (t) => {
  const schema = definition([
    textField("birthplace", {
      required: true,
      default: undefined,
      updatePolicy: "immutable",
    }),
    textField("specialty", {
      required: true,
      default: undefined,
      updatePolicy: "setup_only",
    }),
    field("health"),
  ]);
  const world = worldFor(schema);
  world.entities.player.attributes = {
    birthplace: "PRIVATE_PLOT",
    specialty: "PRIVATE_PLOT",
    health: 0.4,
  };
  world.entities.erin.attributes = { ...world.entities.player.attributes };
  t.mock.method(agentRuntime, "runAgent", async (opts: any) => {
    assert.doesNotMatch(JSON.stringify(opts.context), /PRIVATE_PLOT/);
    assert.match(opts.context.characterSchemaPrompt, /specialty/);
    return {
      success: true,
      data: {
        name: "罗莎",
        attributes: { birthplace: "山城", specialty: "植物学" },
      },
    };
  });
  const patches = await generateNewCharacters(
    world,
    [
      {
        op: "add",
        path: "/entities/rosa",
        value: { type: "character", memory: "PRIVATE_DRAFT" },
      },
    ],
    "遇到一位新人物",
    { groupId: "x", agents: [], groups: [], backends: [] },
    schema,
  );
  const result = applyCharacterPatches(world, patches, schema);
  assert.equal(result.success, true, result.error);
  assert.deepEqual(result.newWorld.entities.rosa.attributes, {
    health: 0.4,
    birthplace: "山城",
    specialty: "植物学",
  });
  assert.equal(result.newWorld.entities.rosa.relationships, undefined);
  assert.doesNotMatch(
    JSON.stringify(patches),
    /appearance|personality|mood|PRIVATE_DRAFT/,
  );
});

test("O: old save migration preserves original values, histories and variations; is idempotent", () => {
  const old: any = structuredClone(INITIAL_DEMO_SAVE);
  delete old.worldDefinition;
  const legacy = {
    type: "character",
    name: "艾琳",
    location: "tavern_outside",
    appearance: "蓝衣",
    occupation: "花商",
    background: "童年",
    personality: "谨慎",
    goal: "离港",
    memory: "原始记忆",
    mentalState: { mood: "uneasy", stress: 0.7 },
    relationships: { player: 20 },
    customTag: "旧字段",
  };
  old.worldState.entities.erin = legacy;
  old.turns[0].worldStateBefore = structuredClone(old.worldState);
  old.turns[0].worldStateAfter = structuredClone(old.worldState);
  old.turns[0].variations = [structuredClone(old.turns[0])];
  const snapshot = structuredClone(old);
  const migrated = migrateGameSave(old);
  const e = migrated.worldState.entities.erin;
  assert.deepEqual(e.attributes, {
    appearance: "蓝衣",
    occupation: "花商",
    background: "童年",
    personality: "谨慎",
    goal: "离港",
    memory: "原始记忆",
    mood: "uneasy",
    stress: 0.7,
    customTag: "旧字段",
  });
  assert.deepEqual(e.relationships, { player: { trust: 20 } });
  assert.deepEqual(migrateGameSave(migrated), migrated);
  assert.deepEqual(old, snapshot);
  assert.deepEqual(
    migrated.turns[0].variations![0].worldStateBefore.entities.erin,
    e,
  );
  assert.throws(() => migrateGameSave({ id: "broken" }), /存档/);
  const malformed = structuredClone(migrated);
  malformed.worldState.entities.erin.attributes!.stress = "bad";
  assert.throws(() => migrateGameSave(malformed), /无效/);
});

test("schema editing is atomic across current state and historical retry baselines; new world has independent schema", () => {
  const save = structuredClone(INITIAL_DEMO_SAVE);
  Object.assign(save.worldDefinition, { futureMetadata: { preserved: true } });
  const before = structuredClone(save);
  assert.throws(() => editSaveSchema(save, definition([field("health")])));
  assert.deepEqual(save, before);
  const next = structuredClone(save.worldDefinition.characterSchema);
  next.sections.push({
    id: "new_section",
    label: "新属性",
    fields: [field("stress", { required: true, default: 0.2 })],
  });
  const edited = editSaveSchema(save, next);
  assert.deepEqual((edited.worldDefinition as any).futureMetadata, { preserved: true });
  assert.equal(edited.worldState.entities.erin.attributes!.stress, 0.2);
  assert.equal(
    edited.turns[0].worldStateBefore.entities.erin.attributes!.stress,
    0.2,
  );
  const fresh = editSaveSchema(
    save,
    definition([field("health"), field("hunger")]),
    true,
  );
  assert.equal(fresh.turns.length, 0);
  assert.equal(fresh.worldState.entities.player.relationships, undefined);
  assert.equal(fresh.worldDefinition.characterSchema.relationship, undefined);
});

test("pipeline records rejected proposals and blocks a malicious resolver independently", async (t) => {
  const world = worldFor(strict);
  let malicious = false;
  t.mock.method(agentRuntime, "runAgent", async (opts: any) => {
    switch (opts.agentId) {
      case "input_compiler":
        return {
          success: true,
          data: {
            blocks: [
              {
                id: "b",
                kind: "normal",
                events: [
                  {
                    id: "e",
                    type: "speech",
                    actor: "player",
                    target: "erin",
                    content: "我帮你",
                    duration: 3,
                  },
                ],
              },
            ],
          },
        };
      case "perception":
        return {
          success: true,
          data: {
            npcObservations: {
              erin: [{ eventId: opts.context.events[0].id, saw: true, heard: true }],
            },
          },
        };
      case "npc_reaction":
        return {
          success: true,
          data: {
            thought: null,
            intents: [],
            stateUpdates: [
              { path: "attributes.mood", op: "set", value: "excited", sourceEventIds: [opts.context.observations[0].eventId] },
              { path: "relationships.player.trust", op: "delta", value: 0.8, sourceEventIds: [opts.context.observations[0].eventId] },
            ],
          },
        };
      case "world_resolver":
        assert.deepEqual(
          opts.context.npcReactions[0].reaction.stateUpdates,
          [],
        );
        return {
          success: true,
          data: {
            patches: malicious
              ? [
                  {
                    op: "replace",
                    path: "/entities/erin",
                    value: {
                      ...world.entities.erin,
                      attributes: {
                        ...world.entities.erin.attributes,
                        hack: true,
                      },
                    },
                  },
                ]
              : [],
            publicEvents: [],
          },
        };
      case "narrator":
        assert.doesNotMatch(JSON.stringify(opts.context), /excited|memories/);
        return {
          success: true,
          data: { segments: [{ type: "prose", text: "雨水敲打窗沿。" }] },
        };
      case "action_adjudicator":
        return { success: true, data: { resolutions: [], speechConstraints: opts.context.events.map((event: any) => ({ eventId: event.id, audibility: "normal", audience: [] })) } };
      case "narration_auditor":
        assert.doesNotMatch(JSON.stringify(opts.context), /excited|memories/);
        return { success: true, data: { grounded: true, issues: [] } };
      default:
        throw Error(opts.agentId);
    }
  });
  const options = {
    agents: [],
    groups: [],
    backends: [],
    activeGroupId: "x",
    mockMode: false,
    worldDefinition: { version: 1, characterSchema: strict },
  };
  const good = await new GamePipeline().executeTurn(
    "帮助艾琳",
    world,
    1,
    options,
  );
  assert.equal(good.success, true, good.error);
  const proposal = globalTraceManager
    .getTrace(good.traceId)!
    .spans.find((s) => s.type === "character_update_validation")!
    .parsedOutput as any;
  assert.equal(proposal.rejected.length, 2);
  assert.match(JSON.stringify(proposal), /maxPerEvent/);
  assert.deepEqual(good.turn.worldStateAfter.entities, world.entities);
  malicious = true;
  const bad = await new GamePipeline().executeTurn(
    "帮助艾琳",
    world,
    2,
    options,
  );
  assert.equal(bad.success, false);
  assert.deepEqual(bad.turn.worldStateAfter, world);
  assert.ok(
    globalTraceManager
      .getTrace(bad.traceId)!
      .spans.some(
        (s) => s.type === "character_patch_validation" && s.status === "error",
      ),
  );
});

for (const scenario of scenarios)
  test(`pipeline smoke: ${scenario.id} world uses its own schema over multiple turns`, async () => {
    let world = worldFor(scenario.schema);
    for (const [i, input] of scenario.inputs.entries()) {
      const result = await new GamePipeline().executeTurn(input, world, i + 1, {
        agents: BUILTIN_AGENTS,
        groups: DEFAULT_AGENT_GROUPS,
        backends: [],
        activeGroupId: "group_fast",
        mockMode: true,
        worldDefinition: { version: 1, characterSchema: scenario.schema },
      });
      assert.equal(result.success, true, result.error);
      assert.equal(result.turn.narrationError, undefined);
      const spans = globalTraceManager.getTrace(result.traceId)!.spans;
      for (const span of spans.filter((s) =>
        ["narrator", "perception"].includes(s.agentId || ""),
      ))
        assert.doesNotMatch(
          JSON.stringify(span.inputContext),
          /PRIVATE_CANARY/,
        );
      world = result.turn.worldStateAfter;
      for (const e of Object.values(world.entities))
        if (e.type === "character")
          assert.equal(
            validateCharacterAgainstSchema(e, scenario.schema, world).valid,
            true,
          );
    }
  });

test("generator output contract permits nested defaults but still requires missing setup data", () => {
  const schema = definition([
    {
      ...textField("profile"),
      type: "object",
      required: true,
      default: undefined,
      fields: [
        textField("birthplace", {
          required: true,
          default: undefined,
          updatePolicy: "setup_only",
        }),
        textField("nickname", { required: true, default: "小林" }),
      ],
    },
    memoryField("notes"),
  ]);
  const contract = withCharacterContract(
    BUILTIN_AGENTS.find((a) => a.id === "character_generator")!,
    schema,
  ).outputSchema!;
  assert.equal(
    SchemaValidator.validate(contract, { name: "林", attributes: {} }).valid,
    false,
  );
  assert.equal(
    SchemaValidator.validate(contract, {
      name: "林",
      attributes: { profile: { birthplace: "山城" } },
    }).valid,
    true,
  );
  const attrs = withAttributeDefaults(
    { profile: { birthplace: "山城" } },
    schema.sections[0].fields,
  );
  assert.deepEqual(attrs.profile, { birthplace: "山城", nickname: "小林" });
  assert.equal(
    validateCharacterAgainstSchema(
      { type: "character", attributes: attrs },
      schema,
    ).valid,
    true,
  );
  assert.equal(
    SchemaValidator.validate(contract, {
      name: "林",
      appearance: "不应存在",
      attributes: { profile: { birthplace: "山城" } },
    }).valid,
    false,
  );
});

test("non-finite numbers and cyclic/free values are rejected deterministically", () => {
  const schema = definition([field("x")]),
    world = worldFor(schema);
  for (const value of [NaN, Infinity, -Infinity]) {
    assert.equal(
      validateCharacterSchemaDefinition(
        definition([field("x", { default: value })]),
      ).valid,
      false,
    );
    assert.equal(
      validateCharacterAgainstSchema(
        { type: "character", attributes: { x: value } },
        schema,
      ).valid,
      false,
    );
    assert.equal(
      validateCharacterUpdate(
        world.entities.erin,
        { path: "attributes.x", op: "set", value },
        schema,
        world,
      ).valid,
      false,
    );
  }
  const cyclic: any = {};
  cyclic.self = cyclic;
  assert.equal(
    validateCharacterUpdate(
      world.entities.erin,
      { path: "attributes.x", op: "set", value: cyclic },
      schema,
      world,
    ).valid,
    false,
  );
});

test("public parent/list patch projection retains public children while redacting private children", () => {
  const schema = definition([
    {
      ...memoryField("entries"),
      visibility: "public",
      item: {
        ...textField("entry"),
        type: "object",
        visibility: "public",
        fields: [
          textField("caption", { visibility: "public" }),
          textField("secret"),
        ],
        default: undefined,
      },
    },
  ]);
  const before = worldFor(schema),
    after = structuredClone(before);
  after.entities.erin.attributes!.entries = [
    { caption: "可观察", secret: "HIDDEN_PAYLOAD" },
  ];
  const patches = filterPublicPatches(
    [
      {
        op: "replace",
        path: "/entities/erin/attributes/entries",
        value: after.entities.erin.attributes!.entries,
      },
    ],
    schema,
    before,
    after,
  );
  assert.match(JSON.stringify(patches), /可观察/);
  assert.doesNotMatch(JSON.stringify(patches), /HIDDEN_PAYLOAD/);
});

test("generator diff compaction cannot hide cumulative travel in original resolver patches", async (t) => {
  const world = worldFor(strict);
  t.mock.method(agentRuntime, "runAgent", async (opts: any) => {
    if (opts.agentId === "admin_patch")
      return {
        success: true,
        data: {
          patches: [
            {
              op: "replace",
              path: "/entities/erin/relationships/player/trust",
              value: 0.5,
            },
            {
              op: "replace",
              path: "/entities/erin/relationships/player/trust",
              value: 0.4,
            },
            { op: "add", path: "/entities/new", value: { type: "character" } },
          ],
        },
      };
    if (opts.agentId === "character_generator")
      return { success: true, data: { name: "新人物", attributes: {} } };
    throw Error("No narrator may run");
  });
  const result = await new GamePipeline().executeTurn(
    "admin:添加新人",
    world,
    1,
    {
      agents: [],
      groups: [],
      backends: [],
      activeGroupId: "x",
      mockMode: false,
      worldDefinition: { version: 1, characterSchema: strict },
    },
  );
  assert.equal(result.success, false);
  assert.match(result.error!, /maxPerEvent/);
  assert.deepEqual(result.turn.worldStateAfter, world);
});

test("storage upgrades old saves once and preserves whole-patch audit without losing snapshots", async () => {
  const old: any = structuredClone(INITIAL_DEMO_SAVE);
  delete old.worldDefinition;
  old.turns[0].patches = [
    {
      op: "replace",
      path: "/entities/erin",
      value: { type: "character", memory: "原文" },
    },
  ];
  const values = new Map([["story_tavern_saves", JSON.stringify([old])]]);
  let writes = 0;
  const descriptor = Object.getOwnPropertyDescriptor(
    globalThis,
    "localStorage",
  );
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: (k: string) => values.get(k) ?? null,
      setItem: (k: string, v: string) => {
        writes++;
        values.set(k, v);
      },
    },
  });
  try {
    const storage = new StorageService();
    const first = await storage.getSaves();
    const second = await storage.getSaves();
    assert.equal(writes, 1);
    assert.deepEqual(first, second);
    assert.deepEqual(first[0].turns[0].legacyPatches, old.turns[0].patches);
    assert.equal(first[0].turns[0].patches.length, 0);
    values.set(
      "story_tavern_saves",
      JSON.stringify([{ ...old, worldState: null }]),
    );
    await assert.rejects(storage.getSaves());
    assert.equal(writes, 1);
  } finally {
    if (descriptor)
      Object.defineProperty(globalThis, "localStorage", descriptor);
    else Reflect.deleteProperty(globalThis, "localStorage");
  }
});
