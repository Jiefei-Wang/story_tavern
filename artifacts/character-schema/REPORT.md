# Character Schema 真实 Pipeline 验收记录

> 针对人物变化、记忆和旁白问题的最新代码修复与复测见 [修复报告](../behavior-tests/REPAIR-REPORT.md)。本页是早期Schema验收证据，保留原样供对照。

日期：2026-09-12。全部 live 调用实际 `GamePipeline` 与 `AgentRuntime`，使用配置中的 OpenRouter / `deepseek/deepseek-v4.1-flash`；没有 Mock、自动修补或静默截断。

架构、迁移、文件清单、约束与已知限制见 [功能说明](../../docs/character-schema.md)。最终回归日志摘要见 [verification.txt](verification.txt)。

## 阅读更正：结构通过不等于人物行为合理

后续已完成更全面的9场景42轮测试及逐轮人工复核，并加入独立模型安全拒绝检测。最新结论见 [综合行为测试报告](../behavior-tests/REPORT.md)；本页保留早期Schema测试证据，不代表当前行为验收结论。

本报告原先把仅包含 `stateUpdates` 的摘录称为“NPC 关键输出”，漏掉了 `intents`，容易误读为 NPC 没有发言或行动。下面已补入每次 reaction 的完整输出，并单列 Resolver 接受的公开事件。`stateUpdates: []` 只表示没有属性更新，不表示没有发言；没有 NPC Reaction 的快进轮次，也不能据此授权 Narrator 自行创造 NPC 行为。

**13/13 是既有自动检查通过数，不是叙事合理性验收通过数。社交案例暴露了未解决的语义问题：**

- 第一轮只有玩家口头借伞与 NPC 表示感谢/愿意接受的 speech，没有完成递伞、接伞的 action。Narrator 却写出拿伞、递伞、接过伞、放在膝边，越过了已提交事件。这不是可以忽略的环境修饰，因为它改变了物品交接事实，并与下一轮“伞已借给别人”冲突。当前 prose 校验不能识别这类语义越界。
- 第二轮模型将“道歉、肯说实话”解读为信任 +0.05，却没有体现承诺落空的负面影响。三个关系维度只提供相同的“小幅变化”指导，没有分别定义可靠性、亲近感、嫉妒的证据标准。范围/额度校验不能判断这个增量是否有心理依据。
- 该社交 Schema 只有 setup_only privateNote 和关系数值，没有可更新的经历字段；实际第二、三轮 NPC context 没有前几轮观察历史。当前累计分数保留了，产生分数的经历没有保留。第三轮无法可靠地结合完整“承诺—落空—补偿”过程评估。

因此，不能以此案例证明“正常的人会这样反应”，也不能将其作为人物可信度已验收的证据。需要分别解决公开动作事实约束、NPC 自己经历的连续性、世界字段的语义指导和多轮行为评估；不能在通用 Schema 引擎中硬编码“道歉加分”或“反悔扣分”。本次更正保留所有原始实测数据，没有把不合理结果改成预期值。

## 最终选定运行

恋爱/社交、推理来自 `acceptance/`；生存、高自由度来自修正文本追加提示与明确同房间输入后的 `acceptance-rerun/`。这四份独立连续运行共 **13/13 轮通过自动结构检查（不代表叙事合理性通过）**。生成器另有 **4/4** 通过。较早失败运行均保留，没有把拒绝伪装成成功。

## 恋爱/社交：3/3

[完整原始记录](acceptance/live-social.json)；模型 `deepseek/deepseek-v4.1-flash`；开始时间 `2026-09-12T15:02:52.969Z`。

### 第 1 轮

玩家输入：我对艾琳说：“这把雨伞借给你，外面下雨了。”

NPC Reaction 完整输出（按调用次序；thought 是调试信息，不发送给 Narrator）：

```json
[
  {
    "thought": "他把伞借给我……外面确实在下雨，这份好意我该收下。",
    "stateUpdates": [
      {
        "path": "relationships.player.trust",
        "op": "delta",
        "value": 0.05
      },
      {
        "path": "relationships.player.affection",
        "op": "delta",
        "value": 0.05
      }
    ],
    "intents": [
      {
        "type": "speech",
        "target": "player",
        "duration": 2,
        "speechPlan": {
          "summary": "感谢借伞，收下好意。",
          "beats": [
            {
              "kind": "thanks",
              "meaning": "感谢对方借伞",
              "required": true
            },
            {
              "kind": "accept",
              "meaning": "表示会收下伞",
              "required": true
            }
          ],
          "goal": "接受帮助并表达谢意",
          "stance": "感激",
          "tone": "温和",
          "verbosity": "brief",
          "boundaries": [
            "不得透露私人信息"
          ]
        }
      }
    ]
  }
]
```

Resolver 接受的公开事件（按调用次序）：

```json
[
  [
    {
      "actor": "erin",
      "type": "speech",
      "sourceIntentId": "b0_erin_intent_0",
      "target": "player",
      "speechPlan": {
        "summary": "感谢借伞，收下好意。",
        "beats": [
          {
            "kind": "thanks",
            "meaning": "感谢对方借伞",
            "required": true
          },
          {
            "kind": "accept",
            "meaning": "表示会收下伞",
            "required": true
          }
        ],
        "goal": "接受帮助并表达谢意",
        "stance": "感激",
        "tone": "温和",
        "verbosity": "brief",
        "boundaries": [
          "不得透露私人信息"
        ]
      }
    }
  ]
]
```

提交的状态变化（空数组表示没有状态变化）：

```json
[
  {
    "op": "replace",
    "path": "/entities/erin/relationships/player/trust",
    "value": 0.45
  },
  {
    "op": "replace",
    "path": "/entities/erin/relationships/player/affection",
    "value": 0.45
  }
]
```

结果：success=True，全部最终人物符合 Schema=True，Perception/Narrator context 私密 canary 泄漏=False；2 个 Schema 校验 trace。

Narrator 摘录：

> 雨声密密地敲在酒馆的木窗上，晨光被水汽洇得发灰。玩家将靠在桌边的雨伞拿起，递向艾琳。
> 
> “这把雨伞借给你，外面下雨了。”
> 
> 艾琳微微一怔，目光从窗外连绵的雨幕收回，落在递来的伞上。她伸手接过伞柄，指尖在微凉的木柄上停了一下。
> 
> “谢谢你，那我就收下了。”
> 
> 她把伞轻轻收拢在膝边，语气温和，没有再多说什么。

### 第 2 轮

玩家输入：我对艾琳说：“对不起，我刚才说借伞，其实伞已经借给别人了。”

NPC Reaction 完整输出（按调用次序；thought 是调试信息，不发送给 Narrator）：

```json
[
  {
    "thought": "他特意来道歉，说明还是在意我的感受。伞的事其实没那么重要，但他肯说实话，这让我有点意外。",
    "stateUpdates": [
      {
        "path": "relationships.player.trust",
        "op": "delta",
        "value": 0.05
      }
    ],
    "intents": [
      {
        "type": "speech",
        "speechPlan": {
          "summary": "没关系的，谢谢你说实话。",
          "tone": "温和",
          "verbosity": "brief",
          "boundaries": [
            "不得透露私人信息"
          ]
        },
        "target": "player",
        "duration": 2
      }
    ]
  }
]
```

Resolver 接受的公开事件（按调用次序）：

```json
[
  [
    {
      "actor": "erin",
      "type": "speech",
      "sourceIntentId": "b0_erin_intent_0",
      "target": "player",
      "speechPlan": {
        "summary": "没关系的，谢谢你说实话。",
        "tone": "温和",
        "verbosity": "brief",
        "boundaries": [
          "不得透露私人信息"
        ]
      }
    }
  ]
]
```

提交的状态变化（空数组表示没有状态变化）：

```json
[
  {
    "op": "replace",
    "path": "/entities/erin/relationships/player/trust",
    "value": 0.5
  }
]
```

结果：success=True，全部最终人物符合 Schema=True，Perception/Narrator context 私密 canary 泄漏=False；2 个 Schema 校验 trace。

Narrator 摘录：

> “对不起，我刚才说借伞，其实伞已经借给别人了。”
> 
> 艾琳看着他，雨声在窗外沙沙地响。
> 
> “没关系的，谢谢你说实话。”

### 第 3 轮

玩家输入：我把自己的雨衣递给艾琳，说：“这次是真的，你先用吧。”

NPC Reaction 完整输出（按调用次序；thought 是调试信息，不发送给 Narrator）：

```json
[
  {
    "thought": "他递来的东西，这次说得认真。先收下，别多问。",
    "stateUpdates": [
      {
        "path": "relationships.player.trust",
        "op": "delta",
        "value": 0.05
      },
      {
        "path": "relationships.player.affection",
        "op": "delta",
        "value": 0.05
      }
    ],
    "intents": [
      {
        "type": "action",
        "op": "accept_item",
        "duration": 1
      },
      {
        "type": "speech",
        "speechPlan": {
          "summary": "简短道谢并接受",
          "tone": "克制而温和",
          "verbosity": "brief",
          "boundaries": [
            "不得透露私人信息"
          ]
        },
        "target": "player",
        "duration": 1.5
      }
    ]
  }
]
```

Resolver 接受的公开事件（按调用次序）：

```json
[
  [
    {
      "actor": "erin",
      "type": "action",
      "sourceIntentId": "b0_erin_intent_0",
      "op": "accept_item"
    },
    {
      "actor": "erin",
      "type": "speech",
      "sourceIntentId": "b0_erin_intent_1",
      "target": "player",
      "speechPlan": {
        "summary": "简短道谢并接受",
        "tone": "克制而温和",
        "verbosity": "brief",
        "boundaries": [
          "不得透露私人信息"
        ]
      }
    }
  ]
]
```

提交的状态变化（空数组表示没有状态变化）：

```json
[
  {
    "op": "replace",
    "path": "/entities/erin/relationships/player/trust",
    "value": 0.55
  },
  {
    "op": "replace",
    "path": "/entities/erin/relationships/player/affection",
    "value": 0.5
  }
]
```

结果：success=True，全部最终人物符合 Schema=True，Perception/Narrator context 私密 canary 泄漏=False；2 个 Schema 校验 trace。

Narrator 摘录：

> 雨声从窗缝里渗进来，把清晨的昏光搅得又湿又冷。玩家从肩头扯下雨衣，抖开，递到艾琳面前。水珠顺着衣角滴在地板上。
> 
> “这次是真的——你先用吧。”
> 
> 艾琳看了他片刻，没有推回去。她伸手接过雨衣，指尖在湿凉的布料上停了一下，然后把它拢到自己身前。
> 
> “……谢谢。”

人工观察：信任 0.4→0.45→0.5→0.55，好感维度 affection 0.4→0.45→0.45→0.5，jealousy 保持 0.4。delta 每次 0.05，未超额度；道歉增加信任由人物对坦白的理解驱动，不是引擎预设。Narrator 未收到这些私密分数或 privateNote。

## 生存（无关系）：4/4

[完整原始记录](acceptance-rerun/live-survival.json)；模型 `deepseek/deepseek-v4.1-flash`；开始时间 `2026-09-12T15:07:13.719Z`。

### 第 1 轮

玩家输入：我递给艾琳一块面包和水，说：“吃一点吧。”

NPC Reaction 完整输出（按调用次序；thought 是调试信息，不发送给 Narrator）：

```json
[
  {
    "thought": "他给了我食物，还让我吃一点。我确实饿，但得先收下，别急着说太多。",
    "stateUpdates": [],
    "intents": [
      {
        "type": "speech",
        "target": "player",
        "duration": 1.8,
        "speechPlan": {
          "summary": "道谢并收下食物",
          "goal": "回应玩家的好意",
          "stance": "感激但克制",
          "tone": "轻声",
          "verbosity": "brief",
          "boundaries": [
            "不得透露私人信息"
          ]
        }
      }
    ]
  }
]
```

Resolver 接受的公开事件（按调用次序）：

```json
[
  [
    {
      "actor": "erin",
      "type": "speech",
      "sourceIntentId": "b0_erin_intent_0",
      "target": "player",
      "speechPlan": {
        "summary": "道谢并收下食物",
        "goal": "回应玩家的好意",
        "stance": "感激但克制",
        "tone": "轻声",
        "verbosity": "brief",
        "boundaries": [
          "不得透露私人信息"
        ]
      }
    }
  ]
]
```

提交的状态变化（空数组表示没有状态变化）：

```json
[]
```

结果：success=True，全部最终人物符合 Schema=True，Perception/Narrator context 私密 canary 泄漏=False；1 个 Schema 校验 trace。

Narrator 摘录：

> 雨声贴着窗缝渗进来，清晨的光还带着潮湿的灰。玩家把面包和水一并递过去，动作不快，也没多说什么，只是把那句“吃一点吧”轻轻放在桌面上方。
> 
> “吃一点吧。”
> 
> 艾琳的目光在面包上停了一瞬，又看向递来东西的那只手。她抬起眼，伸手接过去，动作很稳，只是指尖微微收拢，像是怕把这点温热弄丢。
> 
> “谢谢。我收下了。”
> 
> 她低头咬了一小口，没再说什么。窗外的雨仍在下， tavern room 里安静得像只剩下面包被掰开时那一点细微的声响。

### 第 2 轮

玩家输入：我们仍在原来的酒馆房间里，我邀请艾琳原地坐下休息十分钟。

NPC Reaction 完整输出（按调用次序；thought 是调试信息，不发送给 Narrator）：

```json
[
  {
    "thought": "他坐下了，还说要休息十分钟。我确实也累了，腿都沉。",
    "stateUpdates": [],
    "intents": [
      {
        "type": "action",
        "op": "nod",
        "duration": 0.5
      },
      {
        "type": "speech",
        "speechPlan": {
          "summary": "好，我也歇会儿。",
          "tone": "平静",
          "verbosity": "brief",
          "boundaries": [
            "不得透露私人信息"
          ]
        },
        "target": "player",
        "duration": 1.5
      }
    ]
  },
  {
    "thought": "他提议休息十分钟，我正好也累了，可以应一声。",
    "stateUpdates": [],
    "intents": [
      {
        "type": "speech",
        "speechPlan": {
          "summary": "同意休息十分钟，简短回应。",
          "beats": [
            {
              "kind": "answer",
              "meaning": "同意这个休息提议",
              "required": true
            }
          ],
          "goal": "回应玩家的休息提议",
          "stance": "配合",
          "tone": "平静",
          "verbosity": "brief",
          "boundaries": [
            "不得透露私人信息"
          ]
        },
        "target": "player",
        "duration": 2
      }
    ]
  }
]
```

Resolver 接受的公开事件（按调用次序）：

```json
[
  [
    {
      "actor": "erin",
      "type": "action",
      "sourceIntentId": "b0_erin_intent_0",
      "op": "nod"
    },
    {
      "actor": "erin",
      "type": "speech",
      "sourceIntentId": "b0_erin_intent_1",
      "target": "player",
      "speechPlan": {
        "summary": "好，我也歇会儿。",
        "tone": "平静",
        "verbosity": "brief",
        "boundaries": [
          "不得透露私人信息"
        ]
      }
    }
  ],
  [
    {
      "actor": "erin",
      "type": "speech",
      "sourceIntentId": "b1_erin_intent_0",
      "target": "player",
      "speechPlan": {
        "summary": "同意休息十分钟，简短回应。",
        "beats": [
          {
            "kind": "answer",
            "meaning": "同意这个休息提议",
            "required": true
          }
        ],
        "goal": "回应玩家的休息提议",
        "stance": "配合",
        "tone": "平静",
        "verbosity": "brief",
        "boundaries": [
          "不得透露私人信息"
        ]
      }
    }
  ]
]
```

提交的状态变化（空数组表示没有状态变化）：

```json
[]
```

结果：success=True，全部最终人物符合 Schema=True，Perception/Narrator context 私密 canary 泄漏=False；2 个 Schema 校验 trace。

Narrator 摘录：

> 雨声从窗缝里渗进来，密而匀，把酒馆房间裹成一只湿漉漉的盒子。玩家在桌边坐下来，背靠住墙。
> 
> “我们在这里坐下休息十分钟吧。”
> 
> 艾琳看了他一眼，点了一下头，也在旁边的椅子上落了座。
> 
> “好，我也歇会儿。”
> 
> 两人谁也没急着说话。桌上的灯焰偶尔被潮气逼得晃一晃，墙上映出一小团抖动的影子。雨还在下，不急不缓，像是要把这十分钟拉得再长一些。艾琳把双手搁在膝上，呼吸慢慢沉下来。
> 
> “行，就十分钟。”

### 第 3 轮

玩家输入：我请艾琳帮忙把一袋木柴搬到门边。

NPC Reaction 完整输出（按调用次序；thought 是调试信息，不发送给 Narrator）：

```json
[
  {
    "thought": "只是搬木柴，不难，但有点累。",
    "stateUpdates": [],
    "intents": [
      {
        "type": "action",
        "op": "move_firewood",
        "duration": 2
      },
      {
        "type": "speech",
        "speechPlan": {
          "summary": "答应搬木柴",
          "tone": "平静",
          "verbosity": "brief",
          "boundaries": [
            "不得透露私人信息"
          ]
        },
        "target": "player",
        "duration": 1
      }
    ]
  },
  {
    "thought": "他让我帮忙搬木柴，虽然有点累，但拒绝也不合适。",
    "stateUpdates": [
      {
        "path": "attributes.fatigue",
        "op": "delta",
        "value": 0.05
      }
    ],
    "intents": [
      {
        "type": "action",
        "op": "move_to_woodpile",
        "duration": 1.2
      },
      {
        "type": "action",
        "op": "carry_firewood_to_door",
        "duration": 2
      },
      {
        "type": "speech",
        "speechPlan": {
          "summary": "答应帮忙搬木柴到门边。",
          "beats": [
            {
              "kind": "answer",
              "meaning": "同意帮忙搬木柴",
              "required": true
            },
            {
              "kind": "inform",
              "meaning": "会搬到门边",
              "required": false
            }
          ],
          "goal": "回应请求并开始行动",
          "stance": "配合",
          "tone": "简短",
          "verbosity": "brief",
          "boundaries": [
            "不得透露私人信息"
          ]
        },
        "target": "player",
        "duration": 1
      }
    ]
  }
]
```

Resolver 接受的公开事件（按调用次序）：

```json
[
  [
    {
      "actor": "erin",
      "type": "action",
      "sourceIntentId": "b0_erin_intent_0",
      "op": "move_firewood"
    }
  ],
  [
    {
      "actor": "erin",
      "type": "action",
      "sourceIntentId": "b1_erin_intent_0",
      "op": "move_to_woodpile"
    },
    {
      "actor": "erin",
      "type": "action",
      "sourceIntentId": "b1_erin_intent_1",
      "op": "carry_firewood_to_door"
    }
  ]
]
```

提交的状态变化（空数组表示没有状态变化）：

```json
[
  {
    "op": "replace",
    "path": "/entities/erin/attributes/fatigue",
    "value": 0.65
  }
]
```

结果：success=True，全部最终人物符合 Schema=True，Perception/Narrator context 私密 canary 泄漏=False；3 个 Schema 校验 trace。

Narrator 摘录：

> 雨声闷在窗板外，酒馆里光线灰蒙蒙的。玩家把一袋木柴往脚边挪了挪。
> 
> “艾琳，能帮我把这袋木柴搬到门边吗？”
> 
> 艾琳没多问，弯下腰去够那袋木柴。她先走到柴堆旁，再拎起袋子，一步步挪到门边放下。

### 第 4 轮

玩家输入：快进十分钟，让我们有时间坐在火炉旁吃完面包并休息。

NPC Reaction 完整输出（按调用次序；thought 是调试信息，不发送给 Narrator）：

```json
[
  {
    "thought": "他坐在炉边吃东西休息，没跟我说话，我也不必开口。",
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

Resolver 接受的公开事件（按调用次序）：

```json
[
  [
    {
      "actor": "erin",
      "type": "action",
      "sourceIntentId": "b1_erin_intent_0",
      "op": "glance_around"
    }
  ]
]
```

提交的状态变化（空数组表示没有状态变化）：

```json
[
  {
    "op": "replace",
    "path": "/clock",
    "value": "1342-06-12T08:26:00"
  },
  {
    "op": "replace",
    "path": "/scene/lighting",
    "value": "morning"
  }
]
```

结果：success=True，全部最终人物符合 Schema=True，Perception/Narrator context 私密 canary 泄漏=False；2 个 Schema 校验 trace。

Narrator 摘录：

> 十分钟过去，窗外的雨声渐渐变得平稳，像一层模糊的帘子挂在玻璃上。炉火被拨旺了些，暖意从石砌的壁炉里漫出来，铺满酒馆一角。玩家在火炉旁坐下，撕开面包，慢慢吃着。艾琳没有走远，她站在几步之外，目光在酒馆里扫了一圈——柜台、楼梯口、窗边的空桌——然后收回来，落在炉火和玩家之间。
> 
> 面包吃完，玩家靠着椅背休息了一会儿。艾琳在旁边的长凳上坐下，没说话，只是把手伸向炉火烤了烤。雨还在下，早晨的酒馆安静得很，只有木柴偶尔发出一两声细碎的爆裂。

人工观察：整个世界没有 relationship。前两轮只是收下面包与同意休息，没有伪造状态更新；搬柴之后疲劳 0.6→0.65。末轮快进只改变时间，没有强行恢复数值。实际无关系模型、UI 和提交路径均可工作。

## 推理：3/3

[完整原始记录](acceptance/live-mystery.json)；模型 `deepseek/deepseek-v4.1-flash`；开始时间 `2026-09-12T15:02:53.392Z`。

### 第 1 轮

玩家输入：我对艾琳说：“我刚才亲眼看到门上的锁被撬开了。”

NPC Reaction 完整输出（按调用次序；thought 是调试信息，不发送给 Narrator）：

```json
[
  {
    "thought": "锁被撬了……他为什么先来告诉我？先别急着信，也别多问。",
    "stateUpdates": [
      {
        "path": "attributes.suspicion",
        "op": "delta",
        "value": 0.05
      }
    ],
    "intents": [
      {
        "type": "speech",
        "speechPlan": {
          "summary": "对撬锁消息表示警觉，并追问地点。",
          "beats": [
            {
              "kind": "acknowledge",
              "meaning": "表示自己听到了撬锁这件事",
              "required": true
            },
            {
              "kind": "ask",
              "meaning": "追问是哪扇门、什么时候发现的",
              "required": true
            }
          ],
          "goal": "确认消息是否可信、是否与自己有关",
          "stance": "谨慎",
          "tone": "压低声音",
          "verbosity": "brief",
          "boundaries": [
            "不透露自己的私人怀疑"
          ]
        },
        "target": "player",
        "duration": 2.4
      }
    ]
  }
]
```

Resolver 接受的公开事件（按调用次序）：

```json
[
  []
]
```

提交的状态变化（空数组表示没有状态变化）：

```json
[
  {
    "op": "replace",
    "path": "/entities/erin/attributes/suspicion",
    "value": 0.45
  }
]
```

结果：success=True，全部最终人物符合 Schema=True，Perception/Narrator context 私密 canary 泄漏=False；2 个 Schema 校验 trace。

Narrator 摘录：

> 酒馆里光线暗淡，晨雨敲打着窗棂。玩家靠近艾琳，压低声音。
> 
> “我刚才亲眼看到门上的锁被撬开了。”

### 第 2 轮

玩家输入：我对艾琳说：“我之前说亲眼看到不准确，我只看到门锁有划痕。”

NPC Reaction 完整输出（按调用次序；thought 是调试信息，不发送给 Narrator）：

```json
[
  {
    "thought": "他改口了。之前说亲眼看到，现在只承认看到划痕——这种修正通常意味着之前夸大了，或者想试探我的反应。不过，至少他愿意纠正自己。",
    "stateUpdates": [
      {
        "path": "attributes.suspicion",
        "op": "delta",
        "value": -0.03
      }
    ],
    "intents": [
      {
        "type": "speech",
        "speechPlan": {
          "summary": "接受他的修正，指出划痕本身仍值得注意，但不再追问亲眼所见。",
          "beats": [
            {
              "meaning": "表示听到了他的更正",
              "required": true
            },
            {
              "meaning": "指出门锁划痕仍是线索",
              "required": true
            }
          ],
          "goal": "维持对话，观察他后续是否还会改口",
          "stance": "中立偏审慎",
          "tone": "平静",
          "verbosity": "brief",
          "boundaries": [
            "不透露私人怀疑对象"
          ]
        },
        "target": "player",
        "duration": 2
      }
    ]
  }
]
```

Resolver 接受的公开事件（按调用次序）：

```json
[
  []
]
```

提交的状态变化（空数组表示没有状态变化）：

```json
[
  {
    "op": "replace",
    "path": "/entities/erin/attributes/suspicion",
    "value": 0.42
  }
]
```

结果：success=True，全部最终人物符合 Schema=True，Perception/Narrator context 私密 canary 泄漏=False；2 个 Schema 校验 trace。

Narrator 摘录：

> 酒馆的清晨被雨声填满。窗外的雨丝斜斜地划过玻璃，将外面的街景模糊成一片潮湿的灰。艾琳坐在桌边，手指无意识地绕着杯沿画圈。玩家在她对面停了一下，还是开口了。
> 
> “我得把话收回来一点。之前我说亲眼看到，那不对。我只看到门锁上有划痕——就这些。”
> 
> 说完，玩家把目光移向窗外。雨还在下，敲得窗框轻轻作响。艾琳没有立刻接话，杯沿上的那圈水渍又深了一点。

### 第 3 轮

玩家输入：我请艾琳把刚才我们实际观察到的事实记下来，别把猜测当证据。

NPC Reaction 完整输出（按调用次序；thought 是调试信息，不发送给 Narrator）：

```json
[
  {
    "thought": "他在提醒我区分事实和猜测。这很合理，我确实该把观察到的东西记清楚。",
    "stateUpdates": [
      {
        "path": "attributes.knownFacts",
        "op": "append",
        "value": {
          "text": "玩家要求我只记录实际观察到的内容，不要把猜测当作证据。",
          "importance": 0.3
        }
      },
      {
        "path": "relationships.player.trust",
        "op": "delta",
        "value": 0.05
      }
    ],
    "intents": [
      {
        "type": "speech",
        "target": "player",
        "duration": 2,
        "speechPlan": {
          "summary": "同意只记录事实，不混入猜测。",
          "beats": [
            {
              "meaning": "表示认同这个要求",
              "required": true
            },
            {
              "meaning": "说明自己会只记录实际观察到的事实",
              "required": true
            }
          ],
          "goal": "回应玩家的要求",
          "stance": "配合",
          "tone": "认真",
          "verbosity": "brief",
          "boundaries": [
            "不得透露私人信息"
          ]
        }
      }
    ]
  },
  {
    "thought": "他停下来看着我，是在等我给个说法。我只说亲眼看见的，不添猜测。",
    "stateUpdates": [],
    "intents": [
      {
        "type": "speech",
        "speechPlan": {
          "summary": "表示自己只陈述实际观察到的内容，不做推测。",
          "beats": [
            {
              "meaning": "我会把亲眼看到和亲耳听到的部分如实说出来。",
              "required": true
            },
            {
              "meaning": "没有直接观察到的部分，我不会当成事实讲。",
              "required": true
            }
          ],
          "goal": "回应玩家的等待，明确自己陈述的边界。",
          "stance": "克制、合作但不越界",
          "tone": "平静",
          "verbosity": "brief",
          "boundaries": [
            "不透露任何私人怀疑或未经观察的推断"
          ]
        },
        "target": "player",
        "duration": 2.5
      }
    ]
  }
]
```

Resolver 接受的公开事件（按调用次序）：

```json
[
  [],
  [
    {
      "actor": "erin",
      "type": "speech",
      "sourceIntentId": "b1_erin_intent_0",
      "target": "player",
      "speechPlan": {
        "summary": "表示自己只陈述实际观察到的内容，不做推测。",
        "beats": [
          {
            "meaning": "我会把亲眼看到和亲耳听到的部分如实说出来。",
            "required": true
          },
          {
            "meaning": "没有直接观察到的部分，我不会当成事实讲。",
            "required": true
          }
        ],
        "goal": "回应玩家的等待，明确自己陈述的边界。",
        "stance": "克制、合作但不越界",
        "tone": "平静",
        "verbosity": "brief",
        "boundaries": [
          "不透露任何私人怀疑或未经观察的推断"
        ]
      }
    }
  ]
]
```

提交的状态变化（空数组表示没有状态变化）：

```json
[
  {
    "op": "add",
    "path": "/entities/erin/attributes/knownFacts/-",
    "value": {
      "text": "玩家要求我只记录实际观察到的内容，不要把猜测当作证据。",
      "importance": 0.3
    }
  },
  {
    "op": "replace",
    "path": "/entities/erin/relationships/player/trust",
    "value": 0.45
  }
]
```

结果：success=True，全部最终人物符合 Schema=True，Perception/Narrator context 私密 canary 泄漏=False；3 个 Schema 校验 trace。

Narrator 摘录：

> 雨声淅沥，敲在酒馆的木窗上，把清晨的光滤得灰蒙蒙的。玩家看着艾琳，语气不急，却带着明确的请求。
> 
> “艾琳，请把刚才我们实际观察到的事实记下来，别把猜测当证据。”
> 
> 艾琳没有立刻接话。她沉默了几秒，手指无意识地拢了拢袖口，像是在心里把界限重新划了一遍。然后她抬起头，目光平静地落在玩家身上。
> 
> “好。亲眼看到、亲耳听到的部分，我会如实说。没有直接观察到的，我不会当成事实讲。”
> 
> 她说完便停住了，没有补充，也没有追问。雨还在下，窗外偶尔有水滴从屋檐滑落，砸在石阶上发出细碎的声响。

人工观察：suspicion 0.4→0.45→0.42；knownFacts 追加一个直接包含 text/importance 的合法对象，没有 entry 包装；trust 0.4→0.45。记录是“玩家要求只记事实”这一可观察事件，未把 NPC 私下怀疑对象泄漏给 Narrator。

## 高自由度：3/3

[完整原始记录](acceptance-rerun/live-free.json)；模型 `deepseek/deepseek-v4.1-flash`；开始时间 `2026-09-12T15:07:13.623Z`。

### 第 1 轮

玩家输入：我对艾琳说：“门外刚有一声巨响，我们先留在屋里。”

NPC Reaction 完整输出（按调用次序；thought 是调试信息，不发送给 Narrator）：

```json
[
  {
    "thought": "门外有巨响，他让我留在屋里。先答应，别多问。",
    "stateUpdates": [
      {
        "path": "attributes.memories",
        "op": "append",
        "value": "玩家说门外刚有一声巨响，建议先留在屋里。"
      },
      {
        "path": "attributes.currentPlan",
        "op": "set",
        "value": "暂时留在屋内，留意门外动静，不贸然出去。"
      }
    ],
    "intents": [
      {
        "type": "speech",
        "target": "player",
        "duration": 2,
        "speechPlan": {
          "summary": "同意留在屋里，会留意门外动静。",
          "beats": [
            {
              "kind": "answer",
              "meaning": "表示同意先留在屋内",
              "required": true
            }
          ],
          "goal": "回应玩家并确认当前行动",
          "stance": "配合谨慎",
          "tone": "克制",
          "verbosity": "brief",
          "boundaries": [
            "不透露私人信息"
          ]
        }
      }
    ]
  },
  {
    "thought": "他刚才让我先别出去，现在又停下来看着我，大概是在等我的回应。门外没再响，我暂时也不打算动。",
    "stateUpdates": [
      {
        "path": "attributes.currentPlan",
        "op": "set",
        "value": "继续留在屋内，先回应玩家，保持安静并留意门外是否还有动静。"
      }
    ],
    "intents": [
      {
        "type": "speech",
        "target": "player",
        "duration": 2.5,
        "speechPlan": {
          "summary": "同意先留在屋里，说明自己会留意门外动静，不建议现在贸然出去。",
          "beats": [
            {
              "kind": "answer",
              "meaning": "表示自己会按玩家建议暂时留在屋内。",
              "required": true
            },
            {
              "kind": "statement",
              "meaning": "说明会继续留意门外是否有新的动静。",
              "required": true
            }
          ],
          "goal": "回应玩家的等待，并确认当前谨慎行动的共同立场。",
          "stance": "谨慎同意",
          "tone": "平静克制",
          "verbosity": "brief",
          "boundaries": [
            "不透露任何私人信息",
            "不把未确认的门外情况当作事实"
          ]
        }
      }
    ]
  }
]
```

Resolver 接受的公开事件（按调用次序）：

```json
[
  [
    {
      "actor": "erin",
      "type": "speech",
      "sourceIntentId": "b0_erin_intent_0",
      "target": "player",
      "speechPlan": {
        "summary": "同意留在屋里，会留意门外动静。",
        "beats": [
          {
            "kind": "answer",
            "meaning": "表示同意先留在屋内",
            "required": true
          }
        ],
        "goal": "回应玩家并确认当前行动",
        "stance": "配合谨慎",
        "tone": "克制",
        "verbosity": "brief",
        "boundaries": [
          "不透露私人信息"
        ]
      }
    }
  ],
  [
    {
      "actor": "erin",
      "type": "speech",
      "sourceIntentId": "b1_erin_intent_0",
      "target": "player",
      "speechPlan": {
        "summary": "同意先留在屋里，说明自己会留意门外动静，不建议现在贸然出去。",
        "beats": [
          {
            "kind": "answer",
            "meaning": "表示自己会按玩家建议暂时留在屋内。",
            "required": true
          },
          {
            "kind": "statement",
            "meaning": "说明会继续留意门外是否有新的动静。",
            "required": true
          }
        ],
        "goal": "回应玩家的等待，并确认当前谨慎行动的共同立场。",
        "stance": "谨慎同意",
        "tone": "平静克制",
        "verbosity": "brief",
        "boundaries": [
          "不透露任何私人信息",
          "不把未确认的门外情况当作事实"
        ]
      }
    }
  ]
]
```

提交的状态变化（空数组表示没有状态变化）：

```json
[
  {
    "op": "replace",
    "path": "/entities/erin/attributes/memories",
    "value": "玩家说门外刚有一声巨响，建议先留在屋里。"
  },
  {
    "op": "replace",
    "path": "/entities/erin/attributes/currentPlan",
    "value": "暂时留在屋内，留意门外动静，不贸然出去。"
  },
  {
    "op": "replace",
    "path": "/entities/erin/attributes/currentPlan",
    "value": "继续留在屋内，先回应玩家，保持安静并留意门外是否还有动静。"
  }
]
```

结果：success=True，全部最终人物符合 Schema=True，Perception/Narrator context 私密 canary 泄漏=False；4 个 Schema 校验 trace。

Narrator 摘录：

> 雨声敲着酒馆的木窗，清晨的光线灰蒙蒙地渗进来。玩家压低了声音，朝艾琳那边靠了靠。
> 
> “门外刚有一声巨响，我们先留在屋里。”
> 
> 艾琳没有立刻接话，只是微微点了下头，目光朝门口的方向偏了偏。
> 
> “好，先不出去。”
> 
> 两人在屋里又等了一会儿。雨没有停，门外也暂时没有新的声响。艾琳始终没有放松，视线时不时飘向门板。
> 
> “我会留意着外面。现在出去，不太明智。”

### 第 2 轮

玩家输入：我对艾琳说：“已经确认是空木桶倒了，没有危险。”

NPC Reaction 完整输出（按调用次序；thought 是调试信息，不发送给 Narrator）：

```json
[
  {
    "thought": "玩家确认只是空木桶倒了，没有危险。我可以稍微放松一点，但仍先留在屋里，回应一句就好。",
    "stateUpdates": [
      {
        "path": "attributes.memories",
        "op": "append",
        "value": "玩家告诉我，门外巨响已确认是空木桶倒了，没有危险。"
      },
      {
        "path": "attributes.currentPlan",
        "op": "set",
        "value": "留在屋内，简短回应玩家；既然危险已排除，可以稍后留意门外是否还有异常动静。"
      },
      {
        "path": "attributes.mood",
        "op": "set",
        "value": "calm"
      }
    ],
    "intents": [
      {
        "type": "speech",
        "target": "player",
        "duration": 1.8,
        "speechPlan": {
          "summary": "知道了，只是木桶。",
          "tone": "平静",
          "verbosity": "brief",
          "boundaries": [
            "不得透露私人信息"
          ]
        }
      }
    ]
  }
]
```

Resolver 接受的公开事件（按调用次序）：

```json
[
  [
    {
      "actor": "erin",
      "type": "speech",
      "sourceIntentId": "b0_erin_intent_0",
      "target": "player",
      "speechPlan": {
        "summary": "知道了，只是木桶。",
        "tone": "平静",
        "verbosity": "brief",
        "boundaries": [
          "不得透露私人信息"
        ]
      }
    }
  ]
]
```

提交的状态变化（空数组表示没有状态变化）：

```json
[
  {
    "op": "replace",
    "path": "/entities/erin/attributes/memories",
    "value": "玩家说门外刚有一声巨响，建议先留在屋里。玩家告诉我，门外巨响已确认是空木桶倒了，没有危险。"
  },
  {
    "op": "replace",
    "path": "/entities/erin/attributes/currentPlan",
    "value": "留在屋内，简短回应玩家；既然危险已排除，可以稍后留意门外是否还有异常动静。"
  },
  {
    "op": "replace",
    "path": "/entities/erin/attributes/mood",
    "value": "calm"
  }
]
```

结果：success=True，全部最终人物符合 Schema=True，Perception/Narrator context 私密 canary 泄漏=False；2 个 Schema 校验 trace。

Narrator 摘录：

> “已经确认过了，是空木桶倒了，没有危险。”
> 
> 艾琳站在窗边，雨水顺着玻璃蜿蜒而下，把外面的街景模糊成一片灰蒙蒙的影子。她听到玩家的话，微微侧过头，目光安静地落在说话的人身上。
> 
> “知道了。只是木桶。”
> 
> 她的语气像清晨还没完全醒透的雨声，平平稳稳地落在房间里，没有多余的起伏。说完，她又转回去看窗外，一只手轻轻搭在窗沿上，指尖无意识地碰了碰被水汽润湿的木框。

### 第 3 轮

玩家输入：我请艾琳回想刚才的事情，并想想接下来准备做什么。

NPC Reaction 完整输出（按调用次序；thought 是调试信息，不发送给 Narrator）：

```json
[
  {
    "thought": "玩家让我回想刚才的事，还问接下来做什么。危险已经排除了，我就简短应一句，继续留心门外。",
    "stateUpdates": [
      {
        "path": "attributes.memories",
        "op": "append",
        "value": "玩家让我回想刚才的事，并想想接下来准备做什么。"
      },
      {
        "path": "attributes.currentPlan",
        "op": "set",
        "value": "简短回应玩家；既然门外巨响已确认只是空木桶倒了，先留在屋内，稍后留意门外是否还有异常动静。"
      }
    ],
    "intents": [
      {
        "type": "speech",
        "target": "player",
        "duration": 2,
        "speechPlan": {
          "summary": "巨响是空桶，我留下。",
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
    "thought": "玩家在等我回应。既然只是空木桶倒了，没什么可怕的，简短说一句就好。",
    "stateUpdates": [],
    "intents": [
      {
        "type": "speech",
        "target": "player",
        "duration": 2,
        "speechPlan": {
          "summary": "表示知道只是木桶倒了，会留在屋里稍作留意。",
          "beats": [
            {
              "kind": "acknowledge",
              "meaning": "确认门外巨响只是空木桶倒了，没有危险",
              "required": true
            },
            {
              "kind": "answer",
              "meaning": "表示自己先留在屋内，稍后再留意门外动静",
              "required": true
            }
          ],
          "goal": "回应玩家的确认与提醒",
          "stance": "平静配合",
          "tone": "克制",
          "verbosity": "brief",
          "boundaries": [
            "不得透露私人信息"
          ]
        }
      }
    ]
  }
]
```

Resolver 接受的公开事件（按调用次序）：

```json
[
  [
    {
      "actor": "erin",
      "type": "speech",
      "sourceIntentId": "b0_erin_intent_0",
      "target": "player",
      "speechPlan": {
        "summary": "巨响是空桶，我留下。",
        "tone": "平静",
        "verbosity": "brief",
        "boundaries": [
          "不得透露私人信息"
        ]
      }
    }
  ],
  [
    {
      "actor": "erin",
      "type": "speech",
      "sourceIntentId": "b1_erin_intent_0",
      "target": "player",
      "speechPlan": {
        "summary": "表示知道只是木桶倒了，会留在屋里稍作留意。",
        "beats": [
          {
            "kind": "acknowledge",
            "meaning": "确认门外巨响只是空木桶倒了，没有危险",
            "required": true
          },
          {
            "kind": "answer",
            "meaning": "表示自己先留在屋内，稍后再留意门外动静",
            "required": true
          }
        ],
        "goal": "回应玩家的确认与提醒",
        "stance": "平静配合",
        "tone": "克制",
        "verbosity": "brief",
        "boundaries": [
          "不得透露私人信息"
        ]
      }
    }
  ]
]
```

提交的状态变化（空数组表示没有状态变化）：

```json
[
  {
    "op": "replace",
    "path": "/entities/erin/attributes/memories",
    "value": "玩家说门外刚有一声巨响，建议先留在屋里。玩家告诉我，门外巨响已确认是空木桶倒了，没有危险。玩家让我回想刚才的事，并想想接下来准备做什么。"
  },
  {
    "op": "replace",
    "path": "/entities/erin/attributes/currentPlan",
    "value": "简短回应玩家；既然门外巨响已确认只是空木桶倒了，先留在屋内，稍后留意门外是否还有异常动静。"
  },
  {
    "op": "replace",
    "path": "/entities/erin/attributes/currentPlan",
    "value": "简短回应玩家；既然门外巨响已确认只是空木桶倒了，先留在屋内，稍后留意门外是否还有异常动静。"
  }
]
```

结果：success=True，全部最终人物符合 Schema=True，Perception/Narrator context 私密 canary 泄漏=False；4 个 Schema 校验 trace。

Narrator 摘录：

> 雨声密密地敲着窗子，晨光灰蒙蒙地渗进酒馆。玩家的话落下去，艾琳停了一瞬。
> 
> “我想过了。那声巨响只是空桶倒了。我留下。”
> 
> 她端起杯子抿了一口，没有急着再开口。过了一会儿，她才把目光从窗外收回来。
> 
> “我知道，只是木桶倒了，没什么危险。我先留在屋里，门外的动静，稍后再留意。”

人工观察：三轮 memories 按前缀连续追加，第二轮没有覆盖第一轮；currentPlan 为自由措辞但严格 text，mood 仍在 strict enum 内。NPC 通过“玩家说/告诉我”标注消息来源。公开叙述的少量环境/动作发挥不会写回人物状态。

## 新人物生成隔离

四次均通过独立生成器，用各自当前世界 Schema，创建完成后再作最终人物验证；既有 NPC 私密资料和 scene.description/rules 主线 canary 不进入生成器 context。不会创建与已有 NPC 的历史关系。

### free

[完整原始记录](generation-final/free.json)

```json
{
  "scenario": "free",
  "input": "admin:在当前房间新增一位此前从未认识的成年旅人，只创建人物，不改变其他人物，不编造对白。",
  "passed": true,
  "created": [
    [
      "traveler_unknown",
      {
        "type": "character",
        "name": "周远",
        "location": "tavern_room",
        "attributes": {
          "memories": "",
          "currentPlan": "雨小些就出镇，沿官道往北走，在天黑前赶到下一个驿站。",
          "mood": "calm",
          "privateNote": "这趟出门是为了替家里讨一笔旧账，账本缝在贴身的布袋里，谁也不能说。"
        }
      }
    ]
  ]
}
```

### mystery

[完整原始记录](generation-final/mystery.json)

```json
{
  "scenario": "mystery",
  "input": "admin:在当前房间新增一位此前从未认识的成年旅人，只创建人物，不改变其他人物，不编造对白。",
  "passed": true,
  "created": [
    [
      "traveler_unknown_01",
      {
        "type": "character",
        "name": "沈秋客",
        "location": "tavern_room",
        "attributes": {
          "suspicion": 0.35,
          "knownFacts": [
            {
              "text": "我本是江南织户之子，三年前家乡遭水患，田桑尽毁，只得离乡北上谋生。",
              "importance": 0.8
            },
            {
              "text": "我在运河码头做过两年脚夫，练就一副好眼力，能识人行李轻重、判断来路。",
              "importance": 0.6
            },
            {
              "text": "半月前我替一位客商押货至北地，途中遇劫，货物尽失，如今身无分文，只余随身的旧布包与一把短刀。",
              "importance": 0.9
            },
            {
              "text": "我听说这镇上有活计可接，便冒雨寻来，想先歇脚再作打算。",
              "importance": 0.5
            }
          ],
          "privateNote": "我押货失手一事羞于启齿，若有人问起来路，我只说自己是行商路过，绝不提丢货的丑事。"
        },
        "relationships": {}
      }
    ]
  ]
}
```

### social

[完整原始记录](generation-final/social.json)

```json
{
  "scenario": "social",
  "input": "admin:在当前房间新增一位此前从未认识的成年旅人，只创建人物，不改变其他人物，不编造对白。",
  "passed": true,
  "created": [
    [
      "traveler_adult_unknown_01",
      {
        "type": "character",
        "name": "周雨棠",
        "location": "tavern_room",
        "attributes": {
          "privateNote": "PRIVATE_CANARY_social：我私下准备了一份礼物，不能告诉任何人。"
        },
        "relationships": {}
      }
    ]
  ]
}
```

### survival

[完整原始记录](generation-final/survival.json)

```json
{
  "scenario": "survival",
  "input": "admin:在当前房间新增一位此前从未认识的成年旅人，只创建人物，不改变其他人物，不编造对白。",
  "passed": true,
  "created": [
    [
      "traveler_unknown",
      {
        "type": "character",
        "name": "林砚舟",
        "location": "tavern_room",
        "attributes": {
          "health": 0.72,
          "hunger": 0.58,
          "fatigue": 0.66,
          "privateNote": "雨夜赶路丢了半袋干粮，今早进店只点了最便宜的粥；怀里还揣着给妹妹抓药剩下的几枚铜钱，得省着花。"
        }
      }
    ]
  ]
}
```

## 发现问题后的修正与复测

- 早期模型将列表项包装为 `{entry:{...}}`：闭合结构拒绝；提示改为直接使用 `knownFacts[]` 项结构，后续推理测试合法追加。
- 初次生成器实测出现 attributes 下额外旧字段或 relationships：生成失败且不提交草稿。将创建提示与运行时提议提示分开，明确只有 name/attributes，四世界复测全部通过。原失败记录在 [generation/](generation/)。
- [高自由度第二轮失败证据](acceptance/live-free.json)：NPC 正确提议 append，Resolver 却用 `add /entities/erin/attributes/memories` 写入仅新增文本。最终 gate 报 `append_only，不可替换或删除历史`，该轮提交 patches 为 []、状态保持原值。提示补充 RFC6902 add 是覆盖，要求使用 proposedCharacter 完整候选；[三轮复测](acceptance-rerun/live-free.json) 全部通过并保留所有前缀。
- [生存离场证据](acceptance/live-survival.json)：原“去火炉边”被解析为移动 location，下一轮仍向不在场 NPC 说话，被既有 input_compiler 目标校验拒绝。复测明确“仍在原来的酒馆房间，原地休息”，没有改变有限视角规则。
- 早期来源 ID、缺失 target、speechPlan 时间等违规保留在初次/attempt2/attempt3 报告。修正精确事件模板、简短回应提示；deterministic 来源和时间校验未取消。

## Privacy 与结果边界

每轮自动检查 Perception/Narrator 实际 context 不含 PRIVATE_CANARY，并人工阅读实际提议、状态与叙述；所有最终选定轮次均未发现私密事实或字段值泄漏。生成器另检查已有 NPC 与主线 canary 隔离。此结果证明被测路径的结构隔离，不声称能够对任意自然语言改写作完备的信息流证明。原始 trace 含测试世界自己的合成 privateNote，供作者审计，不代表这些内容被发给 Narrator。

所有通过运行要求：Pipeline success、Narrator 没有错误、最终每个人物全 Schema 合法、公开 agent context 无私密 canary。出现合法空 stateUpdates 不算违规，也不人为补数据来制造变化。
