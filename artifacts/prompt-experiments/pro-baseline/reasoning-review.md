# Pro 原提示词：Compiler 与人物审查人工复核

已人工核对全部21条：input_compiler 6条，character_change_auditor 15条，各case原提示词重复3次。这里只编辑本目录复核文件，未修改提示词、正式配置、源码或金标准。

复核沿用v1标准：失败审查不能仅看valid值；疑虑所指对象的歧义继续单列disputed；物品item与目的地target的合法组合不因criteria字面冲突被拒。逐case核实完整baseline请求消息、Schema hash、原始source和冻结criteria与v1一致；实际模型为deepseek/deepseek-v4-pro-0813。temperature保持compiler 0.2、人物审查0.1，top_p=1，reasoning_effort=none，没有新增摘要envelope。

## 与v1 baseline对比

| Case | v1 Flash baseline 通过/失败/争议 | Pro baseline 通过/失败/争议 |
|---|---:|---:|
| input_compiler_place_direction_failure | 0/1/2 | 3/0/0 |
| input_compiler_listen_request_pass | 2/1/0 | 1/2/0 |
| character_auditor_suspicion_direction_miss | 0/0/3 | 0/0/3 |
| character_auditor_invented_shared_past_miss | 0/3/0 | 0/3/0 |
| character_auditor_apology_count_miss | 0/3/0 | 0/3/0 |
| character_auditor_corrected_caution_pass | 3/0/0 | 3/0/0 |
| character_auditor_accounted_breach_pass | 3/0/0 | 3/0/0 |

Pro合计：10/21通过、8失败、3争议。v1 Flash baseline为8通过、8失败、5争议。两者均无not_evaluable。

Compiler取放方向有改善：Pro 3/3都显式take→place，v1该case为0通过、1失败、2争议。但听取安全讲解case从v1的2/3通过降到Pro的1/3：Pro前两份虽保留listen请求，却漏掉双手离桌并失去被放置的物品ID。Compiler合计Pro为4通过、2失败；v1为2通过、2失败、2争议。

人物审查没有看到改进：15份全部返回valid=true；其中两个正对照各3/3正确放行，无来源共同过去与错误道歉次数仍各3/3漏报，疑虑方向3份仍按原口径争议。人物审查合计两模型都为6通过、6失败、3争议。

疑虑样本的实际audit只有宽泛“对玩家证词的疑虑”标签、撤回及有限观察，并不含其他NPC输出span中“降低对先前那番话的确信度”那句。主动更正后当前声明与已撤回旧目击的疑虑可能不同，不将这三份结果算作Pro修复或普适错误的证明。金标准保持原样。

本批仅对7个固定单次请求各重复3次，比较的是原提示词下更换模型的样本结果，不是完整世界状态提交或长期游戏稳定性测试；净增加的2份明确通过不能代表人物审查问题已解决，也不能据此宣称模型整体更可靠。

## 原始格式补充（不改变原Schema统计口径）

本报告的结构通过是现有JSON提取解析器及Schema校验通过，不等于原始回复全文是纯JSON。21份中14份为纯JSON、4份带Markdown围栏、3份JSON前有格式说明杂文；后7份均被现有解析器成功提取，保持上述语义评定不变。

- character_auditor_accounted_breach_pass repeat 2：JSON前格式说明杂文。
- character_auditor_apology_count_miss repeat 1：JSON前格式说明杂文。
- character_auditor_apology_count_miss repeat 3：JSON前格式说明杂文。
- input_compiler_listen_request_pass repeat 1：Markdown围栏。
- input_compiler_listen_request_pass repeat 2：Markdown围栏。
- input_compiler_listen_request_pass repeat 3：Markdown围栏。
- input_compiler_place_direction_failure repeat 2：Markdown围栏。

## 逐条复核

### character_auditor_accounted_breach_pass / baseline / 1 — passed

正确放行首次结算当前新确认的失约。当前“其实没有伞，刚才不该保证”使之前尚待兑现的保证明确落空；历史两字段此前均未变，本次下降有新证据且理由分开，不属于重复奖励或重复扣分。

- responses/character_auditor_accounted_breach_pass.baseline.1.json；spanId=span_experiment_character_change_auditor_27d445e7-8a14-4c17-b0d8-61b18629c243。
- 原请求：artifacts/behavior-tests/trajectory-live/promise-repair.json，turnNumber=2，该角色调用索引=0；完整baseline消息、Schema hash、criteria、source hash与v1一致。
- 请求模型deepseek/deepseek-v4-pro-0813；temperature=0.1、top_p=1、reasoning_effort=none；没有摘要envelope。
- settledStateHistory前回合及本轮已提交部分均为unchanged=0.4、sourceEventIds=[]；候选才提议0.4→0.3及0.4→0.37。
- 本次sourceEventIds=t2_b0_e1是当前可感知承认，旧承诺作为个人历史提供语境；输出valid=true、两类issues为空。
- 本次Pro实际结果：{"valid": true, "issues": [], "speechIssues": []}
- 原始文本格式：整段可直接解析为JSON。


### character_auditor_accounted_breach_pass / baseline / 2 — passed

正确放行首次结算当前新确认的失约。当前“其实没有伞，刚才不该保证”使之前尚待兑现的保证明确落空；历史两字段此前均未变，本次下降有新证据且理由分开，不属于重复奖励或重复扣分。

- responses/character_auditor_accounted_breach_pass.baseline.2.json；spanId=span_experiment_character_change_auditor_0e1a56bb-c995-4946-98a7-0527b2d37b2d。
- 原请求：artifacts/behavior-tests/trajectory-live/promise-repair.json，turnNumber=2，该角色调用索引=0；完整baseline消息、Schema hash、criteria、source hash与v1一致。
- 请求模型deepseek/deepseek-v4-pro-0813；temperature=0.1、top_p=1、reasoning_effort=none；没有摘要envelope。
- settledStateHistory前回合及本轮已提交部分均为unchanged=0.4、sourceEventIds=[]；候选才提议0.4→0.3及0.4→0.37。
- 本次sourceEventIds=t2_b0_e1是当前可感知承认，旧承诺作为个人历史提供语境；输出valid=true、两类issues为空。
- 本次Pro实际结果：{"valid": true, "issues": [], "speechIssues": []}
- 原始文本格式：JSON前有格式说明杂文；runtime抽取JSON后经原Schema校验success=true。结构通过指现有解析器加Schema通过，不表示原回复是纯JSON；沿用v1口径，不因此改语义状态。


### character_auditor_accounted_breach_pass / baseline / 3 — passed

正确放行首次结算当前新确认的失约。当前“其实没有伞，刚才不该保证”使之前尚待兑现的保证明确落空；历史两字段此前均未变，本次下降有新证据且理由分开，不属于重复奖励或重复扣分。

- responses/character_auditor_accounted_breach_pass.baseline.3.json；spanId=span_experiment_character_change_auditor_037a3670-6088-47a6-ab60-c9c557667e69。
- 原请求：artifacts/behavior-tests/trajectory-live/promise-repair.json，turnNumber=2，该角色调用索引=0；完整baseline消息、Schema hash、criteria、source hash与v1一致。
- 请求模型deepseek/deepseek-v4-pro-0813；temperature=0.1、top_p=1、reasoning_effort=none；没有摘要envelope。
- settledStateHistory前回合及本轮已提交部分均为unchanged=0.4、sourceEventIds=[]；候选才提议0.4→0.3及0.4→0.37。
- 本次sourceEventIds=t2_b0_e1是当前可感知承认，旧承诺作为个人历史提供语境；输出valid=true、两类issues为空。
- 本次Pro实际结果：{"valid": true, "issues": [], "speechIssues": []}
- 原始文本格式：整段可直接解析为JSON。


### character_auditor_apology_count_miss / baseline / 1 — failed

漏报新增记忆的无来源次数。updateIndex=0写“第三次提道歉”，原材料只有第一次保证、一次道歉、借雨衣声明和当前再次道歉，借雨衣没有第三次口头道歉。审查未区分正确的当轮强求信任事实和错误计数，整体放行。

- responses/character_auditor_apology_count_miss.baseline.1.json；spanId=span_experiment_character_change_auditor_d0a4cfd7-3ba1-4d45-88ba-6d5f5d99f769。
- 原请求：artifacts/behavior-tests/final-live/promise-repair.json，turnNumber=4，该角色调用索引=0；完整baseline消息、Schema hash、criteria、source hash与v1一致。
- 请求模型deepseek/deepseek-v4-pro-0813；temperature=0.1、top_p=1、reasoning_effort=none；没有摘要envelope。
- recentExperiences中的三条玩家原话为“我保证借你一把伞，等我一下”“对不起，我其实没有伞，刚才不该保证”“这件确实是我的，借你用”；当前为“我再道歉一次…”。
- 应对属性updateIndex=0指出计数缺口；输出valid=true、issues=[]、speechIssues=[]。未要求替代关系数值。
- 本次Pro实际结果：{"valid": true, "issues": [], "speechIssues": []}
- 原始文本格式：JSON前有格式说明杂文；runtime抽取JSON后经原Schema校验success=true。结构通过指现有解析器加Schema通过，不表示原回复是纯JSON；沿用v1口径，不因此改语义状态。


### character_auditor_apology_count_miss / baseline / 2 — failed

漏报新增记忆的无来源次数。updateIndex=0写“第三次提道歉”，原材料只有第一次保证、一次道歉、借雨衣声明和当前再次道歉，借雨衣没有第三次口头道歉。审查未区分正确的当轮强求信任事实和错误计数，整体放行。

- responses/character_auditor_apology_count_miss.baseline.2.json；spanId=span_experiment_character_change_auditor_6ad2b9e2-5a8f-4249-8b20-2dce54454d24。
- 原请求：artifacts/behavior-tests/final-live/promise-repair.json，turnNumber=4，该角色调用索引=0；完整baseline消息、Schema hash、criteria、source hash与v1一致。
- 请求模型deepseek/deepseek-v4-pro-0813；temperature=0.1、top_p=1、reasoning_effort=none；没有摘要envelope。
- recentExperiences中的三条玩家原话为“我保证借你一把伞，等我一下”“对不起，我其实没有伞，刚才不该保证”“这件确实是我的，借你用”；当前为“我再道歉一次…”。
- 应对属性updateIndex=0指出计数缺口；输出valid=true、issues=[]、speechIssues=[]。未要求替代关系数值。
- 本次Pro实际结果：{"valid": true, "issues": [], "speechIssues": []}
- 原始文本格式：整段可直接解析为JSON。


### character_auditor_apology_count_miss / baseline / 3 — failed

漏报新增记忆的无来源次数。updateIndex=0写“第三次提道歉”，原材料只有第一次保证、一次道歉、借雨衣声明和当前再次道歉，借雨衣没有第三次口头道歉。审查未区分正确的当轮强求信任事实和错误计数，整体放行。

- responses/character_auditor_apology_count_miss.baseline.3.json；spanId=span_experiment_character_change_auditor_2df4fc25-0826-40ee-b244-0ff857396166。
- 原请求：artifacts/behavior-tests/final-live/promise-repair.json，turnNumber=4，该角色调用索引=0；完整baseline消息、Schema hash、criteria、source hash与v1一致。
- 请求模型deepseek/deepseek-v4-pro-0813；temperature=0.1、top_p=1、reasoning_effort=none；没有摘要envelope。
- recentExperiences中的三条玩家原话为“我保证借你一把伞，等我一下”“对不起，我其实没有伞，刚才不该保证”“这件确实是我的，借你用”；当前为“我再道歉一次…”。
- 应对属性updateIndex=0指出计数缺口；输出valid=true、issues=[]、speechIssues=[]。未要求替代关系数值。
- 本次Pro实际结果：{"valid": true, "issues": [], "speechIssues": []}
- 原始文本格式：JSON前有格式说明杂文；runtime抽取JSON后经原Schema校验success=true。结构通过指现有解析器加Schema通过，不表示原回复是纯JSON；沿用v1口径，不因此改语义状态。


### character_auditor_corrected_caution_pass / baseline / 1 — passed

正确放行已移除虚构旧事的候选。当前承诺按未兑现来源记录，两个关系维度不变，计划只问时间/是否有伞并强调行动；没有把泛化谨慎误判为具体历史或强制新增属性变化。

- responses/character_auditor_corrected_caution_pass.baseline.1.json；spanId=span_experiment_character_change_auditor_582376ab-6bc4-4850-ada2-79e160dd77d6。
- 原请求：artifacts/behavior-tests/trajectory-live/promise-repair.json，turnNumber=1，该角色调用索引=1；完整baseline消息、Schema hash、criteria、source hash与v1一致。
- 请求模型deepseek/deepseek-v4-pro-0813；temperature=0.1、top_p=1、reasoning_effort=none；没有摘要envelope。
- 本请求speechPlan没有“上次你也说过”，不能将此前不同请求的坏候选带入本次判断。
- 原数值轨迹unchanged=0.4，proposedStateUpdates仅有当前承诺的记忆；输出valid=true且两类issues为空。
- 本次Pro实际结果：{"valid": true, "issues": [], "speechIssues": []}
- 原始文本格式：整段可直接解析为JSON。


### character_auditor_corrected_caution_pass / baseline / 2 — passed

正确放行已移除虚构旧事的候选。当前承诺按未兑现来源记录，两个关系维度不变，计划只问时间/是否有伞并强调行动；没有把泛化谨慎误判为具体历史或强制新增属性变化。

- responses/character_auditor_corrected_caution_pass.baseline.2.json；spanId=span_experiment_character_change_auditor_b4baba3e-cf42-40dc-bae7-704d4df6017a。
- 原请求：artifacts/behavior-tests/trajectory-live/promise-repair.json，turnNumber=1，该角色调用索引=1；完整baseline消息、Schema hash、criteria、source hash与v1一致。
- 请求模型deepseek/deepseek-v4-pro-0813；temperature=0.1、top_p=1、reasoning_effort=none；没有摘要envelope。
- 本请求speechPlan没有“上次你也说过”，不能将此前不同请求的坏候选带入本次判断。
- 原数值轨迹unchanged=0.4，proposedStateUpdates仅有当前承诺的记忆；输出valid=true且两类issues为空。
- 本次Pro实际结果：{"valid": true, "issues": [], "speechIssues": []}
- 原始文本格式：整段可直接解析为JSON。


### character_auditor_corrected_caution_pass / baseline / 3 — passed

正确放行已移除虚构旧事的候选。当前承诺按未兑现来源记录，两个关系维度不变，计划只问时间/是否有伞并强调行动；没有把泛化谨慎误判为具体历史或强制新增属性变化。

- responses/character_auditor_corrected_caution_pass.baseline.3.json；spanId=span_experiment_character_change_auditor_c5c389d7-16e2-4222-8694-6542063c6cb1。
- 原请求：artifacts/behavior-tests/trajectory-live/promise-repair.json，turnNumber=1，该角色调用索引=1；完整baseline消息、Schema hash、criteria、source hash与v1一致。
- 请求模型deepseek/deepseek-v4-pro-0813；temperature=0.1、top_p=1、reasoning_effort=none；没有摘要envelope。
- 本请求speechPlan没有“上次你也说过”，不能将此前不同请求的坏候选带入本次判断。
- 原数值轨迹unchanged=0.4，proposedStateUpdates仅有当前承诺的记忆；输出valid=true且两类issues为空。
- 本次Pro实际结果：{"valid": true, "issues": [], "speechIssues": []}
- 原始文本格式：整段可直接解析为JSON。


### character_auditor_invented_shared_past_miss / baseline / 1 — failed

漏报无依据的具体共同过去。发言intentIndex=1肯定提醒对方“上次也这么说过”，背景只说曾受空头承诺耽误，没有绑定为当前玩家；空个人历史本身也不是新增共同过去的证据。审查全部放行，未指出这一确定事实缺口。

- responses/character_auditor_invented_shared_past_miss.baseline.1.json；spanId=span_experiment_character_change_auditor_6668deaa-d44b-47fb-8152-28e72b4bec62。
- 原请求：artifacts/behavior-tests/final-live/promise-repair.json，turnNumber=1，该角色调用索引=0；完整baseline消息、Schema hash、criteria、source hash与v1一致。
- 请求模型deepseek/deepseek-v4-pro-0813；temperature=0.1、top_p=1、reasoning_effort=none；没有摘要envelope。
- before.attributes.memories为空、recentExperiences=[]；当前唯一具体承诺来自t1_b0_e1。
- 当前承诺记忆有来源可保留；应针对speechIssues.intentIndex=1，输出却为valid=true、issues=[]、speechIssues=[]。
- 本次Pro实际结果：{"valid": true, "issues": [], "speechIssues": []}
- 原始文本格式：整段可直接解析为JSON。


### character_auditor_invented_shared_past_miss / baseline / 2 — failed

漏报无依据的具体共同过去。发言intentIndex=1肯定提醒对方“上次也这么说过”，背景只说曾受空头承诺耽误，没有绑定为当前玩家；空个人历史本身也不是新增共同过去的证据。审查全部放行，未指出这一确定事实缺口。

- responses/character_auditor_invented_shared_past_miss.baseline.2.json；spanId=span_experiment_character_change_auditor_0a71478e-13ae-49f5-bc92-9558118c6b00。
- 原请求：artifacts/behavior-tests/final-live/promise-repair.json，turnNumber=1，该角色调用索引=0；完整baseline消息、Schema hash、criteria、source hash与v1一致。
- 请求模型deepseek/deepseek-v4-pro-0813；temperature=0.1、top_p=1、reasoning_effort=none；没有摘要envelope。
- before.attributes.memories为空、recentExperiences=[]；当前唯一具体承诺来自t1_b0_e1。
- 当前承诺记忆有来源可保留；应针对speechIssues.intentIndex=1，输出却为valid=true、issues=[]、speechIssues=[]。
- 本次Pro实际结果：{"valid": true, "issues": [], "speechIssues": []}
- 原始文本格式：整段可直接解析为JSON。


### character_auditor_invented_shared_past_miss / baseline / 3 — failed

漏报无依据的具体共同过去。发言intentIndex=1肯定提醒对方“上次也这么说过”，背景只说曾受空头承诺耽误，没有绑定为当前玩家；空个人历史本身也不是新增共同过去的证据。审查全部放行，未指出这一确定事实缺口。

- responses/character_auditor_invented_shared_past_miss.baseline.3.json；spanId=span_experiment_character_change_auditor_10810b77-92e2-4b52-91d8-7c9bab46ebec。
- 原请求：artifacts/behavior-tests/final-live/promise-repair.json，turnNumber=1，该角色调用索引=0；完整baseline消息、Schema hash、criteria、source hash与v1一致。
- 请求模型deepseek/deepseek-v4-pro-0813；temperature=0.1、top_p=1、reasoning_effort=none；没有摘要envelope。
- before.attributes.memories为空、recentExperiences=[]；当前唯一具体承诺来自t1_b0_e1。
- 当前承诺记忆有来源可保留；应针对speechIssues.intentIndex=1，输出却为valid=true、issues=[]、speechIssues=[]。
- 本次Pro实际结果：{"valid": true, "issues": [], "speechIssues": []}
- 原始文本格式：整段可直接解析为JSON。


### character_auditor_suspicion_direction_miss / baseline / 1 — disputed

未达到冻结的“拒绝updateIndex=0”标准，但原审查请求对疑虑所指对象存在语义歧义，不能仅由valid=true断定普适方向错误。字段只有“对玩家证词的疑虑”标签，未限定已撤回的旧目击还是更正后的有限声明；主动撤回夸大陈述可使对当前表述的疑虑缓和。理由将疑虑与误采信风险混用值得质疑，审查没有解释，但这不足以消除样本歧义。

- responses/character_auditor_suspicion_direction_miss.baseline.1.json；spanId=span_experiment_character_change_auditor_286a4e7c-f336-42d8-82cc-1941c7e3ca91。
- 原请求：artifacts/behavior-tests/final-live/testimony-correction.json，turnNumber=2，该角色调用索引=0；完整baseline消息、Schema hash、criteria、source hash与v1一致。
- 请求模型deepseek/deepseek-v4-pro-0813；temperature=0.1、top_p=1、reasoning_effort=none；没有摘要envelope。
- 审查输入有before=0.4、proposed=0.3及承认只见划痕的当前观察；没有NPC thought中“降低对先前那番话的确信度”那句，不能从其他span补入作为审查已知材料。
- 输出valid=true、issues=[]、speechIssues=[]；更正记忆及有限知识发言未被误报。该争议不计为新旧通过或修复证明。
- 本次Pro实际结果：{"valid": true, "issues": [], "speechIssues": []}
- 原始文本格式：整段可直接解析为JSON。


### character_auditor_suspicion_direction_miss / baseline / 2 — disputed

未达到冻结的“拒绝updateIndex=0”标准，但原审查请求对疑虑所指对象存在语义歧义，不能仅由valid=true断定普适方向错误。字段只有“对玩家证词的疑虑”标签，未限定已撤回的旧目击还是更正后的有限声明；主动撤回夸大陈述可使对当前表述的疑虑缓和。理由将疑虑与误采信风险混用值得质疑，审查没有解释，但这不足以消除样本歧义。

- responses/character_auditor_suspicion_direction_miss.baseline.2.json；spanId=span_experiment_character_change_auditor_a0d5f46f-6bdb-4063-b21c-297795fb6ee8。
- 原请求：artifacts/behavior-tests/final-live/testimony-correction.json，turnNumber=2，该角色调用索引=0；完整baseline消息、Schema hash、criteria、source hash与v1一致。
- 请求模型deepseek/deepseek-v4-pro-0813；temperature=0.1、top_p=1、reasoning_effort=none；没有摘要envelope。
- 审查输入有before=0.4、proposed=0.3及承认只见划痕的当前观察；没有NPC thought中“降低对先前那番话的确信度”那句，不能从其他span补入作为审查已知材料。
- 输出valid=true、issues=[]、speechIssues=[]；更正记忆及有限知识发言未被误报。该争议不计为新旧通过或修复证明。
- 本次Pro实际结果：{"valid": true, "issues": [], "speechIssues": []}
- 原始文本格式：整段可直接解析为JSON。


### character_auditor_suspicion_direction_miss / baseline / 3 — disputed

未达到冻结的“拒绝updateIndex=0”标准，但原审查请求对疑虑所指对象存在语义歧义，不能仅由valid=true断定普适方向错误。字段只有“对玩家证词的疑虑”标签，未限定已撤回的旧目击还是更正后的有限声明；主动撤回夸大陈述可使对当前表述的疑虑缓和。理由将疑虑与误采信风险混用值得质疑，审查没有解释，但这不足以消除样本歧义。

- responses/character_auditor_suspicion_direction_miss.baseline.3.json；spanId=span_experiment_character_change_auditor_41b6886e-4c36-4b18-a25d-6b4787b4d37a。
- 原请求：artifacts/behavior-tests/final-live/testimony-correction.json，turnNumber=2，该角色调用索引=0；完整baseline消息、Schema hash、criteria、source hash与v1一致。
- 请求模型deepseek/deepseek-v4-pro-0813；temperature=0.1、top_p=1、reasoning_effort=none；没有摘要envelope。
- 审查输入有before=0.4、proposed=0.3及承认只见划痕的当前观察；没有NPC thought中“降低对先前那番话的确信度”那句，不能从其他span补入作为审查已知材料。
- 输出valid=true、issues=[]、speechIssues=[]；更正记忆及有限知识发言未被误报。该争议不计为新旧通过或修复证明。
- 本次Pro实际结果：{"valid": true, "issues": [], "speechIssues": []}
- 原始文本格式：整段可直接解析为JSON。


### input_compiler_listen_request_pass / baseline / 1 — failed

结构通过但漏掉“双手离开桌面”，也未明确放置的是手枪：第一事件仅place,target=table，无item=pistol或保留原文content，无法从输出确认实际操作物品。listen_to he、逐字responseRequest和wait虽正确，不能覆盖前两项动作的信息缺失。

- responses/input_compiler_listen_request_pass.baseline.1.json；spanId=span_experiment_input_compiler_685568d2-aff4-4299-bf6f-2dfc7b317913。
- 原请求：artifacts/behavior-tests/targeted-live/modern-legal-item.json，turnNumber=3，该角色调用索引=0；完整baseline消息、Schema hash、criteria、source hash与v1一致。
- 请求模型deepseek/deepseek-v4-pro-0813；temperature=0.2、top_p=1、reasoning_effort=none；没有摘要envelope。
- 原输入包含“我把空枪放稳，双手离开桌面，听教练讲下一步安全操作”三项意图。
- 本次输出只有place(target=table)和listen_to；没有hands_off/move_hands_away等动作，也没有任何content保留离手原文。与v2把离手写入组合动作content的情况不同。
- 本次输出：{"blocks": [{"id": "b1", "kind": "normal", "events": [{"id": "e1", "type": "action", "actor": "player", "op": "place", "target": "table", "duration": 1.5}, {"id": "e2", "type": "action", "actor": "player", "op": "listen_to", "target": "he", "content": "听教练讲下一步安全操作", "responseRequest": {"target": "he", "sourceText": "听教练讲下一步安全操作"}}]}, {"id": "b2", "kind": "wait", "responseWindow": true}]}
- 原始文本格式：包含Markdown代码围栏；runtime抽取JSON后经原Schema校验success=true。结构通过指现有解析器加Schema通过，不表示原回复是纯JSON；沿用v1口径，不因此改语义状态。


### input_compiler_listen_request_pass / baseline / 2 — failed

结构通过但漏掉“双手离开桌面”，也未明确放置的是手枪：第一事件仅place,target=table，无item=pistol或保留原文content，无法从输出确认实际操作物品。listen_to he、逐字responseRequest和wait虽正确，不能覆盖前两项动作的信息缺失。

- responses/input_compiler_listen_request_pass.baseline.2.json；spanId=span_experiment_input_compiler_502c77f1-1713-4854-86f4-fe663a40e1b1。
- 原请求：artifacts/behavior-tests/targeted-live/modern-legal-item.json，turnNumber=3，该角色调用索引=0；完整baseline消息、Schema hash、criteria、source hash与v1一致。
- 请求模型deepseek/deepseek-v4-pro-0813；temperature=0.2、top_p=1、reasoning_effort=none；没有摘要envelope。
- 原输入包含“我把空枪放稳，双手离开桌面，听教练讲下一步安全操作”三项意图。
- 本次输出只有place(target=table)和listen_to；没有hands_off/move_hands_away等动作，也没有任何content保留离手原文。与v2把离手写入组合动作content的情况不同。
- 本次输出：{"blocks": [{"id": "b1", "kind": "normal", "events": [{"id": "e1", "type": "action", "actor": "player", "op": "place", "target": "table", "duration": 1.5}, {"id": "e2", "type": "action", "actor": "player", "op": "listen_to", "target": "he", "content": "听教练讲下一步安全操作", "responseRequest": {"target": "he", "sourceText": "听教练讲下一步安全操作"}}]}, {"id": "b2", "kind": "wait", "responseWindow": true}]}
- 原始文本格式：包含Markdown代码围栏；runtime抽取JSON后经原Schema校验success=true。结构通过指现有解析器加Schema通过，不表示原回复是纯JSON；沿用v1口径，不因此改语义状态。


### input_compiler_listen_request_pass / baseline / 3 — passed

明确保留place pistol、move_hands_away table及listen_to he三项动作，正确逐字responseRequest与后续wait齐全。没有生成教练已经讲解的内容，也没有射击、装弹或管理员路由，符合冻结原意保留标准。

- responses/input_compiler_listen_request_pass.baseline.3.json；spanId=span_experiment_input_compiler_c74ac360-93a9-48aa-8917-92d0ac522f78。
- 原请求：artifacts/behavior-tests/targeted-live/modern-legal-item.json，turnNumber=3，该角色调用索引=0；完整baseline消息、Schema hash、criteria、source hash与v1一致。
- 请求模型deepseek/deepseek-v4-pro-0813；temperature=0.2、top_p=1、reasoning_effort=none；没有摘要envelope。
- 三个事件按place→move_hands_away→listen_to排列，物品身份target=pistol没有丢失。
- listen_to.content与responseRequest.sourceText均为“听教练讲下一步安全操作”，target均为he；后续wait.responseWindow=true。
- 本次输出：{"blocks": [{"id": "b1", "kind": "normal", "events": [{"id": "e1", "type": "action", "actor": "player", "op": "place", "target": "pistol", "duration": 1.5}, {"id": "e2", "type": "action", "actor": "player", "op": "move_hands_away", "target": "table", "duration": 1}, {"id": "e3", "type": "action", "actor": "player", "op": "listen_to", "target": "he", "content": "听教练讲下一步安全操作", "responseRequest": {"target": "he", "sourceText": "听教练讲下一步安全操作"}}]}, {"id": "b2", "kind": "wait", "responseWindow": true}]}
- 原始文本格式：包含Markdown代码围栏；runtime抽取JSON后经原Schema校验success=true。结构通过指现有解析器加Schema通过，不表示原回复是纯JSON；沿用v1口径，不因此改语义状态。


### input_compiler_place_direction_failure / baseline / 1 — passed

正确保留先取出再放桌的完整方向：take的对象由item=pistol、目标player限定，之后同一pistol明确place到table，没有从桌面反向拿走的结果。normal/events层级和必需字段均有效，未新增枪支、弹药或admin命令。

- responses/input_compiler_place_direction_failure.baseline.1.json；spanId=span_experiment_input_compiler_fcb18143-bf51-444c-9903-8f764ba6a6b4。
- 原请求：artifacts/behavior-tests/trajectory-live/modern-legal-item.json，turnNumber=1，该角色调用索引=0；完整baseline消息、Schema hash、criteria、source hash与v1一致。
- 请求模型deepseek/deepseek-v4-pro-0813；temperature=0.2、top_p=1、reasoning_effort=none；没有摘要envelope。
- 本次输出：{"blocks": [{"id": "b1", "kind": "normal", "events": [{"id": "e1", "type": "action", "actor": "player", "op": "take", "item": "pistol", "target": "player", "duration": 1}, {"id": "e2", "type": "action", "actor": "player", "op": "place", "item": "pistol", "target": "table", "duration": 1}]}]}
- 原输入“我掏出一把手枪，放在桌上”，已知pistol归player、table为桌子。take→place按顺序表达，第二个place动作消除了v1单独take_out未明确放下的争议。
- 原协议item为物品、target为目标/目的地；item=pistol,target=table是有效表达，不按criteria中target=pistol字面误拒。
- 原始文本格式：整段可直接解析为JSON。


### input_compiler_place_direction_failure / baseline / 2 — passed

正确保留先取出再放桌的完整方向：take的对象由item=pistol、目标player限定，之后同一pistol明确place到table，没有从桌面反向拿走的结果。normal/events层级和必需字段均有效，未新增枪支、弹药或admin命令。

- responses/input_compiler_place_direction_failure.baseline.2.json；spanId=span_experiment_input_compiler_a7c72bd5-b6db-4f35-8619-445fa4220d45。
- 原请求：artifacts/behavior-tests/trajectory-live/modern-legal-item.json，turnNumber=1，该角色调用索引=0；完整baseline消息、Schema hash、criteria、source hash与v1一致。
- 请求模型deepseek/deepseek-v4-pro-0813；temperature=0.2、top_p=1、reasoning_effort=none；没有摘要envelope。
- 本次输出：{"blocks": [{"id": "b1", "kind": "normal", "events": [{"id": "e1", "type": "action", "actor": "player", "op": "take", "item": "pistol", "target": "player", "duration": 1}, {"id": "e2", "type": "action", "actor": "player", "op": "place", "item": "pistol", "target": "table", "duration": 1.5}]}]}
- 原输入“我掏出一把手枪，放在桌上”，已知pistol归player、table为桌子。take→place按顺序表达，第二个place动作消除了v1单独take_out未明确放下的争议。
- 原协议item为物品、target为目标/目的地；item=pistol,target=table是有效表达，不按criteria中target=pistol字面误拒。
- 原始文本格式：包含Markdown代码围栏；runtime抽取JSON后经原Schema校验success=true。结构通过指现有解析器加Schema通过，不表示原回复是纯JSON；沿用v1口径，不因此改语义状态。


### input_compiler_place_direction_failure / baseline / 3 — passed

正确保留先取出再放桌的完整方向：take的对象由item=pistol、目标player限定，之后同一pistol明确place到table，没有从桌面反向拿走的结果。normal/events层级和必需字段均有效，未新增枪支、弹药或admin命令。

- responses/input_compiler_place_direction_failure.baseline.3.json；spanId=span_experiment_input_compiler_2a513a3d-9fa3-47ed-b8df-13a05dac2790。
- 原请求：artifacts/behavior-tests/trajectory-live/modern-legal-item.json，turnNumber=1，该角色调用索引=0；完整baseline消息、Schema hash、criteria、source hash与v1一致。
- 请求模型deepseek/deepseek-v4-pro-0813；temperature=0.2、top_p=1、reasoning_effort=none；没有摘要envelope。
- 本次输出：{"blocks": [{"id": "b1", "kind": "normal", "events": [{"id": "e1", "type": "action", "actor": "player", "op": "take", "item": "pistol", "target": "player", "duration": 1}, {"id": "e2", "type": "action", "actor": "player", "op": "place", "item": "pistol", "target": "table", "duration": 1}]}]}
- 原输入“我掏出一把手枪，放在桌上”，已知pistol归player、table为桌子。take→place按顺序表达，第二个place动作消除了v1单独take_out未明确放下的争议。
- 原协议item为物品、target为目标/目的地；item=pistol,target=table是有效表达，不按criteria中target=pistol字面误拒。
- 原始文本格式：整段可直接解析为JSON。

