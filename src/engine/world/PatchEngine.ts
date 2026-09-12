import * as jsonpatch from "fast-json-patch";
import { JsonPatchOperation, WorldState } from "../../types";

const applyPatchFn =
  (jsonpatch as any).default?.applyPatch || (jsonpatch as any).applyPatch;

export interface PatchApplicationResult {
  success: boolean;
  newWorld: WorldState;
  appliedPatches: JsonPatchOperation[];
  error?: string;
}

/**
 * Clones a WorldState deeply.
 */
export function cloneWorldState(world: WorldState): WorldState {
  return JSON.parse(JSON.stringify(world));
}

/**
 * Validates whether an object is a valid RFC 6902 JSON patch operation.
 */
export function isValidPatchOperation(op: unknown): op is JsonPatchOperation {
  if (typeof op !== "object" || op === null) return false;
  const o = op as Record<string, unknown>;
  const validOps = ["add", "remove", "replace", "move", "copy", "test"];
  return (
    typeof o.op === "string" &&
    validOps.includes(o.op) &&
    typeof o.path === "string" &&
    o.path.startsWith("/")
  );
}

/**
 * Applies an array of RFC 6902 JSON patches to a WorldState immutably.
 */
export function applyPatches(
  currentWorld: WorldState,
  patches: JsonPatchOperation[]
): PatchApplicationResult {
  const cloned = cloneWorldState(currentWorld);
  const validPatches: any[] = [];

  for (const patch of patches) {
    if (isValidPatchOperation(patch)) {
      validPatches.push(patch);
    }
  }

  if (validPatches.length === 0) {
    return {
      success: true,
      newWorld: cloned,
      appliedPatches: [],
    };
  }

  try {
    const result = applyPatchFn(cloned, validPatches, true, false);
    return {
      success: true,
      newWorld: result.newDocument as WorldState,
      appliedPatches: patches,
    };
  } catch (err: any) {
    return {
      success: false,
      newWorld: currentWorld,
      appliedPatches: [],
      error: `Patch application failed: ${err?.message || String(err)}`,
    };
  }
}
