# Compiler 与人物审查离线 A/B 人工复核

已逐份核对 manifest 原请求、冻结 cases.json 和全部 42 份响应：input_compiler 12 份，character_change_auditor 30 份；每 case 两组各重复 3 次。原始请求及消息 hash 与 manifest 相符。只按单次审查实际可见资料评定，不借别的 span 或后续结果补证据。Schema 拒绝计为 failed；有效 JSON 不等于语义通过；valid=false 必须逐项判断是否真有问题。

## 按 case 汇总

| Case | baseline 通过/失败/争议 | candidate 通过/失败/争议 |
|---|---:|---:|
| input_compiler_place_direction_failure | 0/1/2 | 0/3/0 |
| input_compiler_listen_request_pass | 2/1/0 | 0/3/0 |
| character_auditor_suspicion_direction_miss | 0/0/3 | 0/0/3 |
| character_auditor_invented_shared_past_miss | 0/3/0 | 0/3/0 |
| character_auditor_apology_count_miss | 0/3/0 | 0/3/0 |
| character_auditor_corrected_caution_pass | 3/0/0 | 3/0/0 |
| character_auditor_accounted_breach_pass | 3/0/0 | 0/3/0 |

## 整体结果与边界

- baseline：8/21 明确通过、8 失败、5 争议。争议不并入通过，也不当作确定语义错误。
- candidate：3/21 明确通过、15 失败、3 争议。争议不并入通过，也不当作确定语义错误。

候选版本没有证明改进：compiler 全部 6 次结构失败，原版本为 2 次通过、2 次失败、2 次争议；人物审查候选误拒 3 次合理的首次失约结算，且对虚构共同过去与错误道歉次数仍全部漏报。已修正的一般谨慎正对照两组都 3/3 通过。

疑虑 case 的冻结标准要求拒绝下降，但审查实际输入不含 NPC thought 中“降低对先前那番话的确信度”。标签“对玩家证词的疑虑”没有明确是对已撤回旧声明还是对更正后声明；坦白缩小声明范围也可能降低后者的疑虑。reason 混用疑虑与误采信风险值得质疑，但单凭该请求不能排除另一合理解释，因此六份均标 disputed，不用它证明候选修复或未修复普适心理方向。冻结标准未改。

放置 case 的 criteria 提及target=pistol，但manifest原协议明确item为物品、target为目的地。合法item=pistol/target=table不应本身判错。baseline第1/3次的take_out+table缺少明确放下但可读成向桌面取出，列争议；第2次只用take则仍缺原用户放置方向。

首次失约结算误报是实质回归：unchanged=0.4代表尚无真实数值变化，不能证明同次失约已结算。当前“没有伞，不该保证”是新的可感知承认，可与旧承诺历史合看；要求它再次引用非当前旧事件，或因历史尚未扣分而拒绝首次扣分，均不成立。

本次只重放单次请求，没有运行完整动作裁决/世界提交/后续多轮链；这些通过数不能替代端到端通过率。未修改提示词、生产源码、配置或金标准。

## 逐份评定

### character_auditor_accounted_breach_pass / baseline / 1 — passed

正确放行首次结算当前新确认的失约。当前“其实没有伞，刚才不该保证”使之前尚待兑现的保证明确落空；历史两字段此前均未变，本次下降有新证据且理由分开，不属于重复奖励或重复扣分。

- responses/character_auditor_accounted_breach_pass.baseline.1.json；spanId=span_experiment_character_change_auditor_b9b35f50-f071-40a7-975d-ef7d6d1b3c8c
- 原始请求：artifacts/behavior-tests/trajectory-live/promise-repair.json，turnNumber=2，该角色调用索引=0；原请求与manifest的source/messages hash均一致。
- settledStateHistory前回合及本轮已提交部分均为unchanged=0.4、sourceEventIds=[]；候选才提议0.4→0.3及0.4→0.37。
- 本次sourceEventIds=t2_b0_e1是当前可感知承认，旧承诺作为个人历史提供语境；输出valid=true、两类issues为空。

### character_auditor_accounted_breach_pass / baseline / 2 — passed

正确放行首次结算当前新确认的失约。当前“其实没有伞，刚才不该保证”使之前尚待兑现的保证明确落空；历史两字段此前均未变，本次下降有新证据且理由分开，不属于重复奖励或重复扣分。

- responses/character_auditor_accounted_breach_pass.baseline.2.json；spanId=span_experiment_character_change_auditor_9eb14ccb-523d-42d2-b7e4-932844f0163b
- 原始请求：artifacts/behavior-tests/trajectory-live/promise-repair.json，turnNumber=2，该角色调用索引=0；原请求与manifest的source/messages hash均一致。
- settledStateHistory前回合及本轮已提交部分均为unchanged=0.4、sourceEventIds=[]；候选才提议0.4→0.3及0.4→0.37。
- 本次sourceEventIds=t2_b0_e1是当前可感知承认，旧承诺作为个人历史提供语境；输出valid=true、两类issues为空。

### character_auditor_accounted_breach_pass / baseline / 3 — passed

正确放行首次结算当前新确认的失约。当前“其实没有伞，刚才不该保证”使之前尚待兑现的保证明确落空；历史两字段此前均未变，本次下降有新证据且理由分开，不属于重复奖励或重复扣分。

- responses/character_auditor_accounted_breach_pass.baseline.3.json；spanId=span_experiment_character_change_auditor_d271ef7a-ff1e-46d9-9a38-bb190d0ac7fc
- 原始请求：artifacts/behavior-tests/trajectory-live/promise-repair.json，turnNumber=2，该角色调用索引=0；原请求与manifest的source/messages hash均一致。
- settledStateHistory前回合及本轮已提交部分均为unchanged=0.4、sourceEventIds=[]；候选才提议0.4→0.3及0.4→0.37。
- 本次sourceEventIds=t2_b0_e1是当前可感知承认，旧承诺作为个人历史提供语境；输出valid=true、两类issues为空。

### character_auditor_accounted_breach_pass / candidate / 1 — failed

误报合法的首次失约结算。审查把已记录但尚待兑现的旧承诺当作此前已完成失约结算，或要求当前source同时引用旧事件，忽略当前承认“根本没有伞”是新确认失败的证据；unchanged快照不能证明此前扣过，不能反过来成为拒绝首次结算的理由。

- responses/character_auditor_accounted_breach_pass.candidate.1.json；spanId=span_experiment_character_change_auditor_17be126c-3f4e-4323-ba94-2e98686447c0
- 原始请求：artifacts/behavior-tests/trajectory-live/promise-repair.json，turnNumber=2，该角色调用索引=0；原请求与manifest的source/messages hash均一致。
- 候选更新1/2分别结算可靠性和亲近感；历史值一直为0.4，没有已扣除同一损失的真实记录。
- 实际审查意见：{"valid": false, "issues": [{"updateIndex": 1, "reason": "可靠性信任下降方向与证据一致，但本轮唯一新事件是玩家承认没有伞；先前承诺落空已在上一轮发生，settledStateHistory 显示 trust 在 turn_1 与 turn_2 均为 0.4 未变，本轮再以同一失约为由扣减属于重复结算旧事。"}, {"updateIndex": 2, "reason": "亲近感下降方向可接受，但理由中“此前空等带来的失望”是上一轮已发生且未在本轮新证据中升级的旧事；本轮仅玩家承认失约，settledStateHistory 显示 affection 在 turn_1 与 turn_2 均为 0.4 未变，不应把旧失望作为本轮新增扣减依据。"}], "speechIssues": []}
- 没有发现记忆重复或对白错误；valid=false只因上述误报，不能计为正确拦截。

### character_auditor_accounted_breach_pass / candidate / 2 — failed

误报合法的首次失约结算。审查把已记录但尚待兑现的旧承诺当作此前已完成失约结算，或要求当前source同时引用旧事件，忽略当前承认“根本没有伞”是新确认失败的证据；unchanged快照不能证明此前扣过，不能反过来成为拒绝首次结算的理由。

- responses/character_auditor_accounted_breach_pass.candidate.2.json；spanId=span_experiment_character_change_auditor_dcb05147-13f5-4980-b569-c8da42f5b033
- 原始请求：artifacts/behavior-tests/trajectory-live/promise-repair.json，turnNumber=2，该角色调用索引=0；原请求与manifest的source/messages hash均一致。
- 候选更新1/2分别结算可靠性和亲近感；历史值一直为0.4，没有已扣除同一损失的真实记录。
- 实际审查意见：{"valid": false, "issues": [{"updateIndex": 1, "reason": "可靠性信任下降方向可成立，但sourceEventIds只列了本轮承认事件；失约本身来自上一轮承诺未兑现，本轮承认仅证明其坦白，不能单独作为失约结算依据。"}, {"updateIndex": 2, "reason": "亲近感下降方向与理由可成立，但sourceEventIds只列了本轮承认事件；此前空等失望来自上一轮未兑现承诺，不能仅凭本轮承认事件结算。"}], "speechIssues": []}
- 没有发现记忆重复或对白错误；valid=false只因上述误报，不能计为正确拦截。

### character_auditor_accounted_breach_pass / candidate / 3 — failed

误报合法的首次失约结算。审查把已记录但尚待兑现的旧承诺当作此前已完成失约结算，或要求当前source同时引用旧事件，忽略当前承认“根本没有伞”是新确认失败的证据；unchanged快照不能证明此前扣过，不能反过来成为拒绝首次结算的理由。

- responses/character_auditor_accounted_breach_pass.candidate.3.json；spanId=span_experiment_character_change_auditor_c02d9835-a603-4d40-95cd-937d600837f0
- 原始请求：artifacts/behavior-tests/trajectory-live/promise-repair.json，turnNumber=2，该角色调用索引=0；原请求与manifest的source/messages hash均一致。
- 候选更新1/2分别结算可靠性和亲近感；历史值一直为0.4，没有已扣除同一损失的真实记录。
- 实际审查意见：{"valid": false, "issues": [{"updateIndex": 1, "reason": "可靠性信任下降方向可由玩家承认未兑现承诺支持，但本轮 settledStateHistory 显示 trust 在 turn_1、turn_2 均为 0.4 未变，且此前承诺尚未被结算为失约；仅凭承认没有伞就扣减信任，缺少本轮可感知的失约结算依据。"}], "speechIssues": []}
- 没有发现记忆重复或对白错误；valid=false只因上述误报，不能计为正确拦截。

### character_auditor_apology_count_miss / baseline / 1 — failed

漏报新增记忆的无来源次数。updateIndex=0写“第三次提道歉”，原材料只有第一次保证、一次道歉、借雨衣声明和当前再次道歉，借雨衣没有第三次口头道歉。审查未区分正确的当轮强求信任事实和错误计数，整体放行。

- responses/character_auditor_apology_count_miss.baseline.1.json；spanId=span_experiment_character_change_auditor_c0a8d4b6-c786-4157-8223-3019343e9e6c
- 原始请求：artifacts/behavior-tests/final-live/promise-repair.json，turnNumber=4，该角色调用索引=0；原请求与manifest的source/messages hash均一致。
- recentExperiences中的三条玩家原话为“我保证借你一把伞，等我一下”“对不起，我其实没有伞，刚才不该保证”“这件确实是我的，借你用”；当前为“我再道歉一次…”。
- 应对属性updateIndex=0指出计数缺口；输出valid=true、issues=[]、speechIssues=[]。未要求替代关系数值。

### character_auditor_apology_count_miss / baseline / 2 — failed

漏报新增记忆的无来源次数。updateIndex=0写“第三次提道歉”，原材料只有第一次保证、一次道歉、借雨衣声明和当前再次道歉，借雨衣没有第三次口头道歉。审查未区分正确的当轮强求信任事实和错误计数，整体放行。

- responses/character_auditor_apology_count_miss.baseline.2.json；spanId=span_experiment_character_change_auditor_e8c8d802-d305-4fec-baa7-b8ac69f558ee
- 原始请求：artifacts/behavior-tests/final-live/promise-repair.json，turnNumber=4，该角色调用索引=0；原请求与manifest的source/messages hash均一致。
- recentExperiences中的三条玩家原话为“我保证借你一把伞，等我一下”“对不起，我其实没有伞，刚才不该保证”“这件确实是我的，借你用”；当前为“我再道歉一次…”。
- 应对属性updateIndex=0指出计数缺口；输出valid=true、issues=[]、speechIssues=[]。未要求替代关系数值。

### character_auditor_apology_count_miss / baseline / 3 — failed

漏报新增记忆的无来源次数。updateIndex=0写“第三次提道歉”，原材料只有第一次保证、一次道歉、借雨衣声明和当前再次道歉，借雨衣没有第三次口头道歉。审查未区分正确的当轮强求信任事实和错误计数，整体放行。

- responses/character_auditor_apology_count_miss.baseline.3.json；spanId=span_experiment_character_change_auditor_c65cce6f-fddd-44fe-a4ac-892009f89f95
- 原始请求：artifacts/behavior-tests/final-live/promise-repair.json，turnNumber=4，该角色调用索引=0；原请求与manifest的source/messages hash均一致。
- recentExperiences中的三条玩家原话为“我保证借你一把伞，等我一下”“对不起，我其实没有伞，刚才不该保证”“这件确实是我的，借你用”；当前为“我再道歉一次…”。
- 应对属性updateIndex=0指出计数缺口；输出valid=true、issues=[]、speechIssues=[]。未要求替代关系数值。

### character_auditor_apology_count_miss / candidate / 1 — failed

漏报新增记忆的无来源次数。updateIndex=0写“第三次提道歉”，原材料只有第一次保证、一次道歉、借雨衣声明和当前再次道歉，借雨衣没有第三次口头道歉。审查未区分正确的当轮强求信任事实和错误计数，整体放行。

- responses/character_auditor_apology_count_miss.candidate.1.json；spanId=span_experiment_character_change_auditor_23b87aa4-f335-4006-8329-00695e0210b3
- 原始请求：artifacts/behavior-tests/final-live/promise-repair.json，turnNumber=4，该角色调用索引=0；原请求与manifest的source/messages hash均一致。
- recentExperiences中的三条玩家原话为“我保证借你一把伞，等我一下”“对不起，我其实没有伞，刚才不该保证”“这件确实是我的，借你用”；当前为“我再道歉一次…”。
- 应对属性updateIndex=0指出计数缺口；输出valid=true、issues=[]、speechIssues=[]。未要求替代关系数值。

### character_auditor_apology_count_miss / candidate / 2 — failed

漏报新增记忆的无来源次数。updateIndex=0写“第三次提道歉”，原材料只有第一次保证、一次道歉、借雨衣声明和当前再次道歉，借雨衣没有第三次口头道歉。审查未区分正确的当轮强求信任事实和错误计数，整体放行。

- responses/character_auditor_apology_count_miss.candidate.2.json；spanId=span_experiment_character_change_auditor_1d296fc0-469e-4a08-a453-090eeb63612d
- 原始请求：artifacts/behavior-tests/final-live/promise-repair.json，turnNumber=4，该角色调用索引=0；原请求与manifest的source/messages hash均一致。
- recentExperiences中的三条玩家原话为“我保证借你一把伞，等我一下”“对不起，我其实没有伞，刚才不该保证”“这件确实是我的，借你用”；当前为“我再道歉一次…”。
- 应对属性updateIndex=0指出计数缺口；输出valid=true、issues=[]、speechIssues=[]。未要求替代关系数值。

### character_auditor_apology_count_miss / candidate / 3 — failed

漏报新增记忆的无来源次数。updateIndex=0写“第三次提道歉”，原材料只有第一次保证、一次道歉、借雨衣声明和当前再次道歉，借雨衣没有第三次口头道歉。审查未区分正确的当轮强求信任事实和错误计数，整体放行。

- responses/character_auditor_apology_count_miss.candidate.3.json；spanId=span_experiment_character_change_auditor_10d23abe-87ac-4546-b8dc-ba12b1018e9a
- 原始请求：artifacts/behavior-tests/final-live/promise-repair.json，turnNumber=4，该角色调用索引=0；原请求与manifest的source/messages hash均一致。
- recentExperiences中的三条玩家原话为“我保证借你一把伞，等我一下”“对不起，我其实没有伞，刚才不该保证”“这件确实是我的，借你用”；当前为“我再道歉一次…”。
- 应对属性updateIndex=0指出计数缺口；输出valid=true、issues=[]、speechIssues=[]。未要求替代关系数值。

### character_auditor_corrected_caution_pass / baseline / 1 — passed

正确放行已移除虚构旧事的候选。当前承诺按未兑现来源记录，两个关系维度不变，计划只问时间/是否有伞并强调行动；没有把泛化谨慎误判为具体历史或强制新增属性变化。

- responses/character_auditor_corrected_caution_pass.baseline.1.json；spanId=span_experiment_character_change_auditor_d21bfa6a-a52d-4552-909f-f58c3475f0bd
- 原始请求：artifacts/behavior-tests/trajectory-live/promise-repair.json，turnNumber=1，该角色调用索引=1；原请求与manifest的source/messages hash均一致。
- 本请求speechPlan没有“上次你也说过”，不能将此前不同请求的坏候选带入本次判断。
- 原数值轨迹unchanged=0.4，proposedStateUpdates仅有当前承诺的记忆；输出valid=true且两类issues为空。

### character_auditor_corrected_caution_pass / baseline / 2 — passed

正确放行已移除虚构旧事的候选。当前承诺按未兑现来源记录，两个关系维度不变，计划只问时间/是否有伞并强调行动；没有把泛化谨慎误判为具体历史或强制新增属性变化。

- responses/character_auditor_corrected_caution_pass.baseline.2.json；spanId=span_experiment_character_change_auditor_265696bc-943b-424f-9002-74c127b76f01
- 原始请求：artifacts/behavior-tests/trajectory-live/promise-repair.json，turnNumber=1，该角色调用索引=1；原请求与manifest的source/messages hash均一致。
- 本请求speechPlan没有“上次你也说过”，不能将此前不同请求的坏候选带入本次判断。
- 原数值轨迹unchanged=0.4，proposedStateUpdates仅有当前承诺的记忆；输出valid=true且两类issues为空。

### character_auditor_corrected_caution_pass / baseline / 3 — passed

正确放行已移除虚构旧事的候选。当前承诺按未兑现来源记录，两个关系维度不变，计划只问时间/是否有伞并强调行动；没有把泛化谨慎误判为具体历史或强制新增属性变化。

- responses/character_auditor_corrected_caution_pass.baseline.3.json；spanId=span_experiment_character_change_auditor_a245988c-4de5-47dc-a6a0-8733b8d7fcda
- 原始请求：artifacts/behavior-tests/trajectory-live/promise-repair.json，turnNumber=1，该角色调用索引=1；原请求与manifest的source/messages hash均一致。
- 本请求speechPlan没有“上次你也说过”，不能将此前不同请求的坏候选带入本次判断。
- 原数值轨迹unchanged=0.4，proposedStateUpdates仅有当前承诺的记忆；输出valid=true且两类issues为空。

### character_auditor_corrected_caution_pass / candidate / 1 — passed

正确放行已移除虚构旧事的候选。当前承诺按未兑现来源记录，两个关系维度不变，计划只问时间/是否有伞并强调行动；没有把泛化谨慎误判为具体历史或强制新增属性变化。

- responses/character_auditor_corrected_caution_pass.candidate.1.json；spanId=span_experiment_character_change_auditor_92780e28-941e-46b8-a799-729e9c3c4c4b
- 原始请求：artifacts/behavior-tests/trajectory-live/promise-repair.json，turnNumber=1，该角色调用索引=1；原请求与manifest的source/messages hash均一致。
- 本请求speechPlan没有“上次你也说过”，不能将此前不同请求的坏候选带入本次判断。
- 原数值轨迹unchanged=0.4，proposedStateUpdates仅有当前承诺的记忆；输出valid=true且两类issues为空。

### character_auditor_corrected_caution_pass / candidate / 2 — passed

正确放行已移除虚构旧事的候选。当前承诺按未兑现来源记录，两个关系维度不变，计划只问时间/是否有伞并强调行动；没有把泛化谨慎误判为具体历史或强制新增属性变化。

- responses/character_auditor_corrected_caution_pass.candidate.2.json；spanId=span_experiment_character_change_auditor_d87131b8-6ad8-43b4-911d-4fde8f5ec3fc
- 原始请求：artifacts/behavior-tests/trajectory-live/promise-repair.json，turnNumber=1，该角色调用索引=1；原请求与manifest的source/messages hash均一致。
- 本请求speechPlan没有“上次你也说过”，不能将此前不同请求的坏候选带入本次判断。
- 原数值轨迹unchanged=0.4，proposedStateUpdates仅有当前承诺的记忆；输出valid=true且两类issues为空。

### character_auditor_corrected_caution_pass / candidate / 3 — passed

正确放行已移除虚构旧事的候选。当前承诺按未兑现来源记录，两个关系维度不变，计划只问时间/是否有伞并强调行动；没有把泛化谨慎误判为具体历史或强制新增属性变化。

- responses/character_auditor_corrected_caution_pass.candidate.3.json；spanId=span_experiment_character_change_auditor_351e4254-74d2-45ce-a7d8-c8345908ce0e
- 原始请求：artifacts/behavior-tests/trajectory-live/promise-repair.json，turnNumber=1，该角色调用索引=1；原请求与manifest的source/messages hash均一致。
- 本请求speechPlan没有“上次你也说过”，不能将此前不同请求的坏候选带入本次判断。
- 原数值轨迹unchanged=0.4，proposedStateUpdates仅有当前承诺的记忆；输出valid=true且两类issues为空。

### character_auditor_invented_shared_past_miss / baseline / 1 — failed

漏报无依据的具体共同过去。发言intentIndex=1肯定提醒对方“上次也这么说过”，背景只说曾受空头承诺耽误，没有绑定为当前玩家；空个人历史本身也不是新增共同过去的证据。审查全部放行，未指出这一确定事实缺口。

- responses/character_auditor_invented_shared_past_miss.baseline.1.json；spanId=span_experiment_character_change_auditor_30a331d1-8306-4e0a-81c2-a8e29632fc1f
- 原始请求：artifacts/behavior-tests/final-live/promise-repair.json，turnNumber=1，该角色调用索引=0；原请求与manifest的source/messages hash均一致。
- before.attributes.memories为空、recentExperiences=[]；当前唯一具体承诺来自t1_b0_e1。
- 当前承诺记忆有来源可保留；应针对speechIssues.intentIndex=1，输出却为valid=true、issues=[]、speechIssues=[]。

### character_auditor_invented_shared_past_miss / baseline / 2 — failed

漏报无依据的具体共同过去。发言intentIndex=1肯定提醒对方“上次也这么说过”，背景只说曾受空头承诺耽误，没有绑定为当前玩家；空个人历史本身也不是新增共同过去的证据。审查全部放行，未指出这一确定事实缺口。

- responses/character_auditor_invented_shared_past_miss.baseline.2.json；spanId=span_experiment_character_change_auditor_bd52f684-ee9d-4022-9920-1eb609e6e8dc
- 原始请求：artifacts/behavior-tests/final-live/promise-repair.json，turnNumber=1，该角色调用索引=0；原请求与manifest的source/messages hash均一致。
- before.attributes.memories为空、recentExperiences=[]；当前唯一具体承诺来自t1_b0_e1。
- 当前承诺记忆有来源可保留；应针对speechIssues.intentIndex=1，输出却为valid=true、issues=[]、speechIssues=[]。

### character_auditor_invented_shared_past_miss / baseline / 3 — failed

漏报无依据的具体共同过去。发言intentIndex=1肯定提醒对方“上次也这么说过”，背景只说曾受空头承诺耽误，没有绑定为当前玩家；空个人历史本身也不是新增共同过去的证据。审查全部放行，未指出这一确定事实缺口。

- responses/character_auditor_invented_shared_past_miss.baseline.3.json；spanId=span_experiment_character_change_auditor_d0385c1b-d4aa-42e7-9e22-6e00328cd3f9
- 原始请求：artifacts/behavior-tests/final-live/promise-repair.json，turnNumber=1，该角色调用索引=0；原请求与manifest的source/messages hash均一致。
- before.attributes.memories为空、recentExperiences=[]；当前唯一具体承诺来自t1_b0_e1。
- 当前承诺记忆有来源可保留；应针对speechIssues.intentIndex=1，输出却为valid=true、issues=[]、speechIssues=[]。

### character_auditor_invented_shared_past_miss / candidate / 1 — failed

漏报无依据的具体共同过去。发言intentIndex=1肯定提醒对方“上次也这么说过”，背景只说曾受空头承诺耽误，没有绑定为当前玩家；空个人历史本身也不是新增共同过去的证据。审查全部放行，未指出这一确定事实缺口。

- responses/character_auditor_invented_shared_past_miss.candidate.1.json；spanId=span_experiment_character_change_auditor_a33a867f-14fe-43ad-b73e-9271f291da8d
- 原始请求：artifacts/behavior-tests/final-live/promise-repair.json，turnNumber=1，该角色调用索引=0；原请求与manifest的source/messages hash均一致。
- before.attributes.memories为空、recentExperiences=[]；当前唯一具体承诺来自t1_b0_e1。
- 当前承诺记忆有来源可保留；应针对speechIssues.intentIndex=1，输出却为valid=true、issues=[]、speechIssues=[]。

### character_auditor_invented_shared_past_miss / candidate / 2 — failed

漏报无依据的具体共同过去。发言intentIndex=1肯定提醒对方“上次也这么说过”，背景只说曾受空头承诺耽误，没有绑定为当前玩家；空个人历史本身也不是新增共同过去的证据。审查全部放行，未指出这一确定事实缺口。

- responses/character_auditor_invented_shared_past_miss.candidate.2.json；spanId=span_experiment_character_change_auditor_6de942ae-2551-4644-9585-7654134b6561
- 原始请求：artifacts/behavior-tests/final-live/promise-repair.json，turnNumber=1，该角色调用索引=0；原请求与manifest的source/messages hash均一致。
- before.attributes.memories为空、recentExperiences=[]；当前唯一具体承诺来自t1_b0_e1。
- 当前承诺记忆有来源可保留；应针对speechIssues.intentIndex=1，输出却为valid=true、issues=[]、speechIssues=[]。

### character_auditor_invented_shared_past_miss / candidate / 3 — failed

漏报无依据的具体共同过去。发言intentIndex=1肯定提醒对方“上次也这么说过”，背景只说曾受空头承诺耽误，没有绑定为当前玩家；空个人历史本身也不是新增共同过去的证据。审查全部放行，未指出这一确定事实缺口。

- responses/character_auditor_invented_shared_past_miss.candidate.3.json；spanId=span_experiment_character_change_auditor_b3d193d2-7af7-4d6d-bedb-affc3828c4b0
- 原始请求：artifacts/behavior-tests/final-live/promise-repair.json，turnNumber=1，该角色调用索引=0；原请求与manifest的source/messages hash均一致。
- before.attributes.memories为空、recentExperiences=[]；当前唯一具体承诺来自t1_b0_e1。
- 当前承诺记忆有来源可保留；应针对speechIssues.intentIndex=1，输出却为valid=true、issues=[]、speechIssues=[]。

### character_auditor_suspicion_direction_miss / baseline / 1 — disputed

未达到冻结的“拒绝updateIndex=0”标准，但原审查请求对疑虑所指对象存在语义歧义，不能仅由valid=true断定普适方向错误。字段只有“对玩家证词的疑虑”标签，未限定已撤回的旧目击还是更正后的有限声明；主动撤回夸大陈述可使对当前表述的疑虑缓和。理由将疑虑与误采信风险混用值得质疑，审查没有解释，但这不足以消除样本歧义。

- responses/character_auditor_suspicion_direction_miss.baseline.1.json；spanId=span_experiment_character_change_auditor_c4eb5127-5539-43db-86bd-327a68996b90
- 原始请求：artifacts/behavior-tests/final-live/testimony-correction.json，turnNumber=2，该角色调用索引=0；原请求与manifest的source/messages hash均一致。
- 审查输入有before=0.4、proposed=0.3及承认只见划痕的当前观察；没有NPC thought中“降低对先前那番话的确信度”那句，不能从其他span补入作为审查已知材料。
- 输出valid=true、issues=[]、speechIssues=[]；更正记忆及有限知识发言未被误报。该争议不计为新旧通过或修复证明。

### character_auditor_suspicion_direction_miss / baseline / 2 — disputed

未达到冻结的“拒绝updateIndex=0”标准，但原审查请求对疑虑所指对象存在语义歧义，不能仅由valid=true断定普适方向错误。字段只有“对玩家证词的疑虑”标签，未限定已撤回的旧目击还是更正后的有限声明；主动撤回夸大陈述可使对当前表述的疑虑缓和。理由将疑虑与误采信风险混用值得质疑，审查没有解释，但这不足以消除样本歧义。

- responses/character_auditor_suspicion_direction_miss.baseline.2.json；spanId=span_experiment_character_change_auditor_ff28b41a-1b93-4687-bb9b-d32d9c30a501
- 原始请求：artifacts/behavior-tests/final-live/testimony-correction.json，turnNumber=2，该角色调用索引=0；原请求与manifest的source/messages hash均一致。
- 审查输入有before=0.4、proposed=0.3及承认只见划痕的当前观察；没有NPC thought中“降低对先前那番话的确信度”那句，不能从其他span补入作为审查已知材料。
- 输出valid=true、issues=[]、speechIssues=[]；更正记忆及有限知识发言未被误报。该争议不计为新旧通过或修复证明。

### character_auditor_suspicion_direction_miss / baseline / 3 — disputed

未达到冻结的“拒绝updateIndex=0”标准，但原审查请求对疑虑所指对象存在语义歧义，不能仅由valid=true断定普适方向错误。字段只有“对玩家证词的疑虑”标签，未限定已撤回的旧目击还是更正后的有限声明；主动撤回夸大陈述可使对当前表述的疑虑缓和。理由将疑虑与误采信风险混用值得质疑，审查没有解释，但这不足以消除样本歧义。

- responses/character_auditor_suspicion_direction_miss.baseline.3.json；spanId=span_experiment_character_change_auditor_43d020cf-8e49-46dd-b3da-90e7d636724d
- 原始请求：artifacts/behavior-tests/final-live/testimony-correction.json，turnNumber=2，该角色调用索引=0；原请求与manifest的source/messages hash均一致。
- 审查输入有before=0.4、proposed=0.3及承认只见划痕的当前观察；没有NPC thought中“降低对先前那番话的确信度”那句，不能从其他span补入作为审查已知材料。
- 输出valid=true、issues=[]、speechIssues=[]；更正记忆及有限知识发言未被误报。该争议不计为新旧通过或修复证明。

### character_auditor_suspicion_direction_miss / candidate / 1 — disputed

未达到冻结的“拒绝updateIndex=0”标准，但原审查请求对疑虑所指对象存在语义歧义，不能仅由valid=true断定普适方向错误。字段只有“对玩家证词的疑虑”标签，未限定已撤回的旧目击还是更正后的有限声明；主动撤回夸大陈述可使对当前表述的疑虑缓和。理由将疑虑与误采信风险混用值得质疑，审查没有解释，但这不足以消除样本歧义。

- responses/character_auditor_suspicion_direction_miss.candidate.1.json；spanId=span_experiment_character_change_auditor_6c5bea76-62d3-4588-a548-d07a58fb6a83
- 原始请求：artifacts/behavior-tests/final-live/testimony-correction.json，turnNumber=2，该角色调用索引=0；原请求与manifest的source/messages hash均一致。
- 审查输入有before=0.4、proposed=0.3及承认只见划痕的当前观察；没有NPC thought中“降低对先前那番话的确信度”那句，不能从其他span补入作为审查已知材料。
- 输出valid=true、issues=[]、speechIssues=[]；更正记忆及有限知识发言未被误报。该争议不计为新旧通过或修复证明。

### character_auditor_suspicion_direction_miss / candidate / 2 — disputed

未达到冻结的“拒绝updateIndex=0”标准，但原审查请求对疑虑所指对象存在语义歧义，不能仅由valid=true断定普适方向错误。字段只有“对玩家证词的疑虑”标签，未限定已撤回的旧目击还是更正后的有限声明；主动撤回夸大陈述可使对当前表述的疑虑缓和。理由将疑虑与误采信风险混用值得质疑，审查没有解释，但这不足以消除样本歧义。

- responses/character_auditor_suspicion_direction_miss.candidate.2.json；spanId=span_experiment_character_change_auditor_77834519-0987-4ea0-9e36-4007eef211c1
- 原始请求：artifacts/behavior-tests/final-live/testimony-correction.json，turnNumber=2，该角色调用索引=0；原请求与manifest的source/messages hash均一致。
- 审查输入有before=0.4、proposed=0.3及承认只见划痕的当前观察；没有NPC thought中“降低对先前那番话的确信度”那句，不能从其他span补入作为审查已知材料。
- 输出valid=true、issues=[]、speechIssues=[]；更正记忆及有限知识发言未被误报。该争议不计为新旧通过或修复证明。

### character_auditor_suspicion_direction_miss / candidate / 3 — disputed

未达到冻结的“拒绝updateIndex=0”标准，但原审查请求对疑虑所指对象存在语义歧义，不能仅由valid=true断定普适方向错误。字段只有“对玩家证词的疑虑”标签，未限定已撤回的旧目击还是更正后的有限声明；主动撤回夸大陈述可使对当前表述的疑虑缓和。理由将疑虑与误采信风险混用值得质疑，审查没有解释，但这不足以消除样本歧义。

- responses/character_auditor_suspicion_direction_miss.candidate.3.json；spanId=span_experiment_character_change_auditor_f468398e-5582-4fcc-8371-9b89bc083ff0
- 原始请求：artifacts/behavior-tests/final-live/testimony-correction.json，turnNumber=2，该角色调用索引=0；原请求与manifest的source/messages hash均一致。
- 审查输入有before=0.4、proposed=0.3及承认只见划痕的当前观察；没有NPC thought中“降低对先前那番话的确信度”那句，不能从其他span补入作为审查已知材料。
- 输出valid=true、issues=[]、speechIssues=[]；更正记忆及有限知识发言未被误报。该争议不计为新旧通过或修复证明。

### input_compiler_listen_request_pass / baseline / 1 — passed

保留放下现有空枪、双手离桌和面向he的listen_to三项意图，逐字responseRequest及后续wait存在；没有生成教练已说出的内容、装弹、射击或admin命令。

- responses/input_compiler_listen_request_pass.baseline.1.json；spanId=span_experiment_input_compiler_b916c92c-c40d-4e4f-91fe-0c8926483d9b
- 原始请求：artifacts/behavior-tests/targeted-live/modern-legal-item.json，turnNumber=3，该角色调用索引=0；原请求与manifest的source/messages hash均一致。
- 输出：{"blocks": [{"id": "b1", "kind": "normal", "events": [{"id": "e1", "type": "action", "actor": "player", "op": "put_down", "target": "pistol", "duration": 1.5}, {"id": "e2", "type": "action", "actor": "player", "op": "hands_off", "target": "table", "duration": 1, "parallelWith": ["e1"]}, {"id": "e3", "type": "action", "actor": "player", "op": "listen_to", "target": "he", "content": "听教练讲下一步安全操作", "duration": 2, "responseRequest": {"target": "he", "sourceText": "听教练讲下一步安全操作"}}]}, {"id": "b2", "kind": "wait", "responseWindow": true}]}
- put_down.target=pistol保持当前物品身份；hands_off.target=table和listen_to.target=he分别保持正确对象。第1次给离手动作parallelWith=e1；冻结criteria未要求精确动作耗时，未凭此单独判实质方向错误。

### input_compiler_listen_request_pass / baseline / 2 — failed

动作和听取对象有保留，但place_item使用原Schema禁止的destination字段，造成结构拒绝；这是协议错误，并非管理员路由或世界内动作被合法拒绝。

- responses/input_compiler_listen_request_pass.baseline.2.json；spanId=span_experiment_input_compiler_c5e6be26-4b0c-4600-8822-ab9f3ce27abc
- 原始请求：artifacts/behavior-tests/targeted-live/modern-legal-item.json，turnNumber=3，该角色调用索引=0；原请求与manifest的source/messages hash均一致。
- 原始候选：{"blocks": [{"id": "b1", "kind": "normal", "events": [{"id": "e1", "type": "action", "actor": "player", "op": "place_item", "target": "pistol", "destination": "table", "duration": 1.5}, {"id": "e2", "type": "action", "actor": "player", "op": "hands_off_table", "target": "table", "duration": 1, "parallelWith": ["e1"]}, {"id": "e3", "type": "action", "actor": "player", "op": "listen_to", "target": "he", "content": "听教练讲下一步安全操作", "duration": 2, "responseRequest": {"target": "he", "sourceText": "听教练讲下一步安全操作"}}]}, {"id": "b2", "kind": "wait", "responseWindow": true}]}
- 结构错误：Output Schema Validation Failed for agent 'experiment_input_compiler': instance.blocks[0].events[0] is not allowed to have the additional property "destination"
- listen_to target=he、responseRequest原文及后续wait均存在；不能掩盖额外字段错误。

### input_compiler_listen_request_pass / baseline / 3 — passed

保留放下现有空枪、双手离桌和面向he的listen_to三项意图，逐字responseRequest及后续wait存在；没有生成教练已说出的内容、装弹、射击或admin命令。

- responses/input_compiler_listen_request_pass.baseline.3.json；spanId=span_experiment_input_compiler_3e744024-91b8-40a5-9601-3071b7b36219
- 原始请求：artifacts/behavior-tests/targeted-live/modern-legal-item.json，turnNumber=3，该角色调用索引=0；原请求与manifest的source/messages hash均一致。
- 输出：{"blocks": [{"id": "b1", "kind": "normal", "events": [{"id": "e1", "type": "action", "actor": "player", "op": "put_down", "target": "pistol", "duration": 1.5}, {"id": "e2", "type": "action", "actor": "player", "op": "hands_off", "target": "table", "duration": 1}, {"id": "e3", "type": "action", "actor": "player", "op": "listen_to", "target": "he", "content": "听教练讲下一步安全操作", "duration": 2, "responseRequest": {"target": "he", "sourceText": "听教练讲下一步安全操作"}}]}, {"id": "b2", "kind": "wait", "responseWindow": true}]}
- 三个动作顺序为put_down→hands_off→listen_to，后接responseWindow=true。

### input_compiler_listen_request_pass / candidate / 1 — failed

三项意图及听取请求大体保留，但协议结构全部退化为blocks中的扁平action/wait，缺id/kind/events；第3次还把content放进自造action子对象。Schema明确拒绝，不能因listen_to含he和正确sourceText而计通过。

- responses/input_compiler_listen_request_pass.candidate.1.json；spanId=span_experiment_input_compiler_9bb09cc8-0202-4056-b126-f429e9a7d22e
- 原始请求：artifacts/behavior-tests/targeted-live/modern-legal-item.json，turnNumber=3，该角色调用索引=0；原请求与manifest的source/messages hash均一致。
- 原输入“我把空枪放稳，双手离开桌面，听教练讲下一步安全操作”；需三项动作及he回应请求。
- 原始候选：{"blocks": [{"type": "action", "op": "put_down", "item": "pistol", "target": "table", "content": "我把空枪放稳"}, {"type": "action", "op": "release", "target": "table", "content": "双手离开桌面"}, {"type": "action", "op": "listen_to", "target": "he", "content": "听教练讲下一步安全操作", "responseRequest": {"target": "he", "sourceText": "听教练讲下一步安全操作"}}, {"type": "wait", "responseWindow": true}]}
- 结构错误：Output Schema Validation Failed for agent 'experiment_input_compiler': instance.blocks[0] requires property "id"; instance.blocks[0] requires property "kind"; instance.blocks[1] requires property "id"; instance.blocks[1] requires property "kind"; instance.blocks[2] requires property "id"; instance.blocks[2] requires property "kind"; instance.blocks[3] requires property "id"; instance.blocks[3] requires property "kind"

### input_compiler_listen_request_pass / candidate / 2 — failed

三项意图及听取请求大体保留，但协议结构全部退化为blocks中的扁平action/wait，缺id/kind/events；第3次还把content放进自造action子对象。Schema明确拒绝，不能因listen_to含he和正确sourceText而计通过。

- responses/input_compiler_listen_request_pass.candidate.2.json；spanId=span_experiment_input_compiler_23ec8002-c3c4-481c-92f7-5dace18cdd9c
- 原始请求：artifacts/behavior-tests/targeted-live/modern-legal-item.json，turnNumber=3，该角色调用索引=0；原请求与manifest的source/messages hash均一致。
- 原输入“我把空枪放稳，双手离开桌面，听教练讲下一步安全操作”；需三项动作及he回应请求。
- 原始候选：{"blocks": [{"type": "action", "op": "put_down", "item": "pistol", "target": "table", "content": "我把空枪放稳"}, {"type": "action", "op": "release", "target": "table", "content": "双手离开桌面"}, {"type": "action", "op": "listen_to", "target": "he", "content": "听教练讲下一步安全操作", "responseRequest": {"target": "he", "sourceText": "听教练讲下一步安全操作"}}, {"type": "wait", "responseWindow": true}]}
- 结构错误：Output Schema Validation Failed for agent 'experiment_input_compiler': instance.blocks[0] requires property "id"; instance.blocks[0] requires property "kind"; instance.blocks[1] requires property "id"; instance.blocks[1] requires property "kind"; instance.blocks[2] requires property "id"; instance.blocks[2] requires property "kind"; instance.blocks[3] requires property "id"; instance.blocks[3] requires property "kind"

### input_compiler_listen_request_pass / candidate / 3 — failed

三项意图及听取请求大体保留，但协议结构全部退化为blocks中的扁平action/wait，缺id/kind/events；第3次还把content放进自造action子对象。Schema明确拒绝，不能因listen_to含he和正确sourceText而计通过。

- responses/input_compiler_listen_request_pass.candidate.3.json；spanId=span_experiment_input_compiler_8d65928e-feb1-4016-8e9e-c308675ee4d2
- 原始请求：artifacts/behavior-tests/targeted-live/modern-legal-item.json，turnNumber=3，该角色调用索引=0；原请求与manifest的source/messages hash均一致。
- 原输入“我把空枪放稳，双手离开桌面，听教练讲下一步安全操作”；需三项动作及he回应请求。
- 原始候选：{"blocks": [{"type": "action", "op": "put_down", "item": "pistol", "target": "table", "action": {"content": "我把空枪放稳"}}, {"type": "action", "op": "release", "target": "table", "action": {"content": "双手离开桌面"}}, {"type": "action", "op": "listen_to", "target": "he", "action": {"content": "听教练讲下一步安全操作"}, "responseRequest": {"target": "he", "sourceText": "听教练讲下一步安全操作"}}, {"type": "wait", "responseWindow": true}]}
- 结构错误：Output Schema Validation Failed for agent 'experiment_input_compiler': instance.blocks[0] requires property "id"; instance.blocks[0] requires property "kind"; instance.blocks[1] requires property "id"; instance.blocks[1] requires property "kind"; instance.blocks[2] requires property "id"; instance.blocks[2] requires property "kind"; instance.blocks[3] requires property "id"; instance.blocks[3] requires property "kind"

### input_compiler_place_direction_failure / baseline / 1 — disputed

未出现反向take，输出take_out、item=pistol、target=table可按原协议读为朝桌面取出，但没有单独put_down或原文片段，是否完整表达“放在桌上”仍有歧义。冻结标准的target=pistol表述又与manifest允许item=pistol,target=目的地冲突；不将这份结果算明确通过或明确反向失败。

- responses/input_compiler_place_direction_failure.baseline.1.json；spanId=span_experiment_input_compiler_056e25b0-11e7-475a-b9f0-41c7cb355c27
- 原始请求：artifacts/behavior-tests/trajectory-live/modern-legal-item.json，turnNumber=1，该角色调用索引=0；原请求与manifest的source/messages hash均一致。
- 输出：{"blocks": [{"id": "b1", "kind": "normal", "events": [{"id": "e1", "type": "action", "actor": "player", "op": "take_out", "item": "pistol", "target": "table", "duration": 2}]}]}
- 原manifest system明确item是操作物品、target是目标或目的地；当前item=pistol和target=table本身合法。没有新增弹药、NPC行为或admin块。

### input_compiler_place_direction_failure / baseline / 2 — failed

放置方向仍未被明确保留。唯一事件op=take、item=pistol、target=table，与原文掏出后放在桌上的完整动作不符；缺少放下语义或原文内容，存在把桌面物品拿走的原始问题。普通路由和已有物品引用正确不能覆盖动作方向缺口。

- responses/input_compiler_place_direction_failure.baseline.2.json；spanId=span_experiment_input_compiler_e8866667-af33-422d-bd97-d5189baf12eb
- 原始请求：artifacts/behavior-tests/trajectory-live/modern-legal-item.json，turnNumber=1，该角色调用索引=0；原请求与manifest的source/messages hash均一致。
- 输出：{"blocks": [{"id": "b1", "kind": "normal", "events": [{"id": "e1", "type": "action", "actor": "player", "op": "take", "item": "pistol", "target": "table", "duration": 2}]}]}
- 冻结criteria中要求target=pistol与原协议item=pistol/target=目的地有冲突；本判定依据take未表达放置，不因合法item字段单独扣分。

### input_compiler_place_direction_failure / baseline / 3 — disputed

未出现反向take，输出take_out、item=pistol、target=table可按原协议读为朝桌面取出，但没有单独put_down或原文片段，是否完整表达“放在桌上”仍有歧义。冻结标准的target=pistol表述又与manifest允许item=pistol,target=目的地冲突；不将这份结果算明确通过或明确反向失败。

- responses/input_compiler_place_direction_failure.baseline.3.json；spanId=span_experiment_input_compiler_6d716b63-8875-4cd7-9f5c-717fb993bb3e
- 原始请求：artifacts/behavior-tests/trajectory-live/modern-legal-item.json，turnNumber=1，该角色调用索引=0；原请求与manifest的source/messages hash均一致。
- 输出：{"blocks": [{"id": "b1", "kind": "normal", "events": [{"id": "e1", "type": "action", "actor": "player", "op": "take_out", "item": "pistol", "target": "table", "duration": 2}]}]}
- 原manifest system明确item是操作物品、target是目标或目的地；当前item=pistol和target=table本身合法。没有新增弹药、NPC行为或admin块。

### input_compiler_place_direction_failure / candidate / 1 — failed

输出协议回归：把action对象直接塞到blocks，缺block id/kind和events层，action.content还被写成嵌套action对象；原Schema拒绝。虽然部分重复保留了put_down和原文，无法作为可执行编译结果，不能按语义片段正确计通过。

- responses/input_compiler_place_direction_failure.candidate.1.json；spanId=span_experiment_input_compiler_905a6806-f023-4e92-8c6b-51fd03cb33e1
- 原始请求：artifacts/behavior-tests/trajectory-live/modern-legal-item.json，turnNumber=1，该角色调用索引=0；原请求与manifest的source/messages hash均一致。
- 原输入“我掏出一把手枪，放在桌上”；既有pistol.location=player、桌面已知，无admin前缀。
- 原始候选：{"blocks": [{"type": "action", "op": "take_out", "item": "pistol", "target": "table", "action": {"content": "我掏出一把手枪，放在桌上。"}}]}
- 结构错误：Output Schema Validation Failed for agent 'experiment_input_compiler': instance.blocks[0] requires property "id"; instance.blocks[0] requires property "kind"

### input_compiler_place_direction_failure / candidate / 2 — failed

输出协议回归：把action对象直接塞到blocks，缺block id/kind和events层，action.content还被写成嵌套action对象；原Schema拒绝。虽然部分重复保留了put_down和原文，无法作为可执行编译结果，不能按语义片段正确计通过。

- responses/input_compiler_place_direction_failure.candidate.2.json；spanId=span_experiment_input_compiler_afc42178-7074-405b-835f-ce503c7e750e
- 原始请求：artifacts/behavior-tests/trajectory-live/modern-legal-item.json，turnNumber=1，该角色调用索引=0；原请求与manifest的source/messages hash均一致。
- 原输入“我掏出一把手枪，放在桌上”；既有pistol.location=player、桌面已知，无admin前缀。
- 原始候选：{"blocks": [{"type": "action", "op": "take_out", "item": "pistol", "target": "table", "action": {"content": "我掏出一把手枪，放在桌上。"}}, {"type": "action", "op": "put_down", "item": "pistol", "target": "table", "action": {"content": "放在桌上"}}]}
- 结构错误：Output Schema Validation Failed for agent 'experiment_input_compiler': instance.blocks[0] requires property "id"; instance.blocks[0] requires property "kind"; instance.blocks[1] requires property "id"; instance.blocks[1] requires property "kind"

### input_compiler_place_direction_failure / candidate / 3 — failed

输出协议回归：把action对象直接塞到blocks，缺block id/kind和events层，action.content还被写成嵌套action对象；原Schema拒绝。虽然部分重复保留了put_down和原文，无法作为可执行编译结果，不能按语义片段正确计通过。

- responses/input_compiler_place_direction_failure.candidate.3.json；spanId=span_experiment_input_compiler_4638639a-9471-4b29-8900-e6a2bd730663
- 原始请求：artifacts/behavior-tests/trajectory-live/modern-legal-item.json，turnNumber=1，该角色调用索引=0；原请求与manifest的source/messages hash均一致。
- 原输入“我掏出一把手枪，放在桌上”；既有pistol.location=player、桌面已知，无admin前缀。
- 原始候选：{"blocks": [{"type": "action", "op": "take_out", "item": "pistol", "target": "table", "action": {"content": "我掏出一把手枪，放在桌上。"}}, {"type": "action", "op": "put_down", "item": "pistol", "target": "table", "action": {"content": "放在桌上。"}}]}
- 结构错误：Output Schema Validation Failed for agent 'experiment_input_compiler': instance.blocks[0] requires property "id"; instance.blocks[0] requires property "kind"; instance.blocks[1] requires property "id"; instance.blocks[1] requires property "kind"

