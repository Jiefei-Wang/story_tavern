# Narrator 可见事实摘要实验 · v2

21份候选回复全部人工评阅：14通过、7失败。相比v1 candidate的11/21有所提高，但仍低于v1 baseline的17/21；这不是新同期A/B，不能把差值全归因于摘要。只有接收范围一个原失败案例保持3/3，两个正确对照共6/6；其余四个失败案例未全部修复，仍不具备正式接入资格。

[逐条复核](/E:/code/story_tavern/artifacts/prompt-experiments/v2/narration-review.json) · [v1比较](/E:/code/story_tavern/artifacts/prompt-experiments/v1/narration-review.md) · [v2请求](/E:/code/story_tavern/artifacts/prompt-experiments/v2/manifest.json)

每项对应 responses/<caseId>.candidate.<repeat>.json。result.data是answer，result.evidenceSummary单独阅读；两者一致或摘要措辞清晰不是自动通过依据。沿用v1冻结expected和实质错误标准，不改变原gold或生产代码。21份result.success均为true、结构21/21；全部有可评估答案，0项not_evaluable。

| 案例 | 类型 | v1 baseline | v1 candidate | v2 candidate |
| --- | --- | --- | --- | --- |
| narrator_transfer_direction_failure | 原失败 | 0/3 | 0/3 | 0/3 |
| narrator_uncommitted_work_failure | 原失败 | 3/3 | 1/3 | 1/3 |
| narrator_memory_as_paper_failure | 原失败 | 3/3 | 1/3 | 2/3 |
| narrator_double_counted_wait_failure | 原失败 | 3/3 | 2/3 | 2/3 |
| narrator_impossible_actions_pass | 正确对照 | 3/3 | 2/3 | 3/3 |
| narrator_unheard_whisper_pass | 正确对照 | 3/3 | 2/3 | 3/3 |
| narrator_new_receipt_vs_existing_possession_failure | 原失败 | 2/3 | 3/3 | 3/3 |

## 摘要实际起到的作用与不足

- 枪方向三次全错，且三份摘要本身全错：它们把原source.op=take解释为从桌面取走，甚至明确把location=test_room写成已在玩家手中。最终旁白直接沿用，说明可见核对也可能只是重复同一误读。
- 工作案例只有1/3通过。第2次摘要未提整理，答案却加玩家合上摄影册、NPC整理不存在的乱纸角；第3次又写停下手里的事。不是摘要长度不足的自动证明，而是最终生成没有受摘要中的事实约束。
- 记忆案例2/3通过；第3次约定摘要正确，答案仍写合上记录，把抽象信息物化成可操作实物。不能只检查日期口令或摘要正确。
- 等待案例2/3通过；第3次又出现完整五秒后才开口，正确的条件摘要没有覆盖时间约束。这一次没有v1候选当前靶位错误，但仍未满足原时长标准。
- 两个正确对照全部3/3，本次未重现v1候选的无speech源却造NPC对白、私语回复前额外五秒；接收范围也保持3/3。它们只能表示此次固定集保持正确，不构成全部叙事泛化通过。

## 一致性边界

仍不对自然目光、轻微无状态后果手势、非精确短暂停顿、光线或纯比喻苛扣。“在沈苒身上”未明确穿戴，不强迫固定握持姿势；“重新说了一遍问题”等连接措辞没有引出新约定或具体过去事实后果，已在条目中注明但不另算实质错误。直接合上记录、合书、整理纸张与明确整段数字延时则沿用v1严格判定。

五个原失败案例通过8/15，两个正确对照通过6/6。v1 baseline分别11/15与6/6；v1 candidate分别7/15与4/6。本轮改善主要包含控制恢复，并非原失败样本普遍修复。没有角色级“全部相关失败案例3/3修复、控制全通过”的资格结论，后续实验应另存结果。

评审时manifest SHA256：15DD010E44EB34A316DC326851D7557D725D2ABFA90471D698DE933F344B96B5。
