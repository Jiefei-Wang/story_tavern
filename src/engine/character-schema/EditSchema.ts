import {
  CharacterSchemaDefinition,
  GameSave,
  GameTurn,
  WorldState,
} from "../../types";
import {
  assertCharacterSchema,
  characterFields,
  createDefaultCharacterAttributes,
  withAttributeDefaults,
} from "./CharacterSchema";
import { migrateGameSave } from "./Migration";

/** Authoring is a separate, explicit transaction. Existing values and all retry baselines must remain valid. */
export function editSaveSchema(
  save: GameSave,
  schema: CharacterSchemaDefinition,
  newWorld = false,
): GameSave {
  assertCharacterSchema(schema);
  const candidate = structuredClone(save);
  candidate.worldDefinition = {
    ...candidate.worldDefinition,
    version: 1,
    characterSchema: structuredClone(schema),
  };
  candidate.updatedAt = new Date().toISOString();
  if (newWorld) {
    candidate.id = `save_${crypto.randomUUID()}`;
    candidate.name = `${save.name} · 自定义世界`;
    candidate.createdAt = candidate.updatedAt;
    candidate.turns = [];
    candidate.worldState = {
      clock: save.worldState.clock,
      scene: structuredClone(save.worldState.scene),
      rules: {},
      entities: {
        player: {
          type: "character",
          name: "玩家",
          location: save.worldState.scene.location,
          attributes: createDefaultCharacterAttributes(schema),
          ...(schema.relationship ? { relationships: {} } : {}),
        },
      },
    };
  } else {
    const visitWorld = (world: WorldState) => {
      for (const entity of Object.values(world.entities))
        if (entity.type === "character") {
          entity.attributes = withAttributeDefaults(
            entity.attributes || {},
            characterFields(schema),
          );
          if (schema.relationship)
            for (const [id, values] of Object.entries(
              entity.relationships || {},
            ))
              entity.relationships![id] = withAttributeDefaults(
                values,
                schema.relationship.fields,
              );
        }
    };
    const visitTurn = (t: GameTurn) => {
      visitWorld(t.worldStateBefore);
      visitWorld(t.worldStateAfter);
      t.variations?.forEach(visitTurn);
    };
    visitWorld(candidate.worldState);
    candidate.turns.forEach(visitTurn);
  }
  return migrateGameSave(candidate);
}
