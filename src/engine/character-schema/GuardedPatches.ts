import {
  CharacterSchemaDefinition,
  JsonPatchOperation,
  WorldState,
} from "../../types";
import { applyPatches, PatchApplicationResult } from "../world/PatchEngine";
import {
  ChangeLedger,
  validateCharacterAgainstSchema,
  validateCharacterTransition,
} from "./CharacterSchema";

/** Raw PatchEngine is a preview primitive. All agent mutations commit through this transaction gate. */
export function applyCharacterPatches(
  world: WorldState,
  patches: JsonPatchOperation[],
  schema: CharacterSchemaDefinition,
  turnLedger: ChangeLedger = {},
  allowNewCharacterDrafts = false,
): PatchApplicationResult {
  const candidate = applyPatches(world, patches);
  if (!candidate.success) return candidate;
  const errors: string[] = [];
  const nextLedger = { ...turnLedger },
    eventLedger: ChangeLedger = {};
  // Every final character, not just leaf paths, is checked. New characters are setup transactions.
  for (const [id, entity] of Object.entries(candidate.newWorld.entities))
    if (
      entity.type === "character" &&
      !(allowNewCharacterDrafts && world.entities[id]?.type !== "character")
    )
      errors.push(
        ...validateCharacterAgainstSchema(
          entity,
          schema,
          candidate.newWorld,
        ).errors.map((e) => `${id}: ${e}`),
      );
  let intermediate = world;
  for (const patch of patches) {
    const result = applyPatches(intermediate, [patch]);
    if (!result.success) {
      errors.push(result.error!);
      break;
    }
    for (const [id, before] of Object.entries(intermediate.entities)) {
      if (
        before.type !== "character" ||
        world.entities[id]?.type !== "character"
      )
        continue;
      const after = result.newWorld.entities[id];
      if (!after || after.type !== "character") {
        errors.push(`${id}: 运行时不得删除人物或改变人物类型`);
        continue;
      }
      errors.push(
        ...validateCharacterTransition(
          before,
          after,
          schema,
          id,
          nextLedger,
          eventLedger,
        ).map((e) => `${id}: ${e}`),
      );
    }
    intermediate = result.newWorld;
  }
  if (errors.length)
    return {
      success: false,
      newWorld: world,
      appliedPatches: [],
      error: `Character Schema rejected atomically: ${errors.join("; ")}`,
    };
  Object.assign(turnLedger, nextLedger);
  return candidate;
}
