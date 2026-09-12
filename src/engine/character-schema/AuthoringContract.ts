import { z } from "zod";
import { CharacterFieldDefinition } from "../../types";

/** Serializable capability metadata for the existing configuration assistant.
 * Cross-field rules remain authoritative in validateCharacterSchemaDefinition. */
const field: z.ZodType<CharacterFieldDefinition> = z.lazy(() =>
  z
    .object({
      id: z.string(),
      label: z.string(),
      type: z.enum([
        "text",
        "number",
        "integer",
        "boolean",
        "enum",
        "list",
        "object",
      ]),
      description: z.string().optional(),
      llmGuidance: z.string().optional(),
      default: z.unknown().optional(),
      visibility: z.enum(["public", "private"]),
      updatePolicy: z.enum([
        "immutable",
        "setup_only",
        "dynamic",
        "append_only",
      ]),
      freedom: z.enum(["strict", "guided", "free"]),
      required: z.boolean().optional(),
      min: z.number().optional(),
      max: z.number().optional(),
      enumValues: z.array(z.string()).optional(),
      item: field.optional(),
      fields: z.array(field).optional(),
      changePolicy: z
        .object({
          mode: z.enum(["set", "delta"]).optional(),
          maxPerEvent: z.number().nonnegative().optional(),
          maxPerTurn: z.number().nonnegative().optional(),
        })
        .strict()
        .optional(),
    })
    .strict(),
);
export const worldDefinitionAuthoringContract = z
  .object({
    version: z.literal(1),
    characterSchema: z
      .object({
        version: z.literal(1),
        sections: z.array(
          z
            .object({
              id: z.string(),
              label: z.string(),
              fields: z.array(field),
            })
            .strict(),
        ),
        relationship: z
          .object({ label: z.string().optional(), fields: z.array(field) })
          .strict()
          .optional(),
      })
      .strict(),
  })
  .passthrough();
