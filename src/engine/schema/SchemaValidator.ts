import { validateNarratorStructure } from "../narration/NarratorComposition";
import { Validator, Schema } from "jsonschema";
import draft7 from "ajv/dist/refs/json-schema-draft-07.json";
import { AgentRuntimeError } from "../errors/PipelineStageError";

// Interpret schemas rather than compiling JavaScript (blocked by Tauri's CSP).
// Validate the schema itself too, including definitions not reached by the data.
const metaValidator = new Validator();
metaValidator.addSchema(draft7 as unknown as Schema);

export interface SchemaValidationResult {
  valid: boolean;
  errors?: string;
  details?: unknown[];
}

export class SchemaValidator {
  /**
   * Validates data against a JSON schema.
   */
  static validate(schema: object, data: unknown): SchemaValidationResult {
    try {
      const definition = metaValidator.validate(schema, draft7 as unknown as Schema);
      if (!definition.valid) {
        return { valid: false, errors: `Invalid JSON Schema definition: ${definition.errors.map(e => e.stack).join("; ")}` };
      }
      const result = new Validator().validate(data, schema as Schema, { required: true });
      if (result.valid) {
        return { valid: true };
      }
      const errorText = result.errors.map(e => e.stack).join("; ");
      return {
        valid: false,
        errors: errorText,
        details: result.errors,
      };
    } catch (err: any) {
      return {
        valid: false,
        errors: `Invalid JSON Schema definition: ${err.message}`,
      };
    }
  }

  /**
   * Deterministic semantic validation for built-in agents to enforce deep nested structural constraints.
   */
  static validateAgentSemantics(agentId: string, data: any): void {
    if (!data || typeof data !== "object") {
      throw new Error(`Agent '${agentId}' output must be a non-null object`);
    }

    if (agentId === "narrator") {
      validateNarratorStructure(data);
    } else if (agentId === "input_compiler") {
      if (!Array.isArray(data.blocks)) {
        throw new Error("Input Compiler output must contain a 'blocks' array");
      }
      for (let i = 0; i < data.blocks.length; i++) {
        const b = data.blocks[i];
        if (!b || typeof b !== "object") {
          throw new Error(`Block at index ${i} must be an object`);
        }
        if (typeof b.id !== "string" || b.id.trim() === "") {
          throw new Error(`Block at index ${i} must have a non-empty string 'id'`);
        }
        if (!["normal", "wait", "time_skip", "admin"].includes(b.kind)) {
          throw new Error(`Block '${b.id}' has invalid kind '${b.kind}'`);
        }
        if (b.kind === "normal") {
          if (!Array.isArray(b.events)) {
            throw new Error(`Normal block '${b.id}' must have an 'events' array`);
          }
          for (let j = 0; j < b.events.length; j++) {
            const ev = b.events[j];
            if (!ev || typeof ev !== "object") {
              throw new Error(`Event at index ${j} in block '${b.id}' must be an object`);
            }
            if (typeof ev.id !== "string" || ev.id.trim() === "") {
              throw new Error(`Event at index ${j} in block '${b.id}' must have a non-empty string 'id'`);
            }
            if (!["action", "speech"].includes(ev.type)) {
              throw new Error(`Event '${ev.id}' has invalid type '${ev.type}'. Must be 'action' or 'speech'`);
            }
            if (ev.type === "action" && (typeof ev.op !== "string" || ev.op.trim() === "")) {
              throw new Error(`Action event '${ev.id}' must have a non-empty 'op'`);
            }
            if (ev.type === "speech" && (typeof ev.content !== "string" || ev.content.trim() === "")) {
              throw new Error(`Speech event '${ev.id}' must have non-empty 'content'`);
            }
            if (ev.duration !== undefined) {
              if (typeof ev.duration !== "number" || !Number.isFinite(ev.duration) || ev.duration < 0) {
                throw new Error(`Event '${ev.id}' duration must be a non-negative finite number`);
              }
            }
          }
        }
      }
    } else if (agentId === "perception") {
      if (!data.npcObservations || typeof data.npcObservations !== "object" || Array.isArray(data.npcObservations)) {
        throw new Error("Perception output must contain an 'npcObservations' object dictionary");
      }
      for (const [npcId, obsList] of Object.entries(data.npcObservations)) {
        if (!Array.isArray(obsList)) {
          throw new Error(`Observations for NPC '${npcId}' must be an array`);
        }
        for (let i = 0; i < obsList.length; i++) {
          const obs = (obsList as any[])[i];
          if (!obs || typeof obs !== "object") {
            throw new Error(`Observation at index ${i} for NPC '${npcId}' must be an object`);
          }
          if (typeof obs.eventId !== "string" || obs.eventId.trim() === "") {
            throw new Error(`Observation at index ${i} for NPC '${npcId}' must have a non-empty string 'eventId'`);
          }
          if (typeof obs.saw !== "boolean" || typeof obs.heard !== "boolean") {
            throw new Error(`Observation at index ${i} for NPC '${npcId}' must have boolean 'saw' and 'heard'`);
          }
        }
      }
    } else if (agentId === "npc_reaction") {
      if (data.thought !== null && typeof data.thought !== "string") {
        throw new Error("NPC Reaction 'thought' must be a string or null");
      }
      if (!Array.isArray(data.intents)) {
        throw new Error("NPC Reaction must contain an 'intents' array");
      }
      for (let i = 0; i < data.intents.length; i++) {
        const intent = data.intents[i];
        if (!intent || typeof intent !== "object") {
          throw new Error(`Intent at index ${i} must be an object`);
        }
        if (!["action", "speech", "wait"].includes(intent.type)) {
          throw new Error(`Intent at index ${i} has invalid type '${intent.type}'`);
        }
        if (intent.type === "speech" && (typeof intent.content !== "string" || intent.content.trim() === "")) {
          throw new Error(`Speech intent at index ${i} must have non-empty 'content'`);
        }
        if (intent.duration !== undefined) {
          if (typeof intent.duration !== "number" || !Number.isFinite(intent.duration) || intent.duration < 0) {
            throw new Error(`Intent at index ${i} duration must be a non-negative finite number`);
          }
        }
      }
    } else if (["world_resolver", "time_skip", "admin_patch"].includes(agentId)) {
      if (!Array.isArray(data.patches)) {
        throw new Error(`Agent '${agentId}' output must contain a 'patches' array`);
      }
      for (let i = 0; i < data.patches.length; i++) {
        const patch = data.patches[i];
        if (!patch || typeof patch !== "object") {
          throw new Error(`Patch at index ${i} must be an object`);
        }
        if (!["add", "remove", "replace", "move", "copy", "test"].includes(patch.op)) {
          throw new Error(`Patch at index ${i} has invalid op '${patch.op}'`);
        }
        if (typeof patch.path !== "string" || !patch.path.startsWith("/")) {
          throw new Error(`Patch at index ${i} path must be a string starting with '/'`);
        }
        if (["add", "replace", "test"].includes(patch.op) && patch.value === undefined) {
          throw new Error(`Patch at index ${i} ('${patch.op}') must specify a 'value'`);
        }
        if (["move", "copy"].includes(patch.op) && (typeof patch.from !== "string" || !patch.from.startsWith("/"))) {
          throw new Error(`Patch at index ${i} ('${patch.op}') must specify a 'from' string starting with '/'`);
        }
      }

      if (agentId === "world_resolver" && data.publicEvents !== undefined) {
        if (!Array.isArray(data.publicEvents)) {
          throw new Error("World Resolver 'publicEvents' must be an array if provided");
        }
        for (let i = 0; i < data.publicEvents.length; i++) {
          const ev = data.publicEvents[i];
          if (!ev || typeof ev !== "object") {
            throw new Error(`Public event at index ${i} must be an object`);
          }
          if (typeof ev.actor !== "string" || ev.actor.trim() === "") {
            throw new Error(`Public event at index ${i} must have a non-empty string 'actor'`);
          }
          if (!["action", "speech", "environment"].includes(ev.type)) {
            throw new Error(`Public event at index ${i} has invalid type '${ev.type}'`);
          }
          if (ev.type === "speech" && (typeof ev.sourceIntentId !== "string" || !ev.sourceIntentId.trim())) {
            throw new Error("Public speech must reference sourceIntentId");
          }
          if (ev.type === "speech" && (typeof ev.content !== "string" || ev.content.trim() === "")) {
            throw new Error(`Public speech event at index ${i} must have non-empty 'content'`);
          }
        }
      }
    }
  }

  /**
   * Validates data against a JSON schema or throws an AgentRuntimeError.
   */
  static validateOrThrow(
    schema: object,
    data: unknown,
    agentId?: string,
    rawOutput?: string
  ): void {
    const result = this.validate(schema, data);
    if (!result.valid) {
      throw new AgentRuntimeError(
        `Output Schema Validation Failed for agent '${agentId || "unknown"}': ${result.errors}`,
        agentId,
        "SCHEMA_VALIDATION_ERROR",
        {
          agentId,
          schemaErrors: result.errors,
          rawOutput,
          details: result.details,
        }
      );
    }

    if (agentId) {
      try {
        this.validateAgentSemantics(agentId, data);
      } catch (semErr: any) {
        throw new AgentRuntimeError(
          `Semantic Validation Failed for agent '${agentId}': ${semErr.message}`,
          agentId,
          "SEMANTIC_VALIDATION_ERROR",
          {
            agentId,
            schemaErrors: semErr.message,
            rawOutput,
          }
        );
      }
    }
  }
}
