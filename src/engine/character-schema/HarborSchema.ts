import {
  CharacterFieldDefinition as Field,
  WorldDefinition,
} from "../../types";

const text = (
  id: string,
  label: string,
  visibility: Field["visibility"],
  updatePolicy: Field["updatePolicy"],
  defaultValue = "",
): Field => ({
  id,
  label,
  type: "text",
  visibility,
  updatePolicy,
  freedom: "guided",
  default: defaultValue,
});
/** Story content, not engine ontology. Old relationship scores retain their original units. */
export const HARBOR_WORLD_DEFINITION: WorldDefinition = {
  version: 1,
  characterSchema: {
    version: 1,
    sections: [
      {
        id: "basic",
        label: "基本资料",
        fields: [
          text("appearance", "外貌", "public", "setup_only"),
          text("occupation", "职业", "public", "setup_only"),
          text("background", "个人经历", "private", "setup_only"),
          text("personality", "性格", "private", "setup_only"),
        ],
      },
      {
        id: "state",
        label: "当前状态",
        fields: [
          text("mood", "情绪", "private", "dynamic", "calm"),
          text("goal", "眼前目标", "private", "dynamic"),
        ],
      },
      {
        id: "history",
        label: "记忆",
        fields: [
          {
            ...text("memory", "记忆", "private", "append_only"),
            freedom: "free",
            llmGuidance: "只追加自己确实观察到或经历的事情，不读取他人秘密。",
          },
        ],
      },
      {
        id: "possessions",
        label: "随身物品",
        fields: [
          {
            id: "inventory",
            label: "物品",
            type: "list",
            visibility: "private",
            updatePolicy: "dynamic",
            freedom: "guided",
            default: [],
            item: {
              id: "item",
              label: "物品名称",
              type: "text",
              visibility: "private",
              updatePolicy: "dynamic",
              freedom: "guided",
            },
          },
        ],
      },
    ],
    relationship: {
      label: "关系",
      fields: [
        {
          id: "trust",
          label: "信任",
          type: "number",
          visibility: "private",
          updatePolicy: "dynamic",
          freedom: "strict",
          default: 0,
          description: "港口世界的信任分值，保留旧存档原始单位。",
          changePolicy: { mode: "delta", maxPerEvent: 15, maxPerTurn: 30 },
        },
      ],
    },
  },
};
