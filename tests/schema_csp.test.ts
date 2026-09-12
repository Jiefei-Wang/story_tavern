import test from "node:test";
import assert from "node:assert/strict";
import { SchemaValidator } from "../src/engine/schema/SchemaValidator";
import { BUILTIN_AGENTS } from "../src/db/initialData";

test("built-in schema validates admin blocks without generated code", () => {
  const schema = BUILTIN_AGENTS.find(a => a.id === "input_compiler")!.outputSchema!;
  assert.equal(SchemaValidator.validate(schema, {
    blocks: [{ id: "b1", kind: "admin", command: "让卫兵晕倒" }],
  }).valid, true);
  assert.equal(SchemaValidator.validate(schema, { blocks: [{ id: "b1", kind: "invalid" }] }).valid, false);
});

test("interpreted validation enforces references, alternatives and strict types", () => {
  const schema = {
    type: "object", additionalProperties: false, required: ["value"],
    definitions: { count: { type: "integer", minimum: 1 } },
    properties: { value: { oneOf: [{ $ref: "#/definitions/count" }, { const: "unknown" }] } },
  };
  for (const value of [1, "unknown"]) assert.equal(SchemaValidator.validate(schema, { value }).valid, true);
  for (const data of [{ value: "1" }, { value: 0 }, {}, { value: 1, extra: true }, undefined]) {
    assert.equal(SchemaValidator.validate(schema, data).valid, false);
  }
});

test("invalid schema definitions are rejected even in unused properties", () => {
  const result = SchemaValidator.validate({ type: "object", properties: { unused: { type: "typo" } } }, {});
  assert.equal(result.valid, false);
  assert.match(result.errors!, /Invalid JSON Schema definition/);
});
