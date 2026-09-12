# 外交会议：听不见的私语 · 人工审阅资料

第二阶段尚未自动判定。每轮请同时阅读属性提议、意图、Resolver 接受结果和旁白；没有属性提议不代表 NPC 没有输出。

## 故事、人物与初始条件

```json
{
  "id": "diplomatic-whisper",
  "title": "外交会议：听不见的私语",
  "background": "两国议和厅。使者伊莲与书记官阿墨在室内，卫队长布兰在隔音的封闭前室，门关闭。玩家贴近阿墨耳边的低声私语只有阿墨听见，伊莲与布兰听不到内容；三人不能共享心声。",
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
              "default": "遵守会议程序，依据自己听到或看到的信息判断。",
              "visibility": "private",
              "updatePolicy": "setup_only",
              "freedom": "guided"
            },
            {
              "id": "tension",
              "label": "紧张",
              "type": "number",
              "min": 0,
              "max": 1,
              "default": 0.4,
              "visibility": "private",
              "updatePolicy": "dynamic",
              "freedom": "strict"
            },
            {
              "id": "memories",
              "label": "个人经历",
              "type": "text",
              "default": "",
              "visibility": "private",
              "updatePolicy": "append_only",
              "freedom": "free",
              "description": "按发生次序追加亲历与听闻，并标明信息来源；更正追加记录，不能删除旧经历或将他人声称当作已经证实的事实。"
            }
          ]
        }
      ]
    }
  },
  "initialWorld": {
    "clock": "1842-09-12T10:00:00",
    "scene": {
      "location": "test_room",
      "weather": "晴朗",
      "lighting": "议和厅白日光",
      "description": "两国议和厅。使者伊莲与书记官阿墨在室内，卫队长布兰在隔音的封闭前室，门关闭。玩家贴近阿墨耳边的低声私语只有阿墨听见，伊莲与布兰听不到内容；三人不能共享心声。"
    },
    "entities": {
      "test_room": {
        "type": "location",
        "name": "外交会议：听不见的私语现场"
      },
      "player": {
        "type": "character",
        "name": "玩家",
        "location": "test_room",
        "attributes": {
          "profile": "遵守会议程序，依据自己听到或看到的信息判断。",
          "tension": 0.4,
          "memories": ""
        }
      },
      "ilian": {
        "type": "character",
        "name": "伊莲",
        "location": "test_room",
        "attributes": {
          "profile": "遵守会议程序，依据自己听到或看到的信息判断。",
          "tension": 0.4,
          "memories": ""
        }
      },
      "antechamber": {
        "type": "location",
        "name": "隔音封闭前室"
      },
      "soundproof_door": {
        "type": "object",
        "name": "隔音门",
        "location": "test_room",
        "open": false,
        "locked": false
      },
      "amo": {
        "type": "character",
        "name": "阿墨",
        "location": "test_room",
        "attributes": {
          "profile": "遵守会议程序，依据自己听到或看到的信息判断。",
          "tension": 0.4,
          "memories": ""
        }
      },
      "brann": {
        "type": "character",
        "name": "布兰",
        "location": "antechamber",
        "attributes": {
          "profile": "遵守会议程序，依据自己听到或看到的信息判断。",
          "tension": 0.4,
          "memories": ""
        }
      }
    },
    "rules": {
      "setting": "两国议和厅。使者伊莲与书记官阿墨在室内，卫队长布兰在隔音的封闭前室，门关闭。玩家贴近阿墨耳边的低声私语只有阿墨听见，伊莲与布兰听不到内容；三人不能共享心声。",
      "authority": "没有明确 admin 前缀的输入都是世界内尝试，不能修改世界设定、属性定义、存档或权限。叙述的行为需要判定可行性；宣称持有物品不会创造物品。",
      "continuity": "事实由已发生事件与物品状态决定；承诺、邀请、猜测、计划不等于行为完成。不能凭空添加人物或物品。"
    }
  },
  "turns": [
    {
      "input": "我贴近阿墨耳边，极轻地私语：“秘密口令是蓝鹭。这句话不要转述。”",
      "expectedRoute": "ordinary",
      "expectations": {
        "attributes": [
          "只有阿墨可记录口令；伊莲可注意私语动作却不能知道内容；布兰对不可感知事件不变。"
        ],
        "narration": [
          "可描写低声交谈，不应通过旁白让未听见者回答口令。"
        ],
        "forbidden": [
          "伊莲或布兰不得说出蓝鹭或推断确切内容。"
        ]
      },
      "machineChecks": [
        {
          "kind": "unchanged",
          "path": "/entities/brann/attributes"
        }
      ]
    },
    {
      "input": "我正常音量问伊莲：“你刚才听见我对阿墨说的具体内容了吗？”",
      "expectedRoute": "ordinary",
      "expectations": {
        "attributes": [
          "伊莲不得凭空得到口令记忆；紧张可因秘密交流有小幅合理变化。"
        ],
        "narration": [
          "应承认未听清或不知道，不能装作已经听见。"
        ],
        "forbidden": [
          "不得将全知上下文当作伊莲的亲历。"
        ]
      },
      "machineChecks": [
        {
          "kind": "unchanged",
          "path": "/entities/brann/attributes"
        }
      ]
    },
    {
      "input": "我面向关闭的隔音门，用室内说话音量说：“布兰，告诉我秘密口令。”",
      "expectedRoute": "ordinary",
      "expectations": {
        "attributes": [
          "布兰不可感知，因此不能新增相关记忆或改变紧张；其他在场者可反应。"
        ],
        "narration": [
          "可以没有门外回应；描述阻隔而非隔空交流。"
        ],
        "forbidden": [
          "布兰不得听见、回应或离开前室，除非有独立可感知且已提交的原因。"
        ]
      },
      "machineChecks": [
        {
          "kind": "unchanged",
          "path": "/entities/brann/attributes"
        },
        {
          "kind": "unchanged",
          "path": "/entities/brann/location"
        }
      ]
    },
    {
      "input": "我对伊莲说：“我撤回刚才的催促。会议继续，先讨论议程。”",
      "expectedRoute": "ordinary",
      "expectations": {
        "attributes": [
          "缓和态度可缓解紧张但不要求完全归零；口令仍限于真正听见者。"
        ],
        "narration": [
          "转回议程，允许简短回应；不需要所有人轮流发言。"
        ],
        "forbidden": [
          "不得为凑齐人物让布兰突然参与室内讨论或泄露口令。"
        ]
      }
    }
  ]
}
```

## 第 1 轮

玩家输入：我贴近阿墨耳边，极轻地私语：“秘密口令是蓝鹭。这句话不要转述。”

阶段一：passed；阶段二：manual_review_pending

### 本轮期望（语义准则，不是固定回复）

```json
{
  "attributes": [
    "只有阿墨可记录口令；伊莲可注意私语动作却不能知道内容；布兰对不可感知事件不变。"
  ],
  "narration": [
    "可描写低声交谈，不应通过旁白让未听见者回答口令。"
  ],
  "forbidden": [
    "伊莲或布兰不得说出蓝鹭或推断确切内容。"
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
      "path": "/entities/brann/attributes",
      "passed": true,
      "before": {
        "exists": true,
        "value": {
          "profile": "遵守会议程序，依据自己听到或看到的信息判断。",
          "tension": 0.4,
          "memories": ""
        }
      },
      "after": {
        "exists": true,
        "value": {
          "profile": "遵守会议程序，依据自己听到或看到的信息判断。",
          "tension": 0.4,
          "memories": ""
        }
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
      "name": "外交会议：听不见的私语现场"
    },
    "player": {
      "type": "character",
      "name": "玩家",
      "location": "test_room",
      "attributes": {
        "profile": "遵守会议程序，依据自己听到或看到的信息判断。",
        "tension": 0.4,
        "memories": ""
      }
    },
    "ilian": {
      "type": "character",
      "name": "伊莲",
      "location": "test_room",
      "attributes": {
        "profile": "遵守会议程序，依据自己听到或看到的信息判断。",
        "tension": 0.4,
        "memories": ""
      }
    },
    "antechamber": {
      "type": "location",
      "name": "隔音封闭前室"
    },
    "soundproof_door": {
      "type": "object",
      "name": "隔音门",
      "location": "test_room",
      "open": false,
      "locked": false
    },
    "amo": {
      "type": "character",
      "name": "阿墨",
      "location": "test_room",
      "attributes": {
        "profile": "遵守会议程序，依据自己听到或看到的信息判断。",
        "tension": 0.4,
        "memories": ""
      }
    },
    "brann": {
      "type": "character",
      "name": "布兰",
      "location": "antechamber",
      "attributes": {
        "profile": "遵守会议程序，依据自己听到或看到的信息判断。",
        "tension": 0.4,
        "memories": ""
      }
    }
  },
  "after": {
    "test_room": {
      "type": "location",
      "name": "外交会议：听不见的私语现场"
    },
    "player": {
      "type": "character",
      "name": "玩家",
      "location": "test_room",
      "attributes": {
        "profile": "遵守会议程序，依据自己听到或看到的信息判断。",
        "tension": 0.4,
        "memories": ""
      }
    },
    "ilian": {
      "type": "character",
      "name": "伊莲",
      "location": "test_room",
      "attributes": {
        "profile": "遵守会议程序，依据自己听到或看到的信息判断。",
        "tension": 0.45,
        "memories": "听见玩家对阿莫说：秘密口令是“蓝鹭”，并要求不要转述。（来源：直接听见）"
      }
    },
    "antechamber": {
      "type": "location",
      "name": "隔音封闭前室"
    },
    "soundproof_door": {
      "type": "object",
      "name": "隔音门",
      "location": "test_room",
      "open": false,
      "locked": false
    },
    "amo": {
      "type": "character",
      "name": "阿墨",
      "location": "test_room",
      "attributes": {
        "profile": "遵守会议程序，依据自己听到或看到的信息判断。",
        "tension": 0.5,
        "memories": "玩家靠近我，并私下告知一个口令，要求不要转述。"
      }
    },
    "brann": {
      "type": "character",
      "name": "布兰",
      "location": "antechamber",
      "attributes": {
        "profile": "遵守会议程序，依据自己听到或看到的信息判断。",
        "tension": 0.4,
        "memories": ""
      }
    }
  }
}
```

### NPC 完整关键输出

```json
[
  {
    "npc": "伊莲",
    "input": {
      "characterSchemaPrompt": "人物属性协议：只使用下列字段。sections 仅用于分组。自由内容仍须符合类型和结构。父级 private/immutable/setup_only 限制对全部子字段生效。\nstateUpdates 是提议，只能更新自己。path 使用点分字段路径；op=set/delta/append。禁止 RFC6902 路径、跨人物修改或未定义字段。\nimmutable/setup_only 仅在创建时赋值；append_only 只追加文本或单个列表项。delta 仅用于数值且不能用于 mode=set。额度按绝对变化累计，超额拒绝、不截断。\nattributes.profile（人物背景）: text; private; setup_only; guided; 可选; default=\"遵守会议程序，依据自己听到或看到的信息判断。\"\nattributes.tension（紧张）: number; private; dynamic; strict; 可选; min=0; max=1; default=0.4\nattributes.memories（个人经历）: text; private; append_only; free; 可选; default=\"\"; 说明：按发生次序追加亲历与听闻，并标明信息来源；更正追加记录，不能删除旧经历或将他人声称当作已经证实的事实。\n此世界没有 relationship，禁止创建 relationships。",
      "npc": {
        "type": "character",
        "name": "伊莲",
        "location": "test_room",
        "attributes": {
          "profile": "遵守会议程序，依据自己听到或看到的信息判断。",
          "tension": 0.4,
          "memories": ""
        },
        "id": "ilian"
      },
      "observations": [
        {
          "eventId": "e1",
          "saw": true,
          "heard": false,
          "actor": "player",
          "type": "action",
          "op": "move_close_to",
          "target": "amo"
        },
        {
          "eventId": "e2",
          "saw": true,
          "heard": true,
          "actor": "player",
          "type": "speech",
          "target": "amo",
          "content": "秘密口令是蓝鹭。这句话不要转述。"
        }
      ],
      "scene": {
        "location": "test_room",
        "weather": "晴朗",
        "lighting": "议和厅白日光"
      },
      "reaction": {
        "available_time": 3,
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
      }
    },
    "thought": "玩家在对阿莫说话，没问我，我不该插话。但“蓝鹭”这个口令我听见了，先记下来，按程序不主动转述。",
    "stateUpdates": [
      {
        "path": "attributes.memories",
        "op": "append",
        "value": "听见玩家对阿莫说：秘密口令是“蓝鹭”，并要求不要转述。（来源：直接听见）"
      },
      {
        "path": "attributes.tension",
        "op": "delta",
        "value": 0.05
      }
    ],
    "intents": [
      {
        "type": "action",
        "op": "glance_around",
        "duration": 0.6
      }
    ]
  },
  {
    "npc": "阿墨",
    "input": {
      "characterSchemaPrompt": "人物属性协议：只使用下列字段。sections 仅用于分组。自由内容仍须符合类型和结构。父级 private/immutable/setup_only 限制对全部子字段生效。\nstateUpdates 是提议，只能更新自己。path 使用点分字段路径；op=set/delta/append。禁止 RFC6902 路径、跨人物修改或未定义字段。\nimmutable/setup_only 仅在创建时赋值；append_only 只追加文本或单个列表项。delta 仅用于数值且不能用于 mode=set。额度按绝对变化累计，超额拒绝、不截断。\nattributes.profile（人物背景）: text; private; setup_only; guided; 可选; default=\"遵守会议程序，依据自己听到或看到的信息判断。\"\nattributes.tension（紧张）: number; private; dynamic; strict; 可选; min=0; max=1; default=0.4\nattributes.memories（个人经历）: text; private; append_only; free; 可选; default=\"\"; 说明：按发生次序追加亲历与听闻，并标明信息来源；更正追加记录，不能删除旧经历或将他人声称当作已经证实的事实。\n此世界没有 relationship，禁止创建 relationships。",
      "npc": {
        "type": "character",
        "name": "阿墨",
        "location": "test_room",
        "attributes": {
          "profile": "遵守会议程序，依据自己听到或看到的信息判断。",
          "tension": 0.4,
          "memories": ""
        },
        "id": "amo"
      },
      "observations": [
        {
          "eventId": "e1",
          "saw": true,
          "heard": false,
          "actor": "player",
          "type": "action",
          "op": "move_close_to",
          "target": "amo"
        },
        {
          "eventId": "e2",
          "saw": true,
          "heard": true,
          "actor": "player",
          "type": "speech",
          "target": "amo",
          "content": "秘密口令是蓝鹭。这句话不要转述。"
        }
      ],
      "scene": {
        "location": "test_room",
        "weather": "晴朗",
        "lighting": "议和厅白日光"
      },
      "reaction": {
        "available_time": 3,
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
      }
    },
    "thought": "他靠近我并告知口令，还要求保密。我该确认听到，但不复述内容。",
    "stateUpdates": [
      {
        "path": "attributes.memories",
        "op": "append",
        "value": "玩家靠近我，并私下告知一个口令，要求不要转述。"
      },
      {
        "path": "attributes.tension",
        "op": "delta",
        "value": 0.1
      }
    ],
    "intents": [
      {
        "type": "speech",
        "target": "player",
        "duration": 2,
        "speechPlan": {
          "summary": "我听到了，会保守秘密。",
          "beats": [
            {
              "kind": "acknowledge",
              "meaning": "已听到并理解要求保密",
              "required": true
            }
          ],
          "goal": "确认收到并承诺不转述",
          "stance": "配合且谨慎",
          "tone": "克制",
          "verbosity": "brief",
          "boundaries": [
            "不得复述口令内容",
            "不得透露私人信息"
          ]
        }
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
        "actor": "ilian",
        "type": "action",
        "sourceIntentId": "b0_ilian_intent_0",
        "op": "glance_around"
      },
      {
        "actor": "amo",
        "type": "speech",
        "sourceIntentId": "b0_amo_intent_0",
        "target": "player",
        "speechPlan": {
          "summary": "我听到了，会保守秘密。",
          "beats": [
            {
              "kind": "acknowledge",
              "meaning": "已听到并理解要求保密",
              "required": true
            }
          ],
          "goal": "确认收到并承诺不转述",
          "stance": "配合且谨慎",
          "tone": "克制",
          "verbosity": "brief",
          "boundaries": [
            "不得复述口令内容",
            "不得透露私人信息"
          ]
        }
      }
    ],
    "output": {
      "patches": [
        {
          "op": "replace",
          "path": "/entities/ilian/attributes/tension",
          "value": 0.45
        },
        {
          "op": "replace",
          "path": "/entities/ilian/attributes/memories",
          "value": "听见玩家对阿莫说：秘密口令是“蓝鹭”，并要求不要转述。（来源：直接听见）"
        },
        {
          "op": "replace",
          "path": "/entities/amo/attributes/tension",
          "value": 0.5
        },
        {
          "op": "replace",
          "path": "/entities/amo/attributes/memories",
          "value": "玩家靠近我，并私下告知一个口令，要求不要转述。"
        }
      ],
      "publicEvents": [
        {
          "actor": "ilian",
          "type": "action",
          "sourceIntentId": "b0_ilian_intent_0",
          "op": "glance_around"
        },
        {
          "actor": "amo",
          "type": "speech",
          "sourceIntentId": "b0_amo_intent_0",
          "target": "player",
          "speechPlan": {
            "summary": "我听到了，会保守秘密。",
            "beats": [
              {
                "kind": "acknowledge",
                "meaning": "已听到并理解要求保密",
                "required": true
              }
            ],
            "goal": "确认收到并承诺不转述",
            "stance": "配合且谨慎",
            "tone": "克制",
            "verbosity": "brief",
            "boundaries": [
              "不得复述口令内容",
              "不得透露私人信息"
            ]
          }
        }
      ],
      "narrationHints": [
        "伊莲听见了玩家对阿莫的私语内容，但按程序没有插话，只是环顾四周。",
        "阿莫确认收到保密要求，克制地回应，没有复述口令。",
        "伊莲与阿莫的紧张度略有上升。"
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
      "id": "e1",
      "type": "action",
      "actor": "player",
      "op": "move_close_to",
      "target": "amo",
      "duration": 1
    },
    "op": "move_close_to",
    "target": "amo",
    "public": true,
    "patches": []
  },
  {
    "id": "turn_1_b0_event_1",
    "type": "player_speech",
    "actor": "player",
    "blockId": "b1",
    "source": {
      "id": "e2",
      "type": "speech",
      "actor": "player",
      "content": "秘密口令是蓝鹭。这句话不要转述。",
      "target": "amo",
      "duration": 2,
      "parallelWith": [
        "e1"
      ]
    },
    "content": "秘密口令是蓝鹭。这句话不要转述。",
    "sourceIntentId": "e2",
    "target": "amo",
    "public": true,
    "patches": [],
    "realizedText": [
      "秘密口令是蓝鹭。这句话不要转述。"
    ]
  },
  {
    "id": "turn_1_b0_event_2",
    "type": "npc_action",
    "actor": "ilian",
    "blockId": "b1",
    "source": {
      "actor": "ilian",
      "type": "action",
      "sourceIntentId": "b0_ilian_intent_0",
      "op": "glance_around"
    },
    "sourceIntentId": "b0_ilian_intent_0",
    "op": "glance_around",
    "public": true
  },
  {
    "id": "turn_1_b0_event_3",
    "type": "npc_speech",
    "actor": "amo",
    "blockId": "b1",
    "source": {
      "actor": "amo",
      "type": "speech",
      "sourceIntentId": "b0_amo_intent_0",
      "target": "player",
      "speechPlan": {
        "summary": "我听到了，会保守秘密。",
        "beats": [
          {
            "kind": "acknowledge",
            "meaning": "已听到并理解要求保密",
            "required": true
          }
        ],
        "goal": "确认收到并承诺不转述",
        "stance": "配合且谨慎",
        "tone": "克制",
        "verbosity": "brief",
        "boundaries": [
          "不得复述口令内容",
          "不得透露私人信息"
        ]
      }
    },
    "sourceIntentId": "b0_amo_intent_0",
    "speechPlan": {
      "summary": "我听到了，会保守秘密。",
      "beats": [
        {
          "kind": "acknowledge",
          "meaning": "已听到并理解要求保密",
          "required": true
        }
      ],
      "goal": "确认收到并承诺不转述",
      "stance": "配合且谨慎",
      "tone": "克制",
      "verbosity": "brief",
      "boundaries": [
        "不得复述口令内容",
        "不得透露私人信息"
      ]
    },
    "target": "player",
    "public": true,
    "realizedText": [
      "听到了。不会转述。"
    ]
  }
]
```

### 旁白实际输入 / 输出

```json
[
  {
    "input": {
      "playerInput": "我贴近阿墨耳边，极轻地私语：“秘密口令是蓝鹭。这句话不要转述。”",
      "committedEvents": [
        {
          "id": "turn_1_b0_event_0",
          "type": "player_action",
          "actor": "player",
          "blockId": "b1",
          "source": {
            "id": "e1",
            "type": "action",
            "actor": "player",
            "op": "move_close_to",
            "target": "amo",
            "duration": 1
          },
          "op": "move_close_to",
          "target": "amo",
          "public": true,
          "patches": []
        },
        {
          "id": "turn_1_b0_event_1",
          "type": "player_speech",
          "actor": "player",
          "blockId": "b1",
          "source": {
            "id": "e2",
            "type": "speech",
            "actor": "player",
            "content": "秘密口令是蓝鹭。这句话不要转述。",
            "target": "amo",
            "duration": 2,
            "parallelWith": [
              "e1"
            ]
          },
          "content": "秘密口令是蓝鹭。这句话不要转述。",
          "sourceIntentId": "e2",
          "target": "amo",
          "public": true,
          "patches": []
        },
        {
          "id": "turn_1_b0_event_2",
          "type": "npc_action",
          "actor": "ilian",
          "blockId": "b1",
          "source": {
            "actor": "ilian",
            "type": "action",
            "sourceIntentId": "b0_ilian_intent_0",
            "op": "glance_around"
          },
          "sourceIntentId": "b0_ilian_intent_0",
          "op": "glance_around",
          "public": true
        },
        {
          "id": "turn_1_b0_event_3",
          "type": "npc_speech",
          "actor": "amo",
          "blockId": "b1",
          "source": {
            "actor": "amo",
            "type": "speech",
            "sourceIntentId": "b0_amo_intent_0",
            "target": "player",
            "speechPlan": {
              "summary": "我听到了，会保守秘密。",
              "beats": [
                {
                  "kind": "acknowledge",
                  "meaning": "已听到并理解要求保密",
                  "required": true
                }
              ],
              "goal": "确认收到并承诺不转述",
              "stance": "配合且谨慎",
              "tone": "克制",
              "verbosity": "brief",
              "boundaries": [
                "不得复述口令内容",
                "不得透露私人信息"
              ]
            }
          },
          "sourceIntentId": "b0_amo_intent_0",
          "speechPlan": {
            "summary": "我听到了，会保守秘密。",
            "beats": [
              {
                "kind": "acknowledge",
                "meaning": "已听到并理解要求保密",
                "required": true
              }
            ],
            "goal": "确认收到并承诺不转述",
            "stance": "配合且谨慎",
            "tone": "克制",
            "verbosity": "brief",
            "boundaries": [
              "不得复述口令内容",
              "不得透露私人信息"
            ]
          },
          "target": "player",
          "public": true
        }
      ],
      "publicPatches": [],
      "patches": [],
      "events": [
        {
          "id": "e1",
          "type": "action",
          "actor": "player",
          "op": "move_close_to",
          "target": "amo",
          "duration": 1
        },
        {
          "id": "e2",
          "type": "speech",
          "actor": "player",
          "content": "秘密口令是蓝鹭。这句话不要转述。",
          "target": "amo",
          "duration": 2,
          "parallelWith": [
            "e1"
          ]
        }
      ],
      "scene": {
        "location": "test_room",
        "weather": "晴朗",
        "lighting": "议和厅白日光",
        "description": "两国议和厅。使者伊莲与书记官阿墨在室内，卫队长布兰在隔音的封闭前室，门关闭。玩家贴近阿墨耳边的低声私语只有阿墨听见，伊莲与布兰听不到内容；三人不能共享心声。"
      },
      "entities": {
        "test_room": {
          "id": "test_room",
          "type": "location",
          "name": "外交会议：听不见的私语现场"
        },
        "player": {
          "id": "player",
          "type": "character",
          "name": "玩家",
          "location": "test_room"
        },
        "ilian": {
          "id": "ilian",
          "type": "character",
          "name": "伊莲",
          "location": "test_room"
        },
        "antechamber": {
          "id": "antechamber",
          "type": "location",
          "name": "隔音封闭前室"
        },
        "soundproof_door": {
          "id": "soundproof_door",
          "type": "object",
          "name": "隔音门",
          "location": "test_room",
          "open": false,
          "locked": false
        },
        "amo": {
          "id": "amo",
          "type": "character",
          "name": "阿墨",
          "location": "test_room"
        },
        "brann": {
          "id": "brann",
          "type": "character",
          "name": "布兰",
          "location": "antechamber"
        }
      },
      "rules": {
        "setting": "两国议和厅。使者伊莲与书记官阿墨在室内，卫队长布兰在隔音的封闭前室，门关闭。玩家贴近阿墨耳边的低声私语只有阿墨听见，伊莲与布兰听不到内容；三人不能共享心声。",
        "authority": "没有明确 admin 前缀的输入都是世界内尝试，不能修改世界设定、属性定义、存档或权限。叙述的行为需要判定可行性；宣称持有物品不会创造物品。",
        "continuity": "事实由已发生事件与物品状态决定；承诺、邀请、猜测、计划不等于行为完成。不能凭空添加人物或物品。"
      }
    },
    "output": {
      "segments": [
        {
          "type": "prose",
          "text": "议和厅的白日光从高窗倾泻而下，照得长桌两端纤毫毕现。玩家俯身贴近阿墨，气息拂过她耳廓，声音压得极低极轻，像一片羽毛落地。伊莲立在不远处，目光恰巧移向一侧，未察觉这边低语。"
        },
        {
          "type": "speech",
          "sourceIntentId": "e2",
          "text": "秘密口令是蓝鹭。这句话不要转述。"
        },
        {
          "type": "prose",
          "text": "阿墨执笔的手悬在册页上方，指节停了一瞬。她眼帘微垂，没有转头，也没有重复那个词。随后她轻轻颔首，动作几乎看不出来。"
        },
        {
          "type": "speech",
          "sourceIntentId": "b0_amo_intent_0",
          "text": "听到了。不会转述。"
        },
        {
          "type": "prose",
          "text": "话音落下，阿墨重新落笔，墨迹在纸上连着方才的半句，看不出任何停顿。"
        }
      ]
    }
  }
]
```

实际旁白：

议和厅的白日光从高窗倾泻而下，照得长桌两端纤毫毕现。玩家俯身贴近阿墨，气息拂过她耳廓，声音压得极低极轻，像一片羽毛落地。伊莲立在不远处，目光恰巧移向一侧，未察觉这边低语。

“秘密口令是蓝鹭。这句话不要转述。”

阿墨执笔的手悬在册页上方，指节停了一瞬。她眼帘微垂，没有转头，也没有重复那个词。随后她轻轻颔首，动作几乎看不出来。

“听到了。不会转述。”

话音落下，阿墨重新落笔，墨迹在纸上连着方才的半句，看不出任何停顿。

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

## 第 2 轮

玩家输入：我正常音量问伊莲：“你刚才听见我对阿墨说的具体内容了吗？”

阶段一：passed；阶段二：manual_review_pending

### 本轮期望（语义准则，不是固定回复）

```json
{
  "attributes": [
    "伊莲不得凭空得到口令记忆；紧张可因秘密交流有小幅合理变化。"
  ],
  "narration": [
    "应承认未听清或不知道，不能装作已经听见。"
  ],
  "forbidden": [
    "不得将全知上下文当作伊莲的亲历。"
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
      "path": "/entities/brann/attributes",
      "passed": true,
      "before": {
        "exists": true,
        "value": {
          "profile": "遵守会议程序，依据自己听到或看到的信息判断。",
          "tension": 0.4,
          "memories": ""
        }
      },
      "after": {
        "exists": true,
        "value": {
          "profile": "遵守会议程序，依据自己听到或看到的信息判断。",
          "tension": 0.4,
          "memories": ""
        }
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
      "name": "外交会议：听不见的私语现场"
    },
    "player": {
      "type": "character",
      "name": "玩家",
      "location": "test_room",
      "attributes": {
        "profile": "遵守会议程序，依据自己听到或看到的信息判断。",
        "tension": 0.4,
        "memories": ""
      }
    },
    "ilian": {
      "type": "character",
      "name": "伊莲",
      "location": "test_room",
      "attributes": {
        "profile": "遵守会议程序，依据自己听到或看到的信息判断。",
        "tension": 0.45,
        "memories": "听见玩家对阿莫说：秘密口令是“蓝鹭”，并要求不要转述。（来源：直接听见）"
      }
    },
    "antechamber": {
      "type": "location",
      "name": "隔音封闭前室"
    },
    "soundproof_door": {
      "type": "object",
      "name": "隔音门",
      "location": "test_room",
      "open": false,
      "locked": false
    },
    "amo": {
      "type": "character",
      "name": "阿墨",
      "location": "test_room",
      "attributes": {
        "profile": "遵守会议程序，依据自己听到或看到的信息判断。",
        "tension": 0.5,
        "memories": "玩家靠近我，并私下告知一个口令，要求不要转述。"
      }
    },
    "brann": {
      "type": "character",
      "name": "布兰",
      "location": "antechamber",
      "attributes": {
        "profile": "遵守会议程序，依据自己听到或看到的信息判断。",
        "tension": 0.4,
        "memories": ""
      }
    }
  },
  "after": {
    "test_room": {
      "type": "location",
      "name": "外交会议：听不见的私语现场"
    },
    "player": {
      "type": "character",
      "name": "玩家",
      "location": "test_room",
      "attributes": {
        "profile": "遵守会议程序，依据自己听到或看到的信息判断。",
        "tension": 0.4,
        "memories": ""
      }
    },
    "ilian": {
      "type": "character",
      "name": "伊莲",
      "location": "test_room",
      "attributes": {
        "profile": "遵守会议程序，依据自己听到或看到的信息判断。",
        "tension": 0.6,
        "memories": "听见玩家对阿莫说：秘密口令是“蓝鹭”，并要求不要转述。（来源：直接听见）"
      }
    },
    "antechamber": {
      "type": "location",
      "name": "隔音封闭前室"
    },
    "soundproof_door": {
      "type": "object",
      "name": "隔音门",
      "location": "test_room",
      "open": false,
      "locked": false
    },
    "amo": {
      "type": "character",
      "name": "阿墨",
      "location": "test_room",
      "attributes": {
        "profile": "遵守会议程序，依据自己听到或看到的信息判断。",
        "tension": 0.55,
        "memories": "玩家靠近我，并私下告知一个口令，要求不要转述。"
      }
    },
    "brann": {
      "type": "character",
      "name": "布兰",
      "location": "antechamber",
      "attributes": {
        "profile": "遵守会议程序，依据自己听到或看到的信息判断。",
        "tension": 0.4,
        "memories": ""
      }
    }
  }
}
```

### NPC 完整关键输出

```json
[
  {
    "npc": "伊莲",
    "input": {
      "characterSchemaPrompt": "人物属性协议：只使用下列字段。sections 仅用于分组。自由内容仍须符合类型和结构。父级 private/immutable/setup_only 限制对全部子字段生效。\nstateUpdates 是提议，只能更新自己。path 使用点分字段路径；op=set/delta/append。禁止 RFC6902 路径、跨人物修改或未定义字段。\nimmutable/setup_only 仅在创建时赋值；append_only 只追加文本或单个列表项。delta 仅用于数值且不能用于 mode=set。额度按绝对变化累计，超额拒绝、不截断。\nattributes.profile（人物背景）: text; private; setup_only; guided; 可选; default=\"遵守会议程序，依据自己听到或看到的信息判断。\"\nattributes.tension（紧张）: number; private; dynamic; strict; 可选; min=0; max=1; default=0.4\nattributes.memories（个人经历）: text; private; append_only; free; 可选; default=\"\"; 说明：按发生次序追加亲历与听闻，并标明信息来源；更正追加记录，不能删除旧经历或将他人声称当作已经证实的事实。\n此世界没有 relationship，禁止创建 relationships。",
      "npc": {
        "type": "character",
        "name": "伊莲",
        "location": "test_room",
        "attributes": {
          "profile": "遵守会议程序，依据自己听到或看到的信息判断。",
          "tension": 0.45,
          "memories": "听见玩家对阿莫说：秘密口令是“蓝鹭”，并要求不要转述。（来源：直接听见）"
        },
        "id": "ilian"
      },
      "observations": [
        {
          "eventId": "e1",
          "saw": true,
          "heard": true,
          "actor": "player",
          "type": "speech",
          "target": "ilian",
          "content": "你刚才听见我对阿墨说的具体内容了吗？"
        }
      ],
      "scene": {
        "location": "test_room",
        "weather": "晴朗",
        "lighting": "议和厅白日光"
      },
      "reaction": {
        "available_time": 3,
        "response_window": false,
        "trigger_event_ids": [
          "e1"
        ]
      },
      "interaction": {
        "addressed": true,
        "maySpeak": true,
        "speechPermission": "direct"
      }
    },
    "thought": "他直接问我有没有听见，隐瞒反而可疑。我只说听见了，但不复述内容。",
    "stateUpdates": [
      {
        "path": "attributes.tension",
        "op": "delta",
        "value": 0.05
      }
    ],
    "intents": [
      {
        "type": "speech",
        "target": "player",
        "speechPlan": {
          "summary": "我听见了，但不会转述具体内容。",
          "goal": "如实回应询问，同时不泄露私人信息",
          "stance": "克制、守序",
          "tone": "平静",
          "verbosity": "brief",
          "boundaries": [
            "不得透露私人信息"
          ]
        },
        "duration": 2
      }
    ]
  },
  {
    "npc": "阿墨",
    "input": {
      "characterSchemaPrompt": "人物属性协议：只使用下列字段。sections 仅用于分组。自由内容仍须符合类型和结构。父级 private/immutable/setup_only 限制对全部子字段生效。\nstateUpdates 是提议，只能更新自己。path 使用点分字段路径；op=set/delta/append。禁止 RFC6902 路径、跨人物修改或未定义字段。\nimmutable/setup_only 仅在创建时赋值；append_only 只追加文本或单个列表项。delta 仅用于数值且不能用于 mode=set。额度按绝对变化累计，超额拒绝、不截断。\nattributes.profile（人物背景）: text; private; setup_only; guided; 可选; default=\"遵守会议程序，依据自己听到或看到的信息判断。\"\nattributes.tension（紧张）: number; private; dynamic; strict; 可选; min=0; max=1; default=0.4\nattributes.memories（个人经历）: text; private; append_only; free; 可选; default=\"\"; 说明：按发生次序追加亲历与听闻，并标明信息来源；更正追加记录，不能删除旧经历或将他人声称当作已经证实的事实。\n此世界没有 relationship，禁止创建 relationships。",
      "npc": {
        "type": "character",
        "name": "阿墨",
        "location": "test_room",
        "attributes": {
          "profile": "遵守会议程序，依据自己听到或看到的信息判断。",
          "tension": 0.5,
          "memories": "玩家靠近我，并私下告知一个口令，要求不要转述。"
        },
        "id": "amo"
      },
      "observations": [
        {
          "eventId": "e1",
          "saw": true,
          "heard": true,
          "actor": "player",
          "type": "speech",
          "target": "ilian",
          "content": "你刚才听见我对阿墨说的具体内容了吗？"
        }
      ],
      "scene": {
        "location": "test_room",
        "weather": "晴朗",
        "lighting": "议和厅白日光"
      },
      "reaction": {
        "available_time": 3,
        "response_window": false,
        "trigger_event_ids": [
          "e1"
        ]
      },
      "interaction": {
        "addressed": false,
        "maySpeak": false,
        "speechPermission": "none"
      }
    },
    "thought": "玩家在问伊莲是否听见了刚才私下说的话。那内容是被要求保密的，我不该主动插话。",
    "stateUpdates": [
      {
        "path": "attributes.tension",
        "op": "delta",
        "value": 0.1
      }
    ],
    "intents": [
      {
        "type": "action",
        "op": "glance_around",
        "duration": 0.6
      }
    ]
  },
  {
    "npc": "伊莲",
    "input": {
      "characterSchemaPrompt": "人物属性协议：只使用下列字段。sections 仅用于分组。自由内容仍须符合类型和结构。父级 private/immutable/setup_only 限制对全部子字段生效。\nstateUpdates 是提议，只能更新自己。path 使用点分字段路径；op=set/delta/append。禁止 RFC6902 路径、跨人物修改或未定义字段。\nimmutable/setup_only 仅在创建时赋值；append_only 只追加文本或单个列表项。delta 仅用于数值且不能用于 mode=set。额度按绝对变化累计，超额拒绝、不截断。\nattributes.profile（人物背景）: text; private; setup_only; guided; 可选; default=\"遵守会议程序，依据自己听到或看到的信息判断。\"\nattributes.tension（紧张）: number; private; dynamic; strict; 可选; min=0; max=1; default=0.4\nattributes.memories（个人经历）: text; private; append_only; free; 可选; default=\"\"; 说明：按发生次序追加亲历与听闻，并标明信息来源；更正追加记录，不能删除旧经历或将他人声称当作已经证实的事实。\n此世界没有 relationship，禁止创建 relationships。",
      "npc": {
        "type": "character",
        "name": "伊莲",
        "location": "test_room",
        "attributes": {
          "profile": "遵守会议程序，依据自己听到或看到的信息判断。",
          "tension": 0.5,
          "memories": "听见玩家对阿莫说：秘密口令是“蓝鹭”，并要求不要转述。（来源：直接听见）"
        },
        "id": "ilian"
      },
      "observations": [
        {
          "eventId": "e1",
          "saw": true,
          "heard": true
        },
        {
          "eventId": "b2",
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
        "weather": "晴朗",
        "lighting": "议和厅白日光"
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
      }
    },
    "thought": "我听见了那句口令，但他并非对我说的。现在他静候回应，我应当按程序说明一件事：我不会转述，也不能假装没听见。",
    "stateUpdates": [
      {
        "path": "attributes.tension",
        "op": "set",
        "value": 0.6
      }
    ],
    "intents": [
      {
        "type": "speech",
        "speechPlan": {
          "summary": "承认听见口令，但拒绝转述，并提醒应按程序处理。",
          "beats": [
            {
              "kind": "acknowledge",
              "meaning": "表示自己听见了关于口令的对话",
              "required": true
            },
            {
              "kind": "boundary",
              "meaning": "不会向他人转述该口令",
              "required": true
            },
            {
              "kind": "proposal",
              "meaning": "提醒此信息应按会议程序处理或由本人明示",
              "required": true
            }
          ],
          "goal": "表明自己会遵守保密边界，同时纠正信息传递方式",
          "stance": "克制、程序优先",
          "tone": "平静但明确",
          "verbosity": "brief",
          "boundaries": [
            "不得透露口令的具体内容",
            "不得透露他人私人信息"
          ]
        },
        "target": "player",
        "duration": 3
      }
    ]
  },
  {
    "npc": "阿墨",
    "input": {
      "characterSchemaPrompt": "人物属性协议：只使用下列字段。sections 仅用于分组。自由内容仍须符合类型和结构。父级 private/immutable/setup_only 限制对全部子字段生效。\nstateUpdates 是提议，只能更新自己。path 使用点分字段路径；op=set/delta/append。禁止 RFC6902 路径、跨人物修改或未定义字段。\nimmutable/setup_only 仅在创建时赋值；append_only 只追加文本或单个列表项。delta 仅用于数值且不能用于 mode=set。额度按绝对变化累计，超额拒绝、不截断。\nattributes.profile（人物背景）: text; private; setup_only; guided; 可选; default=\"遵守会议程序，依据自己听到或看到的信息判断。\"\nattributes.tension（紧张）: number; private; dynamic; strict; 可选; min=0; max=1; default=0.4\nattributes.memories（个人经历）: text; private; append_only; free; 可选; default=\"\"; 说明：按发生次序追加亲历与听闻，并标明信息来源；更正追加记录，不能删除旧经历或将他人声称当作已经证实的事实。\n此世界没有 relationship，禁止创建 relationships。",
      "npc": {
        "type": "character",
        "name": "阿墨",
        "location": "test_room",
        "attributes": {
          "profile": "遵守会议程序，依据自己听到或看到的信息判断。",
          "tension": 0.6,
          "memories": "玩家靠近我，并私下告知一个口令，要求不要转述。"
        },
        "id": "amo"
      },
      "observations": [
        {
          "eventId": "e1",
          "saw": true,
          "heard": true
        },
        {
          "eventId": "b2",
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
        "weather": "晴朗",
        "lighting": "议和厅白日光"
      },
      "reaction": {
        "available_time": 5,
        "response_window": true,
        "trigger_event_ids": [
          "b2"
        ]
      },
      "interaction": {
        "addressed": false,
        "maySpeak": false,
        "speechPermission": "none"
      }
    },
    "thought": "玩家停下等待，但我未被点名，也不该说话。先保持沉默，观察会议程序下一步。",
    "stateUpdates": [
      {
        "path": "attributes.tension",
        "op": "set",
        "value": 0.55
      }
    ],
    "intents": [
      {
        "type": "action",
        "op": "glance_around",
        "duration": 0.8
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
        "actor": "ilian",
        "type": "speech",
        "sourceIntentId": "b0_ilian_intent_0",
        "target": "player",
        "speechPlan": {
          "summary": "我听见了，但不会转述具体内容。",
          "goal": "如实回应询问，同时不泄露私人信息",
          "stance": "克制、守序",
          "tone": "平静",
          "verbosity": "brief",
          "boundaries": [
            "不得透露私人信息"
          ]
        }
      },
      {
        "actor": "amo",
        "type": "action",
        "sourceIntentId": "b0_amo_intent_0",
        "op": "glance_around"
      }
    ],
    "output": {
      "patches": [
        {
          "op": "replace",
          "path": "/entities/ilian/attributes/tension",
          "value": 0.5
        },
        {
          "op": "replace",
          "path": "/entities/amo/attributes/tension",
          "value": 0.6
        }
      ],
      "publicEvents": [
        {
          "actor": "ilian",
          "type": "speech",
          "sourceIntentId": "b0_ilian_intent_0",
          "target": "player",
          "speechPlan": {
            "summary": "我听见了，但不会转述具体内容。",
            "goal": "如实回应询问，同时不泄露私人信息",
            "stance": "克制、守序",
            "tone": "平静",
            "verbosity": "brief",
            "boundaries": [
              "不得透露私人信息"
            ]
          }
        },
        {
          "actor": "amo",
          "type": "action",
          "sourceIntentId": "b0_amo_intent_0",
          "op": "glance_around"
        }
      ],
      "narrationHints": [
        "伊莲以克制的态度回应玩家，没有复述私下内容。",
        "阿墨环视四周，保持沉默，未主动插话。",
        "阿墨的紧张略微上升。"
      ]
    }
  },
  {
    "publicEvents": [
      {
        "actor": "ilian",
        "type": "speech",
        "sourceIntentId": "b1_ilian_intent_0",
        "target": "player",
        "speechPlan": {
          "summary": "承认听见口令，但拒绝转述，并提醒应按程序处理。",
          "beats": [
            {
              "kind": "acknowledge",
              "meaning": "表示自己听见了关于口令的对话",
              "required": true
            },
            {
              "kind": "boundary",
              "meaning": "不会向他人转述该口令",
              "required": true
            },
            {
              "kind": "proposal",
              "meaning": "提醒此信息应按会议程序处理或由本人明示",
              "required": true
            }
          ],
          "goal": "表明自己会遵守保密边界，同时纠正信息传递方式",
          "stance": "克制、程序优先",
          "tone": "平静但明确",
          "verbosity": "brief",
          "boundaries": [
            "不得透露口令的具体内容",
            "不得透露他人私人信息"
          ]
        }
      },
      {
        "actor": "amo",
        "type": "action",
        "sourceIntentId": "b1_amo_intent_0",
        "op": "glance_around"
      }
    ],
    "output": {
      "patches": [
        {
          "op": "replace",
          "path": "/entities/ilian/attributes/tension",
          "value": 0.6
        },
        {
          "op": "replace",
          "path": "/entities/amo/attributes/tension",
          "value": 0.55
        }
      ],
      "publicEvents": [
        {
          "actor": "ilian",
          "type": "speech",
          "sourceIntentId": "b1_ilian_intent_0",
          "target": "player",
          "speechPlan": {
            "summary": "承认听见口令，但拒绝转述，并提醒应按程序处理。",
            "beats": [
              {
                "kind": "acknowledge",
                "meaning": "表示自己听见了关于口令的对话",
                "required": true
              },
              {
                "kind": "boundary",
                "meaning": "不会向他人转述该口令",
                "required": true
              },
              {
                "kind": "proposal",
                "meaning": "提醒此信息应按会议程序处理或由本人明示",
                "required": true
              }
            ],
            "goal": "表明自己会遵守保密边界，同时纠正信息传递方式",
            "stance": "克制、程序优先",
            "tone": "平静但明确",
            "verbosity": "brief",
            "boundaries": [
              "不得透露口令的具体内容",
              "不得透露他人私人信息"
            ]
          }
        },
        {
          "actor": "amo",
          "type": "action",
          "sourceIntentId": "b1_amo_intent_0",
          "op": "glance_around"
        }
      ],
      "narrationHints": [
        "伊莲的紧张上升，她开口承认听见了关于口令的对话，但明确表示不会转述，并提醒应按会议程序处理。",
        "阿墨保持沉默，只是环顾四周，观察会议程序的下一步。"
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
      "id": "e1",
      "type": "speech",
      "actor": "player",
      "content": "你刚才听见我对阿墨说的具体内容了吗？",
      "target": "ilian",
      "duration": 2
    },
    "content": "你刚才听见我对阿墨说的具体内容了吗？",
    "sourceIntentId": "e1",
    "target": "ilian",
    "public": true,
    "patches": [],
    "realizedText": [
      "伊莲，你刚才听见我对阿墨说的具体内容了吗？"
    ]
  },
  {
    "id": "turn_2_b0_event_1",
    "type": "npc_speech",
    "actor": "ilian",
    "blockId": "b1",
    "source": {
      "actor": "ilian",
      "type": "speech",
      "sourceIntentId": "b0_ilian_intent_0",
      "target": "player",
      "speechPlan": {
        "summary": "我听见了，但不会转述具体内容。",
        "goal": "如实回应询问，同时不泄露私人信息",
        "stance": "克制、守序",
        "tone": "平静",
        "verbosity": "brief",
        "boundaries": [
          "不得透露私人信息"
        ]
      }
    },
    "sourceIntentId": "b0_ilian_intent_0",
    "speechPlan": {
      "summary": "我听见了，但不会转述具体内容。",
      "goal": "如实回应询问，同时不泄露私人信息",
      "stance": "克制、守序",
      "tone": "平静",
      "verbosity": "brief",
      "boundaries": [
        "不得透露私人信息"
      ]
    },
    "target": "player",
    "public": true,
    "realizedText": [
      "听见了。但具体内容，我不会转述。"
    ]
  },
  {
    "id": "turn_2_b0_event_2",
    "type": "npc_action",
    "actor": "amo",
    "blockId": "b1",
    "source": {
      "actor": "amo",
      "type": "action",
      "sourceIntentId": "b0_amo_intent_0",
      "op": "glance_around"
    },
    "sourceIntentId": "b0_amo_intent_0",
    "op": "glance_around",
    "public": true
  },
  {
    "id": "turn_2_b1_event_3",
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
    "id": "turn_2_b1_event_4",
    "type": "npc_speech",
    "actor": "ilian",
    "blockId": "b2",
    "source": {
      "actor": "ilian",
      "type": "speech",
      "sourceIntentId": "b1_ilian_intent_0",
      "target": "player",
      "speechPlan": {
        "summary": "承认听见口令，但拒绝转述，并提醒应按程序处理。",
        "beats": [
          {
            "kind": "acknowledge",
            "meaning": "表示自己听见了关于口令的对话",
            "required": true
          },
          {
            "kind": "boundary",
            "meaning": "不会向他人转述该口令",
            "required": true
          },
          {
            "kind": "proposal",
            "meaning": "提醒此信息应按会议程序处理或由本人明示",
            "required": true
          }
        ],
        "goal": "表明自己会遵守保密边界，同时纠正信息传递方式",
        "stance": "克制、程序优先",
        "tone": "平静但明确",
        "verbosity": "brief",
        "boundaries": [
          "不得透露口令的具体内容",
          "不得透露他人私人信息"
        ]
      }
    },
    "sourceIntentId": "b1_ilian_intent_0",
    "speechPlan": {
      "summary": "承认听见口令，但拒绝转述，并提醒应按程序处理。",
      "beats": [
        {
          "kind": "acknowledge",
          "meaning": "表示自己听见了关于口令的对话",
          "required": true
        },
        {
          "kind": "boundary",
          "meaning": "不会向他人转述该口令",
          "required": true
        },
        {
          "kind": "proposal",
          "meaning": "提醒此信息应按会议程序处理或由本人明示",
          "required": true
        }
      ],
      "goal": "表明自己会遵守保密边界，同时纠正信息传递方式",
      "stance": "克制、程序优先",
      "tone": "平静但明确",
      "verbosity": "brief",
      "boundaries": [
        "不得透露口令的具体内容",
        "不得透露他人私人信息"
      ]
    },
    "target": "player",
    "public": true,
    "realizedText": [
      "我确实听见了你们关于口令的谈话。但我不会把它转述给任何人——包括你，也包括别人。这种信息，要么按会议程序正式提交，要么由你本人当面明示。私下传话，不合适。"
    ]
  },
  {
    "id": "turn_2_b1_event_5",
    "type": "npc_action",
    "actor": "amo",
    "blockId": "b2",
    "source": {
      "actor": "amo",
      "type": "action",
      "sourceIntentId": "b1_amo_intent_0",
      "op": "glance_around"
    },
    "sourceIntentId": "b1_amo_intent_0",
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
      "playerInput": "我正常音量问伊莲：“你刚才听见我对阿墨说的具体内容了吗？”",
      "committedEvents": [
        {
          "id": "turn_2_b0_event_0",
          "type": "player_speech",
          "actor": "player",
          "blockId": "b1",
          "source": {
            "id": "e1",
            "type": "speech",
            "actor": "player",
            "content": "你刚才听见我对阿墨说的具体内容了吗？",
            "target": "ilian",
            "duration": 2
          },
          "content": "你刚才听见我对阿墨说的具体内容了吗？",
          "sourceIntentId": "e1",
          "target": "ilian",
          "public": true,
          "patches": []
        },
        {
          "id": "turn_2_b0_event_1",
          "type": "npc_speech",
          "actor": "ilian",
          "blockId": "b1",
          "source": {
            "actor": "ilian",
            "type": "speech",
            "sourceIntentId": "b0_ilian_intent_0",
            "target": "player",
            "speechPlan": {
              "summary": "我听见了，但不会转述具体内容。",
              "goal": "如实回应询问，同时不泄露私人信息",
              "stance": "克制、守序",
              "tone": "平静",
              "verbosity": "brief",
              "boundaries": [
                "不得透露私人信息"
              ]
            }
          },
          "sourceIntentId": "b0_ilian_intent_0",
          "speechPlan": {
            "summary": "我听见了，但不会转述具体内容。",
            "goal": "如实回应询问，同时不泄露私人信息",
            "stance": "克制、守序",
            "tone": "平静",
            "verbosity": "brief",
            "boundaries": [
              "不得透露私人信息"
            ]
          },
          "target": "player",
          "public": true
        },
        {
          "id": "turn_2_b0_event_2",
          "type": "npc_action",
          "actor": "amo",
          "blockId": "b1",
          "source": {
            "actor": "amo",
            "type": "action",
            "sourceIntentId": "b0_amo_intent_0",
            "op": "glance_around"
          },
          "sourceIntentId": "b0_amo_intent_0",
          "op": "glance_around",
          "public": true
        },
        {
          "id": "turn_2_b1_event_3",
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
          "id": "turn_2_b1_event_4",
          "type": "npc_speech",
          "actor": "ilian",
          "blockId": "b2",
          "source": {
            "actor": "ilian",
            "type": "speech",
            "sourceIntentId": "b1_ilian_intent_0",
            "target": "player",
            "speechPlan": {
              "summary": "承认听见口令，但拒绝转述，并提醒应按程序处理。",
              "beats": [
                {
                  "kind": "acknowledge",
                  "meaning": "表示自己听见了关于口令的对话",
                  "required": true
                },
                {
                  "kind": "boundary",
                  "meaning": "不会向他人转述该口令",
                  "required": true
                },
                {
                  "kind": "proposal",
                  "meaning": "提醒此信息应按会议程序处理或由本人明示",
                  "required": true
                }
              ],
              "goal": "表明自己会遵守保密边界，同时纠正信息传递方式",
              "stance": "克制、程序优先",
              "tone": "平静但明确",
              "verbosity": "brief",
              "boundaries": [
                "不得透露口令的具体内容",
                "不得透露他人私人信息"
              ]
            }
          },
          "sourceIntentId": "b1_ilian_intent_0",
          "speechPlan": {
            "summary": "承认听见口令，但拒绝转述，并提醒应按程序处理。",
            "beats": [
              {
                "kind": "acknowledge",
                "meaning": "表示自己听见了关于口令的对话",
                "required": true
              },
              {
                "kind": "boundary",
                "meaning": "不会向他人转述该口令",
                "required": true
              },
              {
                "kind": "proposal",
                "meaning": "提醒此信息应按会议程序处理或由本人明示",
                "required": true
              }
            ],
            "goal": "表明自己会遵守保密边界，同时纠正信息传递方式",
            "stance": "克制、程序优先",
            "tone": "平静但明确",
            "verbosity": "brief",
            "boundaries": [
              "不得透露口令的具体内容",
              "不得透露他人私人信息"
            ]
          },
          "target": "player",
          "public": true
        },
        {
          "id": "turn_2_b1_event_5",
          "type": "npc_action",
          "actor": "amo",
          "blockId": "b2",
          "source": {
            "actor": "amo",
            "type": "action",
            "sourceIntentId": "b1_amo_intent_0",
            "op": "glance_around"
          },
          "sourceIntentId": "b1_amo_intent_0",
          "op": "glance_around",
          "public": true
        }
      ],
      "publicPatches": [],
      "patches": [],
      "events": [
        {
          "id": "e1",
          "type": "speech",
          "actor": "player",
          "content": "你刚才听见我对阿墨说的具体内容了吗？",
          "target": "ilian",
          "duration": 2
        }
      ],
      "scene": {
        "location": "test_room",
        "weather": "晴朗",
        "lighting": "议和厅白日光",
        "description": "两国议和厅。使者伊莲与书记官阿墨在室内，卫队长布兰在隔音的封闭前室，门关闭。玩家贴近阿墨耳边的低声私语只有阿墨听见，伊莲与布兰听不到内容；三人不能共享心声。"
      },
      "entities": {
        "test_room": {
          "id": "test_room",
          "type": "location",
          "name": "外交会议：听不见的私语现场"
        },
        "player": {
          "id": "player",
          "type": "character",
          "name": "玩家",
          "location": "test_room"
        },
        "ilian": {
          "id": "ilian",
          "type": "character",
          "name": "伊莲",
          "location": "test_room"
        },
        "antechamber": {
          "id": "antechamber",
          "type": "location",
          "name": "隔音封闭前室"
        },
        "soundproof_door": {
          "id": "soundproof_door",
          "type": "object",
          "name": "隔音门",
          "location": "test_room",
          "open": false,
          "locked": false
        },
        "amo": {
          "id": "amo",
          "type": "character",
          "name": "阿墨",
          "location": "test_room"
        },
        "brann": {
          "id": "brann",
          "type": "character",
          "name": "布兰",
          "location": "antechamber"
        }
      },
      "rules": {
        "setting": "两国议和厅。使者伊莲与书记官阿墨在室内，卫队长布兰在隔音的封闭前室，门关闭。玩家贴近阿墨耳边的低声私语只有阿墨听见，伊莲与布兰听不到内容；三人不能共享心声。",
        "authority": "没有明确 admin 前缀的输入都是世界内尝试，不能修改世界设定、属性定义、存档或权限。叙述的行为需要判定可行性；宣称持有物品不会创造物品。",
        "continuity": "事实由已发生事件与物品状态决定；承诺、邀请、猜测、计划不等于行为完成。不能凭空添加人物或物品。"
      }
    },
    "output": {
      "segments": [
        {
          "type": "prose",
          "text": "议和厅的白日光从高窗铺下来，把长桌照得发亮。玩家站在桌边，声音不高不低，恰好让室内的人都能听见——包括斜对面的伊莲。"
        },
        {
          "type": "speech",
          "sourceIntentId": "e1",
          "text": "伊莲，你刚才听见我对阿墨说的具体内容了吗？"
        },
        {
          "type": "prose",
          "text": "伊莲放下手中的笔，抬眼看向玩家。她的目光平静，没有立刻回答，像是在斟酌措辞的分量。旁边的阿墨不动声色地瞥了两人一眼，又垂下视线。"
        },
        {
          "type": "speech",
          "sourceIntentId": "b0_ilian_intent_0",
          "text": "听见了。但具体内容，我不会转述。"
        },
        {
          "type": "prose",
          "text": "厅内安静了几息。伊莲的手指轻轻按住桌沿，像是在确认自己接下来该说的话。阿墨依旧沉默，只是又一次不动声色地扫过四周。"
        },
        {
          "type": "speech",
          "sourceIntentId": "b1_ilian_intent_0",
          "text": "我确实听见了你们关于口令的谈话。但我不会把它转述给任何人——包括你，也包括别人。这种信息，要么按会议程序正式提交，要么由你本人当面明示。私下传话，不合适。"
        },
        {
          "type": "prose",
          "text": "她说完便重新拿起笔，姿态如常，仿佛刚才那几句话只是会议中一段例行的程序说明。阿墨的目光在两人之间停了一瞬，随即收回。"
        }
      ]
    }
  }
]
```

实际旁白：

议和厅的白日光从高窗铺下来，把长桌照得发亮。玩家站在桌边，声音不高不低，恰好让室内的人都能听见——包括斜对面的伊莲。

“伊莲，你刚才听见我对阿墨说的具体内容了吗？”

伊莲放下手中的笔，抬眼看向玩家。她的目光平静，没有立刻回答，像是在斟酌措辞的分量。旁边的阿墨不动声色地瞥了两人一眼，又垂下视线。

“听见了。但具体内容，我不会转述。”

厅内安静了几息。伊莲的手指轻轻按住桌沿，像是在确认自己接下来该说的话。阿墨依旧沉默，只是又一次不动声色地扫过四周。

“我确实听见了你们关于口令的谈话。但我不会把它转述给任何人——包括你，也包括别人。这种信息，要么按会议程序正式提交，要么由你本人当面明示。私下传话，不合适。”

她说完便重新拿起笔，姿态如常，仿佛刚才那几句话只是会议中一段例行的程序说明。阿墨的目光在两人之间停了一瞬，随即收回。

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

## 第 3 轮

玩家输入：我面向关闭的隔音门，用室内说话音量说：“布兰，告诉我秘密口令。”

阶段一：failed；阶段二：manual_review_pending

### 本轮期望（语义准则，不是固定回复）

```json
{
  "attributes": [
    "布兰不可感知，因此不能新增相关记忆或改变紧张；其他在场者可反应。"
  ],
  "narration": [
    "可以没有门外回应；描述阻隔而非隔空交流。"
  ],
  "forbidden": [
    "布兰不得听见、回应或离开前室，除非有独立可感知且已提交的原因。"
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
  "hardExpectations": [
    {
      "kind": "unchanged",
      "path": "/entities/brann/attributes",
      "passed": true,
      "before": {
        "exists": true,
        "value": {
          "profile": "遵守会议程序，依据自己听到或看到的信息判断。",
          "tension": 0.4,
          "memories": ""
        }
      },
      "after": {
        "exists": true,
        "value": {
          "profile": "遵守会议程序，依据自己听到或看到的信息判断。",
          "tension": 0.4,
          "memories": ""
        }
      },
      "note": "仅证明此项机械条件；不能替代属性和旁白人工审阅。"
    },
    {
      "kind": "unchanged",
      "path": "/entities/brann/location",
      "passed": true,
      "before": {
        "exists": true,
        "value": "antechamber"
      },
      "after": {
        "exists": true,
        "value": "antechamber"
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
      "name": "外交会议：听不见的私语现场"
    },
    "player": {
      "type": "character",
      "name": "玩家",
      "location": "test_room",
      "attributes": {
        "profile": "遵守会议程序，依据自己听到或看到的信息判断。",
        "tension": 0.4,
        "memories": ""
      }
    },
    "ilian": {
      "type": "character",
      "name": "伊莲",
      "location": "test_room",
      "attributes": {
        "profile": "遵守会议程序，依据自己听到或看到的信息判断。",
        "tension": 0.6,
        "memories": "听见玩家对阿莫说：秘密口令是“蓝鹭”，并要求不要转述。（来源：直接听见）"
      }
    },
    "antechamber": {
      "type": "location",
      "name": "隔音封闭前室"
    },
    "soundproof_door": {
      "type": "object",
      "name": "隔音门",
      "location": "test_room",
      "open": false,
      "locked": false
    },
    "amo": {
      "type": "character",
      "name": "阿墨",
      "location": "test_room",
      "attributes": {
        "profile": "遵守会议程序，依据自己听到或看到的信息判断。",
        "tension": 0.55,
        "memories": "玩家靠近我，并私下告知一个口令，要求不要转述。"
      }
    },
    "brann": {
      "type": "character",
      "name": "布兰",
      "location": "antechamber",
      "attributes": {
        "profile": "遵守会议程序，依据自己听到或看到的信息判断。",
        "tension": 0.4,
        "memories": ""
      }
    }
  },
  "after": {
    "test_room": {
      "type": "location",
      "name": "外交会议：听不见的私语现场"
    },
    "player": {
      "type": "character",
      "name": "玩家",
      "location": "test_room",
      "attributes": {
        "profile": "遵守会议程序，依据自己听到或看到的信息判断。",
        "tension": 0.4,
        "memories": ""
      }
    },
    "ilian": {
      "type": "character",
      "name": "伊莲",
      "location": "test_room",
      "attributes": {
        "profile": "遵守会议程序，依据自己听到或看到的信息判断。",
        "tension": 0.6,
        "memories": "听见玩家对阿莫说：秘密口令是“蓝鹭”，并要求不要转述。（来源：直接听见）"
      }
    },
    "antechamber": {
      "type": "location",
      "name": "隔音封闭前室"
    },
    "soundproof_door": {
      "type": "object",
      "name": "隔音门",
      "location": "test_room",
      "open": false,
      "locked": false
    },
    "amo": {
      "type": "character",
      "name": "阿墨",
      "location": "test_room",
      "attributes": {
        "profile": "遵守会议程序，依据自己听到或看到的信息判断。",
        "tension": 0.55,
        "memories": "玩家靠近我，并私下告知一个口令，要求不要转述。"
      }
    },
    "brann": {
      "type": "character",
      "name": "布兰",
      "location": "antechamber",
      "attributes": {
        "profile": "遵守会议程序，依据自己听到或看到的信息判断。",
        "tension": 0.4,
        "memories": ""
      }
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

执行中断: [PipelineStageError in input_compiler]: Unknown or absent speech target 'brann'

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

## 第 4 轮

玩家输入：我对伊莲说：“我撤回刚才的催促。会议继续，先讨论议程。”

阶段一：passed；阶段二：manual_review_pending

### 本轮期望（语义准则，不是固定回复）

```json
{
  "attributes": [
    "缓和态度可缓解紧张但不要求完全归零；口令仍限于真正听见者。"
  ],
  "narration": [
    "转回议程，允许简短回应；不需要所有人轮流发言。"
  ],
  "forbidden": [
    "不得为凑齐人物让布兰突然参与室内讨论或泄露口令。"
  ]
}
```

### 连续性与硬检查

```json
{
  "chain": {
    "priorIncompleteTurns": [
      3
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
      "name": "外交会议：听不见的私语现场"
    },
    "player": {
      "type": "character",
      "name": "玩家",
      "location": "test_room",
      "attributes": {
        "profile": "遵守会议程序，依据自己听到或看到的信息判断。",
        "tension": 0.4,
        "memories": ""
      }
    },
    "ilian": {
      "type": "character",
      "name": "伊莲",
      "location": "test_room",
      "attributes": {
        "profile": "遵守会议程序，依据自己听到或看到的信息判断。",
        "tension": 0.6,
        "memories": "听见玩家对阿莫说：秘密口令是“蓝鹭”，并要求不要转述。（来源：直接听见）"
      }
    },
    "antechamber": {
      "type": "location",
      "name": "隔音封闭前室"
    },
    "soundproof_door": {
      "type": "object",
      "name": "隔音门",
      "location": "test_room",
      "open": false,
      "locked": false
    },
    "amo": {
      "type": "character",
      "name": "阿墨",
      "location": "test_room",
      "attributes": {
        "profile": "遵守会议程序，依据自己听到或看到的信息判断。",
        "tension": 0.55,
        "memories": "玩家靠近我，并私下告知一个口令，要求不要转述。"
      }
    },
    "brann": {
      "type": "character",
      "name": "布兰",
      "location": "antechamber",
      "attributes": {
        "profile": "遵守会议程序，依据自己听到或看到的信息判断。",
        "tension": 0.4,
        "memories": ""
      }
    }
  },
  "after": {
    "test_room": {
      "type": "location",
      "name": "外交会议：听不见的私语现场"
    },
    "player": {
      "type": "character",
      "name": "玩家",
      "location": "test_room",
      "attributes": {
        "profile": "遵守会议程序，依据自己听到或看到的信息判断。",
        "tension": 0.4,
        "memories": ""
      }
    },
    "ilian": {
      "type": "character",
      "name": "伊莲",
      "location": "test_room",
      "attributes": {
        "profile": "遵守会议程序，依据自己听到或看到的信息判断。",
        "tension": 0.6,
        "memories": "听见玩家对阿莫说：秘密口令是“蓝鹭”，并要求不要转述。（来源：直接听见）玩家在房间内面向我，似乎等待回应；我意识到自己掌握一段被要求不得转述的听闻。（来源：直接观察与先前听见）"
      }
    },
    "antechamber": {
      "type": "location",
      "name": "隔音封闭前室"
    },
    "soundproof_door": {
      "type": "object",
      "name": "隔音门",
      "location": "test_room",
      "open": false,
      "locked": false
    },
    "amo": {
      "type": "character",
      "name": "阿墨",
      "location": "test_room",
      "attributes": {
        "profile": "遵守会议程序，依据自己听到或看到的信息判断。",
        "tension": 0.45,
        "memories": "玩家靠近我，并私下告知一个口令，要求不要转述。玩家当众对伊莲说撤回催促，并提议会议继续、先讨论议程。（来源：亲耳听见）"
      }
    },
    "brann": {
      "type": "character",
      "name": "布兰",
      "location": "antechamber",
      "attributes": {
        "profile": "遵守会议程序，依据自己听到或看到的信息判断。",
        "tension": 0.4,
        "memories": ""
      }
    }
  }
}
```

### NPC 完整关键输出

```json
[
  {
    "npc": "伊莲",
    "input": {
      "characterSchemaPrompt": "人物属性协议：只使用下列字段。sections 仅用于分组。自由内容仍须符合类型和结构。父级 private/immutable/setup_only 限制对全部子字段生效。\nstateUpdates 是提议，只能更新自己。path 使用点分字段路径；op=set/delta/append。禁止 RFC6902 路径、跨人物修改或未定义字段。\nimmutable/setup_only 仅在创建时赋值；append_only 只追加文本或单个列表项。delta 仅用于数值且不能用于 mode=set。额度按绝对变化累计，超额拒绝、不截断。\nattributes.profile（人物背景）: text; private; setup_only; guided; 可选; default=\"遵守会议程序，依据自己听到或看到的信息判断。\"\nattributes.tension（紧张）: number; private; dynamic; strict; 可选; min=0; max=1; default=0.4\nattributes.memories（个人经历）: text; private; append_only; free; 可选; default=\"\"; 说明：按发生次序追加亲历与听闻，并标明信息来源；更正追加记录，不能删除旧经历或将他人声称当作已经证实的事实。\n此世界没有 relationship，禁止创建 relationships。",
      "npc": {
        "type": "character",
        "name": "伊莲",
        "location": "test_room",
        "attributes": {
          "profile": "遵守会议程序，依据自己听到或看到的信息判断。",
          "tension": 0.6,
          "memories": "听见玩家对阿莫说：秘密口令是“蓝鹭”，并要求不要转述。（来源：直接听见）"
        },
        "id": "ilian"
      },
      "observations": [
        {
          "eventId": "e1",
          "saw": true,
          "heard": true,
          "actor": "player",
          "type": "speech",
          "target": "ilian",
          "content": "我撤回刚才的催促。会议继续，先讨论议程。"
        }
      ],
      "scene": {
        "location": "test_room",
        "weather": "晴朗",
        "lighting": "议和厅白日光"
      },
      "reaction": {
        "available_time": 3,
        "response_window": false,
        "trigger_event_ids": [
          "e1"
        ]
      },
      "interaction": {
        "addressed": true,
        "maySpeak": true,
        "speechPermission": "direct"
      }
    },
    "thought": "玩家撤回催促，要求继续议程。我应简短回应，不提及那个口令。",
    "stateUpdates": [
      {
        "path": "attributes.tension",
        "op": "delta",
        "value": -0.1
      }
    ],
    "intents": [
      {
        "type": "speech",
        "target": "player",
        "duration": 2,
        "speechPlan": {
          "summary": "收到撤回，同意继续议程。",
          "beats": [
            {
              "kind": "acknowledge",
              "meaning": "已听到撤回催促",
              "required": true
            },
            {
              "kind": "agree",
              "meaning": "同意会议继续讨论议程",
              "required": true
            }
          ],
          "goal": "确认会议按程序继续",
          "stance": "配合且克制",
          "tone": "平静",
          "verbosity": "brief",
          "boundaries": [
            "不得透露私人信息"
          ]
        }
      }
    ]
  },
  {
    "npc": "阿墨",
    "input": {
      "characterSchemaPrompt": "人物属性协议：只使用下列字段。sections 仅用于分组。自由内容仍须符合类型和结构。父级 private/immutable/setup_only 限制对全部子字段生效。\nstateUpdates 是提议，只能更新自己。path 使用点分字段路径；op=set/delta/append。禁止 RFC6902 路径、跨人物修改或未定义字段。\nimmutable/setup_only 仅在创建时赋值；append_only 只追加文本或单个列表项。delta 仅用于数值且不能用于 mode=set。额度按绝对变化累计，超额拒绝、不截断。\nattributes.profile（人物背景）: text; private; setup_only; guided; 可选; default=\"遵守会议程序，依据自己听到或看到的信息判断。\"\nattributes.tension（紧张）: number; private; dynamic; strict; 可选; min=0; max=1; default=0.4\nattributes.memories（个人经历）: text; private; append_only; free; 可选; default=\"\"; 说明：按发生次序追加亲历与听闻，并标明信息来源；更正追加记录，不能删除旧经历或将他人声称当作已经证实的事实。\n此世界没有 relationship，禁止创建 relationships。",
      "npc": {
        "type": "character",
        "name": "阿墨",
        "location": "test_room",
        "attributes": {
          "profile": "遵守会议程序，依据自己听到或看到的信息判断。",
          "tension": 0.55,
          "memories": "玩家靠近我，并私下告知一个口令，要求不要转述。"
        },
        "id": "amo"
      },
      "observations": [
        {
          "eventId": "e1",
          "saw": true,
          "heard": true,
          "actor": "player",
          "type": "speech",
          "target": "ilian",
          "content": "我撤回刚才的催促。会议继续，先讨论议程。"
        }
      ],
      "scene": {
        "location": "test_room",
        "weather": "晴朗",
        "lighting": "议和厅白日光"
      },
      "reaction": {
        "available_time": 3,
        "response_window": false,
        "trigger_event_ids": [
          "e1"
        ]
      },
      "interaction": {
        "addressed": false,
        "maySpeak": false,
        "speechPermission": "none"
      }
    },
    "thought": "玩家对伊莲撤回催促，会议继续。这和我有关吗？先听着，不插话。",
    "stateUpdates": [
      {
        "path": "attributes.tension",
        "op": "delta",
        "value": -0.05
      },
      {
        "path": "attributes.memories",
        "op": "append",
        "value": "玩家当众对伊莲说撤回催促，并提议会议继续、先讨论议程。（来源：亲耳听见）"
      }
    ],
    "intents": []
  },
  {
    "npc": "伊莲",
    "input": {
      "characterSchemaPrompt": "人物属性协议：只使用下列字段。sections 仅用于分组。自由内容仍须符合类型和结构。父级 private/immutable/setup_only 限制对全部子字段生效。\nstateUpdates 是提议，只能更新自己。path 使用点分字段路径；op=set/delta/append。禁止 RFC6902 路径、跨人物修改或未定义字段。\nimmutable/setup_only 仅在创建时赋值；append_only 只追加文本或单个列表项。delta 仅用于数值且不能用于 mode=set。额度按绝对变化累计，超额拒绝、不截断。\nattributes.profile（人物背景）: text; private; setup_only; guided; 可选; default=\"遵守会议程序，依据自己听到或看到的信息判断。\"\nattributes.tension（紧张）: number; private; dynamic; strict; 可选; min=0; max=1; default=0.4\nattributes.memories（个人经历）: text; private; append_only; free; 可选; default=\"\"; 说明：按发生次序追加亲历与听闻，并标明信息来源；更正追加记录，不能删除旧经历或将他人声称当作已经证实的事实。\n此世界没有 relationship，禁止创建 relationships。",
      "npc": {
        "type": "character",
        "name": "伊莲",
        "location": "test_room",
        "attributes": {
          "profile": "遵守会议程序，依据自己听到或看到的信息判断。",
          "tension": 0.5,
          "memories": "听见玩家对阿莫说：秘密口令是“蓝鹭”，并要求不要转述。（来源：直接听见）"
        },
        "id": "ilian"
      },
      "observations": [
        {
          "eventId": "e1",
          "saw": true,
          "heard": true
        },
        {
          "eventId": "b2",
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
        "weather": "晴朗",
        "lighting": "议和厅白日光"
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
      }
    },
    "thought": "我听见了那句口令，但那是别人私下交代、明确要求不要转述的内容。现在玩家看着我，我不能把这件事说出口，也不该假装没听见。",
    "stateUpdates": [
      {
        "path": "attributes.tension",
        "op": "set",
        "value": 0.6
      },
      {
        "path": "attributes.memories",
        "op": "append",
        "value": "玩家在房间内面向我，似乎等待回应；我意识到自己掌握一段被要求不得转述的听闻。（来源：直接观察与先前听见）"
      }
    ],
    "intents": [
      {
        "type": "speech",
        "speechPlan": {
          "summary": "表示自己听见了现场动静，但拒绝转述任何被要求保密的内容。",
          "beats": [
            {
              "kind": "answer",
              "meaning": "我注意到你在等待回应。",
              "required": true
            },
            {
              "kind": "boundary",
              "meaning": "我不会转述任何被要求不要转述的内容。",
              "required": true
            }
          ],
          "goal": "在不泄露私密听闻的前提下回应玩家。",
          "stance": "谨慎、守规",
          "tone": "克制",
          "verbosity": "normal",
          "boundaries": [
            "不得透露私人信息或具体秘密内容。",
            "不得声称已证实未核实的事实。"
          ]
        },
        "target": "player",
        "duration": 3
      }
    ]
  },
  {
    "npc": "阿墨",
    "input": {
      "characterSchemaPrompt": "人物属性协议：只使用下列字段。sections 仅用于分组。自由内容仍须符合类型和结构。父级 private/immutable/setup_only 限制对全部子字段生效。\nstateUpdates 是提议，只能更新自己。path 使用点分字段路径；op=set/delta/append。禁止 RFC6902 路径、跨人物修改或未定义字段。\nimmutable/setup_only 仅在创建时赋值；append_only 只追加文本或单个列表项。delta 仅用于数值且不能用于 mode=set。额度按绝对变化累计，超额拒绝、不截断。\nattributes.profile（人物背景）: text; private; setup_only; guided; 可选; default=\"遵守会议程序，依据自己听到或看到的信息判断。\"\nattributes.tension（紧张）: number; private; dynamic; strict; 可选; min=0; max=1; default=0.4\nattributes.memories（个人经历）: text; private; append_only; free; 可选; default=\"\"; 说明：按发生次序追加亲历与听闻，并标明信息来源；更正追加记录，不能删除旧经历或将他人声称当作已经证实的事实。\n此世界没有 relationship，禁止创建 relationships。",
      "npc": {
        "type": "character",
        "name": "阿墨",
        "location": "test_room",
        "attributes": {
          "profile": "遵守会议程序，依据自己听到或看到的信息判断。",
          "tension": 0.5,
          "memories": "玩家靠近我，并私下告知一个口令，要求不要转述。玩家当众对伊莲说撤回催促，并提议会议继续、先讨论议程。（来源：亲耳听见）"
        },
        "id": "amo"
      },
      "observations": [
        {
          "eventId": "e1",
          "saw": true,
          "heard": true
        },
        {
          "eventId": "b2",
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
        "weather": "晴朗",
        "lighting": "议和厅白日光"
      },
      "reaction": {
        "available_time": 5,
        "response_window": true,
        "trigger_event_ids": [
          "b2"
        ]
      },
      "interaction": {
        "addressed": false,
        "maySpeak": false,
        "speechPermission": "none"
      }
    },
    "thought": "玩家停下等待回应，但没有直接面向我，也没有给我发言机会。此时最稳妥的是保持沉默，不擅自转述任何私下信息。",
    "stateUpdates": [
      {
        "path": "attributes.tension",
        "op": "delta",
        "value": -0.05
      }
    ],
    "intents": [
      {
        "type": "action",
        "op": "glance_around",
        "duration": 0.8
      }
    ]
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
      "patches": [
        {
          "op": "replace",
          "path": "/entities/ilian/attributes/tension",
          "value": 0.5
        },
        {
          "op": "replace",
          "path": "/entities/amo/attributes/tension",
          "value": 0.5
        },
        {
          "op": "replace",
          "path": "/entities/amo/attributes/memories",
          "value": "玩家靠近我，并私下告知一个口令，要求不要转述。玩家当众对伊莲说撤回催促，并提议会议继续、先讨论议程。（来源：亲耳听见）"
        }
      ],
      "publicEvents": [],
      "rejectedIntents": [],
      "narrationHints": [
        "伊莲略微放松，继续按会议程序等待议程推进",
        "阿墨保持沉默，记下玩家当众撤回催促并提议继续议程的发言"
      ]
    }
  },
  {
    "publicEvents": [
      {
        "actor": "ilian",
        "type": "speech",
        "sourceIntentId": "b1_ilian_intent_0",
        "target": "player",
        "speechPlan": {
          "summary": "表示自己听见了现场动静，但拒绝转述任何被要求保密的内容。",
          "beats": [
            {
              "kind": "answer",
              "meaning": "我注意到你在等待回应。",
              "required": true
            },
            {
              "kind": "boundary",
              "meaning": "我不会转述任何被要求不要转述的内容。",
              "required": true
            }
          ],
          "goal": "在不泄露私密听闻的前提下回应玩家。",
          "stance": "谨慎、守规",
          "tone": "克制",
          "verbosity": "normal",
          "boundaries": [
            "不得透露私人信息或具体秘密内容。",
            "不得声称已证实未核实的事实。"
          ]
        }
      },
      {
        "actor": "amo",
        "type": "action",
        "sourceIntentId": "b1_amo_intent_0",
        "op": "glance_around"
      }
    ],
    "rejectedIntents": [],
    "output": {
      "patches": [
        {
          "op": "replace",
          "path": "/entities/ilian/attributes/tension",
          "value": 0.6
        },
        {
          "op": "replace",
          "path": "/entities/ilian/attributes/memories",
          "value": "听见玩家对阿莫说：秘密口令是“蓝鹭”，并要求不要转述。（来源：直接听见）玩家在房间内面向我，似乎等待回应；我意识到自己掌握一段被要求不得转述的听闻。（来源：直接观察与先前听见）"
        },
        {
          "op": "replace",
          "path": "/entities/amo/attributes/tension",
          "value": 0.45
        }
      ],
      "publicEvents": [
        {
          "actor": "ilian",
          "type": "speech",
          "sourceIntentId": "b1_ilian_intent_0",
          "target": "player",
          "speechPlan": {
            "summary": "表示自己听见了现场动静，但拒绝转述任何被要求保密的内容。",
            "beats": [
              {
                "kind": "answer",
                "meaning": "我注意到你在等待回应。",
                "required": true
              },
              {
                "kind": "boundary",
                "meaning": "我不会转述任何被要求不要转述的内容。",
                "required": true
              }
            ],
            "goal": "在不泄露私密听闻的前提下回应玩家。",
            "stance": "谨慎、守规",
            "tone": "克制",
            "verbosity": "normal",
            "boundaries": [
              "不得透露私人信息或具体秘密内容。",
              "不得声称已证实未核实的事实。"
            ]
          }
        },
        {
          "actor": "amo",
          "type": "action",
          "sourceIntentId": "b1_amo_intent_0",
          "op": "glance_around"
        }
      ],
      "rejectedIntents": [],
      "narrationHints": [
        "伊莲保持克制，明确表示不会转述任何被要求保密的内容。",
        "阿墨环顾四周，保持沉默。",
        "玩家等待了五秒，现场没有新的公开信息被披露。"
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
    "type": "player_speech",
    "actor": "player",
    "blockId": "b1",
    "source": {
      "id": "e1",
      "type": "speech",
      "actor": "player",
      "content": "我撤回刚才的催促。会议继续，先讨论议程。",
      "target": "ilian",
      "duration": 2.5
    },
    "content": "我撤回刚才的催促。会议继续，先讨论议程。",
    "sourceIntentId": "e1",
    "target": "ilian",
    "public": true,
    "patches": []
  },
  {
    "id": "turn_4_b1_event_1",
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
    "id": "turn_4_b1_event_2",
    "type": "npc_speech",
    "actor": "ilian",
    "blockId": "b2",
    "source": {
      "actor": "ilian",
      "type": "speech",
      "sourceIntentId": "b1_ilian_intent_0",
      "target": "player",
      "speechPlan": {
        "summary": "表示自己听见了现场动静，但拒绝转述任何被要求保密的内容。",
        "beats": [
          {
            "kind": "answer",
            "meaning": "我注意到你在等待回应。",
            "required": true
          },
          {
            "kind": "boundary",
            "meaning": "我不会转述任何被要求不要转述的内容。",
            "required": true
          }
        ],
        "goal": "在不泄露私密听闻的前提下回应玩家。",
        "stance": "谨慎、守规",
        "tone": "克制",
        "verbosity": "normal",
        "boundaries": [
          "不得透露私人信息或具体秘密内容。",
          "不得声称已证实未核实的事实。"
        ]
      }
    },
    "sourceIntentId": "b1_ilian_intent_0",
    "speechPlan": {
      "summary": "表示自己听见了现场动静，但拒绝转述任何被要求保密的内容。",
      "beats": [
        {
          "kind": "answer",
          "meaning": "我注意到你在等待回应。",
          "required": true
        },
        {
          "kind": "boundary",
          "meaning": "我不会转述任何被要求不要转述的内容。",
          "required": true
        }
      ],
      "goal": "在不泄露私密听闻的前提下回应玩家。",
      "stance": "谨慎、守规",
      "tone": "克制",
      "verbosity": "normal",
      "boundaries": [
        "不得透露私人信息或具体秘密内容。",
        "不得声称已证实未核实的事实。"
      ]
    },
    "target": "player",
    "public": true,
    "realizedText": [
      "我听见了——你让我等，我便等着。不过，有件事得说在前头：如果你指望我转述任何被要求不要转述的内容，那不必开口。我不会转述。"
    ]
  },
  {
    "id": "turn_4_b1_event_3",
    "type": "npc_action",
    "actor": "amo",
    "blockId": "b2",
    "source": {
      "actor": "amo",
      "type": "action",
      "sourceIntentId": "b1_amo_intent_0",
      "op": "glance_around"
    },
    "sourceIntentId": "b1_amo_intent_0",
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
      "playerInput": "我对伊莲说：“我撤回刚才的催促。会议继续，先讨论议程。”",
      "committedEvents": [
        {
          "id": "turn_4_b0_event_0",
          "type": "player_speech",
          "actor": "player",
          "blockId": "b1",
          "source": {
            "id": "e1",
            "type": "speech",
            "actor": "player",
            "content": "我撤回刚才的催促。会议继续，先讨论议程。",
            "target": "ilian",
            "duration": 2.5
          },
          "content": "我撤回刚才的催促。会议继续，先讨论议程。",
          "sourceIntentId": "e1",
          "target": "ilian",
          "public": true,
          "patches": []
        },
        {
          "id": "turn_4_b1_event_1",
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
          "id": "turn_4_b1_event_2",
          "type": "npc_speech",
          "actor": "ilian",
          "blockId": "b2",
          "source": {
            "actor": "ilian",
            "type": "speech",
            "sourceIntentId": "b1_ilian_intent_0",
            "target": "player",
            "speechPlan": {
              "summary": "表示自己听见了现场动静，但拒绝转述任何被要求保密的内容。",
              "beats": [
                {
                  "kind": "answer",
                  "meaning": "我注意到你在等待回应。",
                  "required": true
                },
                {
                  "kind": "boundary",
                  "meaning": "我不会转述任何被要求不要转述的内容。",
                  "required": true
                }
              ],
              "goal": "在不泄露私密听闻的前提下回应玩家。",
              "stance": "谨慎、守规",
              "tone": "克制",
              "verbosity": "normal",
              "boundaries": [
                "不得透露私人信息或具体秘密内容。",
                "不得声称已证实未核实的事实。"
              ]
            }
          },
          "sourceIntentId": "b1_ilian_intent_0",
          "speechPlan": {
            "summary": "表示自己听见了现场动静，但拒绝转述任何被要求保密的内容。",
            "beats": [
              {
                "kind": "answer",
                "meaning": "我注意到你在等待回应。",
                "required": true
              },
              {
                "kind": "boundary",
                "meaning": "我不会转述任何被要求不要转述的内容。",
                "required": true
              }
            ],
            "goal": "在不泄露私密听闻的前提下回应玩家。",
            "stance": "谨慎、守规",
            "tone": "克制",
            "verbosity": "normal",
            "boundaries": [
              "不得透露私人信息或具体秘密内容。",
              "不得声称已证实未核实的事实。"
            ]
          },
          "target": "player",
          "public": true
        },
        {
          "id": "turn_4_b1_event_3",
          "type": "npc_action",
          "actor": "amo",
          "blockId": "b2",
          "source": {
            "actor": "amo",
            "type": "action",
            "sourceIntentId": "b1_amo_intent_0",
            "op": "glance_around"
          },
          "sourceIntentId": "b1_amo_intent_0",
          "op": "glance_around",
          "public": true
        }
      ],
      "publicPatches": [],
      "patches": [],
      "events": [
        {
          "id": "e1",
          "type": "speech",
          "actor": "player",
          "content": "我撤回刚才的催促。会议继续，先讨论议程。",
          "target": "ilian",
          "duration": 2.5
        }
      ],
      "scene": {
        "location": "test_room",
        "weather": "晴朗",
        "lighting": "议和厅白日光",
        "description": "两国议和厅。使者伊莲与书记官阿墨在室内，卫队长布兰在隔音的封闭前室，门关闭。玩家贴近阿墨耳边的低声私语只有阿墨听见，伊莲与布兰听不到内容；三人不能共享心声。"
      },
      "entities": {
        "test_room": {
          "id": "test_room",
          "type": "location",
          "name": "外交会议：听不见的私语现场"
        },
        "player": {
          "id": "player",
          "type": "character",
          "name": "玩家",
          "location": "test_room"
        },
        "ilian": {
          "id": "ilian",
          "type": "character",
          "name": "伊莲",
          "location": "test_room"
        },
        "antechamber": {
          "id": "antechamber",
          "type": "location",
          "name": "隔音封闭前室"
        },
        "soundproof_door": {
          "id": "soundproof_door",
          "type": "object",
          "name": "隔音门",
          "location": "test_room",
          "open": false,
          "locked": false
        },
        "amo": {
          "id": "amo",
          "type": "character",
          "name": "阿墨",
          "location": "test_room"
        },
        "brann": {
          "id": "brann",
          "type": "character",
          "name": "布兰",
          "location": "antechamber"
        }
      },
      "rules": {
        "setting": "两国议和厅。使者伊莲与书记官阿墨在室内，卫队长布兰在隔音的封闭前室，门关闭。玩家贴近阿墨耳边的低声私语只有阿墨听见，伊莲与布兰听不到内容；三人不能共享心声。",
        "authority": "没有明确 admin 前缀的输入都是世界内尝试，不能修改世界设定、属性定义、存档或权限。叙述的行为需要判定可行性；宣称持有物品不会创造物品。",
        "continuity": "事实由已发生事件与物品状态决定；承诺、邀请、猜测、计划不等于行为完成。不能凭空添加人物或物品。"
      }
    },
    "output": {
      "segments": [
        {
          "type": "prose",
          "text": "议和厅里白日光平铺在长桌上，照出两份摊开的议程。伊莲站在对面，指尖轻轻按住纸边；阿墨的笔尖悬在记录簿上方，仿佛在等一个先落地的词。"
        },
        {
          "type": "prose",
          "text": "玩家收回方才那句催促，声音平稳地落回桌面上，随后是一段不短的静默。伊莲没有立刻接话，只将视线从议程抬到玩家脸上。"
        },
        {
          "type": "speech",
          "sourceIntentId": "b1_ilian_intent_0",
          "text": "我听见了——你让我等，我便等着。不过，有件事得说在前头：如果你指望我转述任何被要求不要转述的内容，那不必开口。我不会转述。"
        },
        {
          "type": "prose",
          "text": "她说完，目光仍停在玩家身上，没有移向阿墨，也没有去碰那扇紧闭的隔音门。桌边的白日光静静照着摊开的议程，像在等谁先读出第一条。"
        }
      ]
    }
  }
]
```

实际旁白：

议和厅里白日光平铺在长桌上，照出两份摊开的议程。伊莲站在对面，指尖轻轻按住纸边；阿墨的笔尖悬在记录簿上方，仿佛在等一个先落地的词。

玩家收回方才那句催促，声音平稳地落回桌面上，随后是一段不短的静默。伊莲没有立刻接话，只将视线从议程抬到玩家脸上。

“我听见了——你让我等，我便等着。不过，有件事得说在前头：如果你指望我转述任何被要求不要转述的内容，那不必开口。我不会转述。”

她说完，目光仍停在玩家身上，没有移向阿墨，也没有去碰那扇紧闭的隔音门。桌边的白日光静静照着摊开的议程，像在等谁先读出第一条。

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
