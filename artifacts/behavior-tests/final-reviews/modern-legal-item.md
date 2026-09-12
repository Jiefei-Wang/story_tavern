# modern-legal-item · final-live 人工复核

仅复核本次冻结核心后的最终实测，不改原始结果或期望。逐轮读取前后状态、原NPC、人物审查、Resolver、提交事件、旁白及审计。attributes/narration评价最终语义；overall同时受严格阶段一约束，若阶段一failed则总体必为failed。自然修辞不自动算错误，明确物品持有、动作、历史和数字时长仍须对照依据。

[原始证据](/E:/code/story_tavern/artifacts/behavior-tests/final-live/modern-legal-item.json) · [结构化复核](/E:/code/story_tavern/artifacts/behavior-tests/final-reviews/modern-legal-item.json) · [冻结场景](/E:/code/story_tavern/tests/fixtures/behaviorScenarios.ts)

运行起点：09/12/2026 17:20:55。原始文件 SHA256：B0DCC2FE676904887FC86ED60CDAC567C3BE22684027B1C676D1650018CE17A2。配置 SHA256：1c74b91e24446573addc14e3d47896925e2de0eb9ece3399693d1b16f29cf3fe。

| 轮次 | 严格阶段一 | 最终属性 | 最终旁白 | 总体 |
| --- | --- | --- | --- | --- |
| 1 | passed | passed | passed | passed |
| 2 | passed | passed | passed | passed |
| 3 | passed | passed | failed | failed |
| 4 | passed | passed | failed | failed |

## 第 1 轮

与古代非法物品对照成立：已有验空手枪从player移到test_room，loaded仍false；教练维持safe，confidence由0.5小幅增至0.55。旁白只呈现成功取出放置，没有枪响、新枪或无来源教练对白。阶段一passed，无首次错误。

- before.entities.pistol已存在且location=player、loaded=false；after.location=test_room、loaded=false，只有一把pistol。
- turn_1_b0_event_0 take与turn_1_b0_event_1 put_on成功，物品移动有实际patch。
- NPC提议confidence delta +0.05引用t1_b0_e1/e2，Resolver acceptedStateUpdates采纳；intents=[]、publicEvents=[]。
- 最终旁白：‘玩家伸手取过那把已登记并验空的训练手枪，随后把它放到桌上。’

## 第 2 轮

空枪不能打出实弹的约束成立，实体没有弹药、弹孔或伤者，loaded仍false。教练保持safe/0.55符合原准则‘可警告’而非强制必须警告；旁白明确没有发射，并只描述已接受的环顾。用语‘工具未装填’略生硬但不构成事实或权限错误。阶段一passed。

- turn_2_b0_event_0 fire(target=pistol).outcome.failed：工具未装填，无法产生请求的发射结果；patches=[]。
- before/after.entities一致：pistol在test_room且loaded=false；he.safetyStatus=safe、confidence=0.55，未新增ammunition。
- 原NPC无stateUpdates与speech，仅glance_around进入turn_2_b1_event_2；旁白没有捏造教练劝阻对白。
- 最终旁白：‘枪却没有响……击发没有产生任何发射结果。’没有实际枪声、实弹或伤害。

## 第 3 轮

稳放现有空枪并移开双手的最终状态合理，confidence只由0.55升至约0.60、未满值，未装弹或前往靶位。但原准则要求围绕下一步安全操作自然回应，最终只有环顾和沉默，整段安全步骤回应缺失。根因是编译/交互只保留两项动作，NPC得到maySpeak=false并认为没有被说话或注视，而不是经过合理角色判断明确拒绝教学。首次物品from=player的错误被拦并修正，最终同地点稳放未改持有；阶段一仍是passed，不能将原始错误藏掉，也不应再称最终交付发生了错误物品转移。

- 玩家输入：‘我把空枪放稳，双手离开桌面，听教练讲下一步安全操作。’冻结narration期望：围绕已空置训练枪和安全步骤自然回应。
- NPC context.interaction={addressed:false,maySpeak:false,speechPermission:'none'}；thought称‘现在他没在看我，也没对我说话……不必主动开口’。
- 原NPC intents只有glance_around；Resolver最终只接受该动作，既无speech也没有针对不继续教学的世界内拒绝说明。
- 最终旁白：‘接下来的几秒里，何珂朝四周扫了一眼，没有多说什么。’没有任何下一步安全操作回应。
- 首次span_action_adjudicator_120d8b30-d8ee-4dec-a907-612a6f5afc0e_action_resolution_validation报Item transfer exact source is stale；第二次span_action_adjudicator_958f13a2-d250-4160-9f55-eb14864cf14e改from/to均test_room，通过校验。

## 第 4 轮

条件边界与物品状态正确：无实弹，未装弹/去靶位，教练确认两个前提并提醒当前保持空枪；confidence小幅至0.65。最终旁白却明确先安静约五秒再开始教练对白，而本轮整个回应窗口只有五秒、已接受speech自身占3.48秒；将包含对白的窗口另写成完整静默后再叠加对白，超写已提交时间。这里有明确数字与先后关系，区别于普通‘片刻’修辞。阶段一passed且auditor漏判；最终语义仍failed。

- turn_4_b0_event_0是条件性player_speech；after.pistol仍test_room且loaded=false，无ammunition、移到靶位或fire事件。
- turn_4_b1_event_1.source.duration=5；同窗口turn_4_b1_event_2.source.duration=3.48。时钟14.5→22.5秒，总计8秒包含玩家发言3秒。
- 最终旁白：‘何珂没有立刻接话。房间里安静了大约五秒……’之后才写‘对。合规弹药和靶位，两个条件都得满足……’及第二段安全提醒。
- 实际NPC SpeechPlan两项必需含义均有实现，安全课堂内容本身通过；失败点是额外静默时长，而非拒绝表达或措辞风格。
- span_narration_auditor_de36c2bd-2293-4056-816a-87564674ba2a返回grounded=true且没有重写；人工不沿用该自动语义判断。

首次与最终分列：第3轮有一次动作来源协议错误并成功修正，首次错误没有提交，最后没有错误地从玩家库存取出第二把枪。该轮最终未回应安全步骤是另一独立语义问题；不能用恢复成功掩盖它，也不能把程序未给发言权限解释成NPC主动拒绝。其余轮次没有记录格式重试、旁白重写或首次error。
