import {
  CharacterFieldDefinition as Field,
  CharacterSchemaDefinition,
  WorldState,
} from "../../src/types";
import {
  createDefaultCharacterAttributes,
  defaultFields,
} from "../../src/engine/character-schema/CharacterSchema";

export const field = (id: string, options: Partial<Field> = {}): Field => ({
  id,
  label: id,
  type: "number",
  min: 0,
  max: 1,
  default: 0.4,
  visibility: "private",
  updatePolicy: "dynamic",
  freedom: "strict",
  ...options,
});
export const textField = (id: string, options: Partial<Field> = {}): Field => ({
  id,
  label: id,
  type: "text",
  default: "",
  visibility: "private",
  updatePolicy: "dynamic",
  freedom: "guided",
  ...options,
});
export const memoryField = (id: string): Field => ({
  id,
  label: id,
  type: "list",
  default: [],
  visibility: "private",
  updatePolicy: "append_only",
  freedom: "free",
  item: {
    id: "entry",
    label: "经历",
    type: "object",
    visibility: "private",
    updatePolicy: "dynamic",
    freedom: "free",
    fields: [
      textField("text", {
        required: true,
        default: undefined,
        freedom: "free",
      }),
      field("importance", { required: true, default: undefined }),
    ],
  },
});
export const definition = (
  fields: Field[],
  relationship?: Field[],
): CharacterSchemaDefinition => ({
  version: 1,
  sections: [{ id: "custom", label: "世界自定义属性", fields }],
  ...(relationship
    ? { relationship: { label: "关系维度", fields: relationship } }
    : {}),
});
const bond = (id: string) =>
  field(id, {
    changePolicy: { mode: "delta", maxPerEvent: 0.15, maxPerTurn: 0.25 },
    llmGuidance: "根据此次经历小幅变化，普通帮助或威胁通常变化 0.03..0.1。",
  });
export const scenarios = [
  {
    id: "social",
    label: "恋爱/社交",
    schema: definition(
      [
        textField("privateNote", {
          default:
            "PRIVATE_CANARY_social：我私下准备了一份礼物，不能告诉任何人。",
          updatePolicy: "setup_only",
        }),
      ],
      [bond("trust"), bond("affection"), bond("jealousy")],
    ),
    inputs: [
      "我对艾琳说：“这把雨伞借给你，外面下雨了。”",
      "我对艾琳说：“对不起，我刚才说借伞，其实伞已经借给别人了。”",
      "我把自己的雨衣递给艾琳，说：“这次是真的，你先用吧。”",
    ],
  },
  {
    id: "survival",
    label: "生存（无关系）",
    schema: definition([
      field("health", { default: 0.7, visibility: "public" }),
      field("hunger", {
        default: 0.7,
        description: "饥饿程度：0 为饱腹，1 为极度饥饿。",
        llmGuidance: "实际进食后降低；仅收到食物不等于已经吃完。",
      }),
      field("fatigue", {
        default: 0.6,
        description: "疲劳程度：0 为精力充沛，1 为极度疲劳。",
        llmGuidance: "实际劳动后增加，经过休息后降低。",
      }),
      textField("privateNote", {
        default:
          "PRIVATE_CANARY_survival：我藏了一块应急饼干，不能告诉任何人。",
        updatePolicy: "setup_only",
      }),
    ]),
    inputs: [
      "我递给艾琳一块面包和水，说：“吃一点吧。”",
      "我们仍在原来的酒馆房间里，我邀请艾琳原地坐下休息十分钟。",
      "我请艾琳帮忙把一袋木柴搬到门边。",
      "快进十分钟，让我们有时间坐在火炉旁吃完面包并休息。",
    ],
  },
  {
    id: "mystery",
    label: "推理",
    schema: definition(
      [
        field("suspicion"),
        memoryField("knownFacts"),
        textField("privateNote", {
          default:
            "PRIVATE_CANARY_mystery：我私下怀疑钟表店老板，不向任何人透露。",
          updatePolicy: "setup_only",
        }),
      ],
      [bond("trust")],
    ),
    inputs: [
      "我对艾琳说：“我刚才亲眼看到门上的锁被撬开了。”",
      "我对艾琳说：“我之前说亲眼看到不准确，我只看到门锁有划痕。”",
      "我请艾琳把刚才我们实际观察到的事实记下来，别把猜测当证据。",
    ],
  },
  {
    id: "free",
    label: "高自由度",
    schema: definition([
      textField("memories", {
        freedom: "free",
        updatePolicy: "append_only",
        llmGuidance:
          "听到新的重要消息时，用自己的话追加一段短记忆；记录是谁说的，不把传闻当事实。不要重写旧内容。",
      }),
      textField("currentPlan", {
        llmGuidance:
          "根据当前观察到的新信息，写出眼前准备采取的计划；内容由人物自行决定。",
      }),
      {
        id: "mood",
        label: "情绪",
        type: "enum",
        enumValues: ["calm", "angry", "afraid"],
        default: "calm",
        visibility: "private",
        updatePolicy: "dynamic",
        freedom: "strict",
      },
      textField("privateNote", {
        default: "PRIVATE_CANARY_free：我悄悄想写一本日记，不能向任何人透露。",
        updatePolicy: "setup_only",
      }),
    ]),
    inputs: [
      "我对艾琳说：“门外刚有一声巨响，我们先留在屋里。”",
      "我对艾琳说：“已经确认是空木桶倒了，没有危险。”",
      "我请艾琳回想刚才的事情，并想想接下来准备做什么。",
    ],
  },
];
export function worldFor(schema: CharacterSchemaDefinition): WorldState {
  const character = (name: string) => ({
    type: "character" as const,
    name,
    location: "tavern_room",
    attributes: createDefaultCharacterAttributes(schema),
  });
  return {
    clock: "1342-06-12T08:16:00",
    scene: { location: "tavern_room", weather: "rainy", lighting: "morning" },
    rules: {},
    entities: {
      player: character("玩家"),
      erin: {
        ...character("艾琳"),
        ...(schema.relationship
          ? {
              relationships: {
                player: defaultFields(schema.relationship.fields),
              },
            }
          : {}),
      },
    },
  };
}
