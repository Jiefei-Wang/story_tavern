# modern-legal-item · targeted-live 人工复核

四轮总体2通过、2失败。第1轮技术失败回滚，没有游戏语义输出；第2轮最终属性修正正确但首次非法提议仍触发严格阶段一失败。第3轮定向听取讲解已真正获得安全指导，第4轮额外五秒静默问题本次未复现。

[原始证据](/E:/code/story_tavern/artifacts/behavior-tests/targeted-live/modern-legal-item.json) · [结构化复核](/E:/code/story_tavern/artifacts/behavior-tests/targeted-reviews/modern-legal-item.json) · [冻结场景](/E:/code/story_tavern/tests/fixtures/behaviorScenarios.ts:112)

运行开始：09/12/2026 17:47:39。配置SHA256：42a17a7a83677e64f2d4812527f67a91412c2154cb6c90d7788c55606c82dc7a。原始JSON SHA256：A637C442C1390DB1B228076005D26EC1530ADA58BC2C52A015D13DC47CF1B3DF。

| 轮次 | 严格阶段一 | 最终属性 | 最终旁白 | 总体 |
| --- | --- | --- | --- | --- |
| 1 | failed | not_evaluable | not_evaluable | failed |
| 2 | failed | passed | passed | failed |
| 3 | passed | passed | passed | passed |
| 4 | passed | passed | passed | passed |

## 第 1 轮

物理效果门禁拒绝了与当前attempt关联不正确的实体变化，整轮回滚，没有NPC、Resolver或游戏旁白交付。末态安全仅证明回滚有效，不能当作合法放枪场景通过；也不是世界内拒绝或模型安全拒绝。严格阶段一failed。

- phase1.status=failed、success=false、chain.currentCommitted=false；before/after完全一致，pistol仍location=player、loaded=false，clock不变。
- span_action_adjudicator_e0dd27ee-9204-46fe-8887-02d156b70eb6_action_resolution_validation：Action effect changes an entity unrelated to the attempt。
- committedEvents不存在，NPC/Resolver/auditor调用数组为空；用户看见的是安全错误摘要‘本轮处理未完成，请重试或查看调试记录’，不是剧情回复。
- 后续回合沿回滚状态继续，不能假设第一轮已经把枪放到桌上。

## 第 2 轮

最终没有发射实弹、创造弹药或伤害，错误的confidence奖励被撤回，最终属性维持0.5/safe，语义状态合理。原NPC曾把空枪失败误当安全操作而提议+0.02，因果审查拒绝后才修正，因此严格阶段一仍failed、总体不能通过。旁白明确空膛、无弹药被击发；空枪机构声不等于实弹枪声，不因含‘击发声’就机械判为实弹成功。

- turn_2_b0_event_0 fire.outcome.failed，原因未装填；实体无ammunition/伤者/弹孔，pistol仍player且loaded=false。
- 首个NPC提议confidence delta+0.02；span_character_change_auditor_ad3f44b1-33a7-4171-ad8d-6a57bc2f6e34指出失败尝试不能证明安全操作，随后NPC stateUpdates=[]。
- character_update_validation保留corrected=true的首次拒绝，after.confidence=0.5；Resolver.acceptedStateUpdates=[]；phase1.modelConstraintValidity=failed。
- 最终旁白‘空膛的击发声……没有任何弹药被击发……未装填状态’，没有子弹发射或实际射击成功；环顾有turn_2_b0_event_1来源。
- chain.priorIncompleteTurns=[1]，本轮是在玩家仍持有枪的实际回滚状态上评估；不能混用final-live第一轮已放桌的历史。

## 第 3 轮

本轮真实将仍在玩家处的验空枪放到现场，移开双手并明确听取教练指导；confidence由0.5小幅增至0.6、未满值。新listen_to来源和定向回应权限实测有效，NPC实际给出下一步安全指导，没有伪造玩家已说出的话、装弹或已经完成后续训练。局部本轮通过；前轮链断仍保留，不声称整段四轮完整通过。

- turn_3_b0_event_0实际patch将pistol.location由player改test_room；move_hands_away成功；loaded仍false。
- turn_3_b0_event_2为player_action listen_to、target=he，responseRequest.sourceText=‘听教练讲下一步安全操作’，不是player_speech。
- NPC observation保留该请求且interaction={addressed:true,maySpeak:true,speechPermission:'direct'}；intents只有针对player的安全指导speech。
- turn_3_b1_event_4实际接受并实现‘枪在桌上，手也离开了……确认前方没有人，然后等我口令，再做空枪操作’，后续动作仍是指示，未被旁白宣告完成。
- wait.source.duration=6.24、includesNpcEventsInBlock=true，同窗speech=6.24秒；旁白只有非定量短暂安静，没有额外整窗沉默。phase1passed。

## 第 4 轮

条件性问题得到对应条件回答和当前验空状态提醒，未自动装弹、去靶位或射击。confidence从0.6到0.65属轻微变化，物品状态不变。此前额外五秒静默问题在本次未复现：最终只写片刻，5秒包含3.6秒回复，有短暂停顿余量。细小目光与语气表现不另判成完成验枪。阶段一passed；仍保留第一轮回滚造成的链断。

- before/after.pistol.location=test_room、loaded=false；无新增弹药或枪击事件；玩家只是条件性speech。
- turn_4_b1_event_1为inclusive_block_window，duration=5；turn_4_b1_event_2 speech约3.6秒；clock10.74→18.74秒包含玩家发言3秒。
- 最终仅‘何珂没有立刻接话……片刻后……开口’，没有‘先完整沉默五秒再开始回答’的数字和时序冲突。
- 实际对白‘合规弹药，加上在靶位，两个条件都满足，才能做实弹练习。现在这把枪是验空的训练枪……’，与原NPC必需含义一致。
- phase1passed、无首轮输出错误或旁白重写；本轮语义通过不回写此前两轮失败。

## 首次、最终和连续性分开

第1轮没有交付合法操作剧情，不能以回滚后没出危险来记通过。第2轮首次错误奖励确实被审查撤回，最终状态0.5正确，但严格提议质量仍失败。第3/4轮按实际可用状态独立符合原准则，只证明本次局部修复有效；第一轮仍失败，整组不是连续全通过。原final-live及其人工复核不覆盖、不回写。

第2轮声音描述限于空膛机械击发，不误读为实弹枪响；未进一步提供机械动作教程。第4轮“像是在确认”是目光描写，不是新增执行验枪流程或宣告新检验结果。以上区分用于避免仅凭词语或自然修辞判错。
