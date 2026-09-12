import { JsonPatchOperation } from "../../types";

const DANGEROUS_KEYS = new Set(["__proto__", "prototype", "constructor"]);
const PROTECTED_ROOTS = new Set(["/clock", "/scene", "/entities", "/rules"]);

/**
 * Decodes an RFC 6901 JSON pointer token.
 * '~1' -> '/', '~0' -> '~'
 */
function decodeJsonPointerToken(token: string): string {
  return token.replace(/~1/g, "/").replace(/~0/g, "~");
}

/**
 * Validates a patch path against security restrictions and root immutability rules.
 * Throws an Error if the path is invalid or prohibited.
 */
export function validateWorldPatchPath(path: string, op?: string): void {
  if (typeof path !== "string" || !path.startsWith("/")) {
    throw new Error(`Invalid patch path '${path}': must be a non-empty string starting with '/'`);
  }

  if (path === "/" || path.trim() === "") {
    throw new Error("Prohibited patch path: modifying the root document '/' directly is forbidden");
  }

  // Tokenize path and check against prototype pollution
  const tokens = path.split("/").slice(1);
  for (const rawToken of tokens) {
    const decoded = decodeJsonPointerToken(rawToken);
    if (DANGEROUS_KEYS.has(decoded.toLowerCase())) {
      throw new Error(`Prohibited patch path '${path}': prototype pollution attempt detected ('${decoded}')`);
    }
  }

  // Check top-level root
  const rootSegment = `/${tokens[0]}`;
  const validRoots = new Set(["/clock", "/scene", "/entities", "/rules"]);
  if (!validRoots.has(rootSegment)) {
    throw new Error(`Prohibited patch path '${path}': root segment '${rootSegment}' is not a permitted WorldState branch`);
  }

  // Disallow removing core root branches
  if (op === "remove" && PROTECTED_ROOTS.has(path)) {
    throw new Error(`Prohibited patch operation: cannot remove protected core branch '${path}'`);
  }
}

/**
 * Validates whether an object is a strictly conforming RFC 6902 JSON patch operation.
 */
export function isValidPatchOperation(op: unknown): op is JsonPatchOperation {
  if (typeof op !== "object" || op === null) return false;
  const o = op as Record<string, unknown>;

  const validOps = ["add", "remove", "replace", "move", "copy", "test"];
  if (typeof o.op !== "string" || !validOps.includes(o.op)) {
    return false;
  }

  if (typeof o.path !== "string" || !o.path.startsWith("/")) {
    return false;
  }

  try {
    validateWorldPatchPath(o.path, o.op);
  } catch {
    return false;
  }

  switch (o.op) {
    case "add":
    case "replace":
    case "test":
      if (o.value === undefined) {
        return false;
      }
      break;

    case "move":
    case "copy":
      if (typeof o.from !== "string" || !o.from.startsWith("/")) {
        return false;
      }
      try {
        validateWorldPatchPath(o.from);
      } catch {
        return false;
      }
      break;

    case "remove":
      // No extra fields required
      break;

    default:
      return false;
  }

  return true;
}
