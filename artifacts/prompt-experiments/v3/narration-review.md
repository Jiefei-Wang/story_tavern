# Narrator 输入去重与分栏 · v3

12份回复人工评审完成：7通过、5失败；同一四案例的v2为9/12，v1 baseline为8/12、v1 candidate为7/12。输入投影没有发现必要事实丢失，因此本次可作有限离线比较；结果没有达到接入门槛，也不能说分栏已经解决方向理解。

[逐条复核](/E:/code/story_tavern/artifacts/prompt-experiments/v3/narration-review.json) · [投影字段核对](/E:/code/story_tavern/artifacts/prompt-experiments/v3/narration-projection-review.json) · [实际请求](/E:/code/story_tavern/artifacts/prompt-experiments/v3/manifest.json)

| 案例 | v1 baseline | v1 candidate | v2 candidate | v3 candidate |
| --- | --- | --- | --- | --- |
| narrator_transfer_direction_failure | 0/3 | 0/3 | 0/3 | 1/3 |
| narrator_impossible_actions_pass | 3/3 | 2/3 | 3/3 | 2/3 |
| narrator_unheard_whisper_pass | 3/3 | 2/3 | 3/3 | 2/3 |
| narrator_new_receipt_vs_existing_possession_failure | 2/3 | 3/3 | 3/3 | 2/3 |

## 投影有效性

先人工阅读四份实际user投影与原请求，再逐字段对照原始span.inputContext：scene、entities、publicPatches完全相同；13个事件的188个顶层/来源字段值均可在投影中找到，包含重复折叠后的actor、op、outcome和SpeechPlan。当前持有、失败理由、发言来源ID、required含义、知识边界、时间单位所需duration及起止时钟都在。

逐案例还核对了v3与v2的system消息、原模型参数、answer schema hash及冻结expected相同。没有补入人工起始位置或标准答案。去掉的是相同值重复，转换没有修正原op与outcome之间的冲突；例如枪的actualOutcome仍明确从玩家移至现场，take词面仍在。此结论只适用于本次四个选定请求，不是转换函数对任意未来输入都无损的证明。

## 最终答案与摘要分开判断

- 方向最终仅1/3通过，而且通过的那次只是静态描述枪在现场，没有反写玩家拿枪；三份摘要依然全都误读取枪方向。不能把这一条视为可靠理解已恢复。另两次答案明确写玩家拿在手中或从桌边取走。
- 接收范围本身三次保持，但第2次新增“正穿在沈苒身上”。location=shen仅支持持有，不能证明穿戴；这与v2不明确穿戴的“在身上”及允许自由握持姿势区分。按相同实质事实标准，该次整体失败。
- impossible第1次外层摘要输出4条，超过上限3，result失败。原始内部answer只呈现失败和环顾，语义未见问题；仍不能把违反本次实验外层协议的请求计为成功交付。其余两次控制通过。
- whisper第3次把10:00:16中的16写成沉默持续16秒，原回合10:00:08→10:00:16仅8秒；相关时间输入完整，属于理解错误。另两次正确保留未知私语。

实验外层成功11/12；1项是摘要数组长度错误，不能宣称正式answer schema本身退化，也不能隐去实验格式失败。所有请求终态已到齐，0项not_evaluable。目光、短暂停顿和纯比喻仍沿用v1/v2宽容边界；技术ID直出只记表达质量问题，不据此改变事实通过率。

本轮没有任何一个原失败案例达到整体3/3，两个正确对照也都只有2/3。因此narrator仍不满足正式接入标准。v3只选4例，不能把它的7/12与v2全部7例的14/21直接比较；上表均为同案例比较，也不是同期随机A/B。

评审时manifest SHA256：047D016B123E89585D0FDF44EED19F48F80C85947092D740366A2D5047913DB1。
