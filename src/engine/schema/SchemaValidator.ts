import Ajv from "ajv";
import { AgentRuntimeError } from "../errors/PipelineStageError";

const ajv = new Ajv({
  allErrors: true,
  strict: false,
  coerceTypes: false,
});

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
      const validate = ajv.compile(schema);
      const valid = validate(data) as boolean;
      if (valid) {
        return { valid: true };
      }
      const errorText = ajv.errorsText(validate.errors, { dataVar: "output" });
      return {
        valid: false,
        errors: errorText,
        details: validate.errors || undefined,
      };
    } catch (err: any) {
      return {
        valid: false,
        errors: `Invalid JSON Schema definition: ${err.message}`,
      };
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
  }
}
