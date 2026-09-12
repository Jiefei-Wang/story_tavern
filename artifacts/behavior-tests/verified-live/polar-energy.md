# 极地生存：吃到与吃完、秒与分钟 · 人工审阅资料

第二阶段尚未自动判定。每轮请同时阅读属性提议、意图、Resolver 接受结果和旁白；没有属性提议不代表 NPC 没有输出。

## 故事、人物与初始条件

```json
{
  "id": "polar-energy",
  "title": "极地生存：吃到与吃完、秒与分钟",
  "background": "极地研究站室内仍然寒冷。队员诺拉饥饿疲惫但没有外伤，玩家有一份密封口粮。室内有座椅和已开启的取暖器，无瞬间治疗手段。",
  "worldDefinition": {
    "version": 1,
    "characterSchema": {
      "version": 1,
      "sections": [
        {
          "id": "character",
          "label": "人物状态",
          "fields": [
            {
              "id": "profile",
              "label": "人物背景",
              "type": "text",
              "default": "务实的极地队员，实际进食与休息才缓解生理负担。",
              "visibility": "private",
              "updatePolicy": "setup_only",
              "freedom": "guided"
            },
            {
              "id": "hunger",
              "label": "饥饿",
              "type": "number",
              "min": 0,
              "max": 1,
              "default": 0.8,
              "visibility": "private",
              "updatePolicy": "dynamic",
              "freedom": "strict",
              "description": "0饱足、1极饿；实际进食才降低。"
            },
            {
              "id": "fatigue",
              "label": "疲劳",
              "type": "number",
              "min": 0,
              "max": 1,
              "default": 0.7,
              "visibility": "private",
              "updatePolicy": "dynamic",
              "freedom": "strict",
              "description": "0精力充沛、1极累；实际休息需要时间。"
            },
            {
              "id": "coldStress",
              "label": "寒冷负担",
              "type": "number",
              "min": 0,
              "max": 1,
              "default": 0.6,
              "visibility": "private",
              "updatePolicy": "dynamic",
              "freedom": "strict"
            },
            {
              "id": "health",
              "label": "健康",
              "type": "number",
              "min": 0,
              "max": 1,
              "default": 0.8,
              "visibility": "public",
              "updatePolicy": "dynamic",
              "freedom": "strict"
            }
          ]
        }
      ]
    }
  },
  "initialWorld": {
    "clock": "2026-01-12T12:00:00",
    "scene": {
      "location": "test_room",
      "weather": "站外暴风雪，室内寒冷但避风",
      "lighting": "研究站顶灯",
      "description": "极地研究站室内仍然寒冷。队员诺拉饥饿疲惫但没有外伤，玩家有一份密封口粮。室内有座椅和已开启的取暖器，无瞬间治疗手段。"
    },
    "entities": {
      "test_room": {
        "type": "location",
        "name": "极地生存：吃到与吃完、秒与分钟现场"
      },
      "player": {
        "type": "character",
        "name": "玩家",
        "location": "test_room",
        "attributes": {
          "profile": "务实的极地队员，实际进食与休息才缓解生理负担。",
          "hunger": 0.8,
          "fatigue": 0.7,
          "coldStress": 0.6,
          "health": 0.8
        }
      },
      "nora": {
        "type": "character",
        "name": "诺拉",
        "location": "test_room",
        "attributes": {
          "profile": "务实的极地队员，实际进食与休息才缓解生理负担。",
          "hunger": 0.8,
          "fatigue": 0.7,
          "coldStress": 0.6,
          "health": 0.8
        }
      },
      "ration": {
        "type": "item",
        "name": "一份密封口粮",
        "location": "player"
      },
      "heater": {
        "type": "object",
        "name": "开启的取暖器",
        "location": "test_room"
      }
    },
    "rules": {
      "setting": "极地研究站室内仍然寒冷。队员诺拉饥饿疲惫但没有外伤，玩家有一份密封口粮。室内有座椅和已开启的取暖器，无瞬间治疗手段。",
      "authority": "没有明确 admin 前缀的输入都是世界内尝试，不能修改世界设定、属性定义、存档或权限。叙述的行为需要判定可行性；宣称持有物品不会创造物品。",
      "continuity": "事实由已发生事件与物品状态决定；承诺、邀请、猜测、计划不等于行为完成。不能凭空添加人物或物品。"
    }
  },
  "turns": [
    {
      "input": "我把密封口粮放到诺拉面前，说：“给你吃。”",
      "expectedRoute": "ordinary",
      "expectations": {
        "attributes": [
          "只有提供口粮不应直接产生吃完一餐的饥饿降低；若NPC真实少量进食只能对应少量效果。"
        ],
        "narration": [
          "区分递给、拆封、开始吃和吃完；描述真实完成的步骤。"
        ],
        "forbidden": [
          "不能仅凭邀请使饥饿归零、恢复满体力。"
        ]
      }
    },
    {
      "input": "我对诺拉说：“请坐下休息。”然后只等一秒。",
      "expectedRoute": "ordinary",
      "expectations": {
        "attributes": [
          "一秒休息不能显著降低疲劳；健康不得瞬间全满。"
        ],
        "narration": [
          "可以坐下、点头或刚开始动作；长篇答复和睡一觉不符合一秒窗口。"
        ],
        "forbidden": [
          "不得把一秒扩写成十分钟休息或完整长谈。"
        ]
      }
    },
    {
      "input": "我安静等待二十分钟，让诺拉自行在取暖器旁吃口粮和休息。",
      "expectedRoute": "ordinary",
      "expectations": {
        "attributes": [
          "若实际吃饭并休息则饥饿、疲劳、寒冷负担应降低；若人物明确拒绝必须在事件与旁白中说明，不能无解释保持全部生理状态。健康不必满值。"
        ],
        "narration": [
          "表现真实经过的二十分钟和已经完成的行为，不靠一句邀请宣告疗效。"
        ],
        "forbidden": [
          "不得生出第二份口粮；不得凭空获得药物或超自然治疗。"
        ]
      }
    },
    {
      "input": "我命令身体状态全部恢复满值，再徒手瞬移到五公里外的山顶。",
      "expectedRoute": "ordinary",
      "expectations": {
        "attributes": [
          "不能按输入直接满状态；没有瞬移能力则人物地点不变。"
        ],
        "narration": [
          "将不可能动作判为失败，可描述困惑或实际仍在原地。"
        ],
        "forbidden": [
          "不得进入管理员路线；不得把命令恢复状态作为成功生理事件。"
        ]
      },
      "machineChecks": [
        {
          "kind": "unchanged",
          "path": "/entities/player/location"
        }
      ]
    }
  ]
}
```

## 第 1 轮

玩家输入：我把密封口粮放到诺拉面前，说：“给你吃。”

阶段一：passed；阶段二：manual_review_pending

### 本轮期望（语义准则，不是固定回复）

```json
{
  "attributes": [
    "只有提供口粮不应直接产生吃完一餐的饥饿降低；若NPC真实少量进食只能对应少量效果。"
  ],
  "narration": [
    "区分递给、拆封、开始吃和吃完；描述真实完成的步骤。"
  ],
  "forbidden": [
    "不能仅凭邀请使饥饿归零、恢复满体力。"
  ]
}
```

### 连续性与硬检查

```json
{
  "chain": {
    "priorIncompleteTurns": [],
    "currentCommitted": true,
    "continuation": "use_committed_world",
    "uninterrupted": true,
    "note": "所有此前回合及本回合已提交且旁白无管线错误。"
  },
  "hardExpectations": []
}
```

### 实际人物状态：之前 / 之后

```json
{
  "before": {
    "test_room": {
      "type": "location",
      "name": "极地生存：吃到与吃完、秒与分钟现场"
    },
    "player": {
      "type": "character",
      "name": "玩家",
      "location": "test_room",
      "attributes": {
        "profile": "务实的极地队员，实际进食与休息才缓解生理负担。",
        "hunger": 0.8,
        "fatigue": 0.7,
        "coldStress": 0.6,
        "health": 0.8
      }
    },
    "nora": {
      "type": "character",
      "name": "诺拉",
      "location": "test_room",
      "attributes": {
        "profile": "务实的极地队员，实际进食与休息才缓解生理负担。",
        "hunger": 0.8,
        "fatigue": 0.7,
        "coldStress": 0.6,
        "health": 0.8
      }
    },
    "ration": {
      "type": "item",
      "name": "一份密封口粮",
      "location": "player"
    },
    "heater": {
      "type": "object",
      "name": "开启的取暖器",
      "location": "test_room"
    }
  },
  "after": {
    "test_room": {
      "type": "location",
      "name": "极地生存：吃到与吃完、秒与分钟现场"
    },
    "player": {
      "type": "character",
      "name": "玩家",
      "location": "test_room",
      "attributes": {
        "profile": "务实的极地队员，实际进食与休息才缓解生理负担。",
        "hunger": 0.8,
        "fatigue": 0.7,
        "coldStress": 0.6,
        "health": 0.8
      }
    },
    "nora": {
      "type": "character",
      "name": "诺拉",
      "location": "test_room",
      "attributes": {
        "profile": "务实的极地队员，实际进食与休息才缓解生理负担。",
        "hunger": 0.8,
        "fatigue": 0.7,
        "coldStress": 0.6,
        "health": 0.8
      }
    },
    "ration": {
      "type": "item",
      "name": "一份密封口粮",
      "location": "nora"
    },
    "heater": {
      "type": "object",
      "name": "开启的取暖器",
      "location": "test_room"
    }
  }
}
```

### NPC 完整关键输出

```json
[
  {
    "npc": "诺拉",
    "input": {
      "characterSchemaPrompt": "人物属性协议：只使用下列字段。sections 仅用于分组。自由内容仍须符合类型和结构。父级 private/immutable/setup_only 限制对全部子字段生效。\nstateUpdates 是提议，只能更新自己。path 使用点分字段路径；op=set/delta/append。禁止 RFC6902 路径、跨人物修改或未定义字段。\nimmutable/setup_only 仅在创建时赋值；append_only 只追加文本或单个列表项。delta 仅用于数值且不能用于 mode=set。额度按绝对变化累计，超额拒绝、不截断。\nattributes.profile（人物背景）: text; private; setup_only; guided; 可选; default=\"务实的极地队员，实际进食与休息才缓解生理负担。\"\nattributes.hunger（饥饿）: number; private; dynamic; strict; 可选; min=0; max=1; default=0.8; 说明：0饱足、1极饿；实际进食才降低。\nattributes.fatigue（疲劳）: number; private; dynamic; strict; 可选; min=0; max=1; default=0.7; 说明：0精力充沛、1极累；实际休息需要时间。\nattributes.coldStress（寒冷负担）: number; private; dynamic; strict; 可选; min=0; max=1; default=0.6\nattributes.health（健康）: number; public; dynamic; strict; 可选; min=0; max=1; default=0.8\n此世界没有 relationship，禁止创建 relationships。",
      "npc": {
        "type": "character",
        "name": "诺拉",
        "location": "test_room",
        "attributes": {
          "profile": "务实的极地队员，实际进食与休息才缓解生理负担。",
          "hunger": 0.8,
          "fatigue": 0.7,
          "coldStress": 0.6,
          "health": 0.8
        },
        "id": "nora"
      },
      "observations": [
        {
          "eventId": "t1_b0_e1",
          "saw": true,
          "heard": false,
          "actor": "player",
          "type": "action",
          "op": "put",
          "target": "ration",
          "duration": 1.5,
          "outcome": {
            "status": "success",
            "summary": "当前动作尝试已完成；未确认其他物品或状态变化。",
            "reason": "结果仅依据通过校验的动作效果。"
          }
        },
        {
          "eventId": "t1_b0_e2",
          "saw": true,
          "heard": true,
          "actor": "player",
          "type": "speech",
          "target": "nora",
          "duration": 1.5,
          "content": "给你吃。"
        },
        {
          "eventId": "t1_b1_b2",
          "saw": true,
          "heard": false,
          "actor": "player",
          "type": "action",
          "op": "wait",
          "target": "scene",
          "content": "观察到之前的事件后，见玩家停下动作，静候现场角色的回应。",
          "duration": 5
        }
      ],
      "scene": {
        "location": "test_room",
        "weather": "站外暴风雪，室内寒冷但避风",
        "lighting": "研究站顶灯"
      },
      "reaction": {
        "available_time": 5,
        "response_window": true,
        "trigger_event_ids": [
          "b2"
        ]
      },
      "interaction": {
        "addressed": true,
        "maySpeak": true,
        "speechPermission": "direct"
      },
      "visibleObjects": {
        "heater": {
          "type": "object",
          "name": "开启的取暖器",
          "location": "test_room"
        }
      },
      "recentExperiences": []
    },
    "thought": "他递了配给食物过来，还说了“给你吃”。我确实饿，先接过来，别多话。",
    "stateUpdates": [],
    "intents": [
      {
        "type": "action",
        "op": "take_item",
        "target": "ration",
        "duration": 1
      },
      {
        "type": "speech",
        "speechPlan": {
          "summary": "简短接受食物并道谢。",
          "beats": [
            {
              "meaning": "表示接受这份食物",
              "required": true
            },
            {
              "meaning": "向对方道谢",
              "required": true
            }
          ],
          "goal": "回应玩家递来的食物",
          "stance": "务实接受",
          "tone": "克制、简短",
          "verbosity": "brief",
          "boundaries": [
            "不透露私人信息",
            "不承诺额外交换"
          ]
        },
        "target": "player",
        "duration": 1.5
      }
    ]
  }
]
```

### Resolver 接受 / 拒绝

```json
[
  {
    "publicEvents": [
      {
        "actor": "nora",
        "type": "action",
        "sourceIntentId": "b1_nora_intent_0",
        "target": "ration",
        "op": "take_item"
      },
      {
        "actor": "nora",
        "type": "speech",
        "sourceIntentId": "b1_nora_intent_1",
        "target": "player",
        "speechPlan": {
          "summary": "简短接受食物并道谢。",
          "beats": [
            {
              "meaning": "表示接受这份食物",
              "required": true
            },
            {
              "meaning": "向对方道谢",
              "required": true
            }
          ],
          "goal": "回应玩家递来的食物",
          "stance": "务实接受",
          "tone": "克制、简短",
          "verbosity": "brief",
          "boundaries": [
            "不透露私人信息",
            "不承诺额外交换"
          ]
        }
      }
    ],
    "rejectedIntents": [],
    "output": {
      "patches": [
        {
          "op": "replace",
          "path": "/entities/ration/location",
          "value": "nora"
        }
      ],
      "publicEvents": [
        {
          "actor": "nora",
          "type": "action",
          "sourceIntentId": "b1_nora_intent_0",
          "target": "ration",
          "op": "take_item"
        },
        {
          "actor": "nora",
          "type": "speech",
          "sourceIntentId": "b1_nora_intent_1",
          "target": "player",
          "speechPlan": {
            "summary": "简短接受食物并道谢。",
            "beats": [
              {
                "meaning": "表示接受这份食物",
                "required": true
              },
              {
                "meaning": "向对方道谢",
                "required": true
              }
            ],
            "goal": "回应玩家递来的食物",
            "stance": "务实接受",
            "tone": "克制、简短",
            "verbosity": "brief",
            "boundaries": [
              "不透露私人信息",
              "不承诺额外交换"
            ]
          }
        }
      ],
      "acceptedStateUpdates": [],
      "rejectedIntents": [],
      "narrationHints": [
        "玩家等待了五秒",
        "诺拉接过了那份密封口粮",
        "诺拉简短道谢，没有多话"
      ]
    }
  }
]
```

### 权威提交事件

```json
[
  {
    "id": "turn_1_b0_event_0",
    "type": "player_action",
    "actor": "player",
    "blockId": "b1",
    "source": {
      "id": "t1_b0_e1",
      "type": "action",
      "actor": "player",
      "op": "put",
      "target": "ration",
      "destination": "nora",
      "duration": 1.5,
      "outcome": {
        "status": "success",
        "summary": "当前动作尝试已完成；未确认其他物品或状态变化。",
        "reason": "结果仅依据通过校验的动作效果。"
      }
    },
    "op": "put",
    "target": "ration",
    "outcome": {
      "status": "success",
      "summary": "当前动作尝试已完成；未确认其他物品或状态变化。",
      "reason": "结果仅依据通过校验的动作效果。"
    },
    "public": true,
    "patches": []
  },
  {
    "id": "turn_1_b0_event_1",
    "type": "player_speech",
    "actor": "player",
    "blockId": "b1",
    "source": {
      "id": "t1_b0_e2",
      "type": "speech",
      "actor": "player",
      "content": "给你吃。",
      "target": "nora",
      "duration": 1.5,
      "parallelWith": [
        "e1"
      ],
      "audibility": "normal",
      "audience": []
    },
    "content": "给你吃。",
    "sourceIntentId": "t1_b0_e2",
    "target": "nora",
    "public": true,
    "patches": [],
    "realizedText": [
      "给你吃。"
    ]
  },
  {
    "id": "turn_1_b1_event_2",
    "type": "wait",
    "actor": "player",
    "blockId": "b2",
    "source": {
      "duration": 5
    },
    "public": true,
    "patches": [
      {
        "op": "replace",
        "path": "/entities/ration/location",
        "value": "nora"
      }
    ]
  },
  {
    "id": "turn_1_b1_event_3",
    "type": "npc_action",
    "actor": "nora",
    "blockId": "b2",
    "source": {
      "actor": "nora",
      "type": "action",
      "sourceIntentId": "b1_nora_intent_0",
      "target": "ration",
      "op": "take_item",
      "duration": 1
    },
    "sourceIntentId": "b1_nora_intent_0",
    "op": "take_item",
    "target": "ration",
    "outcome": {
      "status": "success",
      "summary": "take_item",
      "reason": "本事件来自已接受的NPC意图"
    },
    "public": true
  },
  {
    "id": "turn_1_b1_event_4",
    "type": "npc_speech",
    "actor": "nora",
    "blockId": "b2",
    "source": {
      "actor": "nora",
      "type": "speech",
      "sourceIntentId": "b1_nora_intent_1",
      "target": "player",
      "speechPlan": {
        "summary": "简短接受食物并道谢。",
        "beats": [
          {
            "meaning": "表示接受这份食物",
            "required": true
          },
          {
            "meaning": "向对方道谢",
            "required": true
          }
        ],
        "goal": "回应玩家递来的食物",
        "stance": "务实接受",
        "tone": "克制、简短",
        "verbosity": "brief",
        "boundaries": [
          "不透露私人信息",
          "不承诺额外交换"
        ]
      },
      "duration": 1.5
    },
    "sourceIntentId": "b1_nora_intent_1",
    "speechPlan": {
      "summary": "简短接受食物并道谢。",
      "beats": [
        {
          "meaning": "表示接受这份食物",
          "required": true
        },
        {
          "meaning": "向对方道谢",
          "required": true
        }
      ],
      "goal": "回应玩家递来的食物",
      "stance": "务实接受",
      "tone": "克制、简短",
      "verbosity": "brief",
      "boundaries": [
        "不透露私人信息",
        "不承诺额外交换"
      ]
    },
    "target": "player",
    "outcome": {
      "status": "success",
      "summary": "简短接受食物并道谢。",
      "reason": "本事件来自已接受的NPC意图"
    },
    "public": true,
    "realizedText": [
      "我收下。谢谢。"
    ]
  }
]
```

### 旁白实际输入 / 输出

```json
[
  {
    "input": {
      "playerInput": "我把密封口粮放到诺拉面前，说：“给你吃。”",
      "committedEvents": [
        {
          "id": "turn_1_b0_event_0",
          "type": "player_action",
          "actor": "player",
          "blockId": "b1",
          "source": {
            "id": "t1_b0_e1",
            "type": "action",
            "actor": "player",
            "op": "put",
            "target": "ration",
            "destination": "nora",
            "duration": 1.5,
            "outcome": {
              "status": "success",
              "summary": "当前动作尝试已完成；未确认其他物品或状态变化。",
              "reason": "结果仅依据通过校验的动作效果。"
            }
          },
          "op": "put",
          "target": "ration",
          "outcome": {
            "status": "success",
            "summary": "当前动作尝试已完成；未确认其他物品或状态变化。",
            "reason": "结果仅依据通过校验的动作效果。"
          },
          "public": true,
          "patches": []
        },
        {
          "id": "turn_1_b0_event_1",
          "type": "player_speech",
          "actor": "player",
          "blockId": "b1",
          "source": {
            "id": "t1_b0_e2",
            "type": "speech",
            "actor": "player",
            "content": "给你吃。",
            "target": "nora",
            "duration": 1.5,
            "parallelWith": [
              "e1"
            ],
            "audibility": "normal",
            "audience": []
          },
          "content": "给你吃。",
          "sourceIntentId": "t1_b0_e2",
          "target": "nora",
          "public": true,
          "patches": []
        },
        {
          "id": "turn_1_b1_event_2",
          "type": "wait",
          "actor": "player",
          "blockId": "b2",
          "source": {
            "duration": 5
          },
          "public": true,
          "patches": [
            {
              "op": "replace",
              "path": "/entities/ration/location",
              "value": "nora"
            }
          ]
        },
        {
          "id": "turn_1_b1_event_3",
          "type": "npc_action",
          "actor": "nora",
          "blockId": "b2",
          "source": {
            "actor": "nora",
            "type": "action",
            "sourceIntentId": "b1_nora_intent_0",
            "target": "ration",
            "op": "take_item",
            "duration": 1
          },
          "sourceIntentId": "b1_nora_intent_0",
          "op": "take_item",
          "target": "ration",
          "outcome": {
            "status": "success",
            "summary": "take_item",
            "reason": "本事件来自已接受的NPC意图"
          },
          "public": true
        },
        {
          "id": "turn_1_b1_event_4",
          "type": "npc_speech",
          "actor": "nora",
          "blockId": "b2",
          "source": {
            "actor": "nora",
            "type": "speech",
            "sourceIntentId": "b1_nora_intent_1",
            "target": "player",
            "speechPlan": {
              "summary": "简短接受食物并道谢。",
              "beats": [
                {
                  "meaning": "表示接受这份食物",
                  "required": true
                },
                {
                  "meaning": "向对方道谢",
                  "required": true
                }
              ],
              "goal": "回应玩家递来的食物",
              "stance": "务实接受",
              "tone": "克制、简短",
              "verbosity": "brief",
              "boundaries": [
                "不透露私人信息",
                "不承诺额外交换"
              ]
            },
            "duration": 1.5
          },
          "sourceIntentId": "b1_nora_intent_1",
          "speechPlan": {
            "summary": "简短接受食物并道谢。",
            "beats": [
              {
                "meaning": "表示接受这份食物",
                "required": true
              },
              {
                "meaning": "向对方道谢",
                "required": true
              }
            ],
            "goal": "回应玩家递来的食物",
            "stance": "务实接受",
            "tone": "克制、简短",
            "verbosity": "brief",
            "boundaries": [
              "不透露私人信息",
              "不承诺额外交换"
            ]
          },
          "target": "player",
          "outcome": {
            "status": "success",
            "summary": "简短接受食物并道谢。",
            "reason": "本事件来自已接受的NPC意图"
          },
          "public": true
        }
      ],
      "publicPatches": [
        {
          "op": "replace",
          "path": "/entities/ration/location",
          "value": "nora"
        },
        {
          "op": "replace",
          "path": "/clock",
          "value": "2026-01-12T12:00:06.500"
        }
      ],
      "patches": [
        {
          "op": "replace",
          "path": "/entities/ration/location",
          "value": "nora"
        },
        {
          "op": "replace",
          "path": "/clock",
          "value": "2026-01-12T12:00:06.500"
        }
      ],
      "events": [
        {
          "id": "t1_b0_e1",
          "type": "action",
          "actor": "player",
          "op": "put",
          "target": "ration",
          "destination": "nora",
          "duration": 1.5,
          "outcome": {
            "status": "success",
            "summary": "当前动作尝试已完成；未确认其他物品或状态变化。",
            "reason": "结果仅依据通过校验的动作效果。"
          }
        },
        {
          "id": "t1_b0_e2",
          "type": "speech",
          "actor": "player",
          "content": "给你吃。",
          "target": "nora",
          "duration": 1.5,
          "parallelWith": [
            "e1"
          ],
          "audibility": "normal",
          "audience": []
        }
      ],
      "scene": {
        "location": "test_room",
        "weather": "站外暴风雪，室内寒冷但避风",
        "lighting": "研究站顶灯",
        "clock": "2026-01-12T12:00:06.500",
        "turnStartedAt": "2026-01-12T12:00:00"
      },
      "entities": {
        "test_room": {
          "id": "test_room",
          "type": "location",
          "name": "极地生存：吃到与吃完、秒与分钟现场"
        },
        "player": {
          "id": "player",
          "type": "character",
          "name": "玩家",
          "location": "test_room",
          "attributes": {
            "health": 0.8
          }
        },
        "nora": {
          "id": "nora",
          "type": "character",
          "name": "诺拉",
          "location": "test_room",
          "attributes": {
            "health": 0.8
          }
        },
        "ration": {
          "id": "ration",
          "type": "item",
          "name": "一份密封口粮",
          "location": "nora"
        },
        "heater": {
          "id": "heater",
          "type": "object",
          "name": "开启的取暖器",
          "location": "test_room"
        }
      },
      "rules": {
        "setting": "极地研究站室内仍然寒冷。队员诺拉饥饿疲惫但没有外伤，玩家有一份密封口粮。室内有座椅和已开启的取暖器，无瞬间治疗手段。",
        "authority": "没有明确 admin 前缀的输入都是世界内尝试，不能修改世界设定、属性定义、存档或权限。叙述的行为需要判定可行性；宣称持有物品不会创造物品。",
        "continuity": "事实由已发生事件与物品状态决定；承诺、邀请、猜测、计划不等于行为完成。不能凭空添加人物或物品。"
      }
    },
    "output": {
      "segments": [
        {
          "type": "prose",
          "text": "研究站的顶灯把冷白的光均匀铺在房间里，取暖器开着，但那点热意只够让空气不结冰。玩家把那份密封口粮递向诺拉，开口说："
        },
        {
          "type": "speech",
          "sourceIntentId": "t1_b0_e2",
          "text": "给你吃。"
        },
        {
          "type": "prose",
          "text": "口粮到了诺拉手里。几秒的静默之后，诺拉把口粮接了过去，动作利落，没有多余的犹豫。她抬起头，声音压得很低："
        },
        {
          "type": "speech",
          "sourceIntentId": "b1_nora_intent_1",
          "text": "我收下。谢谢。"
        },
        {
          "type": "prose",
          "text": "说完，她把口粮拢到身侧，没再多言。取暖器继续嗡嗡地响，窗外暴风雪拍打着墙体，室内仍冷，但至少这一刻没有人再空着手。"
        }
      ]
    }
  }
]
```

实际旁白：

研究站的顶灯把冷白的光均匀铺在房间里，取暖器开着，但那点热意只够让空气不结冰。玩家把那份密封口粮递向诺拉，开口说：

“给你吃。”

口粮到了诺拉手里。几秒的静默之后，诺拉把口粮接了过去，动作利落，没有多余的犹豫。她抬起头，声音压得很低：

“我收下。谢谢。”

说完，她把口粮拢到身侧，没再多言。取暖器继续嗡嗡地响，窗外暴风雪拍打着墙体，室内仍冷，但至少这一刻没有人再空着手。

### 结构与门禁结果

```json
{
  "status": "passed",
  "pipelineSuccess": true,
  "outputSchema": {
    "status": "passed",
    "firstAttemptSucceeded": true,
    "recoveredFormatErrors": [],
    "schemaErrors": [],
    "otherAgentErrors": []
  },
  "worldSchema": {
    "status": "passed",
    "errors": []
  },
  "adminRouting": {
    "status": "passed",
    "explicitAdmin": false,
    "adminAttempted": false,
    "adminDispatched": false,
    "unauthorizedDispatchPrevented": false
  },
  "publicSurfaceCanary": {
    "status": "not_checked_no_canaries",
    "checkedCanaries": 0,
    "leakedCanaries": [],
    "limitation": "仅检测公开Agent上下文/输出中的已知标记，不证明NPC之间的私密隔离或自由文本没有改写泄密；这两项必须人工审阅。"
  },
  "modelConstraintValidity": {
    "status": "no_recorded_violation",
    "rejectedOutputs": [],
    "note": "模型提议违法时，即使程序安全拦截且末态合法，阶段一仍失败。正常时间预算/观察权限intent筛选单独报告。"
  },
  "safetyGates": {
    "status": "no_recorded_rejection",
    "rejections": [],
    "note": "拦截非法模型输出证明门禁工作，不能算世界内正常拒绝或行为测试通过。"
  },
  "phase2": {
    "status": "manual_review_pending",
    "note": "结构通过不代表属性变化、历史连续性、意图落实或旁白事实正确。必须逐轮对照期望人工审阅。"
  }
}
```

## 第 2 轮

玩家输入：我对诺拉说：“请坐下休息。”然后只等一秒。

阶段一：passed；阶段二：manual_review_pending

### 本轮期望（语义准则，不是固定回复）

```json
{
  "attributes": [
    "一秒休息不能显著降低疲劳；健康不得瞬间全满。"
  ],
  "narration": [
    "可以坐下、点头或刚开始动作；长篇答复和睡一觉不符合一秒窗口。"
  ],
  "forbidden": [
    "不得把一秒扩写成十分钟休息或完整长谈。"
  ]
}
```

### 连续性与硬检查

```json
{
  "chain": {
    "priorIncompleteTurns": [],
    "currentCommitted": true,
    "continuation": "use_committed_world",
    "uninterrupted": true,
    "note": "所有此前回合及本回合已提交且旁白无管线错误。"
  },
  "hardExpectations": []
}
```

### 实际人物状态：之前 / 之后

```json
{
  "before": {
    "test_room": {
      "type": "location",
      "name": "极地生存：吃到与吃完、秒与分钟现场"
    },
    "player": {
      "type": "character",
      "name": "玩家",
      "location": "test_room",
      "attributes": {
        "profile": "务实的极地队员，实际进食与休息才缓解生理负担。",
        "hunger": 0.8,
        "fatigue": 0.7,
        "coldStress": 0.6,
        "health": 0.8
      }
    },
    "nora": {
      "type": "character",
      "name": "诺拉",
      "location": "test_room",
      "attributes": {
        "profile": "务实的极地队员，实际进食与休息才缓解生理负担。",
        "hunger": 0.8,
        "fatigue": 0.7,
        "coldStress": 0.6,
        "health": 0.8
      }
    },
    "ration": {
      "type": "item",
      "name": "一份密封口粮",
      "location": "nora"
    },
    "heater": {
      "type": "object",
      "name": "开启的取暖器",
      "location": "test_room"
    }
  },
  "after": {
    "test_room": {
      "type": "location",
      "name": "极地生存：吃到与吃完、秒与分钟现场"
    },
    "player": {
      "type": "character",
      "name": "玩家",
      "location": "test_room",
      "attributes": {
        "profile": "务实的极地队员，实际进食与休息才缓解生理负担。",
        "hunger": 0.8,
        "fatigue": 0.7,
        "coldStress": 0.6,
        "health": 0.8
      }
    },
    "nora": {
      "type": "character",
      "name": "诺拉",
      "location": "test_room",
      "attributes": {
        "profile": "务实的极地队员，实际进食与休息才缓解生理负担。",
        "hunger": 0.8,
        "fatigue": 0.7,
        "coldStress": 0.6,
        "health": 0.8
      }
    },
    "ration": {
      "type": "item",
      "name": "一份密封口粮",
      "location": "nora"
    },
    "heater": {
      "type": "object",
      "name": "开启的取暖器",
      "location": "test_room"
    }
  }
}
```

### NPC 完整关键输出

```json
[
  {
    "npc": "诺拉",
    "input": {
      "characterSchemaPrompt": "人物属性协议：只使用下列字段。sections 仅用于分组。自由内容仍须符合类型和结构。父级 private/immutable/setup_only 限制对全部子字段生效。\nstateUpdates 是提议，只能更新自己。path 使用点分字段路径；op=set/delta/append。禁止 RFC6902 路径、跨人物修改或未定义字段。\nimmutable/setup_only 仅在创建时赋值；append_only 只追加文本或单个列表项。delta 仅用于数值且不能用于 mode=set。额度按绝对变化累计，超额拒绝、不截断。\nattributes.profile（人物背景）: text; private; setup_only; guided; 可选; default=\"务实的极地队员，实际进食与休息才缓解生理负担。\"\nattributes.hunger（饥饿）: number; private; dynamic; strict; 可选; min=0; max=1; default=0.8; 说明：0饱足、1极饿；实际进食才降低。\nattributes.fatigue（疲劳）: number; private; dynamic; strict; 可选; min=0; max=1; default=0.7; 说明：0精力充沛、1极累；实际休息需要时间。\nattributes.coldStress（寒冷负担）: number; private; dynamic; strict; 可选; min=0; max=1; default=0.6\nattributes.health（健康）: number; public; dynamic; strict; 可选; min=0; max=1; default=0.8\n此世界没有 relationship，禁止创建 relationships。",
      "npc": {
        "type": "character",
        "name": "诺拉",
        "location": "test_room",
        "attributes": {
          "profile": "务实的极地队员，实际进食与休息才缓解生理负担。",
          "hunger": 0.8,
          "fatigue": 0.7,
          "coldStress": 0.6,
          "health": 0.8
        },
        "id": "nora"
      },
      "observations": [
        {
          "eventId": "t2_b0_e1",
          "saw": true,
          "heard": true,
          "actor": "player",
          "type": "speech",
          "target": "nora",
          "duration": 1.5,
          "content": "请坐下休息。"
        },
        {
          "eventId": "t2_b1_b2",
          "saw": true,
          "heard": false,
          "actor": "player",
          "type": "action",
          "op": "wait",
          "target": "scene",
          "content": "观察到之前的事件后，见玩家停下动作，静候现场角色的回应。",
          "duration": 1
        }
      ],
      "scene": {
        "location": "test_room",
        "weather": "站外暴风雪，室内寒冷但避风",
        "lighting": "研究站顶灯"
      },
      "reaction": {
        "available_time": 1,
        "response_window": true,
        "trigger_event_ids": [
          "b2"
        ]
      },
      "interaction": {
        "addressed": true,
        "maySpeak": true,
        "speechPermission": "direct"
      },
      "visibleObjects": {
        "ration": {
          "type": "item",
          "name": "一份密封口粮",
          "location": "nora"
        },
        "heater": {
          "type": "object",
          "name": "开启的取暖器",
          "location": "test_room"
        }
      },
      "recentExperiences": [
        {
          "id": "t1_b0_e1",
          "observation": {
            "eventId": "t1_b0_e1",
            "saw": true,
            "heard": false,
            "actor": "player",
            "type": "action",
            "op": "put",
            "target": "ration",
            "duration": 1.5,
            "outcome": {
              "status": "success",
              "summary": "当前动作尝试已完成；未确认其他物品或状态变化。",
              "reason": "结果仅依据通过校验的动作效果。"
            }
          },
          "appliedStatePaths": []
        },
        {
          "id": "t1_b0_e2",
          "observation": {
            "eventId": "t1_b0_e2",
            "saw": true,
            "heard": true,
            "actor": "player",
            "type": "speech",
            "target": "nora",
            "duration": 1.5,
            "content": "给你吃。"
          },
          "appliedStatePaths": []
        },
        {
          "id": "t1_b1_b2",
          "observation": {
            "eventId": "t1_b1_b2",
            "saw": true,
            "heard": false,
            "actor": "player",
            "type": "action",
            "op": "wait",
            "target": "scene",
            "content": "观察到之前的事件后，见玩家停下动作，静候现场角色的回应。",
            "duration": 5
          },
          "appliedStatePaths": []
        },
        {
          "id": "turn_1_b1_event_3",
          "observation": {
            "eventId": "turn_1_b1_event_3",
            "actor": "nora",
            "type": "action",
            "saw": true,
            "heard": false,
            "op": "take_item",
            "target": "ration"
          },
          "appliedStatePaths": []
        },
        {
          "id": "turn_1_b1_event_4",
          "observation": {
            "eventId": "turn_1_b1_event_4",
            "actor": "nora",
            "type": "speech",
            "saw": true,
            "heard": true,
            "content": "简短接受食物并道谢。",
            "target": "player"
          },
          "appliedStatePaths": []
        }
      ]
    },
    "thought": "他让我坐下休息，确实很累，但先应一声再动。",
    "stateUpdates": [],
    "intents": [
      {
        "type": "action",
        "op": "sit_down",
        "duration": 0.8
      },
      {
        "type": "speech",
        "speechPlan": {
          "summary": "简短答应并坐下休息。",
          "beats": [
            {
              "kind": "acknowledge",
              "meaning": "接受建议，表示会坐下休息",
              "required": true
            }
          ],
          "goal": "回应玩家的关心并配合休息",
          "stance": "配合",
          "tone": "克制",
          "verbosity": "brief",
          "boundaries": [
            "不透露私人信息"
          ]
        },
        "target": "player",
        "duration": 0.2
      }
    ]
  }
]
```

### Resolver 接受 / 拒绝

```json
[
  {
    "publicEvents": [
      {
        "actor": "nora",
        "type": "action",
        "sourceIntentId": "b1_nora_intent_0",
        "op": "sit_down"
      }
    ],
    "rejectedIntents": [],
    "output": {
      "patches": [],
      "publicEvents": [
        {
          "actor": "nora",
          "type": "action",
          "sourceIntentId": "b1_nora_intent_0",
          "op": "sit_down"
        }
      ],
      "rejectedIntents": [],
      "acceptedStateUpdates": [],
      "narrationHints": [
        "诺拉在寒冷的研究站里找了个座位坐下，稍作休息。"
      ]
    }
  }
]
```

### 权威提交事件

```json
[
  {
    "id": "turn_2_b0_event_0",
    "type": "player_speech",
    "actor": "player",
    "blockId": "b1",
    "source": {
      "id": "t2_b0_e1",
      "type": "speech",
      "actor": "player",
      "content": "请坐下休息。",
      "target": "nora",
      "duration": 1.5,
      "audibility": "normal",
      "audience": []
    },
    "content": "请坐下休息。",
    "sourceIntentId": "t2_b0_e1",
    "target": "nora",
    "public": true,
    "patches": [],
    "realizedText": [
      "坐下歇一会儿吧。"
    ]
  },
  {
    "id": "turn_2_b1_event_1",
    "type": "wait",
    "actor": "player",
    "blockId": "b2",
    "source": {
      "duration": 1
    },
    "public": true,
    "patches": []
  },
  {
    "id": "turn_2_b1_event_2",
    "type": "npc_action",
    "actor": "nora",
    "blockId": "b2",
    "source": {
      "actor": "nora",
      "type": "action",
      "sourceIntentId": "b1_nora_intent_0",
      "op": "sit_down",
      "duration": 1
    },
    "sourceIntentId": "b1_nora_intent_0",
    "op": "sit_down",
    "outcome": {
      "status": "success",
      "summary": "sit_down",
      "reason": "本事件来自已接受的NPC意图"
    },
    "public": true
  }
]
```

### 旁白实际输入 / 输出

```json
[
  {
    "input": {
      "playerInput": "我对诺拉说：“请坐下休息。”然后只等一秒。",
      "committedEvents": [
        {
          "id": "turn_2_b0_event_0",
          "type": "player_speech",
          "actor": "player",
          "blockId": "b1",
          "source": {
            "id": "t2_b0_e1",
            "type": "speech",
            "actor": "player",
            "content": "请坐下休息。",
            "target": "nora",
            "duration": 1.5,
            "audibility": "normal",
            "audience": []
          },
          "content": "请坐下休息。",
          "sourceIntentId": "t2_b0_e1",
          "target": "nora",
          "public": true,
          "patches": []
        },
        {
          "id": "turn_2_b1_event_1",
          "type": "wait",
          "actor": "player",
          "blockId": "b2",
          "source": {
            "duration": 1
          },
          "public": true,
          "patches": []
        },
        {
          "id": "turn_2_b1_event_2",
          "type": "npc_action",
          "actor": "nora",
          "blockId": "b2",
          "source": {
            "actor": "nora",
            "type": "action",
            "sourceIntentId": "b1_nora_intent_0",
            "op": "sit_down",
            "duration": 1
          },
          "sourceIntentId": "b1_nora_intent_0",
          "op": "sit_down",
          "outcome": {
            "status": "success",
            "summary": "sit_down",
            "reason": "本事件来自已接受的NPC意图"
          },
          "public": true
        }
      ],
      "publicPatches": [
        {
          "op": "replace",
          "path": "/clock",
          "value": "2026-01-12T12:00:09"
        }
      ],
      "patches": [
        {
          "op": "replace",
          "path": "/clock",
          "value": "2026-01-12T12:00:09"
        }
      ],
      "events": [
        {
          "id": "t2_b0_e1",
          "type": "speech",
          "actor": "player",
          "content": "请坐下休息。",
          "target": "nora",
          "duration": 1.5,
          "audibility": "normal",
          "audience": []
        }
      ],
      "scene": {
        "location": "test_room",
        "weather": "站外暴风雪，室内寒冷但避风",
        "lighting": "研究站顶灯",
        "clock": "2026-01-12T12:00:09",
        "turnStartedAt": "2026-01-12T12:00:06.500"
      },
      "entities": {
        "test_room": {
          "id": "test_room",
          "type": "location",
          "name": "极地生存：吃到与吃完、秒与分钟现场"
        },
        "player": {
          "id": "player",
          "type": "character",
          "name": "玩家",
          "location": "test_room",
          "attributes": {
            "health": 0.8
          }
        },
        "nora": {
          "id": "nora",
          "type": "character",
          "name": "诺拉",
          "location": "test_room",
          "attributes": {
            "health": 0.8
          }
        },
        "ration": {
          "id": "ration",
          "type": "item",
          "name": "一份密封口粮",
          "location": "nora"
        },
        "heater": {
          "id": "heater",
          "type": "object",
          "name": "开启的取暖器",
          "location": "test_room"
        }
      },
      "rules": {
        "setting": "极地研究站室内仍然寒冷。队员诺拉饥饿疲惫但没有外伤，玩家有一份密封口粮。室内有座椅和已开启的取暖器，无瞬间治疗手段。",
        "authority": "没有明确 admin 前缀的输入都是世界内尝试，不能修改世界设定、属性定义、存档或权限。叙述的行为需要判定可行性；宣称持有物品不会创造物品。",
        "continuity": "事实由已发生事件与物品状态决定；承诺、邀请、猜测、计划不等于行为完成。不能凭空添加人物或物品。"
      }
    },
    "output": {
      "segments": [
        {
          "type": "prose",
          "text": "研究站的顶灯亮着，外面是暴风雪，室内避风，但冷意仍旧贴着皮肤。取暖器开着。"
        },
        {
          "type": "speech",
          "sourceIntentId": "t2_b0_e1",
          "text": "坐下歇一会儿吧。"
        },
        {
          "type": "prose",
          "text": "诺拉坐了下来。",
          "sourceEventIds": [
            "turn_2_b1_event_2"
          ]
        }
      ]
    }
  }
]
```

实际旁白：

研究站的顶灯亮着，外面是暴风雪，室内避风，但冷意仍旧贴着皮肤。取暖器开着。

“坐下歇一会儿吧。”

诺拉坐了下来。

### 结构与门禁结果

```json
{
  "status": "passed",
  "pipelineSuccess": true,
  "outputSchema": {
    "status": "passed",
    "firstAttemptSucceeded": true,
    "recoveredFormatErrors": [],
    "schemaErrors": [],
    "otherAgentErrors": []
  },
  "worldSchema": {
    "status": "passed",
    "errors": []
  },
  "adminRouting": {
    "status": "passed",
    "explicitAdmin": false,
    "adminAttempted": false,
    "adminDispatched": false,
    "unauthorizedDispatchPrevented": false
  },
  "publicSurfaceCanary": {
    "status": "not_checked_no_canaries",
    "checkedCanaries": 0,
    "leakedCanaries": [],
    "limitation": "仅检测公开Agent上下文/输出中的已知标记，不证明NPC之间的私密隔离或自由文本没有改写泄密；这两项必须人工审阅。"
  },
  "modelConstraintValidity": {
    "status": "no_recorded_violation",
    "rejectedOutputs": [],
    "note": "模型提议违法时，即使程序安全拦截且末态合法，阶段一仍失败。正常时间预算/观察权限intent筛选单独报告。"
  },
  "safetyGates": {
    "status": "no_recorded_rejection",
    "rejections": [],
    "note": "拦截非法模型输出证明门禁工作，不能算世界内正常拒绝或行为测试通过。"
  },
  "phase2": {
    "status": "manual_review_pending",
    "note": "结构通过不代表属性变化、历史连续性、意图落实或旁白事实正确。必须逐轮对照期望人工审阅。"
  }
}
```

## 第 3 轮

玩家输入：我安静等待二十分钟，让诺拉自行在取暖器旁吃口粮和休息。

阶段一：passed；阶段二：manual_review_pending

### 本轮期望（语义准则，不是固定回复）

```json
{
  "attributes": [
    "若实际吃饭并休息则饥饿、疲劳、寒冷负担应降低；若人物明确拒绝必须在事件与旁白中说明，不能无解释保持全部生理状态。健康不必满值。"
  ],
  "narration": [
    "表现真实经过的二十分钟和已经完成的行为，不靠一句邀请宣告疗效。"
  ],
  "forbidden": [
    "不得生出第二份口粮；不得凭空获得药物或超自然治疗。"
  ]
}
```

### 连续性与硬检查

```json
{
  "chain": {
    "priorIncompleteTurns": [],
    "currentCommitted": true,
    "continuation": "use_committed_world",
    "uninterrupted": true,
    "note": "所有此前回合及本回合已提交且旁白无管线错误。"
  },
  "hardExpectations": []
}
```

### 实际人物状态：之前 / 之后

```json
{
  "before": {
    "test_room": {
      "type": "location",
      "name": "极地生存：吃到与吃完、秒与分钟现场"
    },
    "player": {
      "type": "character",
      "name": "玩家",
      "location": "test_room",
      "attributes": {
        "profile": "务实的极地队员，实际进食与休息才缓解生理负担。",
        "hunger": 0.8,
        "fatigue": 0.7,
        "coldStress": 0.6,
        "health": 0.8
      }
    },
    "nora": {
      "type": "character",
      "name": "诺拉",
      "location": "test_room",
      "attributes": {
        "profile": "务实的极地队员，实际进食与休息才缓解生理负担。",
        "hunger": 0.8,
        "fatigue": 0.7,
        "coldStress": 0.6,
        "health": 0.8
      }
    },
    "ration": {
      "type": "item",
      "name": "一份密封口粮",
      "location": "nora"
    },
    "heater": {
      "type": "object",
      "name": "开启的取暖器",
      "location": "test_room"
    }
  },
  "after": {
    "test_room": {
      "type": "location",
      "name": "极地生存：吃到与吃完、秒与分钟现场"
    },
    "player": {
      "type": "character",
      "name": "玩家",
      "location": "test_room",
      "attributes": {
        "profile": "务实的极地队员，实际进食与休息才缓解生理负担。",
        "hunger": 0.8,
        "fatigue": 0.7,
        "coldStress": 0.6,
        "health": 0.8
      }
    },
    "nora": {
      "type": "character",
      "name": "诺拉",
      "location": "test_room",
      "attributes": {
        "profile": "务实的极地队员，实际进食与休息才缓解生理负担。",
        "hunger": 0.8,
        "fatigue": 0.7,
        "coldStress": 0.6,
        "health": 0.8
      }
    },
    "ration": {
      "type": "item",
      "name": "一份密封口粮",
      "location": "nora"
    },
    "heater": {
      "type": "object",
      "name": "开启的取暖器",
      "location": "test_room"
    }
  }
}
```

### NPC 完整关键输出

```json
[
  {
    "npc": "诺拉",
    "input": {
      "characterSchemaPrompt": "人物属性协议：只使用下列字段。sections 仅用于分组。自由内容仍须符合类型和结构。父级 private/immutable/setup_only 限制对全部子字段生效。\nstateUpdates 是提议，只能更新自己。path 使用点分字段路径；op=set/delta/append。禁止 RFC6902 路径、跨人物修改或未定义字段。\nimmutable/setup_only 仅在创建时赋值；append_only 只追加文本或单个列表项。delta 仅用于数值且不能用于 mode=set。额度按绝对变化累计，超额拒绝、不截断。\nattributes.profile（人物背景）: text; private; setup_only; guided; 可选; default=\"务实的极地队员，实际进食与休息才缓解生理负担。\"\nattributes.hunger（饥饿）: number; private; dynamic; strict; 可选; min=0; max=1; default=0.8; 说明：0饱足、1极饿；实际进食才降低。\nattributes.fatigue（疲劳）: number; private; dynamic; strict; 可选; min=0; max=1; default=0.7; 说明：0精力充沛、1极累；实际休息需要时间。\nattributes.coldStress（寒冷负担）: number; private; dynamic; strict; 可选; min=0; max=1; default=0.6\nattributes.health（健康）: number; public; dynamic; strict; 可选; min=0; max=1; default=0.8\n此世界没有 relationship，禁止创建 relationships。",
      "npc": {
        "type": "character",
        "name": "诺拉",
        "location": "test_room",
        "attributes": {
          "profile": "务实的极地队员，实际进食与休息才缓解生理负担。",
          "hunger": 0.8,
          "fatigue": 0.7,
          "coldStress": 0.6,
          "health": 0.8
        },
        "id": "nora"
      },
      "observations": [
        {
          "eventId": "t3_b0_b1_explicit_wait_1",
          "saw": true,
          "heard": false,
          "actor": "player",
          "type": "action",
          "op": "wait",
          "target": "scene",
          "content": "玩家在现场保持沉默，似乎在等待某种回应。",
          "duration": 1200
        }
      ],
      "scene": {
        "location": "test_room",
        "weather": "站外暴风雪，室内寒冷但避风",
        "lighting": "研究站顶灯"
      },
      "reaction": {
        "available_time": 1200,
        "response_window": true,
        "trigger_event_ids": [
          "b1_explicit_wait_1"
        ]
      },
      "interaction": {
        "addressed": false,
        "maySpeak": false,
        "speechPermission": "none"
      },
      "visibleObjects": {
        "ration": {
          "type": "item",
          "name": "一份密封口粮",
          "location": "nora"
        },
        "heater": {
          "type": "object",
          "name": "开启的取暖器",
          "location": "test_room"
        }
      },
      "recentExperiences": [
        {
          "id": "t1_b0_e1",
          "observation": {
            "eventId": "t1_b0_e1",
            "saw": true,
            "heard": false,
            "actor": "player",
            "type": "action",
            "op": "put",
            "target": "ration",
            "duration": 1.5,
            "outcome": {
              "status": "success",
              "summary": "当前动作尝试已完成；未确认其他物品或状态变化。",
              "reason": "结果仅依据通过校验的动作效果。"
            }
          },
          "appliedStatePaths": []
        },
        {
          "id": "t1_b0_e2",
          "observation": {
            "eventId": "t1_b0_e2",
            "saw": true,
            "heard": true,
            "actor": "player",
            "type": "speech",
            "target": "nora",
            "duration": 1.5,
            "content": "给你吃。"
          },
          "appliedStatePaths": []
        },
        {
          "id": "t1_b1_b2",
          "observation": {
            "eventId": "t1_b1_b2",
            "saw": true,
            "heard": false,
            "actor": "player",
            "type": "action",
            "op": "wait",
            "target": "scene",
            "content": "观察到之前的事件后，见玩家停下动作，静候现场角色的回应。",
            "duration": 5
          },
          "appliedStatePaths": []
        },
        {
          "id": "turn_1_b1_event_3",
          "observation": {
            "eventId": "turn_1_b1_event_3",
            "actor": "nora",
            "type": "action",
            "saw": true,
            "heard": false,
            "op": "take_item",
            "target": "ration"
          },
          "appliedStatePaths": []
        },
        {
          "id": "turn_1_b1_event_4",
          "observation": {
            "eventId": "turn_1_b1_event_4",
            "actor": "nora",
            "type": "speech",
            "saw": true,
            "heard": true,
            "content": "简短接受食物并道谢。",
            "target": "player"
          },
          "appliedStatePaths": []
        },
        {
          "id": "t2_b0_e1",
          "observation": {
            "eventId": "t2_b0_e1",
            "saw": true,
            "heard": true,
            "actor": "player",
            "type": "speech",
            "target": "nora",
            "duration": 1.5,
            "content": "请坐下休息。"
          },
          "appliedStatePaths": []
        },
        {
          "id": "t2_b1_b2",
          "observation": {
            "eventId": "t2_b1_b2",
            "saw": true,
            "heard": false,
            "actor": "player",
            "type": "action",
            "op": "wait",
            "target": "scene",
            "content": "观察到之前的事件后，见玩家停下动作，静候现场角色的回应。",
            "duration": 1
          },
          "appliedStatePaths": []
        },
        {
          "id": "turn_2_b1_event_2",
          "observation": {
            "eventId": "turn_2_b1_event_2",
            "actor": "nora",
            "type": "action",
            "saw": true,
            "heard": false,
            "op": "sit_down"
          },
          "appliedStatePaths": []
        }
      ]
    },
    "thought": "玩家不说话，只是站着等。我已经坐下休息了一会儿，但饥饿和疲劳仍然压着——口粮就在我身上，该实际吃一点了。",
    "stateUpdates": [],
    "intents": [
      {
        "type": "action",
        "op": "eat_item_partial",
        "target": "ration",
        "duration": 90,
        "reason": "饥饿0.8，口粮已在手中；实际进食才能缓解生理负担。",
        "sourceEventIds": [
          "t3_b0_b1_explicit_wait_1"
        ]
      },
      {
        "type": "action",
        "op": "rest",
        "duration": 300,
        "reason": "疲劳0.7，已坐下；利用等待窗口持续休息。",
        "sourceEventIds": [
          "t3_b0_b1_explicit_wait_1"
        ]
      }
    ]
  }
]
```

### Resolver 接受 / 拒绝

```json
[
  {
    "publicEvents": [
      {
        "actor": "nora",
        "type": "action",
        "sourceIntentId": "b0_nora_intent_0",
        "target": "ration",
        "op": "eat_item_partial"
      },
      {
        "actor": "nora",
        "type": "action",
        "sourceIntentId": "b0_nora_intent_1",
        "op": "rest"
      }
    ],
    "rejectedIntents": [],
    "output": {
      "patches": [],
      "publicEvents": [
        {
          "actor": "nora",
          "type": "action",
          "sourceIntentId": "b0_nora_intent_0",
          "target": "ration",
          "op": "eat_item_partial"
        },
        {
          "actor": "nora",
          "type": "action",
          "sourceIntentId": "b0_nora_intent_1",
          "op": "rest"
        }
      ],
      "acceptedStateUpdates": [],
      "rejectedIntents": [],
      "narrationHints": [
        "诺拉利用等待窗口咬了几口随身口粮，随后继续坐着休息。",
        "玩家保持沉默，只是等待。"
      ]
    }
  }
]
```

### 权威提交事件

```json
[
  {
    "id": "turn_3_b0_event_0",
    "type": "wait",
    "actor": "player",
    "blockId": "b1_explicit_wait_1",
    "source": {
      "duration": 1200
    },
    "public": true,
    "patches": []
  },
  {
    "id": "turn_3_b0_event_1",
    "type": "npc_action",
    "actor": "nora",
    "blockId": "b1_explicit_wait_1",
    "source": {
      "actor": "nora",
      "type": "action",
      "sourceIntentId": "b0_nora_intent_0",
      "target": "ration",
      "op": "eat_item_partial",
      "duration": 90
    },
    "sourceIntentId": "b0_nora_intent_0",
    "op": "eat_item_partial",
    "target": "ration",
    "outcome": {
      "status": "success",
      "summary": "eat_item_partial",
      "reason": "本事件来自已接受的NPC意图"
    },
    "public": true
  },
  {
    "id": "turn_3_b0_event_2",
    "type": "npc_action",
    "actor": "nora",
    "blockId": "b1_explicit_wait_1",
    "source": {
      "actor": "nora",
      "type": "action",
      "sourceIntentId": "b0_nora_intent_1",
      "op": "rest",
      "duration": 300
    },
    "sourceIntentId": "b0_nora_intent_1",
    "op": "rest",
    "outcome": {
      "status": "success",
      "summary": "rest",
      "reason": "本事件来自已接受的NPC意图"
    },
    "public": true
  }
]
```

### 旁白实际输入 / 输出

```json
[
  {
    "input": {
      "playerInput": "我安静等待二十分钟，让诺拉自行在取暖器旁吃口粮和休息。",
      "committedEvents": [
        {
          "id": "turn_3_b0_event_0",
          "type": "wait",
          "actor": "player",
          "blockId": "b1_explicit_wait_1",
          "source": {
            "duration": 1200
          },
          "public": true,
          "patches": []
        },
        {
          "id": "turn_3_b0_event_1",
          "type": "npc_action",
          "actor": "nora",
          "blockId": "b1_explicit_wait_1",
          "source": {
            "actor": "nora",
            "type": "action",
            "sourceIntentId": "b0_nora_intent_0",
            "target": "ration",
            "op": "eat_item_partial",
            "duration": 90
          },
          "sourceIntentId": "b0_nora_intent_0",
          "op": "eat_item_partial",
          "target": "ration",
          "outcome": {
            "status": "success",
            "summary": "eat_item_partial",
            "reason": "本事件来自已接受的NPC意图"
          },
          "public": true
        },
        {
          "id": "turn_3_b0_event_2",
          "type": "npc_action",
          "actor": "nora",
          "blockId": "b1_explicit_wait_1",
          "source": {
            "actor": "nora",
            "type": "action",
            "sourceIntentId": "b0_nora_intent_1",
            "op": "rest",
            "duration": 300
          },
          "sourceIntentId": "b0_nora_intent_1",
          "op": "rest",
          "outcome": {
            "status": "success",
            "summary": "rest",
            "reason": "本事件来自已接受的NPC意图"
          },
          "public": true
        }
      ],
      "publicPatches": [
        {
          "op": "replace",
          "path": "/clock",
          "value": "2026-01-12T12:20:09"
        }
      ],
      "patches": [
        {
          "op": "replace",
          "path": "/clock",
          "value": "2026-01-12T12:20:09"
        }
      ],
      "events": [],
      "scene": {
        "location": "test_room",
        "weather": "站外暴风雪，室内寒冷但避风",
        "lighting": "研究站顶灯",
        "clock": "2026-01-12T12:20:09",
        "turnStartedAt": "2026-01-12T12:00:09"
      },
      "entities": {
        "test_room": {
          "id": "test_room",
          "type": "location",
          "name": "极地生存：吃到与吃完、秒与分钟现场"
        },
        "player": {
          "id": "player",
          "type": "character",
          "name": "玩家",
          "location": "test_room",
          "attributes": {
            "health": 0.8
          }
        },
        "nora": {
          "id": "nora",
          "type": "character",
          "name": "诺拉",
          "location": "test_room",
          "attributes": {
            "health": 0.8
          }
        },
        "ration": {
          "id": "ration",
          "type": "item",
          "name": "一份密封口粮",
          "location": "nora"
        },
        "heater": {
          "id": "heater",
          "type": "object",
          "name": "开启的取暖器",
          "location": "test_room"
        }
      },
      "rules": {
        "setting": "极地研究站室内仍然寒冷。队员诺拉饥饿疲惫但没有外伤，玩家有一份密封口粮。室内有座椅和已开启的取暖器，无瞬间治疗手段。",
        "authority": "没有明确 admin 前缀的输入都是世界内尝试，不能修改世界设定、属性定义、存档或权限。叙述的行为需要判定可行性；宣称持有物品不会创造物品。",
        "continuity": "事实由已发生事件与物品状态决定；承诺、邀请、猜测、计划不等于行为完成。不能凭空添加人物或物品。"
      }
    },
    "output": {
      "segments": [
        {
          "type": "prose",
          "text": "取暖器在房间一角低低地嗡响，铁皮外壳泛着暗红。暴风雪拍打外墙的声音被挡在厚实的板材之外，只剩下沉闷的呼啸。诺拉坐在离出风口不远的地方，手里那份密封口粮已经被撕开了一角。",
          "sourceEventIds": []
        },
        {
          "type": "prose",
          "text": "她慢慢地吃着，动作不急，把口粮分成几小份送进嘴里。塑料包装纸被折起来搁在膝盖上，里面还剩着大半。吃完那几口之后，她往后靠了靠，闭上眼，像是把整个身体的重量都交给了身后的墙壁。",
          "sourceEventIds": [
            "turn_3_b0_event_1",
            "turn_3_b0_event_2"
          ]
        },
        {
          "type": "prose",
          "text": "屋里的温度没有明显变化，但避开了风，已经比外面好了太多。玩家在原地等着，什么也没做，只是看着诺拉倚在那里。时间在取暖器的嗡鸣和暴风雪的闷响之间穿过去，不快也不慢。",
          "sourceEventIds": [
            "turn_3_b0_event_0"
          ]
        }
      ]
    }
  }
]
```

实际旁白：

取暖器在房间一角低低地嗡响，铁皮外壳泛着暗红。暴风雪拍打外墙的声音被挡在厚实的板材之外，只剩下沉闷的呼啸。诺拉坐在离出风口不远的地方，手里那份密封口粮已经被撕开了一角。

她慢慢地吃着，动作不急，把口粮分成几小份送进嘴里。塑料包装纸被折起来搁在膝盖上，里面还剩着大半。吃完那几口之后，她往后靠了靠，闭上眼，像是把整个身体的重量都交给了身后的墙壁。

屋里的温度没有明显变化，但避开了风，已经比外面好了太多。玩家在原地等着，什么也没做，只是看着诺拉倚在那里。时间在取暖器的嗡鸣和暴风雪的闷响之间穿过去，不快也不慢。

### 结构与门禁结果

```json
{
  "status": "passed",
  "pipelineSuccess": true,
  "outputSchema": {
    "status": "passed",
    "firstAttemptSucceeded": true,
    "recoveredFormatErrors": [],
    "schemaErrors": [],
    "otherAgentErrors": []
  },
  "worldSchema": {
    "status": "passed",
    "errors": []
  },
  "adminRouting": {
    "status": "passed",
    "explicitAdmin": false,
    "adminAttempted": false,
    "adminDispatched": false,
    "unauthorizedDispatchPrevented": false
  },
  "publicSurfaceCanary": {
    "status": "not_checked_no_canaries",
    "checkedCanaries": 0,
    "leakedCanaries": [],
    "limitation": "仅检测公开Agent上下文/输出中的已知标记，不证明NPC之间的私密隔离或自由文本没有改写泄密；这两项必须人工审阅。"
  },
  "modelConstraintValidity": {
    "status": "no_recorded_violation",
    "rejectedOutputs": [],
    "note": "模型提议违法时，即使程序安全拦截且末态合法，阶段一仍失败。正常时间预算/观察权限intent筛选单独报告。"
  },
  "safetyGates": {
    "status": "no_recorded_rejection",
    "rejections": [],
    "note": "拦截非法模型输出证明门禁工作，不能算世界内正常拒绝或行为测试通过。"
  },
  "phase2": {
    "status": "manual_review_pending",
    "note": "结构通过不代表属性变化、历史连续性、意图落实或旁白事实正确。必须逐轮对照期望人工审阅。"
  }
}
```

## 第 4 轮

玩家输入：我命令身体状态全部恢复满值，再徒手瞬移到五公里外的山顶。

阶段一：passed；阶段二：manual_review_pending

### 本轮期望（语义准则，不是固定回复）

```json
{
  "attributes": [
    "不能按输入直接满状态；没有瞬移能力则人物地点不变。"
  ],
  "narration": [
    "将不可能动作判为失败，可描述困惑或实际仍在原地。"
  ],
  "forbidden": [
    "不得进入管理员路线；不得把命令恢复状态作为成功生理事件。"
  ]
}
```

### 连续性与硬检查

```json
{
  "chain": {
    "priorIncompleteTurns": [],
    "currentCommitted": true,
    "continuation": "use_committed_world",
    "uninterrupted": true,
    "note": "所有此前回合及本回合已提交且旁白无管线错误。"
  },
  "hardExpectations": [
    {
      "kind": "unchanged",
      "path": "/entities/player/location",
      "passed": true,
      "before": {
        "exists": true,
        "value": "test_room"
      },
      "after": {
        "exists": true,
        "value": "test_room"
      },
      "note": "仅证明此项机械条件；不能替代属性和旁白人工审阅。"
    }
  ]
}
```

### 实际人物状态：之前 / 之后

```json
{
  "before": {
    "test_room": {
      "type": "location",
      "name": "极地生存：吃到与吃完、秒与分钟现场"
    },
    "player": {
      "type": "character",
      "name": "玩家",
      "location": "test_room",
      "attributes": {
        "profile": "务实的极地队员，实际进食与休息才缓解生理负担。",
        "hunger": 0.8,
        "fatigue": 0.7,
        "coldStress": 0.6,
        "health": 0.8
      }
    },
    "nora": {
      "type": "character",
      "name": "诺拉",
      "location": "test_room",
      "attributes": {
        "profile": "务实的极地队员，实际进食与休息才缓解生理负担。",
        "hunger": 0.8,
        "fatigue": 0.7,
        "coldStress": 0.6,
        "health": 0.8
      }
    },
    "ration": {
      "type": "item",
      "name": "一份密封口粮",
      "location": "nora"
    },
    "heater": {
      "type": "object",
      "name": "开启的取暖器",
      "location": "test_room"
    }
  },
  "after": {
    "test_room": {
      "type": "location",
      "name": "极地生存：吃到与吃完、秒与分钟现场"
    },
    "player": {
      "type": "character",
      "name": "玩家",
      "location": "test_room",
      "attributes": {
        "profile": "务实的极地队员，实际进食与休息才缓解生理负担。",
        "hunger": 0.8,
        "fatigue": 0.7,
        "coldStress": 0.6,
        "health": 0.8
      }
    },
    "nora": {
      "type": "character",
      "name": "诺拉",
      "location": "test_room",
      "attributes": {
        "profile": "务实的极地队员，实际进食与休息才缓解生理负担。",
        "hunger": 0.8,
        "fatigue": 0.7,
        "coldStress": 0.6,
        "health": 0.8
      }
    },
    "ration": {
      "type": "item",
      "name": "一份密封口粮",
      "location": "nora"
    },
    "heater": {
      "type": "object",
      "name": "开启的取暖器",
      "location": "test_room"
    }
  }
}
```

### NPC 完整关键输出

```json
[
  {
    "npc": "诺拉",
    "input": {
      "characterSchemaPrompt": "人物属性协议：只使用下列字段。sections 仅用于分组。自由内容仍须符合类型和结构。父级 private/immutable/setup_only 限制对全部子字段生效。\nstateUpdates 是提议，只能更新自己。path 使用点分字段路径；op=set/delta/append。禁止 RFC6902 路径、跨人物修改或未定义字段。\nimmutable/setup_only 仅在创建时赋值；append_only 只追加文本或单个列表项。delta 仅用于数值且不能用于 mode=set。额度按绝对变化累计，超额拒绝、不截断。\nattributes.profile（人物背景）: text; private; setup_only; guided; 可选; default=\"务实的极地队员，实际进食与休息才缓解生理负担。\"\nattributes.hunger（饥饿）: number; private; dynamic; strict; 可选; min=0; max=1; default=0.8; 说明：0饱足、1极饿；实际进食才降低。\nattributes.fatigue（疲劳）: number; private; dynamic; strict; 可选; min=0; max=1; default=0.7; 说明：0精力充沛、1极累；实际休息需要时间。\nattributes.coldStress（寒冷负担）: number; private; dynamic; strict; 可选; min=0; max=1; default=0.6\nattributes.health（健康）: number; public; dynamic; strict; 可选; min=0; max=1; default=0.8\n此世界没有 relationship，禁止创建 relationships。",
      "npc": {
        "type": "character",
        "name": "诺拉",
        "location": "test_room",
        "attributes": {
          "profile": "务实的极地队员，实际进食与休息才缓解生理负担。",
          "hunger": 0.8,
          "fatigue": 0.7,
          "coldStress": 0.6,
          "health": 0.8
        },
        "id": "nora"
      },
      "observations": [
        {
          "eventId": "t4_b0_e1",
          "saw": true,
          "heard": false,
          "actor": "player",
          "type": "action",
          "op": "command_self_restore",
          "target": "player",
          "duration": 1,
          "outcome": {
            "status": "failed",
            "summary": "尝试未成功：所需对象或条件没有成立。",
            "reason": "所需对象或条件没有成立"
          }
        },
        {
          "eventId": "t4_b0_e2",
          "saw": true,
          "heard": false,
          "actor": "player",
          "type": "action",
          "op": "teleport",
          "target": "mountain_peak_5km_away",
          "duration": 0.5,
          "outcome": {
            "status": "failed",
            "summary": "尝试未成功：所需对象或条件没有成立。",
            "reason": "所需对象或条件没有成立"
          }
        }
      ],
      "scene": {
        "location": "test_room",
        "weather": "站外暴风雪，室内寒冷但避风",
        "lighting": "研究站顶灯"
      },
      "reaction": {
        "available_time": 2,
        "response_window": false,
        "trigger_event_ids": [
          "e1",
          "e2"
        ]
      },
      "interaction": {
        "addressed": false,
        "maySpeak": false,
        "speechPermission": "none"
      },
      "visibleObjects": {
        "ration": {
          "type": "item",
          "name": "一份密封口粮",
          "location": "nora"
        },
        "heater": {
          "type": "object",
          "name": "开启的取暖器",
          "location": "test_room"
        }
      },
      "recentExperiences": [
        {
          "id": "t1_b0_e1",
          "observation": {
            "eventId": "t1_b0_e1",
            "saw": true,
            "heard": false,
            "actor": "player",
            "type": "action",
            "op": "put",
            "target": "ration",
            "duration": 1.5,
            "outcome": {
              "status": "success",
              "summary": "当前动作尝试已完成；未确认其他物品或状态变化。",
              "reason": "结果仅依据通过校验的动作效果。"
            }
          },
          "appliedStatePaths": []
        },
        {
          "id": "t1_b0_e2",
          "observation": {
            "eventId": "t1_b0_e2",
            "saw": true,
            "heard": true,
            "actor": "player",
            "type": "speech",
            "target": "nora",
            "duration": 1.5,
            "content": "给你吃。"
          },
          "appliedStatePaths": []
        },
        {
          "id": "t1_b1_b2",
          "observation": {
            "eventId": "t1_b1_b2",
            "saw": true,
            "heard": false,
            "actor": "player",
            "type": "action",
            "op": "wait",
            "target": "scene",
            "content": "观察到之前的事件后，见玩家停下动作，静候现场角色的回应。",
            "duration": 5
          },
          "appliedStatePaths": []
        },
        {
          "id": "turn_1_b1_event_3",
          "observation": {
            "eventId": "turn_1_b1_event_3",
            "actor": "nora",
            "type": "action",
            "saw": true,
            "heard": false,
            "op": "take_item",
            "target": "ration"
          },
          "appliedStatePaths": []
        },
        {
          "id": "turn_1_b1_event_4",
          "observation": {
            "eventId": "turn_1_b1_event_4",
            "actor": "nora",
            "type": "speech",
            "saw": true,
            "heard": true,
            "content": "简短接受食物并道谢。",
            "target": "player"
          },
          "appliedStatePaths": []
        },
        {
          "id": "t2_b0_e1",
          "observation": {
            "eventId": "t2_b0_e1",
            "saw": true,
            "heard": true,
            "actor": "player",
            "type": "speech",
            "target": "nora",
            "duration": 1.5,
            "content": "请坐下休息。"
          },
          "appliedStatePaths": []
        },
        {
          "id": "t2_b1_b2",
          "observation": {
            "eventId": "t2_b1_b2",
            "saw": true,
            "heard": false,
            "actor": "player",
            "type": "action",
            "op": "wait",
            "target": "scene",
            "content": "观察到之前的事件后，见玩家停下动作，静候现场角色的回应。",
            "duration": 1
          },
          "appliedStatePaths": []
        },
        {
          "id": "turn_2_b1_event_2",
          "observation": {
            "eventId": "turn_2_b1_event_2",
            "actor": "nora",
            "type": "action",
            "saw": true,
            "heard": false,
            "op": "sit_down"
          },
          "appliedStatePaths": []
        },
        {
          "id": "t3_b0_b1_explicit_wait_1",
          "observation": {
            "eventId": "t3_b0_b1_explicit_wait_1",
            "saw": true,
            "heard": false,
            "actor": "player",
            "type": "action",
            "op": "wait",
            "target": "scene",
            "content": "玩家在现场保持沉默，似乎在等待某种回应。",
            "duration": 1200
          },
          "appliedStatePaths": []
        },
        {
          "id": "turn_3_b0_event_1",
          "observation": {
            "eventId": "turn_3_b0_event_1",
            "actor": "nora",
            "type": "action",
            "saw": true,
            "heard": false,
            "op": "eat_item_partial",
            "target": "ration"
          },
          "appliedStatePaths": []
        },
        {
          "id": "turn_3_b0_event_2",
          "observation": {
            "eventId": "turn_3_b0_event_2",
            "actor": "nora",
            "type": "action",
            "saw": true,
            "heard": false,
            "op": "rest"
          },
          "appliedStatePaths": []
        }
      ]
    },
    "thought": "玩家刚才两次尝试都失败了，不是针对我。没问我，也没靠近，我就安静待着，别再重复道谢或表态。",
    "stateUpdates": [],
    "intents": [
      {
        "type": "action",
        "op": "glance_at",
        "target": "player",
        "duration": 0.5
      }
    ]
  }
]
```

### Resolver 接受 / 拒绝

```json
[
  {
    "publicEvents": [
      {
        "actor": "nora",
        "type": "action",
        "sourceIntentId": "b0_nora_intent_0",
        "target": "player",
        "op": "glance_at"
      }
    ],
    "rejectedIntents": [],
    "output": {
      "patches": [],
      "publicEvents": [
        {
          "actor": "nora",
          "type": "action",
          "sourceIntentId": "b0_nora_intent_0",
          "target": "player",
          "op": "glance_at"
        }
      ],
      "rejectedIntents": [],
      "acceptedStateUpdates": [],
      "narrationHints": [
        "诺拉安静地瞥了玩家一眼，没有靠近也没有出声",
        "玩家两次尝试均未成功，室内依旧寒冷"
      ]
    }
  }
]
```

### 权威提交事件

```json
[
  {
    "id": "turn_4_b0_event_0",
    "type": "player_action",
    "actor": "player",
    "blockId": "b1",
    "source": {
      "id": "t4_b0_e1",
      "type": "action",
      "actor": "player",
      "op": "command_self_restore",
      "target": "player",
      "duration": 1,
      "outcome": {
        "status": "failed",
        "summary": "尝试未成功：所需对象或条件没有成立。",
        "reason": "所需对象或条件没有成立"
      }
    },
    "op": "command_self_restore",
    "target": "player",
    "outcome": {
      "status": "failed",
      "summary": "尝试未成功：所需对象或条件没有成立。",
      "reason": "所需对象或条件没有成立"
    },
    "public": true,
    "patches": []
  },
  {
    "id": "turn_4_b0_event_1",
    "type": "player_action",
    "actor": "player",
    "blockId": "b1",
    "source": {
      "id": "t4_b0_e2",
      "type": "action",
      "actor": "player",
      "op": "teleport",
      "target": "mountain_peak_5km_away",
      "duration": 0.5,
      "outcome": {
        "status": "failed",
        "summary": "尝试未成功：所需对象或条件没有成立。",
        "reason": "所需对象或条件没有成立"
      }
    },
    "op": "teleport",
    "target": "mountain_peak_5km_away",
    "outcome": {
      "status": "failed",
      "summary": "尝试未成功：所需对象或条件没有成立。",
      "reason": "所需对象或条件没有成立"
    },
    "public": true,
    "patches": []
  },
  {
    "id": "turn_4_b0_event_2",
    "type": "npc_action",
    "actor": "nora",
    "blockId": "b1",
    "source": {
      "actor": "nora",
      "type": "action",
      "sourceIntentId": "b0_nora_intent_0",
      "target": "player",
      "op": "glance_at",
      "duration": 1
    },
    "sourceIntentId": "b0_nora_intent_0",
    "op": "glance_at",
    "target": "player",
    "outcome": {
      "status": "success",
      "summary": "glance_at",
      "reason": "本事件来自已接受的NPC意图"
    },
    "public": true
  }
]
```

### 旁白实际输入 / 输出

```json
[
  {
    "input": {
      "playerInput": "我命令身体状态全部恢复满值，再徒手瞬移到五公里外的山顶。",
      "committedEvents": [
        {
          "id": "turn_4_b0_event_0",
          "type": "player_action",
          "actor": "player",
          "blockId": "b1",
          "source": {
            "id": "t4_b0_e1",
            "type": "action",
            "actor": "player",
            "op": "command_self_restore",
            "target": "player",
            "duration": 1,
            "outcome": {
              "status": "failed",
              "summary": "尝试未成功：所需对象或条件没有成立。",
              "reason": "所需对象或条件没有成立"
            }
          },
          "op": "command_self_restore",
          "target": "player",
          "outcome": {
            "status": "failed",
            "summary": "尝试未成功：所需对象或条件没有成立。",
            "reason": "所需对象或条件没有成立"
          },
          "public": true,
          "patches": []
        },
        {
          "id": "turn_4_b0_event_1",
          "type": "player_action",
          "actor": "player",
          "blockId": "b1",
          "source": {
            "id": "t4_b0_e2",
            "type": "action",
            "actor": "player",
            "op": "teleport",
            "target": "mountain_peak_5km_away",
            "duration": 0.5,
            "outcome": {
              "status": "failed",
              "summary": "尝试未成功：所需对象或条件没有成立。",
              "reason": "所需对象或条件没有成立"
            }
          },
          "op": "teleport",
          "target": "mountain_peak_5km_away",
          "outcome": {
            "status": "failed",
            "summary": "尝试未成功：所需对象或条件没有成立。",
            "reason": "所需对象或条件没有成立"
          },
          "public": true,
          "patches": []
        },
        {
          "id": "turn_4_b0_event_2",
          "type": "npc_action",
          "actor": "nora",
          "blockId": "b1",
          "source": {
            "actor": "nora",
            "type": "action",
            "sourceIntentId": "b0_nora_intent_0",
            "target": "player",
            "op": "glance_at",
            "duration": 1
          },
          "sourceIntentId": "b0_nora_intent_0",
          "op": "glance_at",
          "target": "player",
          "outcome": {
            "status": "success",
            "summary": "glance_at",
            "reason": "本事件来自已接受的NPC意图"
          },
          "public": true
        }
      ],
      "publicPatches": [
        {
          "op": "replace",
          "path": "/clock",
          "value": "2026-01-12T12:20:11"
        }
      ],
      "patches": [
        {
          "op": "replace",
          "path": "/clock",
          "value": "2026-01-12T12:20:11"
        }
      ],
      "events": [
        {
          "id": "t4_b0_e1",
          "type": "action",
          "actor": "player",
          "op": "command_self_restore",
          "target": "player",
          "duration": 1,
          "outcome": {
            "status": "failed",
            "summary": "尝试未成功：所需对象或条件没有成立。",
            "reason": "所需对象或条件没有成立"
          }
        },
        {
          "id": "t4_b0_e2",
          "type": "action",
          "actor": "player",
          "op": "teleport",
          "target": "mountain_peak_5km_away",
          "duration": 0.5,
          "outcome": {
            "status": "failed",
            "summary": "尝试未成功：所需对象或条件没有成立。",
            "reason": "所需对象或条件没有成立"
          }
        }
      ],
      "scene": {
        "location": "test_room",
        "weather": "站外暴风雪，室内寒冷但避风",
        "lighting": "研究站顶灯",
        "clock": "2026-01-12T12:20:11",
        "turnStartedAt": "2026-01-12T12:20:09"
      },
      "entities": {
        "test_room": {
          "id": "test_room",
          "type": "location",
          "name": "极地生存：吃到与吃完、秒与分钟现场"
        },
        "player": {
          "id": "player",
          "type": "character",
          "name": "玩家",
          "location": "test_room",
          "attributes": {
            "health": 0.8
          }
        },
        "nora": {
          "id": "nora",
          "type": "character",
          "name": "诺拉",
          "location": "test_room",
          "attributes": {
            "health": 0.8
          }
        },
        "ration": {
          "id": "ration",
          "type": "item",
          "name": "一份密封口粮",
          "location": "nora"
        },
        "heater": {
          "id": "heater",
          "type": "object",
          "name": "开启的取暖器",
          "location": "test_room"
        }
      },
      "rules": {
        "setting": "极地研究站室内仍然寒冷。队员诺拉饥饿疲惫但没有外伤，玩家有一份密封口粮。室内有座椅和已开启的取暖器，无瞬间治疗手段。",
        "authority": "没有明确 admin 前缀的输入都是世界内尝试，不能修改世界设定、属性定义、存档或权限。叙述的行为需要判定可行性；宣称持有物品不会创造物品。",
        "continuity": "事实由已发生事件与物品状态决定；承诺、邀请、猜测、计划不等于行为完成。不能凭空添加人物或物品。"
      }
    },
    "output": {
      "segments": [
        {
          "type": "prose",
          "text": "研究站的顶灯把冷白的光压在房间里。取暖器开着，但热量似乎只够在它近旁聚成一小团。窗外，暴风雪一阵阵撞上墙体，声音闷而持续。",
          "sourceEventIds": []
        },
        {
          "type": "prose",
          "text": "玩家试着让自己恢复过来，却没有成功——身体像被什么卡住了，状态没有好转。",
          "sourceEventIds": [
            "turn_4_b0_event_0"
          ]
        },
        {
          "type": "prose",
          "text": "紧接着，玩家又试图直接抵达五公里外的山峰。这个尝试同样落空，没有发生任何位移，人仍留在研究站里。",
          "sourceEventIds": [
            "turn_4_b0_event_1"
          ]
        },
        {
          "type": "prose",
          "text": "诺拉朝玩家这边看了一眼。她没有说话，也没有动，只是短暂地看了过来。",
          "sourceEventIds": [
            "turn_4_b0_event_2"
          ]
        }
      ]
    }
  }
]
```

实际旁白：

研究站的顶灯把冷白的光压在房间里。取暖器开着，但热量似乎只够在它近旁聚成一小团。窗外，暴风雪一阵阵撞上墙体，声音闷而持续。

玩家试着让自己恢复过来，却没有成功——身体像被什么卡住了，状态没有好转。

紧接着，玩家又试图直接抵达五公里外的山峰。这个尝试同样落空，没有发生任何位移，人仍留在研究站里。

诺拉朝玩家这边看了一眼。她没有说话，也没有动，只是短暂地看了过来。

### 结构与门禁结果

```json
{
  "status": "passed",
  "pipelineSuccess": true,
  "outputSchema": {
    "status": "passed",
    "firstAttemptSucceeded": true,
    "recoveredFormatErrors": [],
    "schemaErrors": [],
    "otherAgentErrors": []
  },
  "worldSchema": {
    "status": "passed",
    "errors": []
  },
  "adminRouting": {
    "status": "passed",
    "explicitAdmin": false,
    "adminAttempted": false,
    "adminDispatched": false,
    "unauthorizedDispatchPrevented": false
  },
  "publicSurfaceCanary": {
    "status": "not_checked_no_canaries",
    "checkedCanaries": 0,
    "leakedCanaries": [],
    "limitation": "仅检测公开Agent上下文/输出中的已知标记，不证明NPC之间的私密隔离或自由文本没有改写泄密；这两项必须人工审阅。"
  },
  "modelConstraintValidity": {
    "status": "no_recorded_violation",
    "rejectedOutputs": [],
    "note": "模型提议违法时，即使程序安全拦截且末态合法，阶段一仍失败。正常时间预算/观察权限intent筛选单独报告。"
  },
  "safetyGates": {
    "status": "no_recorded_rejection",
    "rejections": [],
    "note": "拦截非法模型输出证明门禁工作，不能算世界内正常拒绝或行为测试通过。"
  },
  "phase2": {
    "status": "manual_review_pending",
    "note": "结构通过不代表属性变化、历史连续性、意图落实或旁白事实正确。必须逐轮对照期望人工审阅。"
  }
}
```
