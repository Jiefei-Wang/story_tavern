import * as jsonpatch from "fast-json-patch";
import { JsonPatchOperation, WorldState } from "../../types";
import { isValidPatchOperation, validateWorldPatchPath } from "./PatchValidator";
import { validateWorldState } from "./WorldValidator";

const applyPatchFn =
  (jsonpatch as any).default?.applyPatch || (jsonpatch as any).applyPatch;

export interface PatchApplicationResult {
  success: boolean;
  newWorld: WorldState;
  appliedPatches: JsonPatchOperation[];
  error?: string;
}

/**
 * Clones a WorldState deeply using structuredClone with fallback.
 */
export function cloneWorldState(world: WorldState): WorldState {
  if (typeof structuredClone === "function") {
    return structuredClone(world);
  }
  return JSON.parse(JSON.stringify(world));
}

export { isValidPatchOperation, validateWorldPatchPath, validateWorldState };

/**
 * Applies an array of RFC 6902 JSON patches to a WorldState atomically.
 * If any single patch is invalid or violates invariants, the entire set is rejected,
 * and the original WorldState is preserved.
 */
export function applyPatches(
  currentWorld: WorldState,
  patches: JsonPatchOperation[]
): PatchApplicationResult {
  if (!Array.isArray(patches) || patches.length === 0) {
    return {
      success: true,
      newWorld: cloneWorldState(currentWorld),
      appliedPatches: [],
    };
  }

  // 1. Strict pre-validation: every single patch must be valid
  for (let i = 0; i < patches.length; i++) {
    const patch = patches[i];
    if (!isValidPatchOperation(patch)) {
      return {
        success: false,
        newWorld: currentWorld,
        appliedPatches: [],
        error: `Patch set rejected atomically: patch at index ${i} is invalid: ${JSON.stringify(patch)}`,
      };
    }
  }

  const cloned = cloneWorldState(currentWorld);

  // 2. Atomic application using fast-json-patch
  try {
    const result = applyPatchFn(cloned, patches, true, false);
    const newWorld = result.newDocument as WorldState;

    // 3. Strict post-validation: WorldState invariants must hold
    validateWorldState(newWorld);

    return {
      success: true,
      newWorld,
      appliedPatches: patches,
    };
  } catch (err: any) {
    return {
      success: false,
      newWorld: currentWorld,
      appliedPatches: [],
      error: `Patch application failed atomically: ${err?.message || String(err)}`,
    };
  }
}
