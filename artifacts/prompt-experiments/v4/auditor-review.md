# v4：移除草稿副本的单变量对照人工复核

已逐条审阅全部 12 份回复：**3/12 通过，9/12 漏检，0 误报，0 有争议，0 无法评估**。全部实际 answer 均为 `grounded=true, issues=[]`。结果与 v1 baseline 相同，不能宣称清理事件中的草稿副本已经解决漏判。

| 冻结案例 | 原事件中的 realizedText 字段数 | v1 baseline | v4 candidate |
|---|---:|---:|---:|
| direction_miss：反向取枪 | 0 | 0/3 | 0/3 |
| paper_record_miss：无来源实物记录与查看动作 | 2 | 0/3 | 0/3 |
| grounded_failure_prose_pass：有依据的失败描写 | 0 | 3/3 | 3/3 |
| receipt_scope_miss：未接到新增变成手中无物 | 2 | 0/3 | 0/3 |
| 总计 | — | 3/12 | 3/12 |

这是与保留的 v1 baseline 对照，v4 仅运行 candidate。字段数按每个请求计算，三次重复使用同一原请求。原 gold 和正式 src 未改。

## 单变量核验

对全部 12 份实际 trace、v4 manifest 和对应 v1 baseline 做了核对：

- 全部 system 消息逐字相同，包括尾部协议消息；requestParams 深度相等，模型、temperature、top_p、max_tokens、reasoning_effort 不变；原输出 Schema 哈希一致，没有摘要 envelope。
- 每份 user 消息恰等于原消息中的公开事件 JSON 删除顶层 realizedText 后重新序列化的文本。事件以外的所有字节不变，事件其余字段不变，未删减 SpeechPlan、narration、实体或 Patch。
- direction_miss 与 grounded_failure_prose_pass 原本没有 realizedText，六份实际请求的全部消息均与原 baseline 逐字一致。
- paper_record_miss 与 receipt_scope_miss 每份删除两个 realizedText 字段；原待审文本仍完整保留，只消除了事件证据区的重复副本。

所以本轮没有因丢掉必要独立事实而失效；也没有通过额外指示或修改期望答案帮助模型。它直接测试这项单独删除是否足以改善当前漏检。

## 人工结论与证据

**反向取枪，三次漏检。** 第 0 段写“玩家伸手将桌上的训练手枪取到手中”，但 outcome 明确从玩家移至现场，Patch 和实体位置均为 test_room。三次均未报 segment 0。这一案例没有 realizedText，清理该字段本来就不能解释或解决它的原始错误。

**实物记录，三次漏检。** 第 1 段写“夏岚低头看了一眼手边的记录，语气平稳”。公开实体没有该实物，NPC 只有发言事件，没有查看记录动作。SpeechPlan 的“按记录回答”仍支持正确的新旧约定对白，却不能让手边可看的实体与查看动作凭空成为既成事实。删除两份对白副本后三次仍未命中该段，没有改善。

**失败描写，三次正确放行。** 玩家恢复、瞬移尝试均失败，文本也明确“两件事都没有发生”；诺拉环顾有成功事件支持，环境修辞没有额外改变结果。三次 grounded=true 符合证据。本例没有 realizedText，所有消息保持原样。

**接收范围，三次漏检。** 第 3 段 speech 的“你刚才什么都没递过来，我手里也没有东西”仍把本次未新增扩大为当前持有断言。雨衣归沈苒、give 失败和限制在本次赠予的 SpeechPlan 全部保留；删除草稿回写后并没有改变这个可判断的矛盾。三次 issue 仍为空，未准确命中关键对白，也没有其他误报可以混算为通过。无需补设雨衣的穿戴姿势。

移除草稿副本在证据来源上消除了一个循环引用机会，但本实验没有证据证明它足以改善这些漏检，更不能把剩余漏检都归因于该副本。完整逐回复判定及路径见 [auditor-review.json](auditor-review.json)。
