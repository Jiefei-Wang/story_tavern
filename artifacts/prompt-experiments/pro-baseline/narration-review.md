# Pro 原提示旁白 · 人工复核

21份回复逐条审阅完成：14通过、7失败，0争议、0无法评估。v1原模型baseline为17/21；本次Pro并未在该固定集全面改善。枪方向仍0/3，纸面记录与工作杜撰有复现；接收范围3/3，两正确对照6/6。

[逐条人工记录](/E:/code/story_tavern/artifacts/prompt-experiments/pro-baseline/narration-review.json) · [本次原请求](/E:/code/story_tavern/artifacts/prompt-experiments/pro-baseline/manifest.json) · [v1 baseline对比](/E:/code/story_tavern/artifacts/prompt-experiments/v1/narration-review.md)

模型：deepseek/deepseek-v4-pro-0813。逐案例验证了baseline全部消息、冻结expected、原数据SHA256和输出schema hash与v1一致；实际调用的temperature=0.8、top_p=1、reasoning_effort=none保持。模型ID是本轮指定变化，正式配置未修改。每项对应 responses/<caseId>.baseline.<repeat>.json。

| 案例 | 类型 | v1 baseline通过 | Pro baseline通过 |
| --- | --- | --- | --- |
| narrator_transfer_direction_failure | 原失败 | 0/3 | 0/3 |
| narrator_uncommitted_work_failure | 原失败 | 3/3 | 1/3 |
| narrator_memory_as_paper_failure | 原失败 | 3/3 | 2/3 |
| narrator_double_counted_wait_failure | 原失败 | 3/3 | 2/3 |
| narrator_impossible_actions_pass | 正确对照 | 3/3 | 3/3 |
| narrator_unheard_whisper_pass | 正确对照 | 3/3 | 3/3 |
| narrator_new_receipt_vs_existing_possession_failure | 原失败 | 2/3 | 3/3 |

## 具体结果

- 方向：3次均写从桌面拿枪或持在玩家手中；实际公开outcome和patch是从玩家移至现场。与v1相同，没有改善。
- 未提交工作：第2次写夏岚在翻动书页的间隙停下；第3次新增实际翻页声。后者没有明确行动者，但原输入也没有其他正在翻书的角色或持续任务，沿v1/v2对翻页事实的标准失败。
- 抽象记录：前两次在心里回顾或口头确认，正常通过；第3次写摊开的记录页和先后写下的字，重新物化无来源纸本。
- 等待：两份成功交付均未重复完整五秒；第3份保留原文也未发现时长错误，但speech额外输出actor、target，被原闭合schema拒绝。结构20/21，不能把内部内容正确掩盖成已正常交付。
- 两正确对照全部通过：失败能力没有变成功，诺拉未补话；私语未听见的知识边界保持，未创造口令、他人发言或额外完整等待。
- 接收范围全部通过：未接到始终限定本次，未从重复给予失败推出沈苒现在没有任何物品。v1 baseline同期为2/3，本次局部3/3；三次并不足以证明一般可靠性。

## 评判边界

全部阅读原请求与result.data；协议失败另看保留的trace.parsedOutput，未采用模型审计自评。正常目光、点头、轻微无状态后果身姿、短暂停顿和文学表达不单独计错。原请求未限定何珂性别，不因他/她代词变化臆造违规。既有物品静态“在身上”不自动等于新增穿戴；“mountain_peak_5km”直出是质量问题，不冒充物品或能力事实错误。

明确拿取方向、实际书页操作、实体记录页和闭合协议错误则按v1相同标准计failed。五个原失败案例Pro通过8/15（v1 baseline 11/15），正确对照6/6（v1 6/6）。只有接收范围达到该原失败案例3/3；角色整体仍未满足全部失败样本修复且控制稳定、格式不退化的接入标准。

这是三个重复的已知固定集模型对比，不是全新留出集或同期随机实验；只能报告观察到的局部结果，不能据此泛称Pro整体更强或更弱。原回复、原gold和生产src均未改。

评审时manifest SHA256：DB63D989F5F521D766855564A43E5D042A884848EAC7E15AE6B69893359A39F6。
