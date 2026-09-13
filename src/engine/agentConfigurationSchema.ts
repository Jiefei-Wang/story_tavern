import { z } from "zod";
import { REASONING_EFFORT_OPTIONS } from "../types";
const text = z.string().trim().min(1);
const object = z.record(z.string(), z.json());
const parameters = z.object({ temperature: z.number().min(0).max(2).optional(), maxTokens: z.number().int().min(0).optional(), topP: z.number().min(0).max(1).optional(), extraBody: object.optional() }).passthrough();
export const assistantAgentSchema = z.object({
  prompt: z.string().trim().min(1).optional(),
  id: text, name: text, description: z.string(), tags: z.array(z.string()).optional(), version: z.string().optional(), updatedAt: z.string().optional(),
  messages: z.array(z.object({ id: text, role: z.enum(["system", "user", "assistant"]), content: z.string() }).passthrough()),
  inputs: z.array(z.object({ name: text, type: text, description: z.string().optional(), required: z.boolean() }).passthrough()),
  outputSchema: object.nullable(), defaults: parameters,
}).passthrough();
export const assistantGroupSchema = z.object({ id: text, name: text, description: z.string().optional(), updatedAt: z.string().optional(), bindings: z.array(z.object({
  agentId: text, backendId: text, model: text,
  overrides: parameters.extend({ reasoningEffort: z.enum(REASONING_EFFORT_OPTIONS.map(o => o.value)).optional() }).optional(),
}).passthrough()) }).passthrough();
