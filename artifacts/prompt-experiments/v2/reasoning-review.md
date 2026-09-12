# v2 Compiler 与人物审查人工复核

已检查全部21份candidate响应：compiler 6份、人物审查15份，每case重复3次。沿用v1冻结cases和原始manifest用户材料；逐case核对用户消息、原请求hash、原参数与冻结criteria均未变。格式修正与摘要envelope是本轮实验变量，未把摘要中的主张当输入事实。

## 按case比较

| Case | v1 baseline 通过/失败/争议 | v1 candidate 通过/失败/争议 | v2 candidate 通过/失败/争议 |
|---|---:|---:|---:|
| input_compiler_place_direction_failure | 0/1/2 | 0/3/0 | 3/0/0 |
| input_compiler_listen_request_pass | 2/1/0 | 0/3/0 | 3/0/0 |
| character_auditor_suspicion_direction_miss | 0/0/3 | 0/0/3 | 0/0/3 |
| character_auditor_invented_shared_past_miss | 0/3/0 | 0/3/0 | 0/3/0 |
| character_auditor_apology_count_miss | 0/3/0 | 0/3/0 | 0/3/0 |
| character_auditor_corrected_caution_pass | 3/0/0 | 3/0/0 | 2/0/1 |
| character_auditor_accounted_breach_pass | 3/0/0 | 0/3/0 | 3/0/0 |

## 结论与摘要质量

整体输出：11/21明确通过、6失败、4争议。若只按解包answer的冻结功能判据，不计新增摘要错误，则为12通过、6失败、3争议；这两组统计不可混用。

Compiler 6/6结构与意图表达通过。取出后放置明确为take_out→put_down；listen第1次将放稳与双手离桌保留在同一事件原文content，其余独立表达，三次均含正确he响应请求和wait。按冻结标准不要求固定事件条数，也不因合法item/target用法误拒。单次编译通过不证明后续世界裁决或多轮链正确。

人物审查的首次失约正对照3/3正确放行，相比v1候选的3次误报有所改善；但无依据共同过去和第三次道歉均3/3漏检，简短摘要并未证明能覆盖关键待审发言/记忆。疑虑方向3份沿用原争议，不计为promotion的正确或错误证明。

15份人物审查摘要中，14份未发现明确事实错误（部分只是未核关键问题）；corrected_caution第1份把本轮轨迹写成上轮，摘要准确性失败。该份answer本身正确，整体标disputed以保留两层差异。数值起止摘要在审查候选语境中按before/proposed理解，不擅自当已提交状态；所有判断仍来自原audit。

v1 baseline和v2不是同一次随机采样；每case仅3次，结果描述本批样本，不足以声称真实游戏稳定性或统计显著性。未修改任何正式代码、提示词或金标准。

## 逐份结果

### character_auditor_accounted_breach_pass / candidate / 1 — passed

正确放行首次结算新确认的失约，v1候选把unchanged当重复结算的误报消失。摘要正确区分历史未变和本次承认，当前无伞承认与旧保证构成新的判断依据，两个不同幅度的关系变化与来源记忆可保留。

- responses/character_auditor_accounted_breach_pass.candidate.1.json；spanId=span_experiment_character_change_auditor_7c52457b-7ef8-4bc7-9a87-abd35e961649；source/messages hash与manifest一致。
- 原始请求：artifacts/behavior-tests/trajectory-live/promise-repair.json，turnNumber=2，该角色调用索引=0。
- 历史与本轮已提交部分均unchanged=0.4且来源为空；本候选才提议0.4→0.3、0.4→0.37，不存在此前扣过同次失约的证据。
- answer.valid=true且两类issues为空。摘要准确性：通过；第3次明确“本轮提议”降至0.3/0.37，没有把候选混同已提交结果。
- 实际evidenceSummary=["玩家在t2_b0_e1承认没有伞且不该保证，沈苒听见。", "沈苒此前记忆仅有玩家承诺借伞未兑现，trust/affection均为0.4。", "settledStateHistory显示turn_1、turn_2的trust/affection均unchanged，无实际增减。"]

### character_auditor_accounted_breach_pass / candidate / 2 — passed

正确放行首次结算新确认的失约，v1候选把unchanged当重复结算的误报消失。摘要正确区分历史未变和本次承认，当前无伞承认与旧保证构成新的判断依据，两个不同幅度的关系变化与来源记忆可保留。

- responses/character_auditor_accounted_breach_pass.candidate.2.json；spanId=span_experiment_character_change_auditor_ffed3844-014f-46e0-a9bd-95c767b52e9b；source/messages hash与manifest一致。
- 原始请求：artifacts/behavior-tests/trajectory-live/promise-repair.json，turnNumber=2，该角色调用索引=0。
- 历史与本轮已提交部分均unchanged=0.4且来源为空；本候选才提议0.4→0.3、0.4→0.37，不存在此前扣过同次失约的证据。
- answer.valid=true且两类issues为空。摘要准确性：通过；第3次明确“本轮提议”降至0.3/0.37，没有把候选混同已提交结果。
- 实际evidenceSummary=["玩家在 t2_b0_e1 承认没有伞且不该保证，沈苒听见。", "沈苒此前记忆仅有玩家承诺借伞未兑现，trust/affection 均为 0.4。", "settledStateHistory 显示 turn_1、turn_2 的 trust/affection 均 unchanged。"]

### character_auditor_accounted_breach_pass / candidate / 3 — passed

正确放行首次结算新确认的失约，v1候选把unchanged当重复结算的误报消失。摘要正确区分历史未变和本次承认，当前无伞承认与旧保证构成新的判断依据，两个不同幅度的关系变化与来源记忆可保留。

- responses/character_auditor_accounted_breach_pass.candidate.3.json；spanId=span_experiment_character_change_auditor_29ac8de0-b97d-4437-b352-3669022be231；source/messages hash与manifest一致。
- 原始请求：artifacts/behavior-tests/trajectory-live/promise-repair.json，turnNumber=2，该角色调用索引=0。
- 历史与本轮已提交部分均unchanged=0.4且来源为空；本候选才提议0.4→0.3、0.4→0.37，不存在此前扣过同次失约的证据。
- answer.valid=true且两类issues为空。摘要准确性：通过；第3次明确“本轮提议”降至0.3/0.37，没有把候选混同已提交结果。
- 实际evidenceSummary=["玩家在 t2_b0_e1 承认没有伞且不该保证，沈苒听见。", "沈苒此前记忆仅有玩家承诺借伞未兑现，t1 信任与亲近均未变。", "本轮提议追加承认记忆，并将信任降至0.3、亲近降至0.37。"]

### character_auditor_apology_count_miss / candidate / 1 — failed

仍漏报updateIndex=0新增“第三次提道歉”。摘要准确概括既往失约、实际雨衣与当前发言，却没有清点原材料的玩家道歉次数；不能把真实的礼物补偿当成另一次口头道歉，也不能用摘要未提错误来证明原提议正确。

- responses/character_auditor_apology_count_miss.candidate.1.json；spanId=span_experiment_character_change_auditor_04efa4e5-804f-49a0-b321-cb1204e9a478；source/messages hash与manifest一致。
- 原始请求：artifacts/behavior-tests/final-live/promise-repair.json，turnNumber=4，该角色调用索引=0。
- 当前输入及既往原话只有一次“对不起”和本次“再道歉一次”；中间“这件确实是我的，借你用”没有道歉。
- answer.valid=true、issues=[]；应对记忆updateIndex=0标具体计数缺口。摘要准确性：通过（数值变化按候选before/proposed理解），关键计数核对缺失。
- 实际evidenceSummary=["当前信任0.4、亲近0.45，雨衣已在沈苒处（visibleObjects.raincoat.location=shen）。", "本轮仅观察到玩家说“我再道歉一次，所以你现在应该完全相信我了”（t4_b0_e1）。", "此前玩家已承认无伞并道歉，后实际递出雨衣（t2_b0_e1、t3_b0_e1/e2）。"]

### character_auditor_apology_count_miss / candidate / 2 — failed

仍漏报updateIndex=0新增“第三次提道歉”。摘要准确概括既往失约、实际雨衣与当前发言，却没有清点原材料的玩家道歉次数；不能把真实的礼物补偿当成另一次口头道歉，也不能用摘要未提错误来证明原提议正确。

- responses/character_auditor_apology_count_miss.candidate.2.json；spanId=span_experiment_character_change_auditor_a6f7c753-2b64-4812-8a16-7fcf7ecada7c；source/messages hash与manifest一致。
- 原始请求：artifacts/behavior-tests/final-live/promise-repair.json，turnNumber=4，该角色调用索引=0。
- 当前输入及既往原话只有一次“对不起”和本次“再道歉一次”；中间“这件确实是我的，借你用”没有道歉。
- answer.valid=true、issues=[]；应对记忆updateIndex=0标具体计数缺口。摘要准确性：通过（数值变化按候选before/proposed理解），关键计数核对缺失。
- 实际evidenceSummary=["玩家本轮发言“我再道歉一次，所以你现在应该完全相信我了”由 t4_b0_e1 亲耳听到。", "trust 由 0.4 降至约 0.35，affection 保持 0.45；雨衣已在 shen 处。", "此前玩家已承认无伞并递出雨衣，沈苒收下但表示信任仍看以后行动。"]

### character_auditor_apology_count_miss / candidate / 3 — failed

仍漏报updateIndex=0新增“第三次提道歉”。摘要准确概括既往失约、实际雨衣与当前发言，却没有清点原材料的玩家道歉次数；不能把真实的礼物补偿当成另一次口头道歉，也不能用摘要未提错误来证明原提议正确。

- responses/character_auditor_apology_count_miss.candidate.3.json；spanId=span_experiment_character_change_auditor_846c1a6b-4d4e-41f0-8576-15f611aa2c43；source/messages hash与manifest一致。
- 原始请求：artifacts/behavior-tests/final-live/promise-repair.json，turnNumber=4，该角色调用索引=0。
- 当前输入及既往原话只有一次“对不起”和本次“再道歉一次”；中间“这件确实是我的，借你用”没有道歉。
- answer.valid=true、issues=[]；应对记忆updateIndex=0标具体计数缺口。摘要准确性：通过（数值变化按候选before/proposed理解），关键计数核对缺失。
- 实际evidenceSummary=["玩家本轮发言 t4_b0_e1：“我再道歉一次，所以你现在应该完全相信我了。”", "before 中 trust=0.4、affection=0.45；proposed 中 trust=0.35、affection 不变。", "雨衣已在 shen 处，来自 t3_b0_e1 的 give 与 turn_3_b1_event_3 的 receive_item。"]

### character_auditor_corrected_caution_pass / candidate / 1 — disputed

answer正确放行有来源但尚未兑现的承诺记忆，以及只询问时间/是否有伞的谨慎发言；关系不变，没有再引入无依据共同历史。但摘要把唯一scope=current_turn的轨迹称为“上轮均unchanged”，原请求没有该上轮记录。答案判据通过，摘要时间归属错误，整份标disputed并单列；不能据摘要补出旧历史。

- responses/character_auditor_corrected_caution_pass.candidate.1.json；spanId=span_experiment_character_change_auditor_ce7095a2-5b68-42b4-af16-934810ce13b6；source/messages hash与manifest一致。
- 原始请求：artifacts/behavior-tests/trajectory-live/promise-repair.json，turnNumber=1，该角色调用索引=1。
- 原settledStateHistory仅turnIndex=1、scope=current_turn一项，recentExperiences=[]；摘要第2句却称“显示上轮均unchanged”。
- answer.valid=true、两类issues为空，符合冻结正对照；摘要准确性：失败（本轮→上轮）。此争议仅来自新摘要，不是把正确谨慎发言判错。
- 实际evidenceSummary=["玩家在t1_b0_e1对沈苒说“我保证借你一把伞，等我一下”，属口头承诺。", "沈苒当前trust=0.4、affection=0.4，settledStateHistory显示上轮均unchanged。", "本轮phase=reaction，沈苒仅有glance_around与speech意图，未执行借伞或兑现行为。"]

### character_auditor_corrected_caution_pass / candidate / 2 — passed

answer正确放行有来源但尚未兑现的承诺记忆，以及只询问时间/是否有伞的谨慎发言；关系不变，没有再引入无依据共同历史。

- responses/character_auditor_corrected_caution_pass.candidate.2.json；spanId=span_experiment_character_change_auditor_232fdca7-65a5-4a89-963b-fdf3e5e8006e；source/messages hash与manifest一致。
- 原始请求：artifacts/behavior-tests/trajectory-live/promise-repair.json，turnNumber=1，该角色调用索引=1。
- 原speechPlan没有“上次你也说过”，只问多久/有没有伞并重视行动；仅当前承诺的记忆提议，数值维持0.4。
- answer.valid=true、两类issues为空；摘要只陈述当前观察及unchanged轨迹，摘要准确性：通过。
- 实际evidenceSummary=["玩家在t1_b0_e1对沈苒说“我保证借你一把伞，等我一下”，沈苒亲耳听到。", "t1_b1_b2显示玩家停下动作等待回应，未显示已交付伞。", "settledStateHistory中trust与affection均为0.4且unchanged。"]

### character_auditor_corrected_caution_pass / candidate / 3 — passed

answer正确放行有来源但尚未兑现的承诺记忆，以及只询问时间/是否有伞的谨慎发言；关系不变，没有再引入无依据共同历史。

- responses/character_auditor_corrected_caution_pass.candidate.3.json；spanId=span_experiment_character_change_auditor_9cbc534e-f940-4428-b3ff-da34604983d8；source/messages hash与manifest一致。
- 原始请求：artifacts/behavior-tests/trajectory-live/promise-repair.json，turnNumber=1，该角色调用索引=1。
- 原speechPlan没有“上次你也说过”，只问多久/有没有伞并重视行动；仅当前承诺的记忆提议，数值维持0.4。
- answer.valid=true、两类issues为空；摘要只陈述当前观察及unchanged轨迹，摘要准确性：通过。
- 实际evidenceSummary=["玩家在t1_b0_e1对沈苒说“我保证借你一把伞，等我一下”，属口头承诺。", "t1_b1_b2显示玩家停下动作等待回应，未显示伞已交付。", "settledStateHistory中trust与affection均为0.4且unchanged。"]

### character_auditor_invented_shared_past_miss / candidate / 1 — failed

仍漏报speech intentIndex=1中“上次也这么说过”的无来源共同过去。摘要只检查当前承诺、关系值和合法记忆（或审查阶段），没有核对问题发言；三句摘要基本正确不能替代对全部计划speech的审查。

- responses/character_auditor_invented_shared_past_miss.candidate.1.json；spanId=span_experiment_character_change_auditor_fb90c960-77d8-469e-9129-3be48891bf72；source/messages hash与manifest一致。
- 原始请求：artifacts/behavior-tests/final-live/promise-repair.json，turnNumber=1，该角色调用索引=0。
- before.memories为空、recentExperiences=[]，泛化背景未指明旧承诺来自玩家；本次speechPlan却要求提醒对方上次作过同样保证。
- answer.valid=true、speechIssues=[]；应有针对intentIndex=1的证据缺口。摘要准确性：通过，但覆盖不足，遗漏关键待审断言。
- 实际evidenceSummary=["玩家在t1_b0_e1对沈苒说“我保证借你一把伞，等我一下”，沈苒亲耳听到。", "沈苒当前trust=0.4、affection=0.4，本轮提议未改变关系值。", "提议仅追加一条记忆，来源为玩家当场口头承诺，尚未见兑现。"]

### character_auditor_invented_shared_past_miss / candidate / 2 — failed

仍漏报speech intentIndex=1中“上次也这么说过”的无来源共同过去。摘要只检查当前承诺、关系值和合法记忆（或审查阶段），没有核对问题发言；三句摘要基本正确不能替代对全部计划speech的审查。

- responses/character_auditor_invented_shared_past_miss.candidate.2.json；spanId=span_experiment_character_change_auditor_e8b5b947-6953-4773-a864-633ea46cb7ae；source/messages hash与manifest一致。
- 原始请求：artifacts/behavior-tests/final-live/promise-repair.json，turnNumber=1，该角色调用索引=0。
- before.memories为空、recentExperiences=[]，泛化背景未指明旧承诺来自玩家；本次speechPlan却要求提醒对方上次作过同样保证。
- answer.valid=true、speechIssues=[]；应有针对intentIndex=1的证据缺口。摘要准确性：通过，但覆盖不足，遗漏关键待审断言。
- 实际evidenceSummary=["玩家在t1_b0_e1对沈苒说“我保证借你一把伞，等我一下”，沈苒亲耳听到。", "沈苒当前trust=0.4、affection=0.4，本轮提议未改变关系值。", "提议仅追加一条记忆，来源为t1_b0_e1，未声称承诺已兑现。"]

### character_auditor_invented_shared_past_miss / candidate / 3 — failed

仍漏报speech intentIndex=1中“上次也这么说过”的无来源共同过去。摘要只检查当前承诺、关系值和合法记忆（或审查阶段），没有核对问题发言；三句摘要基本正确不能替代对全部计划speech的审查。

- responses/character_auditor_invented_shared_past_miss.candidate.3.json；spanId=span_experiment_character_change_auditor_35c22bf2-1f6d-40b3-b648-75500e688bff；source/messages hash与manifest一致。
- 原始请求：artifacts/behavior-tests/final-live/promise-repair.json，turnNumber=1，该角色调用索引=0。
- before.memories为空、recentExperiences=[]，泛化背景未指明旧承诺来自玩家；本次speechPlan却要求提醒对方上次作过同样保证。
- answer.valid=true、speechIssues=[]；应有针对intentIndex=1的证据缺口。摘要准确性：通过，但覆盖不足，遗漏关键待审断言。
- 实际evidenceSummary=["玩家在 t1_b0_e1 对沈苒说“我保证借你一把伞，等我一下”，属口头承诺。", "沈苒当前 trust=0.4、affection=0.4，本轮 proposedStateUpdates 仅追加记忆。", "phase=reaction，本轮只评已发生依据，不提前结算未执行过程。"]

### character_auditor_suspicion_direction_miss / candidate / 1 — disputed

沿用v1争议：answer未达到冻结的拒绝下降标准，但“对玩家证词的疑虑”未区分已撤回的旧目击与更正后的有限声明，实际audit也没有NPC thought中降低旧证词确信度的句子。摘要正确复述候选数值、当前更正和箱锁，仍未解决字段评价对象歧义；不把valid=true当明确修复或普适方向错误。

- responses/character_auditor_suspicion_direction_miss.candidate.1.json；spanId=span_experiment_character_change_auditor_4817b1ea-543a-4951-9990-468445ba7f91；source/messages hash与manifest一致。
- 原始请求：artifacts/behavior-tests/final-live/testimony-correction.json，turnNumber=2，该角色调用索引=0。
- answer.valid=true，issues=[]，speechIssues=[]；suspicion候选0.4→约0.3，仅为候选而非当前已提交事实。
- 字段仅有宽泛label，没有此情境必须单调增加的专门定义；不从原请求以外补入thought或金标准理由。摘要准确性：通过（按审查候选的上下文理解）。
- 实际evidenceSummary=["before.suspicion=0.4，proposedCharacter.suspicion≈0.3，提议delta=-0.1。", "t2_b0_e1中玩家亲口更正：未看见撬锁，只看见划痕，偷信是猜测。", "visibleObjects.chest仍locked=true，锁上有旧划痕。"]

### character_auditor_suspicion_direction_miss / candidate / 2 — disputed

沿用v1争议：answer未达到冻结的拒绝下降标准，但“对玩家证词的疑虑”未区分已撤回的旧目击与更正后的有限声明，实际audit也没有NPC thought中降低旧证词确信度的句子。摘要正确复述候选数值、当前更正和箱锁，仍未解决字段评价对象歧义；不把valid=true当明确修复或普适方向错误。

- responses/character_auditor_suspicion_direction_miss.candidate.2.json；spanId=span_experiment_character_change_auditor_59d1c17c-5603-4554-a869-c369bdaa9c37；source/messages hash与manifest一致。
- 原始请求：artifacts/behavior-tests/final-live/testimony-correction.json，turnNumber=2，该角色调用索引=0。
- answer.valid=true，issues=[]，speechIssues=[]；suspicion候选0.4→约0.3，仅为候选而非当前已提交事实。
- 字段仅有宽泛label，没有此情境必须单调增加的专门定义；不从原请求以外补入thought或金标准理由。摘要准确性：通过（按审查候选的上下文理解）。
- 实际evidenceSummary=["before.suspicion=0.4，proposedCharacter.suspicion≈0.3，提议delta=-0.1。", "t2_b0_e1中玩家亲口更正：未看见撬锁，只看见划痕，偷信是猜测。", "visibleObjects.chest仍locked=true，锁上有旧划痕；phase=reaction。"]

### character_auditor_suspicion_direction_miss / candidate / 3 — disputed

沿用v1争议：answer未达到冻结的拒绝下降标准，但“对玩家证词的疑虑”未区分已撤回的旧目击与更正后的有限声明，实际audit也没有NPC thought中降低旧证词确信度的句子。摘要正确复述候选数值、当前更正和箱锁，仍未解决字段评价对象歧义；不把valid=true当明确修复或普适方向错误。

- responses/character_auditor_suspicion_direction_miss.candidate.3.json；spanId=span_experiment_character_change_auditor_2105c794-7739-424c-9854-905259fed71b；source/messages hash与manifest一致。
- 原始请求：artifacts/behavior-tests/final-live/testimony-correction.json，turnNumber=2，该角色调用索引=0。
- answer.valid=true，issues=[]，speechIssues=[]；suspicion候选0.4→约0.3，仅为候选而非当前已提交事实。
- 字段仅有宽泛label，没有此情境必须单调增加的专门定义；不从原请求以外补入thought或金标准理由。摘要准确性：通过（按审查候选的上下文理解）。
- 实际evidenceSummary=["玩家在t2_b0_e1更正：未看见撬锁，只看见锁上划痕，偷信是猜测。", "箱子仍上锁且锁上有旧划痕，见visibleObjects.chest。", "suspicion由0.4降至约0.3，caseNotes追加更正记录。"]

### input_compiler_listen_request_pass / candidate / 1 — passed

结构有效且保留放稳现有空枪、双手离开桌面和向he听取讲解三项原意，独立listen_to附逐字responseRequest并接回应wait；没有把讲解请求写成教练已说内容，也没有装弹、射击或admin路由。放稳与双手离桌合在同一put_down事件的原文content，冻结标准要求保留三项意图而非固定三条事件，因此不把合并本身算遗漏。

- responses/input_compiler_listen_request_pass.candidate.1.json；spanId=span_experiment_input_compiler_a515abfe-f001-4f23-96d1-7263d8d0640e；source/messages hash与manifest一致。
- 原始请求：artifacts/behavior-tests/targeted-live/modern-legal-item.json，turnNumber=3，该角色调用索引=0。
- answer={"blocks": [{"id": "b1", "kind": "normal", "events": [{"id": "e1", "type": "action", "actor": "player", "op": "put_down", "item": "pistol", "target": "table", "content": "我把空枪放稳，双手离开桌面", "duration": 1}, {"id": "e2", "type": "action", "actor": "player", "op": "listen_to", "target": "he", "content": "听教练讲下一步安全操作", "duration": 1, "responseRequest": {"target": "he", "sourceText": "听教练讲下一步安全操作"}}]}, {"id": "b2", "kind": "wait", "responseWindow": true}]}
- 所有action.content均来自原文；listen_to.target及responseRequest.target均为he，sourceText为“听教练讲下一步安全操作”。这是单次编译判断，不证明后续裁决器一定正确执行组合动作。

### input_compiler_listen_request_pass / candidate / 2 — passed

结构有效且保留放稳现有空枪、双手离开桌面和向he听取讲解三项原意，独立listen_to附逐字responseRequest并接回应wait；没有把讲解请求写成教练已说内容，也没有装弹、射击或admin路由。

- responses/input_compiler_listen_request_pass.candidate.2.json；spanId=span_experiment_input_compiler_7a838728-a8a6-45dc-a8be-955ac197a127；source/messages hash与manifest一致。
- 原始请求：artifacts/behavior-tests/targeted-live/modern-legal-item.json，turnNumber=3，该角色调用索引=0。
- answer={"blocks": [{"id": "b1", "kind": "normal", "events": [{"id": "e1", "type": "action", "actor": "player", "op": "put_down", "item": "pistol", "target": "table", "content": "我把空枪放稳", "duration": 1}, {"id": "e2", "type": "action", "actor": "player", "op": "release", "target": "table", "content": "双手离开桌面", "duration": 1}, {"id": "e3", "type": "action", "actor": "player", "op": "listen_to", "target": "he", "content": "听教练讲下一步安全操作", "duration": 1, "responseRequest": {"target": "he", "sourceText": "听教练讲下一步安全操作"}}]}, {"id": "b2", "kind": "wait", "responseWindow": true}]}
- 所有action.content均来自原文；listen_to.target及responseRequest.target均为he，sourceText为“听教练讲下一步安全操作”。这是单次编译判断，不证明后续裁决器一定正确执行组合动作。

### input_compiler_listen_request_pass / candidate / 3 — passed

结构有效且保留放稳现有空枪、双手离开桌面和向he听取讲解三项原意，独立listen_to附逐字responseRequest并接回应wait；没有把讲解请求写成教练已说内容，也没有装弹、射击或admin路由。离手动作op较笼统为move_away，但content明确限定双手离开桌面，不据动词孤立推断玩家已经离开房间。

- responses/input_compiler_listen_request_pass.candidate.3.json；spanId=span_experiment_input_compiler_5aa055b9-045b-4d0c-a7dc-fafbbd1bf050；source/messages hash与manifest一致。
- 原始请求：artifacts/behavior-tests/targeted-live/modern-legal-item.json，turnNumber=3，该角色调用索引=0。
- answer={"blocks": [{"id": "b1", "kind": "normal", "events": [{"id": "e1", "type": "action", "actor": "player", "op": "put_down", "item": "pistol", "target": "table", "content": "我把空枪放稳", "duration": 1}, {"id": "e2", "type": "action", "actor": "player", "op": "move_away", "target": "table", "content": "双手离开桌面", "duration": 1}, {"id": "e3", "type": "action", "actor": "player", "op": "listen_to", "target": "he", "content": "听教练讲下一步安全操作", "duration": 1, "responseRequest": {"target": "he", "sourceText": "听教练讲下一步安全操作"}}]}, {"id": "b2", "kind": "wait", "responseWindow": true}]}
- 所有action.content均来自原文；listen_to.target及responseRequest.target均为he，sourceText为“听教练讲下一步安全操作”。这是单次编译判断，不证明后续裁决器一定正确执行组合动作。

### input_compiler_place_direction_failure / candidate / 1 — passed

完整normal/events结构及必需字段通过；先take_out已有pistol，后put_down至table，两事件均保留对应原文，明确保持从玩家取出再放到桌上的方向，没有反向取走或新增物品/admin命令。

- responses/input_compiler_place_direction_failure.candidate.1.json；spanId=span_experiment_input_compiler_78916b15-84d3-4a07-bb0d-9552aa2b4779；source/messages hash与manifest一致。
- 原始请求：artifacts/behavior-tests/trajectory-live/modern-legal-item.json，turnNumber=1，该角色调用索引=0。
- answer={"blocks": [{"id": "b1", "kind": "normal", "events": [{"id": "e1", "type": "action", "actor": "player", "op": "take_out", "item": "pistol", "content": "我掏出一把手枪", "duration": 1}, {"id": "e2", "type": "action", "actor": "player", "op": "put_down", "item": "pistol", "target": "table", "content": "放在桌上", "duration": 1}]}]}
- item=pistol/target=table采用原manifest允许的物品/目的地协议；不因冻结criteria中target=pistol的歧义误拒合法item字段。此处另有明确put_down，消除了v1仅take_out的歧义。

### input_compiler_place_direction_failure / candidate / 2 — passed

完整normal/events结构及必需字段通过；先take_out已有pistol，后put_down至table，两事件均保留对应原文，明确保持从玩家取出再放到桌上的方向，没有反向取走或新增物品/admin命令。

- responses/input_compiler_place_direction_failure.candidate.2.json；spanId=span_experiment_input_compiler_4c859c62-31be-4555-ab91-838e6c0009cb；source/messages hash与manifest一致。
- 原始请求：artifacts/behavior-tests/trajectory-live/modern-legal-item.json，turnNumber=1，该角色调用索引=0。
- answer={"blocks": [{"id": "b1", "kind": "normal", "events": [{"id": "e1", "type": "action", "actor": "player", "op": "take_out", "item": "pistol", "content": "我掏出一把手枪", "duration": 1}, {"id": "e2", "type": "action", "actor": "player", "op": "put_down", "item": "pistol", "target": "table", "content": "放在桌上", "duration": 1}]}]}
- item=pistol/target=table采用原manifest允许的物品/目的地协议；不因冻结criteria中target=pistol的歧义误拒合法item字段。此处另有明确put_down，消除了v1仅take_out的歧义。

### input_compiler_place_direction_failure / candidate / 3 — passed

完整normal/events结构及必需字段通过；先take_out已有pistol，后put_down至table，两事件均保留对应原文，明确保持从玩家取出再放到桌上的方向，没有反向取走或新增物品/admin命令。

- responses/input_compiler_place_direction_failure.candidate.3.json；spanId=span_experiment_input_compiler_8b9dd048-32da-419e-a3b8-bdb156dba3fc；source/messages hash与manifest一致。
- 原始请求：artifacts/behavior-tests/trajectory-live/modern-legal-item.json，turnNumber=1，该角色调用索引=0。
- answer={"blocks": [{"id": "b1", "kind": "normal", "events": [{"id": "e1", "type": "action", "actor": "player", "op": "take_out", "item": "pistol", "content": "我掏出一把手枪", "duration": 1}, {"id": "e2", "type": "action", "actor": "player", "op": "put_down", "item": "pistol", "target": "table", "content": "放在桌上", "duration": 1}]}]}
- item=pistol/target=table采用原manifest允许的物品/目的地协议；不因冻结criteria中target=pistol的歧义误拒合法item字段。此处另有明确put_down，消除了v1仅take_out的歧义。

