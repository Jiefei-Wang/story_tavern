import { AgentMessage } from "../../types";

export interface PlaceholderMatch {
  raw: string; // e.g. "{{json npc}}"
  type: "default" | "json" | "text";
  path: string; // e.g. "npc"
  exists: boolean;
  resolvedValue?: unknown;
}

/**
 * Safely extracts a value from a nested object via dot notation.
 */
export function getNestedValue(obj: unknown, path: string): unknown {
  if (obj === null || obj === undefined) return undefined;
  if (!path || path.trim() === "") return obj;

  const parts = path.trim().split(".");
  let current: any = obj;

  for (const part of parts) {
    if (current === null || current === undefined) {
      return undefined;
    }
    current = current[part];
  }

  return current;
}

const PLACEHOLDER_REGEX = /\{\{\s*(json|text)?\s*([a-zA-Z0-9_.]+)\s*\}\}/g;

/**
 * Extracts and inspects all placeholders in a template string against the given context.
 */
export function inspectPlaceholders(
  template: string,
  context: Record<string, unknown>
): PlaceholderMatch[] {
  const matches: PlaceholderMatch[] = [];
  const regex = new RegExp(PLACEHOLDER_REGEX);
  let match: RegExpExecArray | null;

  while ((match = regex.exec(template)) !== null) {
    const raw = match[0];
    const modifier = match[1] as "json" | "text" | undefined;
    const path = match[2];
    const val = getNestedValue(context, path);

    matches.push({
      raw,
      type: modifier === "json" ? "json" : modifier === "text" ? "text" : "default",
      path,
      exists: val !== undefined,
      resolvedValue: val,
    });
  }

  return matches;
}

/**
 * Replaces placeholders in a template string with context values.
 */
export function renderTemplate(
  template: string,
  context: Record<string, unknown>
): string {
  if (!template) return "";

  return template.replace(PLACEHOLDER_REGEX, (_full, modifier, path) => {
    const value = getNestedValue(context, path);

    if (value === undefined) {
      // If undefined, retain original placeholder or return empty string
      return `[UNDEFINED: ${path}]`;
    }

    if (modifier === "json") {
      try {
        return JSON.stringify(value, null, 2);
      } catch {
        return String(value);
      }
    }

    if (typeof value === "object" && value !== null) {
      try {
        return JSON.stringify(value, null, 2);
      } catch {
        return String(value);
      }
    }

    return String(value);
  });
}

/**
 * Renders an array of AgentMessages into concrete OpenAI-compatible messages.
 */
export function renderMessages(
  messages: AgentMessage[],
  context: Record<string, unknown>
): Array<{ role: "system" | "user" | "assistant"; content: string }> {
  return messages.map((m) => ({
    role: m.role,
    content: renderTemplate(m.content, context),
  }));
}

export const PlaceholderEngine = {
  getNestedValue,
  inspectPlaceholders,
  renderTemplate,
  renderMessages,
};
