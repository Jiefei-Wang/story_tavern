import { WorldState } from "../../types";

const ALLOWED_ENTITY_TYPES = new Set(["character", "object", "location", "item"]);

/**
 * Validates the fundamental invariants of a WorldState object.
 * Throws an Error if any invariant is violated.
 */
export function validateWorldState(world: unknown): asserts world is WorldState {
  if (typeof world !== "object" || world === null) {
    throw new Error("WorldState invariant failed: world state must be a non-null object");
  }

  const w = world as Partial<WorldState>;

  // Clock invariant
  if (typeof w.clock !== "string" || w.clock.trim() === "") {
    throw new Error("WorldState invariant failed: clock must be a non-empty string");
  }

  // Scene invariant
  if (typeof w.scene !== "object" || w.scene === null) {
    throw new Error("WorldState invariant failed: scene must be a non-null object");
  }
  if (typeof w.scene.location !== "string" || w.scene.location.trim() === "") {
    throw new Error("WorldState invariant failed: scene.location must be a non-empty string");
  }

  // Entities invariant
  if (typeof w.entities !== "object" || w.entities === null || Array.isArray(w.entities)) {
    throw new Error("WorldState invariant failed: entities must be a dictionary object");
  }

  // Entity items invariant
  for (const [entityId, entity] of Object.entries(w.entities)) {
    if (typeof entity !== "object" || entity === null) {
      throw new Error(`WorldState invariant failed: entity '${entityId}' must be a non-null object`);
    }
    if (typeof entity.type !== "string" || !ALLOWED_ENTITY_TYPES.has(entity.type)) {
      throw new Error(
        `WorldState invariant failed: entity '${entityId}' has invalid type '${entity.type}'. Allowed: ${Array.from(ALLOWED_ENTITY_TYPES).join(", ")}`
      );
    }
  }

  // Rules invariant
  if (typeof w.rules !== "object" || w.rules === null || Array.isArray(w.rules)) {
    throw new Error("WorldState invariant failed: rules must be an object");
  }
}
