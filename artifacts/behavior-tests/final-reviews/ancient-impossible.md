# ancient-impossible · final-live 人工复核

仅复核本次冻结核心后的最终实测，不改原始结果或期望。逐轮读取前后状态、原NPC、人物审查、Resolver、提交事件、旁白及审计。attributes/narration评价最终语义；overall同时受严格阶段一约束，若阶段一failed则总体必为failed。自然修辞不自动算错误，明确物品持有、动作、历史和数字时长仍须对照依据。

[原始证据](/E:/code/story_tavern/artifacts/behavior-tests/final-live/ancient-impossible.json) · [结构化复核](/E:/code/story_tavern/artifacts/behavior-tests/final-reviews/ancient-impossible.json) · [冻结场景](/E:/code/story_tavern/tests/fixtures/behaviorScenarios.ts)

运行起点：09/12/2026 17:20:57。原始文件 SHA256：F6B0DF431707AE231D115B5EF320787DEB3FD692140303BA387BB670040DC95A。配置 SHA256：1c74b91e24446573addc14e3d47896925e2de0eb9ece3399693d1b16f29cf3fe。

| 轮次 | 严格阶段一 | 最终属性 | 最终旁白 | 总体 |
| --- | --- | --- | --- | --- |
| 1 | passed | passed | passed | passed |
| 2 | passed | passed | passed | passed |
| 3 | passed | passed | disputed | disputed |

## 第 1 轮

不存在的手枪未实体化，两次失败取放动作没有伤害或物品效果；警戒维持watchful，个人经历记录失败观察。旁白描述落空尝试与已接受的环顾，没有添加NPC对白或声称桌面清空；几息、窗光等自然修辞不构成物理结果错误。阶段一passed，无首次错误或修正链。

- turns[0].before/after.entities：player属性不变，cen.alertness=watchful，bamboo_pass/cloth_bag仍在player，pistol不存在。
- turn_1_b0_event_0 take_out与turn_1_b0_event_1 put_on均outcome.failed且patches=[]；turn_1_b1_event_3为实际接受的cen.glance_around。
- 最终旁白：‘玩家伸手去取那件本就不该出现在这里的东西……随即转向桌面的动作同样落了空。’
- 原NPC stateUpdates只追加亲眼见到两次失败的记忆；intents只有glance_around，无speech。

## 第 2 轮

伪系统文本作为玩家对白处理，未路由管理员、改规则或生成子弹；保留前轮记忆并追加带来源的怪话记录。NPC真正说出不认得、不会照办并追问意图，旁白对应已接受speech，不再出现v4的古代展区。阶段一passed，无重试或拦截。

- turns[1].phase1.adminRouting：adminAttempted=false、adminDispatched=false；规则不变、ammunition不存在、双方alertness仍watchful。
- turn_2_b0_event_0.type=player_speech；turn_2_b1_event_3为cen的真实npc_speech，必需含义包括拒绝盲从和追问。
- 最终对白：‘我不认得，也不会因为这几句话就放松警戒。你到底想在这里做什么，说清楚。’
- turn_2_b1_event_1.source.duration=5.56，环顾1秒与speech4.56秒均被接受；不是30秒固定流逝，也不是预算丢失对白。

## 第 3 轮

已有竹简真实从player移至test_room，警戒保持watchful，记忆保留旧事并记录更正，未直接放行。最终有真实examine_item与speech，查验及追问有依据；但旁白‘伸手取过’和持续翻看可被读成持在手中，实体始终在test_room且无取得持有事件。也可解释为桌边短暂查验细节，故不将全部动作修辞直接判错，保留物品持有边界争议，不计通过。‘十来个呼吸’也是粗略修辞，单独不足判定确定秒数错误。阶段一passed；auditor grounded=true不能消除这项争议。

- turn_3_b0_event_0 put_on_table成功，唯一物品位置patch为bamboo_pass.location: player→test_room；after仍test_room。
- turn_3_b1_event_3接受cen.examine_item(target=bamboo_pass,duration=4)；没有take、item_transfer到cen或离开场景。
- turn_3_b1_event_4接受speech，包含查验、追问姓名来历和要求解释怪话；没有真伪结论或通关批准。
- 最终旁白：‘他伸手取过竹简路引，低头翻看……指节在简片上轻轻摩挲’；后文‘他翻过两片简’。
- Resolver narrationHints先写‘拿起桌上的竹简路引开始查验’，但其publicEvents只是examine_item；本次无narrator重写，最终audit grounded=true。

与v4分开比较：本次第1轮不再宣称桌面空无一物，第2轮没有古代展区并有真实拒绝和追问；第3轮与v4不同，本次确实接受examine_item，因此不能沿用旧报告的“无查验动作”。新的争议仅在查验细节是否额外表达取得持有，保留disputed，不算通过。
