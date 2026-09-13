import { validateTextWorld } from '../text/Documents';
import {
  CharacterFieldDefinition as Field,
  GameSave,
  GameTurn,
  WorldState,
  JsonPatchOperation,
} from "../../types";
import { HARBOR_WORLD_DEFINITION } from "./HarborSchema";
import {
  assertCharacterSchema,
  safeId,
  validateCharacterAgainstSchema,
} from "./CharacterSchema";
import { validateWorldState } from "../world/WorldValidator";
import * as jsonpatch from "fast-json-patch";

const core = new Set([
  "type",
  "name",
  "location",
  "attributes",
  "relationships",
]);
/** Legacy unknown fields are inferred as private immutable data, preserving values without opening an arbitrary JSON escape hatch. */
function infer(id: string, value: any): Field {
  if (!safeId(id)) throw new Error(`旧存档字段 ID 无法迁移：${id}`);
  const base = {
    id,
    label: id,
    visibility: "private" as const,
    updatePolicy: "immutable" as const,
    freedom: "strict" as const,
  };
  if (typeof value === "string") return { ...base, type: "text" };
  if (typeof value === "boolean") return { ...base, type: "boolean" };
  if (typeof value === "number" && Number.isFinite(value))
    return { ...base, type: "number" };
  if (Array.isArray(value)) {
    const item = infer("item", value[0] ?? "");
    return { ...base, type: "list", item };
  }
  if (value && typeof value === "object")
    return {
      ...base,
      type: "object",
      fields: Object.entries(value).map(([k, v]) => infer(k, v)),
    };
  throw new Error(`旧存档 ${id} 包含无法安全推断的值；原存档未修改`);
}
export function migrateGameSave(raw: unknown): GameSave {
  if (!raw || typeof raw !== "object") throw new Error("存档必须是对象");
  const save = JSON.parse(JSON.stringify(raw)) as GameSave;
  if (save.textWorld) { validateTextWorld(save.textWorld); return save; }
  if (
    typeof save.id !== "string" ||
    typeof save.name !== "string" ||
    typeof save.updatedAt !== "string" ||
    typeof save.createdAt !== "string" ||
    typeof save.activeAgentGroupId !== "string" ||
    !Array.isArray(save.turns)
  )
    throw new Error("存档缺少 ID、名称、时间、Agent Group 或 turns");
  const legacy = !save.worldDefinition;
  save.worldDefinition ??= structuredClone(HARBOR_WORLD_DEFINITION);
  if (save.worldDefinition.version !== 1)
    throw new Error("不支持此 WorldDefinition 版本");
  const schema = save.worldDefinition.characterSchema;
  assertCharacterSchema(schema);
  const extras: Field[] = [];
  const fields = () => schema.sections.flatMap((s) => s.fields);
  const worlds: WorldState[] = [];
  const visitWorld = (world: WorldState) => {
    validateWorldState(world);
    if (legacy)
      for (const entity of Object.values(world.entities))
        if (entity.type === "character") {
          const attributes: Record<string, unknown> = { ...entity.attributes };
          for (const [key, value] of Object.entries(entity)) {
            if (core.has(key)) continue;
            if (key === "mentalState") {
              if (!value || typeof value !== "object" || Array.isArray(value))
                throw new Error("旧 mentalState 必须是对象");
              for (const [aspect, state] of Object.entries(value)) {
                if (
                  attributes[aspect] !== undefined &&
                  JSON.stringify(attributes[aspect]) !== JSON.stringify(state)
                )
                  throw new Error(`迁移字段冲突：${aspect}，原存档未修改`);
                attributes[aspect] = state;
              }
            } else {
              if (
                attributes[key] !== undefined &&
                JSON.stringify(attributes[key]) !== JSON.stringify(value)
              )
                throw new Error(`迁移字段冲突：${key}`);
              attributes[key] = value;
            }
            delete entity[key];
          }
          for (const [key, value] of Object.entries(attributes))
            if (
              !fields().some((f) => f.id === key) &&
              !extras.some((f) => f.id === key)
            )
              extras.push(infer(key, value));
          entity.attributes = attributes;
          if (entity.relationships)
            entity.relationships = Object.fromEntries(
              Object.entries(entity.relationships).map(([target, value]) => [
                target,
                typeof value === "number" ? { trust: value } : value,
              ]),
            );
        }
    worlds.push(world);
  };
  visitWorld(save.worldState);
  const visitTurn = (turn: GameTurn, depth = 0) => {
    if (depth > 32 || !turn || typeof turn !== "object")
      throw new Error("存档回合/分支嵌套无效");
    visitWorld(turn.worldStateBefore);
    visitWorld(turn.worldStateAfter);
    if (legacy && Array.isArray(turn.patches)) {
      turn.legacyPatches = turn.patches;
      const compare =
        (jsonpatch as any).default?.compare || (jsonpatch as any).compare;
      // Rebuild from migrated snapshots: whole-entity/container replacements and copy/move need more than path rewriting.
      turn.patches = compare(turn.worldStateBefore, turn.worldStateAfter);
      for (const event of turn.committedEvents || [])
        if (event.patches)
          event.patches = event.patches.map(migrateLegacyPatch);
    }
    if (turn.variations !== undefined && !Array.isArray(turn.variations))
      throw new Error("variations 必须是数组");
    turn.variations?.forEach((t) => visitTurn(t, depth + 1));
  };
  save.turns.forEach((t) => visitTurn(t));
  if (extras.length)
    schema.sections.push({
      id: "legacy",
      label: "旧存档自定义字段",
      fields: extras,
    });
  assertCharacterSchema(schema);
  for (const world of worlds)
    for (const [id, entity] of Object.entries(world.entities))
      if (entity.type === "character") {
        const result = validateCharacterAgainstSchema(entity, schema, world);
        if (!result.valid)
          throw new Error(`存档人物 ${id} 无效：${result.errors.join("; ")}`);
      }
  return save;
}
function migrateLegacyPatch(patch: JsonPatchOperation): JsonPatchOperation {
  const path = (p: string) =>
    p
      .replace(/^(\/entities\/[^/]+)\/mentalState\//, "$1/attributes/")
      .replace(
        /^(\/entities\/[^/]+)\/(appearance|occupation|background|personality|goal|memory|inventory)(?=\/|$)/,
        "$1/attributes/$2",
      )
      .replace(/^(\/entities\/[^/]+\/relationships\/[^/]+)$/, "$1/trust");
  return {
    ...patch,
    path: path(patch.path),
    ...(patch.from ? { from: path(patch.from) } : {}),
  };
}
