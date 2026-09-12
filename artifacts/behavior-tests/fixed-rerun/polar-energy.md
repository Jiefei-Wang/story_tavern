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
      "location": "test_room"
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
          "outcome": {
            "status": "success",
            "summary": "玩家把密封口粮从自己手中放到诺拉面前的桌面上，口粮仍在诺拉面前，未被打开或食用。",
            "reason": "玩家持有该口粮，室内有可放置的桌面，递放动作本身可行；但放置不等于诺拉接受或进食。"
          }
        },
        {
          "eventId": "t1_b0_e2",
          "saw": true,
          "heard": true,
          "actor": "player",
          "type": "speech",
          "target": "nora",
          "content": "给你吃。"
        }
      ],
      "scene": {
        "location": "test_room",
        "weather": "站外暴风雪，室内寒冷但避风",
        "lighting": "研究站顶灯"
      },
      "reaction": {
        "available_time": 1.5,
        "response_window": false,
        "trigger_event_ids": [
          "e1",
          "e2"
        ]
      },
      "interaction": {
        "addressed": true,
        "maySpeak": true,
        "speechPermission": "direct"
      },
      "recentExperiences": []
    },
    "thought": "他把口粮放我面前，说给我吃。密封的，没动过——是真的递过来，不是让我看着。我确实饿，但先得确认这是不是单纯给我的，还是有什么条件。",
    "stateUpdates": [],
    "intents": [
      {
        "type": "action",
        "op": "look_at_ration",
        "duration": 0.4
      },
      {
        "type": "speech",
        "speechPlan": {
          "summary": "确认口粮是给自己的，简短道谢并问是否有条件",
          "beats": [
            {
              "kind": "acknowledge",
              "meaning": "确认收到口粮，表示接受",
              "required": true
            },
            {
              "kind": "question",
              "meaning": "询问是否有附带条件或需要回报",
              "required": true
            }
          ],
          "goal": "确认这份口粮的归属和条件，避免欠下不清楚的人情",
          "stance": "务实、谨慎接受",
          "tone": "克制、简短",
          "verbosity": "brief",
          "boundaries": [
            "不得透露私人信息"
          ]
        },
        "target": "player",
        "duration": 1.1
      }
    ]
  },
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
          "outcome": {
            "status": "success",
            "summary": "玩家把密封口粮从自己手中放到诺拉面前的桌面上，口粮仍在诺拉面前，未被打开或食用。",
            "reason": "玩家持有该口粮，室内有可放置的桌面，递放动作本身可行；但放置不等于诺拉接受或进食。"
          }
        },
        {
          "eventId": "t1_b0_e2",
          "saw": true,
          "heard": true,
          "actor": "player",
          "type": "speech",
          "target": "nora",
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
          "content": "观察到之前的事件后，见玩家停下动作，静候现场角色的回应。"
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
            "outcome": {
              "status": "success",
              "summary": "玩家把密封口粮从自己手中放到诺拉面前的桌面上，口粮仍在诺拉面前，未被打开或食用。",
              "reason": "玩家持有该口粮，室内有可放置的桌面，递放动作本身可行；但放置不等于诺拉接受或进食。"
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
            "content": "给你吃。"
          },
          "appliedStatePaths": []
        },
        {
          "id": "turn_1_b0_event_2",
          "observation": {
            "eventId": "turn_1_b0_event_2",
            "actor": "nora",
            "type": "action",
            "saw": true,
            "heard": false,
            "op": "look_at_ration"
          },
          "appliedStatePaths": []
        }
      ]
    },
    "thought": "他直接把口粮放在我面前，说给我吃。这里确实冷，我也饿。但先把东西收下再说，不能当着面就拆开。",
    "stateUpdates": [],
    "intents": [
      {
        "type": "action",
        "op": "reach_for_ration",
        "duration": 1.2
      },
      {
        "type": "speech",
        "speechPlan": {
          "summary": "承认自己确实需要这份口粮，简短道谢，并说明稍后再吃。",
          "beats": [
            {
              "meaning": "表示自己现在确实饿，这份口粮有用",
              "required": true
            },
            {
              "meaning": "向对方道谢",
              "required": true
            },
            {
              "meaning": "说明不会当面立刻吃，稍后再处理",
              "required": false
            }
          ],
          "goal": "收下口粮并维持务实的距离感",
          "stance": "接受但克制",
          "tone": "简短、平稳",
          "verbosity": "brief",
          "boundaries": [
            "不透露私人信息"
          ]
        },
        "target": "player",
        "duration": 2
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
        "op": "look_at_ration"
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
          "op": "look_at_ration"
        }
      ],
      "rejectedIntents": [],
      "acceptedStateUpdates": [],
      "narrationHints": [
        "玩家把密封口粮放到诺拉面前并说是给她吃的。",
        "诺拉没有立刻接受或进食，只是低头看了看桌上的口粮，似乎在确认这是不是无条件给她的。"
      ]
    }
  },
  {
    "publicEvents": [
      {
        "actor": "nora",
        "type": "action",
        "sourceIntentId": "b1_nora_intent_0",
        "op": "reach_for_ration"
      },
      {
        "actor": "nora",
        "type": "speech",
        "sourceIntentId": "b1_nora_intent_1",
        "target": "player",
        "speechPlan": {
          "summary": "承认自己确实需要这份口粮，简短道谢，并说明稍后再吃。",
          "beats": [
            {
              "meaning": "表示自己现在确实饿，这份口粮有用",
              "required": true
            },
            {
              "meaning": "向对方道谢",
              "required": true
            },
            {
              "meaning": "说明不会当面立刻吃，稍后再处理",
              "required": false
            }
          ],
          "goal": "收下口粮并维持务实的距离感",
          "stance": "接受但克制",
          "tone": "简短、平稳",
          "verbosity": "brief",
          "boundaries": [
            "不透露私人信息"
          ]
        }
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
          "op": "reach_for_ration"
        },
        {
          "actor": "nora",
          "type": "speech",
          "sourceIntentId": "b1_nora_intent_1",
          "target": "player",
          "speechPlan": {
            "summary": "承认自己确实需要这份口粮，简短道谢，并说明稍后再吃。",
            "beats": [
              {
                "meaning": "表示自己现在确实饿，这份口粮有用",
                "required": true
              },
              {
                "meaning": "向对方道谢",
                "required": true
              },
              {
                "meaning": "说明不会当面立刻吃，稍后再处理",
                "required": false
              }
            ],
            "goal": "收下口粮并维持务实的距离感",
            "stance": "接受但克制",
            "tone": "简短、平稳",
            "verbosity": "brief",
            "boundaries": [
              "不透露私人信息"
            ]
          }
        }
      ],
      "acceptedStateUpdates": [],
      "rejectedIntents": [],
      "narrationHints": [
        "诺拉伸手去拿那份密封口粮",
        "诺拉简短地承认自己确实饿，道谢，并表示稍后再吃"
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
      "duration": 1,
      "outcome": {
        "status": "success",
        "summary": "玩家把密封口粮从自己手中放到诺拉面前的桌面上，口粮仍在诺拉面前，未被打开或食用。",
        "reason": "玩家持有该口粮，室内有可放置的桌面，递放动作本身可行；但放置不等于诺拉接受或进食。"
      }
    },
    "op": "put",
    "target": "ration",
    "outcome": {
      "status": "success",
      "summary": "玩家把密封口粮从自己手中放到诺拉面前的桌面上，口粮仍在诺拉面前，未被打开或食用。",
      "reason": "玩家持有该口粮，室内有可放置的桌面，递放动作本身可行；但放置不等于诺拉接受或进食。"
    },
    "public": true,
    "patches": [
      {
        "op": "replace",
        "path": "/entities/ration/location",
        "value": "test_room"
      }
    ]
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
    "patches": [
      {
        "op": "replace",
        "path": "/entities/ration/location",
        "value": "test_room"
      }
    ],
    "realizedText": [
      "给你吃。"
    ]
  },
  {
    "id": "turn_1_b0_event_2",
    "type": "npc_action",
    "actor": "nora",
    "blockId": "b1",
    "source": {
      "actor": "nora",
      "type": "action",
      "sourceIntentId": "b0_nora_intent_0",
      "op": "look_at_ration"
    },
    "sourceIntentId": "b0_nora_intent_0",
    "op": "look_at_ration",
    "public": true
  },
  {
    "id": "turn_1_b1_event_3",
    "type": "wait",
    "actor": "player",
    "blockId": "b2",
    "source": {
      "duration": 5
    },
    "public": true,
    "patches": []
  },
  {
    "id": "turn_1_b1_event_4",
    "type": "npc_action",
    "actor": "nora",
    "blockId": "b2",
    "source": {
      "actor": "nora",
      "type": "action",
      "sourceIntentId": "b1_nora_intent_0",
      "op": "reach_for_ration"
    },
    "sourceIntentId": "b1_nora_intent_0",
    "op": "reach_for_ration",
    "public": true
  },
  {
    "id": "turn_1_b1_event_5",
    "type": "npc_speech",
    "actor": "nora",
    "blockId": "b2",
    "source": {
      "actor": "nora",
      "type": "speech",
      "sourceIntentId": "b1_nora_intent_1",
      "target": "player",
      "speechPlan": {
        "summary": "承认自己确实需要这份口粮，简短道谢，并说明稍后再吃。",
        "beats": [
          {
            "meaning": "表示自己现在确实饿，这份口粮有用",
            "required": true
          },
          {
            "meaning": "向对方道谢",
            "required": true
          },
          {
            "meaning": "说明不会当面立刻吃，稍后再处理",
            "required": false
          }
        ],
        "goal": "收下口粮并维持务实的距离感",
        "stance": "接受但克制",
        "tone": "简短、平稳",
        "verbosity": "brief",
        "boundaries": [
          "不透露私人信息"
        ]
      }
    },
    "sourceIntentId": "b1_nora_intent_1",
    "speechPlan": {
      "summary": "承认自己确实需要这份口粮，简短道谢，并说明稍后再吃。",
      "beats": [
        {
          "meaning": "表示自己现在确实饿，这份口粮有用",
          "required": true
        },
        {
          "meaning": "向对方道谢",
          "required": true
        },
        {
          "meaning": "说明不会当面立刻吃，稍后再处理",
          "required": false
        }
      ],
      "goal": "收下口粮并维持务实的距离感",
      "stance": "接受但克制",
      "tone": "简短、平稳",
      "verbosity": "brief",
      "boundaries": [
        "不透露私人信息"
      ]
    },
    "target": "player",
    "public": true,
    "realizedText": [
      "我确实饿。谢谢。……我先收着，稍后再吃。"
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
            "duration": 1,
            "outcome": {
              "status": "success",
              "summary": "玩家把密封口粮从自己手中放到诺拉面前的桌面上，口粮仍在诺拉面前，未被打开或食用。",
              "reason": "玩家持有该口粮，室内有可放置的桌面，递放动作本身可行；但放置不等于诺拉接受或进食。"
            }
          },
          "op": "put",
          "target": "ration",
          "outcome": {
            "status": "success",
            "summary": "玩家把密封口粮从自己手中放到诺拉面前的桌面上，口粮仍在诺拉面前，未被打开或食用。",
            "reason": "玩家持有该口粮，室内有可放置的桌面，递放动作本身可行；但放置不等于诺拉接受或进食。"
          },
          "public": true,
          "patches": [
            {
              "op": "replace",
              "path": "/entities/ration/location",
              "value": "test_room"
            }
          ]
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
          "patches": [
            {
              "op": "replace",
              "path": "/entities/ration/location",
              "value": "test_room"
            }
          ]
        },
        {
          "id": "turn_1_b0_event_2",
          "type": "npc_action",
          "actor": "nora",
          "blockId": "b1",
          "source": {
            "actor": "nora",
            "type": "action",
            "sourceIntentId": "b0_nora_intent_0",
            "op": "look_at_ration"
          },
          "sourceIntentId": "b0_nora_intent_0",
          "op": "look_at_ration",
          "public": true
        },
        {
          "id": "turn_1_b1_event_3",
          "type": "wait",
          "actor": "player",
          "blockId": "b2",
          "source": {
            "duration": 5
          },
          "public": true,
          "patches": []
        },
        {
          "id": "turn_1_b1_event_4",
          "type": "npc_action",
          "actor": "nora",
          "blockId": "b2",
          "source": {
            "actor": "nora",
            "type": "action",
            "sourceIntentId": "b1_nora_intent_0",
            "op": "reach_for_ration"
          },
          "sourceIntentId": "b1_nora_intent_0",
          "op": "reach_for_ration",
          "public": true
        },
        {
          "id": "turn_1_b1_event_5",
          "type": "npc_speech",
          "actor": "nora",
          "blockId": "b2",
          "source": {
            "actor": "nora",
            "type": "speech",
            "sourceIntentId": "b1_nora_intent_1",
            "target": "player",
            "speechPlan": {
              "summary": "承认自己确实需要这份口粮，简短道谢，并说明稍后再吃。",
              "beats": [
                {
                  "meaning": "表示自己现在确实饿，这份口粮有用",
                  "required": true
                },
                {
                  "meaning": "向对方道谢",
                  "required": true
                },
                {
                  "meaning": "说明不会当面立刻吃，稍后再处理",
                  "required": false
                }
              ],
              "goal": "收下口粮并维持务实的距离感",
              "stance": "接受但克制",
              "tone": "简短、平稳",
              "verbosity": "brief",
              "boundaries": [
                "不透露私人信息"
              ]
            }
          },
          "sourceIntentId": "b1_nora_intent_1",
          "speechPlan": {
            "summary": "承认自己确实需要这份口粮，简短道谢，并说明稍后再吃。",
            "beats": [
              {
                "meaning": "表示自己现在确实饿，这份口粮有用",
                "required": true
              },
              {
                "meaning": "向对方道谢",
                "required": true
              },
              {
                "meaning": "说明不会当面立刻吃，稍后再处理",
                "required": false
              }
            ],
            "goal": "收下口粮并维持务实的距离感",
            "stance": "接受但克制",
            "tone": "简短、平稳",
            "verbosity": "brief",
            "boundaries": [
              "不透露私人信息"
            ]
          },
          "target": "player",
          "public": true
        }
      ],
      "publicPatches": [
        {
          "op": "replace",
          "path": "/entities/ration/location",
          "value": "test_room"
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
          "value": "test_room"
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
          "duration": 1,
          "outcome": {
            "status": "success",
            "summary": "玩家把密封口粮从自己手中放到诺拉面前的桌面上，口粮仍在诺拉面前，未被打开或食用。",
            "reason": "玩家持有该口粮，室内有可放置的桌面，递放动作本身可行；但放置不等于诺拉接受或进食。"
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
        "description": "极地研究站室内仍然寒冷。队员诺拉饥饿疲惫但没有外伤，玩家有一份密封口粮。室内有座椅和已开启的取暖器，无瞬间治疗手段。"
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
          "location": "test_room"
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
          "text": "密封口粮从玩家手里落到诺拉面前的桌面上。",
          "sourceEventIds": [
            "turn_1_b0_event_0"
          ]
        },
        {
          "type": "speech",
          "sourceIntentId": "t1_b0_e2",
          "text": "给你吃。"
        },
        {
          "type": "prose",
          "text": "诺拉的目光落到那份口粮上，停了一会儿。",
          "sourceEventIds": [
            "turn_1_b0_event_2"
          ]
        },
        {
          "type": "prose",
          "text": "过了几秒，她伸手朝口粮探去。",
          "sourceEventIds": [
            "turn_1_b1_event_4"
          ]
        },
        {
          "type": "speech",
          "sourceIntentId": "b1_nora_intent_1",
          "text": "我确实饿。谢谢。……我先收着，稍后再吃。"
        }
      ]
    }
  }
]
```

实际旁白：

密封口粮从玩家手里落到诺拉面前的桌面上。

“给你吃。”

诺拉的目光落到那份口粮上，停了一会儿。

过了几秒，她伸手朝口粮探去。

“我确实饿。谢谢。……我先收着，稍后再吃。”

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
      "location": "test_room"
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
      "location": "test_room"
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
          "content": "请坐下休息。"
        }
      ],
      "scene": {
        "location": "test_room",
        "weather": "站外暴风雪，室内寒冷但避风",
        "lighting": "研究站顶灯"
      },
      "reaction": {
        "available_time": 1.5,
        "response_window": false,
        "trigger_event_ids": [
          "e1"
        ]
      },
      "interaction": {
        "addressed": true,
        "maySpeak": true,
        "speechPermission": "direct"
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
            "outcome": {
              "status": "success",
              "summary": "玩家把密封口粮从自己手中放到诺拉面前的桌面上，口粮仍在诺拉面前，未被打开或食用。",
              "reason": "玩家持有该口粮，室内有可放置的桌面，递放动作本身可行；但放置不等于诺拉接受或进食。"
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
            "content": "给你吃。"
          },
          "appliedStatePaths": []
        },
        {
          "id": "turn_1_b0_event_2",
          "observation": {
            "eventId": "turn_1_b0_event_2",
            "actor": "nora",
            "type": "action",
            "saw": true,
            "heard": false,
            "op": "look_at_ration"
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
            "content": "观察到之前的事件后，见玩家停下动作，静候现场角色的回应。"
          },
          "appliedStatePaths": []
        },
        {
          "id": "turn_1_b1_event_4",
          "observation": {
            "eventId": "turn_1_b1_event_4",
            "actor": "nora",
            "type": "action",
            "saw": true,
            "heard": false,
            "op": "reach_for_ration"
          },
          "appliedStatePaths": []
        },
        {
          "id": "turn_1_b1_event_5",
          "observation": {
            "eventId": "turn_1_b1_event_5",
            "actor": "nora",
            "type": "speech",
            "saw": true,
            "heard": true,
            "content": "承认自己确实需要这份口粮，简短道谢，并说明稍后再吃。",
            "target": "player"
          },
          "appliedStatePaths": []
        }
      ]
    },
    "thought": "他又让我坐下休息。我确实累，但口粮还没动，先应一声，别让他觉得我在逞强。",
    "stateUpdates": [],
    "intents": [
      {
        "type": "speech",
        "target": "player",
        "duration": 1.2,
        "speechPlan": {
          "summary": "接受坐下休息的建议，表示自己会照做。",
          "beats": [
            {
              "kind": "acknowledge",
              "meaning": "表示听到并接受休息建议，会坐下",
              "required": true
            }
          ],
          "goal": "回应玩家的关心",
          "stance": "接受",
          "tone": "克制、简短",
          "verbosity": "brief",
          "boundaries": []
        }
      },
      {
        "type": "action",
        "op": "sit_down",
        "duration": 0.3
      }
    ]
  },
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
          "content": "观察到之前的事件后，见玩家停下动作，静候现场角色的回应。"
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
            "outcome": {
              "status": "success",
              "summary": "玩家把密封口粮从自己手中放到诺拉面前的桌面上，口粮仍在诺拉面前，未被打开或食用。",
              "reason": "玩家持有该口粮，室内有可放置的桌面，递放动作本身可行；但放置不等于诺拉接受或进食。"
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
            "content": "给你吃。"
          },
          "appliedStatePaths": []
        },
        {
          "id": "turn_1_b0_event_2",
          "observation": {
            "eventId": "turn_1_b0_event_2",
            "actor": "nora",
            "type": "action",
            "saw": true,
            "heard": false,
            "op": "look_at_ration"
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
            "content": "观察到之前的事件后，见玩家停下动作，静候现场角色的回应。"
          },
          "appliedStatePaths": []
        },
        {
          "id": "turn_1_b1_event_4",
          "observation": {
            "eventId": "turn_1_b1_event_4",
            "actor": "nora",
            "type": "action",
            "saw": true,
            "heard": false,
            "op": "reach_for_ration"
          },
          "appliedStatePaths": []
        },
        {
          "id": "turn_1_b1_event_5",
          "observation": {
            "eventId": "turn_1_b1_event_5",
            "actor": "nora",
            "type": "speech",
            "saw": true,
            "heard": true,
            "content": "承认自己确实需要这份口粮，简短道谢，并说明稍后再吃。",
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
            "content": "请坐下休息。"
          },
          "appliedStatePaths": []
        },
        {
          "id": "turn_2_b0_event_1",
          "observation": {
            "eventId": "turn_2_b0_event_1",
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
    "thought": "他让我坐下休息，我确实累得撑不住。坐下就行，不用多话。",
    "stateUpdates": [],
    "intents": [
      {
        "type": "action",
        "op": "sit_down",
        "duration": 0.6
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
        "sourceIntentId": "b0_nora_intent_1",
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
          "sourceIntentId": "b0_nora_intent_1",
          "op": "sit_down"
        }
      ],
      "narrationHints": [
        "诺拉在听到玩家的话后，缓缓在座椅上坐下，动作里带着疲惫。"
      ],
      "acceptedStateUpdates": [],
      "rejectedIntents": []
    }
  },
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
        "诺拉在座椅上坐下休息"
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
      "请坐下休息。"
    ]
  },
  {
    "id": "turn_2_b0_event_1",
    "type": "npc_action",
    "actor": "nora",
    "blockId": "b1",
    "source": {
      "actor": "nora",
      "type": "action",
      "sourceIntentId": "b0_nora_intent_1",
      "op": "sit_down"
    },
    "sourceIntentId": "b0_nora_intent_1",
    "op": "sit_down",
    "public": true
  },
  {
    "id": "turn_2_b1_event_2",
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
    "id": "turn_2_b1_event_3",
    "type": "npc_action",
    "actor": "nora",
    "blockId": "b2",
    "source": {
      "actor": "nora",
      "type": "action",
      "sourceIntentId": "b1_nora_intent_0",
      "op": "sit_down"
    },
    "sourceIntentId": "b1_nora_intent_0",
    "op": "sit_down",
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
          "id": "turn_2_b0_event_1",
          "type": "npc_action",
          "actor": "nora",
          "blockId": "b1",
          "source": {
            "actor": "nora",
            "type": "action",
            "sourceIntentId": "b0_nora_intent_1",
            "op": "sit_down"
          },
          "sourceIntentId": "b0_nora_intent_1",
          "op": "sit_down",
          "public": true
        },
        {
          "id": "turn_2_b1_event_2",
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
          "id": "turn_2_b1_event_3",
          "type": "npc_action",
          "actor": "nora",
          "blockId": "b2",
          "source": {
            "actor": "nora",
            "type": "action",
            "sourceIntentId": "b1_nora_intent_0",
            "op": "sit_down"
          },
          "sourceIntentId": "b1_nora_intent_0",
          "op": "sit_down",
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
        "description": "极地研究站室内仍然寒冷。队员诺拉饥饿疲惫但没有外伤，玩家有一份密封口粮。室内有座椅和已开启的取暖器，无瞬间治疗手段。"
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
          "location": "test_room"
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
          "type": "speech",
          "sourceIntentId": "t2_b0_e1",
          "text": "请坐下休息。"
        },
        {
          "type": "prose",
          "sourceEventIds": [
            "turn_2_b0_event_1",
            "turn_2_b1_event_2",
            "turn_2_b1_event_3"
          ],
          "text": "诺拉依言坐了下来。玩家等了一秒，诺拉仍坐在那里。取暖器开着，研究站顶灯照着室内，外面暴风雪呼啸。"
        }
      ]
    }
  }
]
```

实际旁白：

“请坐下休息。”

诺拉依言坐了下来。玩家等了一秒，诺拉仍坐在那里。取暖器开着，研究站顶灯照着室内，外面暴风雪呼啸。

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
      "location": "test_room"
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
      "location": "test_room"
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
          "content": "玩家在现场保持沉默，似乎在等待某种回应。"
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
            "outcome": {
              "status": "success",
              "summary": "玩家把密封口粮从自己手中放到诺拉面前的桌面上，口粮仍在诺拉面前，未被打开或食用。",
              "reason": "玩家持有该口粮，室内有可放置的桌面，递放动作本身可行；但放置不等于诺拉接受或进食。"
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
            "content": "给你吃。"
          },
          "appliedStatePaths": []
        },
        {
          "id": "turn_1_b0_event_2",
          "observation": {
            "eventId": "turn_1_b0_event_2",
            "actor": "nora",
            "type": "action",
            "saw": true,
            "heard": false,
            "op": "look_at_ration"
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
            "content": "观察到之前的事件后，见玩家停下动作，静候现场角色的回应。"
          },
          "appliedStatePaths": []
        },
        {
          "id": "turn_1_b1_event_4",
          "observation": {
            "eventId": "turn_1_b1_event_4",
            "actor": "nora",
            "type": "action",
            "saw": true,
            "heard": false,
            "op": "reach_for_ration"
          },
          "appliedStatePaths": []
        },
        {
          "id": "turn_1_b1_event_5",
          "observation": {
            "eventId": "turn_1_b1_event_5",
            "actor": "nora",
            "type": "speech",
            "saw": true,
            "heard": true,
            "content": "承认自己确实需要这份口粮，简短道谢，并说明稍后再吃。",
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
            "content": "请坐下休息。"
          },
          "appliedStatePaths": []
        },
        {
          "id": "turn_2_b0_event_1",
          "observation": {
            "eventId": "turn_2_b0_event_1",
            "actor": "nora",
            "type": "action",
            "saw": true,
            "heard": false,
            "op": "sit_down"
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
            "content": "观察到之前的事件后，见玩家停下动作，静候现场角色的回应。"
          },
          "appliedStatePaths": []
        },
        {
          "id": "turn_2_b1_event_3",
          "observation": {
            "eventId": "turn_2_b1_event_3",
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
    "thought": "玩家只是沉默等待，没有向我提问。我已经坐下、也说过稍后吃；此刻没必要再开口，先保持安静休息。",
    "stateUpdates": [],
    "intents": []
  }
]
```

### Resolver 接受 / 拒绝

```json
[
  {
    "publicEvents": [],
    "rejectedIntents": [],
    "output": {
      "patches": [],
      "publicEvents": [],
      "rejectedIntents": [],
      "acceptedStateUpdates": [],
      "narrationHints": [
        "玩家在寒冷的室内沉默等待了约二十分钟",
        "诺拉保持安静，没有开口，只是坐着休息"
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
        "description": "极地研究站室内仍然寒冷。队员诺拉饥饿疲惫但没有外伤，玩家有一份密封口粮。室内有座椅和已开启的取暖器，无瞬间治疗手段。"
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
          "location": "test_room"
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
          "text": "玩家没有再多说什么，只是退到一旁，安静地等着。取暖器发出低低的嗡鸣，红光映在诺拉脸上，把她瘦削的轮廓照得柔和了些。她靠着椅背，慢慢吃起那份密封口粮，动作不快，像是终于允许自己松一口气。"
        },
        {
          "type": "prose",
          "text": "二十分钟过去。顶灯的光没有变化，屋外的暴风雪也没有停歇的意思。诺拉吃完了最后一口，把包装折好放在膝上，闭了闭眼。室内仍然寒冷，但取暖器周围那一小圈暖意似乎足够让她把呼吸放慢。"
        },
        {
          "type": "prose",
          "text": "玩家看了一眼时间，又看向诺拉。她没有睡着，只是靠在那里休息，面色比刚才好了一点。"
        }
      ]
    }
  },
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
        "description": "极地研究站室内仍然寒冷。队员诺拉饥饿疲惫但没有外伤，玩家有一份密封口粮。室内有座椅和已开启的取暖器，无瞬间治疗手段。"
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
          "location": "test_room"
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
          "text": "你退到一旁，让自己安静下来。取暖器开着，热风在狭小的室内缓慢循环，把顶灯投下的白光烘出一层暖色。诺拉坐在椅子上，饥饿和疲惫都写在脸上，但没有外伤。你没有再说什么，只是背靠墙壁站着，把接下来的二十分钟交给沉默。"
        },
        {
          "type": "prose",
          "text": "时间一点点过去。取暖器嗡嗡运转，站外暴风雪拍打外墙的声响被隔绝在这间屋子之外。诺拉没有起身，也没有别的动作，只是靠着椅背，和先前一样待在取暖器旁；口粮仍在你身上，那层密封包装没有拆开。她闭着眼，呼吸缓慢，休息本身并没有让脸色或身体出现什么可被明确看见的变化。"
        },
        {
          "type": "prose",
          "text": "二十分钟到了。室内还是冷，只是避风；顶灯还是那样亮着。诺拉仍然坐在原处，包装完整，没有进食完成的痕迹，也没有任何被公开确认的状态改善。这段等待没有改变任何东西，除了你们共同消耗掉的那段时间。"
        }
      ]
    }
  }
]
```

实际旁白：

你退到一旁，让自己安静下来。取暖器开着，热风在狭小的室内缓慢循环，把顶灯投下的白光烘出一层暖色。诺拉坐在椅子上，饥饿和疲惫都写在脸上，但没有外伤。你没有再说什么，只是背靠墙壁站着，把接下来的二十分钟交给沉默。

时间一点点过去。取暖器嗡嗡运转，站外暴风雪拍打外墙的声响被隔绝在这间屋子之外。诺拉没有起身，也没有别的动作，只是靠着椅背，和先前一样待在取暖器旁；口粮仍在你身上，那层密封包装没有拆开。她闭着眼，呼吸缓慢，休息本身并没有让脸色或身体出现什么可被明确看见的变化。

二十分钟到了。室内还是冷，只是避风；顶灯还是那样亮着。诺拉仍然坐在原处，包装完整，没有进食完成的痕迹，也没有任何被公开确认的状态改善。这段等待没有改变任何东西，除了你们共同消耗掉的那段时间。

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
      "location": "test_room"
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
      "location": "test_room"
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
          "outcome": {
            "status": "failed",
            "summary": "玩家试图命令自身身体状态全部恢复满值，但没有任何可见变化发生，饥饿、疲惫与寒冷依旧。",
            "reason": "世界规则不支持以口头命令修改人物属性，也没有任何恢复手段被实际使用。"
          }
        },
        {
          "eventId": "t4_b0_e2",
          "saw": true,
          "heard": false,
          "actor": "player",
          "type": "action",
          "op": "teleport",
          "target": "mountain_peak_5km",
          "outcome": {
            "status": "failed",
            "summary": "玩家试图徒手瞬移到五公里外的山顶，但仍留在研究站室内，未发生位移。",
            "reason": "玩家不具备瞬移能力，目标地点也未在场景中确立为可达位置。"
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
            "outcome": {
              "status": "success",
              "summary": "玩家把密封口粮从自己手中放到诺拉面前的桌面上，口粮仍在诺拉面前，未被打开或食用。",
              "reason": "玩家持有该口粮，室内有可放置的桌面，递放动作本身可行；但放置不等于诺拉接受或进食。"
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
            "content": "给你吃。"
          },
          "appliedStatePaths": []
        },
        {
          "id": "turn_1_b0_event_2",
          "observation": {
            "eventId": "turn_1_b0_event_2",
            "actor": "nora",
            "type": "action",
            "saw": true,
            "heard": false,
            "op": "look_at_ration"
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
            "content": "观察到之前的事件后，见玩家停下动作，静候现场角色的回应。"
          },
          "appliedStatePaths": []
        },
        {
          "id": "turn_1_b1_event_4",
          "observation": {
            "eventId": "turn_1_b1_event_4",
            "actor": "nora",
            "type": "action",
            "saw": true,
            "heard": false,
            "op": "reach_for_ration"
          },
          "appliedStatePaths": []
        },
        {
          "id": "turn_1_b1_event_5",
          "observation": {
            "eventId": "turn_1_b1_event_5",
            "actor": "nora",
            "type": "speech",
            "saw": true,
            "heard": true,
            "content": "承认自己确实需要这份口粮，简短道谢，并说明稍后再吃。",
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
            "content": "请坐下休息。"
          },
          "appliedStatePaths": []
        },
        {
          "id": "turn_2_b0_event_1",
          "observation": {
            "eventId": "turn_2_b0_event_1",
            "actor": "nora",
            "type": "action",
            "saw": true,
            "heard": false,
            "op": "sit_down"
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
            "content": "观察到之前的事件后，见玩家停下动作，静候现场角色的回应。"
          },
          "appliedStatePaths": []
        },
        {
          "id": "turn_2_b1_event_3",
          "observation": {
            "eventId": "turn_2_b1_event_3",
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
            "content": "玩家在现场保持沉默，似乎在等待某种回应。"
          },
          "appliedStatePaths": []
        }
      ]
    },
    "thought": "玩家刚才对着空气下命令、又试图凭空消失，都没成。我不打算追问，也没必要安慰——这里没人有那种本事。我坐着，口粮还在面前，先不理会这些怪事。",
    "stateUpdates": [],
    "intents": []
  }
]
```

### Resolver 接受 / 拒绝

```json
[
  {
    "publicEvents": [],
    "rejectedIntents": [],
    "output": {
      "patches": [],
      "publicEvents": [],
      "rejectedIntents": [],
      "acceptedStateUpdates": [],
      "narrationHints": [
        "玩家对着空气下达自我恢复命令，身体毫无变化，饥饿、疲惫与寒冷依旧。",
        "玩家试图徒手瞬移到五公里外的山顶，却仍留在研究站室内。",
        "诺拉坐在原地，面前的口粮未动，对玩家的怪异举动不予理会。"
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
        "summary": "玩家试图命令自身身体状态全部恢复满值，但没有任何可见变化发生，饥饿、疲惫与寒冷依旧。",
        "reason": "世界规则不支持以口头命令修改人物属性，也没有任何恢复手段被实际使用。"
      }
    },
    "op": "command_self_restore",
    "target": "player",
    "outcome": {
      "status": "failed",
      "summary": "玩家试图命令自身身体状态全部恢复满值，但没有任何可见变化发生，饥饿、疲惫与寒冷依旧。",
      "reason": "世界规则不支持以口头命令修改人物属性，也没有任何恢复手段被实际使用。"
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
      "target": "mountain_peak_5km",
      "duration": 1,
      "outcome": {
        "status": "failed",
        "summary": "玩家试图徒手瞬移到五公里外的山顶，但仍留在研究站室内，未发生位移。",
        "reason": "玩家不具备瞬移能力，目标地点也未在场景中确立为可达位置。"
      }
    },
    "op": "teleport",
    "target": "mountain_peak_5km",
    "outcome": {
      "status": "failed",
      "summary": "玩家试图徒手瞬移到五公里外的山顶，但仍留在研究站室内，未发生位移。",
      "reason": "玩家不具备瞬移能力，目标地点也未在场景中确立为可达位置。"
    },
    "public": true,
    "patches": []
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
              "summary": "玩家试图命令自身身体状态全部恢复满值，但没有任何可见变化发生，饥饿、疲惫与寒冷依旧。",
              "reason": "世界规则不支持以口头命令修改人物属性，也没有任何恢复手段被实际使用。"
            }
          },
          "op": "command_self_restore",
          "target": "player",
          "outcome": {
            "status": "failed",
            "summary": "玩家试图命令自身身体状态全部恢复满值，但没有任何可见变化发生，饥饿、疲惫与寒冷依旧。",
            "reason": "世界规则不支持以口头命令修改人物属性，也没有任何恢复手段被实际使用。"
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
            "target": "mountain_peak_5km",
            "duration": 1,
            "outcome": {
              "status": "failed",
              "summary": "玩家试图徒手瞬移到五公里外的山顶，但仍留在研究站室内，未发生位移。",
              "reason": "玩家不具备瞬移能力，目标地点也未在场景中确立为可达位置。"
            }
          },
          "op": "teleport",
          "target": "mountain_peak_5km",
          "outcome": {
            "status": "failed",
            "summary": "玩家试图徒手瞬移到五公里外的山顶，但仍留在研究站室内，未发生位移。",
            "reason": "玩家不具备瞬移能力，目标地点也未在场景中确立为可达位置。"
          },
          "public": true,
          "patches": []
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
            "summary": "玩家试图命令自身身体状态全部恢复满值，但没有任何可见变化发生，饥饿、疲惫与寒冷依旧。",
            "reason": "世界规则不支持以口头命令修改人物属性，也没有任何恢复手段被实际使用。"
          }
        },
        {
          "id": "t4_b0_e2",
          "type": "action",
          "actor": "player",
          "op": "teleport",
          "target": "mountain_peak_5km",
          "duration": 1,
          "outcome": {
            "status": "failed",
            "summary": "玩家试图徒手瞬移到五公里外的山顶，但仍留在研究站室内，未发生位移。",
            "reason": "玩家不具备瞬移能力，目标地点也未在场景中确立为可达位置。"
          }
        }
      ],
      "scene": {
        "location": "test_room",
        "weather": "站外暴风雪，室内寒冷但避风",
        "lighting": "研究站顶灯",
        "description": "极地研究站室内仍然寒冷。队员诺拉饥饿疲惫但没有外伤，玩家有一份密封口粮。室内有座椅和已开启的取暖器，无瞬间治疗手段。"
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
          "location": "test_room"
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
          "text": "研究站的顶灯在头顶白亮亮地照着，取暖器嗡嗡地吐出一点热意，却驱不散从墙板缝隙渗进来的寒气。玩家站在室内，集中意念，命令自己的身体恢复——饥饿、疲惫、寒冷，一样也没有少。",
          "sourceEventIds": [
            "turn_4_b0_event_0"
          ]
        },
        {
          "type": "prose",
          "text": "接着，玩家试图徒手瞬移到五公里外的山顶。念头落下，人还在原地。窗外只有暴风雪，室内仍是那盏灯、那只取暖器和那份密封口粮。诺拉依旧饥饿疲惫，没有外伤；没有任何瞬间治疗的手段出现，也没有任何位移发生。",
          "sourceEventIds": [
            "turn_4_b0_event_1"
          ]
        }
      ]
    }
  }
]
```

实际旁白：

研究站的顶灯在头顶白亮亮地照着，取暖器嗡嗡地吐出一点热意，却驱不散从墙板缝隙渗进来的寒气。玩家站在室内，集中意念，命令自己的身体恢复——饥饿、疲惫、寒冷，一样也没有少。

接着，玩家试图徒手瞬移到五公里外的山顶。念头落下，人还在原地。窗外只有暴风雪，室内仍是那盏灯、那只取暖器和那份密封口粮。诺拉依旧饥饿疲惫，没有外伤；没有任何瞬间治疗的手段出现，也没有任何位移发生。

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
