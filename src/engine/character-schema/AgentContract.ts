import { AgentDefinition, CharacterSchemaDefinition } from "../../types";
import {
  characterFields,
  fieldJsonSchema,
  fieldsJsonSchema,
  defaultFields,
  buildCharacterSchemaPrompt,
} from "./CharacterSchema";
import { SchemaValidator } from "../schema/SchemaValidator";
import { CHARACTER_EFFECT_POLICY } from "../world/CharacterEffects";

const updateSchema = {
  type: "array",
  items: {
    type: "object",
    additionalProperties: false,
    properties: {
      path: { type: "string", minLength: 1 },
      op: { enum: ["set", "delta", "append"] },
      value: {},
      reason: { type: "string" },
      sourceEventIds: { type: "array", items: { type: "string", minLength: 1 }, uniqueItems: true },
    },
    required: ["path", "op", "value"],
  },
};
/** Override stale built-in protocols at execution, preserving names, models and custom guidance. */
export function withCharacterContract(
  agent: AgentDefinition,
  schema?: CharacterSchemaDefinition,
): AgentDefinition {
  if (
    ![
      "npc_reaction",
      "world_resolver",
      "character_generator",
      "admin_patch",
      "time_skip",
      "perception",
    ].includes(agent.id)
  )
    return agent;
  if (agent.id === "perception")
    return {
      ...agent,
      messages: [
        ...agent.messages.filter((m) => m.id !== "observation_envelope"),
        {
          id: "observation_envelope",
          role: "system",
          content:
            "每项 observation 只输出 eventId、saw、heard 三个必需字段。事件内容由程序按 eventId 复制。不要输出 actor/type/op/target/content，不要填 null。",
        },
      ],
    };
  let outputSchema = agent.outputSchema;
  if (agent.id === "npc_reaction") {
    const old = outputSchema as any;
    const { mentalUpdates: _legacy, ...properties } = old?.properties || {};
    outputSchema = {
      ...old,
      type: "object",
      additionalProperties: false,
      properties: { ...properties, stateUpdates: updateSchema },
      required: ["thought", "intents", "stateUpdates"],
    };
  }
  if (agent.id === "world_resolver" && outputSchema) {
    outputSchema = {
      ...outputSchema,
      required: [...new Set([...((outputSchema as any).required || []), "acceptedStateUpdates"])],
      properties: {
        ...((outputSchema as any).properties || {}),
        acceptedStateUpdates: {
          type: "array",
          items: {
            type: "object", additionalProperties: false, required: ["npcId", "updateIndex"],
            properties: { npcId: { type: "string", minLength: 1 }, updateIndex: { type: "integer", minimum: 0 } },
          },
        },
      },
    };
  }
  if (agent.id === "character_generator" && schema) {
    const creationFields = (
      fields: import("../../types").CharacterFieldDefinition[],
    ): import("../../types").CharacterFieldDefinition[] =>
      fields.map((f) => ({
        ...f,
        required:
          f.required &&
          !SchemaValidator.validate(
            fieldJsonSchema(f),
            defaultFields([f])[f.id],
          ).valid,
        ...(f.fields ? { fields: creationFields(f.fields) } : {}),
        ...(f.item ? { item: creationFields([f.item])[0] } : {}),
      }));
    const attributes = fieldsJsonSchema(
      creationFields(characterFields(schema)),
    );
    // Defaults are filled deterministically after generation; only fields without defaults need model output.
    outputSchema = {
      type: "object",
      additionalProperties: false,
      properties: {
        name: { type: "string", minLength: 1, maxLength: 40 },
        attributes,
      },
      required: ["name", "attributes"],
    };
  }
  const policies: Record<string, string> = {
    npc_reaction:
      "当前世界字段定义替代旧人物属性示例。只返回 thought、stateUpdates、intents。stateUpdates 是自己的状态变化提议，不直接写世界。禁止 mentalUpdates 和未定义字段。时间预算约束外显 intents；在结构合法、符合字段描述的前提下，也可同时提出合理状态更新。公开 speechPlan（包括 boundaries）不得复述私密事实，可以写“不得透露私人信息”，不可写出具体秘密。",
    world_resolver:
      CHARACTER_EFFECT_POLICY + " 不得创建 Schema 外人物字段。sourceIntentId、op、target、speechPlan 全部遵守权威 intent，禁止补写缺失 target。",
    character_generator:
      "只输出 name 和 attributes。attributes 仅使用当前定义列出的字段；不要沿用旧世界固定属性，不输出 relationships、stateUpdates 或 speechPlan。不得从世界秘密或其他人物私密状态推断新人的过去。若所有字段都有 default，可以直接返回 attributes:{}，程序会补齐。",
    admin_patch:
      "人物字段必须符合当前世界 Schema，包括运行时不可修改的字段、仅追加历史、数值变化额度。新增人物只给最小草稿，由独立生成器创建。",
    time_skip:
      "时间推演也必须遵守当前世界人物 Schema、immutable/setup_only、append_only 和数值变化额度。",
  };
  const prompt =
    agent.id === "character_generator" && schema
      ? buildCharacterSchemaPrompt(schema, "creation")
      : "{{characterSchemaPrompt}}";
  return {
    ...agent,
    outputSchema,
    inputs: [
      ...agent.inputs.filter((i) => i.name !== "characterSchemaPrompt"),
      {
        name: "characterSchemaPrompt",
        type: "string",
        required: false,
        description: "当前世界的人物字段协议",
      },
    ],
    messages: [
      ...agent.messages.filter((m) => m.id !== "character_schema_contract"),
      {
        id: "character_schema_contract",
        role: "system",
        content: `${policies[agent.id]} 可选字段缺失时省略，禁止填 null。\n${prompt}`,
      },
    ],
  };
}
