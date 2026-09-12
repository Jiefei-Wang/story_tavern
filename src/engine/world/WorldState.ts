import { WorldState } from "../../types";

export const INITIAL_HARBOR_TAVERN_WORLD: WorldState = {
  clock: "1342-06-12T08:16:00",
  scene: {
    location: "harbor_tavern",
    weather: "clear",
    lighting: "morning",
    description:
      "海风中夹杂着咸涩与麦芽酒的香气。清晨的酒馆外，几只海鸥在石板路上啄食碎屑，远处的码头传来起锚与号子声。",
  },
  entities: {
    player: {
      type: "character",
      name: "玩家 (Player)",
      location: "tavern_outside",
      inventory: ["copper_coins_x10", "travel_cloak"],
      mentalState: {
        mood: "calm",
      },
    },
    erin: {
      type: "character",
      name: "艾琳 (Erin)",
      location: "tavern_outside",
      mentalState: {
        mood: "uneasy",
      },
      relationships: {
        player: 20,
      },
      goal: "找到明早上船离开港口的门路",
      memory: "昨晚听见卫兵在码头加强戒备的密谈，正急于寻找可信任的同行者。",
    },
    guard: {
      type: "character",
      name: "港口卫兵 (Guard)",
      location: "tavern_outside",
      mentalState: {
        mood: "suspicious",
      },
      relationships: {
        player: -5,
      },
      goal: "盘查可疑流动人员，防止走私偷渡",
      memory: "上级命令今天必须严防死守，盘查任何在码头附近徘徊的陌生面孔。",
    },
    tavern_owner: {
      type: "character",
      name: "酒馆老板 (Tavern Owner)",
      location: "tavern_bar",
      mentalState: {
        mood: "cheerful",
      },
      relationships: {
        player: 10,
      },
      goal: "招揽顾客多卖几桶麦酒，维持小店平安",
      memory: "昨晚有几个走私贩在角落窃窃私语，但他不想卷入麻烦。",
    },
    door_01: {
      type: "object",
      name: "酒馆木门",
      location: "tavern_outside",
      open: true,
      locked: false,
    },
    harbor_ship: {
      type: "object",
      name: "出海商船",
      location: "harbor_dock",
      open: false,
      locked: true,
    },
  },
  rules: {
    magic: {
      resurrection: true,
      teleportation: false,
    },
    harbor: {
      curfew: false,
      inspectLevel: "medium",
    },
  },
};
