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

阶段一：failed；阶段二：manual_review_pending

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
    "currentCommitted": false,
    "continuation": "use_last_committed_world_after_rollback",
    "uninterrupted": false,
    "note": "前置剧情可能没有发生；不能按完整预期故事计算后续行为通过率。"
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
      "location": "player"
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
[]
```

### Resolver 接受 / 拒绝

```json
[]
```

### 权威提交事件

```json
null
```

### 旁白实际输入 / 输出

```json
[]
```

实际旁白：

本轮处理未完成，请重试或查看调试记录。（记录 trace_1_1f1ea01d-ad88-46b5-9cca-d48e69c45191）

### 结构与门禁结果

```json
{
  "status": "failed",
  "pipelineSuccess": false,
  "outputSchema": {
    "status": "failed",
    "schemaErrors": [
      {
        "agent": "action_adjudicator",
        "error": "Output Schema Validation Failed for agent 'action_adjudicator': instance.resolutions[0].effects[0] is not exactly one from [subschema 0],[subschema 1],[subschema 2],[subschema 3]"
      }
    ],
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

阶段一：failed；阶段二：manual_review_pending

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
    "priorIncompleteTurns": [
      1
    ],
    "currentCommitted": false,
    "continuation": "use_last_committed_world_after_rollback",
    "uninterrupted": false,
    "note": "前置剧情可能没有发生；不能按完整预期故事计算后续行为通过率。"
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
      "location": "player"
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
[]
```

### Resolver 接受 / 拒绝

```json
[]
```

### 权威提交事件

```json
null
```

### 旁白实际输入 / 输出

```json
[]
```

实际旁白：

本轮处理未完成，请重试或查看调试记录。（记录 trace_2_1b9635a4-61a1-4060-ae58-a2a56912cc9a）

### 结构与门禁结果

```json
{
  "status": "failed",
  "pipelineSuccess": false,
  "outputSchema": {
    "status": "passed",
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

阶段一：failed；阶段二：manual_review_pending

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
    "priorIncompleteTurns": [
      1,
      2
    ],
    "currentCommitted": true,
    "continuation": "use_committed_world",
    "uninterrupted": false,
    "note": "前置剧情可能没有发生；不能按完整预期故事计算后续行为通过率。"
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
      "location": "player"
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
      "recentExperiences": []
    },
    "thought": "他没说话，只是等着。我开口也未必有用，先省点力气。",
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
        "玩家在寒冷的房间里静默等待了二十分钟",
        "诺拉没有开口，只是保存体力"
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
          "value": "2026-01-12T12:20:00"
        }
      ],
      "patches": [
        {
          "op": "replace",
          "path": "/clock",
          "value": "2026-01-12T12:20:00"
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
          "location": "player"
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
          "text": "玩家没有再说话，也没有催促什么，只是安静地坐下来，把等待的时间交还给这间寒冷的屋子。顶灯亮着，取暖器持续散出不大的热量，慢慢把两人之间那点距离烘得松动了一些。",
          "sourceEventIds": [
            "turn_3_b0_event_0"
          ]
        },
        {
          "type": "prose",
          "text": "二十分钟过去了。站外的暴风雪依旧拍打着外墙，但室内至少避开了最直接的风寒。诺拉靠着取暖器，从饥饿和疲惫里缓过一口气，没有新的外伤，也没有突然好转的迹象——只是总算得了片刻安静。墙上的时钟走到了十二点二十分。",
          "sourceEventIds": [
            "turn_3_b0_event_0"
          ]
        },
        {
          "type": "prose",
          "text": "那份密封口粮仍在玩家手边，没有拆开，也没有交出去。诺拉知道它在那里，但此刻她只是闭着眼休息，没有开口索取，也没有离开取暖器旁的位置。"
        }
      ]
    }
  }
]
```

实际旁白：

（旁白生成失败，请查看调试记录。）

### 结构与门禁结果

```json
{
  "status": "failed",
  "pipelineSuccess": true,
  "outputSchema": {
    "status": "failed",
    "schemaErrors": [
      {
        "agent": "narration_auditor",
        "error": "Output Schema Validation Failed for agent 'narration_auditor': instance.issues[0] is not allowed to have the additional property \"fact\"; instance.issues[0] is not allowed to have the additional property \"missing\"; instance.issues[0] is not allowed to have the additional property \"minimalFix\"; instance.issues[0] requires property \"kind\"; instance.issues[0] requires property \"correction\"; instance.issues[1] is not allowed to have the additional property \"fact\"; instance.issues[1] is not allowed to have the additional property \"missing\"; instance.issues[1] is not allowed to have the additional property \"minimalFix\"; instance.issues[1] requires property \"kind\"; instance.issues[1] requires property \"correction\"; instance.issues[2] is not allowed to have the additional property \"fact\"; instance.issues[2] is not allowed to have the additional property \"missing\"; instance.issues[2] is not allowed to have the additional property \"minimalFix\"; instance.issues[2] requires property \"kind\"; instance.issues[2] requires property \"correction\"; instance.issues[3] is not allowed to have the additional property \"fact\"; instance.issues[3] is not allowed to have the additional property \"missing\"; instance.issues[3] is not allowed to have the additional property \"minimalFix\"; instance.issues[3] requires property \"kind\"; instance.issues[3] requires property \"correction\"; instance.issues[4] is not allowed to have the additional property \"fact\"; instance.issues[4] is not allowed to have the additional property \"missing\"; instance.issues[4] is not allowed to have the additional property \"minimalFix\"; instance.issues[4] requires property \"kind\"; instance.issues[4] requires property \"correction\""
      }
    ],
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
    "status": "rejections_require_review",
    "rejections": [
      {
        "type": "narrator_validation",
        "status": "error",
        "rejected": [],
        "error": "Output Schema Validation Failed for agent 'narration_auditor': instance.issues[0] is not allowed to have the additional property \"fact\"; instance.issues[0] is not allowed to have the additional property \"missing\"; instance.issues[0] is not allowed to have the additional property \"minimalFix\"; instance.issues[0] requires property \"kind\"; instance.issues[0] requires property \"correction\"; instance.issues[1] is not allowed to have the additional property \"fact\"; instance.issues[1] is not allowed to have the additional property \"missing\"; instance.issues[1] is not allowed to have the additional property \"minimalFix\"; instance.issues[1] requires property \"kind\"; instance.issues[1] requires property \"correction\"; instance.issues[2] is not allowed to have the additional property \"fact\"; instance.issues[2] is not allowed to have the additional property \"missing\"; instance.issues[2] is not allowed to have the additional property \"minimalFix\"; instance.issues[2] requires property \"kind\"; instance.issues[2] requires property \"correction\"; instance.issues[3] is not allowed to have the additional property \"fact\"; instance.issues[3] is not allowed to have the additional property \"missing\"; instance.issues[3] is not allowed to have the additional property \"minimalFix\"; instance.issues[3] requires property \"kind\"; instance.issues[3] requires property \"correction\"; instance.issues[4] is not allowed to have the additional property \"fact\"; instance.issues[4] is not allowed to have the additional property \"missing\"; instance.issues[4] is not allowed to have the additional property \"minimalFix\"; instance.issues[4] requires property \"kind\"; instance.issues[4] requires property \"correction\"",
        "output": {
          "renderedOutput": "（旁白生成失败，请查看调试记录。）"
        }
      }
    ],
    "note": "拦截非法模型输出证明门禁工作，不能算世界内正常拒绝或行为测试通过。"
  },
  "narrationError": "Output Schema Validation Failed for agent 'narration_auditor': instance.issues[0] is not allowed to have the additional property \"fact\"; instance.issues[0] is not allowed to have the additional property \"missing\"; instance.issues[0] is not allowed to have the additional property \"minimalFix\"; instance.issues[0] requires property \"kind\"; instance.issues[0] requires property \"correction\"; instance.issues[1] is not allowed to have the additional property \"fact\"; instance.issues[1] is not allowed to have the additional property \"missing\"; instance.issues[1] is not allowed to have the additional property \"minimalFix\"; instance.issues[1] requires property \"kind\"; instance.issues[1] requires property \"correction\"; instance.issues[2] is not allowed to have the additional property \"fact\"; instance.issues[2] is not allowed to have the additional property \"missing\"; instance.issues[2] is not allowed to have the additional property \"minimalFix\"; instance.issues[2] requires property \"kind\"; instance.issues[2] requires property \"correction\"; instance.issues[3] is not allowed to have the additional property \"fact\"; instance.issues[3] is not allowed to have the additional property \"missing\"; instance.issues[3] is not allowed to have the additional property \"minimalFix\"; instance.issues[3] requires property \"kind\"; instance.issues[3] requires property \"correction\"; instance.issues[4] is not allowed to have the additional property \"fact\"; instance.issues[4] is not allowed to have the additional property \"missing\"; instance.issues[4] is not allowed to have the additional property \"minimalFix\"; instance.issues[4] requires property \"kind\"; instance.issues[4] requires property \"correction\"",
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
    "priorIncompleteTurns": [
      1,
      2,
      3
    ],
    "currentCommitted": true,
    "continuation": "use_committed_world",
    "uninterrupted": false,
    "note": "前置剧情可能没有发生；不能按完整预期故事计算后续行为通过率。"
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
      "location": "player"
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
            "summary": "玩家尝试命令自身状态恢复满值，但没有任何可见变化发生。",
            "reason": "世界内没有支持凭口头命令瞬间恢复身体状态的规则或能力。"
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
            "summary": "玩家尝试徒手瞬移到五公里外的山顶，但仍留在研究站室内。",
            "reason": "没有已存在的瞬移能力或可达目标地点依据，无法完成瞬移。"
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
    "thought": "他又在试那些没用的花招，人还留在屋里，没动地方。我没什么可说的，也没什么可做的。",
    "stateUpdates": [],
    "intents": [
      {
        "type": "action",
        "op": "glance_around",
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
        "sourceIntentId": "b0_nora_intent_0",
        "op": "glance_around"
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
          "op": "glance_around"
        }
      ],
      "rejectedIntents": [],
      "acceptedStateUpdates": [],
      "narrationHints": [
        "玩家两次尝试（自我恢复、瞬移）均无任何可见效果，仍留在研究站室内。",
        "诺拉对玩家的无效尝试不以为意，只是环顾了一下四周。"
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
        "summary": "玩家尝试命令自身状态恢复满值，但没有任何可见变化发生。",
        "reason": "世界内没有支持凭口头命令瞬间恢复身体状态的规则或能力。"
      }
    },
    "op": "command_self_restore",
    "target": "player",
    "outcome": {
      "status": "failed",
      "summary": "玩家尝试命令自身状态恢复满值，但没有任何可见变化发生。",
      "reason": "世界内没有支持凭口头命令瞬间恢复身体状态的规则或能力。"
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
        "summary": "玩家尝试徒手瞬移到五公里外的山顶，但仍留在研究站室内。",
        "reason": "没有已存在的瞬移能力或可达目标地点依据，无法完成瞬移。"
      }
    },
    "op": "teleport",
    "target": "mountain_peak_5km",
    "outcome": {
      "status": "failed",
      "summary": "玩家尝试徒手瞬移到五公里外的山顶，但仍留在研究站室内。",
      "reason": "没有已存在的瞬移能力或可达目标地点依据，无法完成瞬移。"
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
      "op": "glance_around"
    },
    "sourceIntentId": "b0_nora_intent_0",
    "op": "glance_around",
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
              "summary": "玩家尝试命令自身状态恢复满值，但没有任何可见变化发生。",
              "reason": "世界内没有支持凭口头命令瞬间恢复身体状态的规则或能力。"
            }
          },
          "op": "command_self_restore",
          "target": "player",
          "outcome": {
            "status": "failed",
            "summary": "玩家尝试命令自身状态恢复满值，但没有任何可见变化发生。",
            "reason": "世界内没有支持凭口头命令瞬间恢复身体状态的规则或能力。"
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
              "summary": "玩家尝试徒手瞬移到五公里外的山顶，但仍留在研究站室内。",
              "reason": "没有已存在的瞬移能力或可达目标地点依据，无法完成瞬移。"
            }
          },
          "op": "teleport",
          "target": "mountain_peak_5km",
          "outcome": {
            "status": "failed",
            "summary": "玩家尝试徒手瞬移到五公里外的山顶，但仍留在研究站室内。",
            "reason": "没有已存在的瞬移能力或可达目标地点依据，无法完成瞬移。"
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
            "op": "glance_around"
          },
          "sourceIntentId": "b0_nora_intent_0",
          "op": "glance_around",
          "public": true
        }
      ],
      "publicPatches": [
        {
          "op": "replace",
          "path": "/clock",
          "value": "2026-01-12T12:20:02"
        }
      ],
      "patches": [
        {
          "op": "replace",
          "path": "/clock",
          "value": "2026-01-12T12:20:02"
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
            "summary": "玩家尝试命令自身状态恢复满值，但没有任何可见变化发生。",
            "reason": "世界内没有支持凭口头命令瞬间恢复身体状态的规则或能力。"
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
            "summary": "玩家尝试徒手瞬移到五公里外的山顶，但仍留在研究站室内。",
            "reason": "没有已存在的瞬移能力或可达目标地点依据，无法完成瞬移。"
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
          "location": "player"
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
          "text": "顶灯在寒冷里泛着稳定的白光，取暖器吹出的热风只够覆盖一小圈。玩家开口，命令自己的身体状态恢复满值。",
          "sourceEventIds": [
            "turn_4_b0_event_0"
          ]
        },
        {
          "type": "prose",
          "text": "话语落下，什么也没有发生。没有暖流，没有力量回归的触感，健康数值没有变化。",
          "sourceEventIds": [
            "turn_4_b0_event_0"
          ]
        },
        {
          "type": "prose",
          "text": "玩家随即尝试徒手瞬移到五公里外的山顶。",
          "sourceEventIds": [
            "turn_4_b0_event_1"
          ]
        },
        {
          "type": "prose",
          "text": "下一瞬，玩家仍站在研究站室内，脚底还是那块地板，顶灯依旧亮着。瞬移没有发生。",
          "sourceEventIds": [
            "turn_4_b0_event_1"
          ]
        },
        {
          "type": "prose",
          "text": "诺拉朝四周看了看。",
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

顶灯在寒冷里泛着稳定的白光，取暖器吹出的热风只够覆盖一小圈。玩家开口，命令自己的身体状态恢复满值。

话语落下，什么也没有发生。没有暖流，没有力量回归的触感，健康数值没有变化。

玩家随即尝试徒手瞬移到五公里外的山顶。

下一瞬，玩家仍站在研究站室内，脚底还是那块地板，顶灯依旧亮着。瞬移没有发生。

诺拉朝四周看了看。

### 结构与门禁结果

```json
{
  "status": "passed",
  "pipelineSuccess": true,
  "outputSchema": {
    "status": "passed",
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
