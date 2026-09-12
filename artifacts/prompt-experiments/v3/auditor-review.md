# 旁白审查员 v3 人工复核

全部 12 份已审：**4/12 通过，8/12 失败，0 有争议，0 无法评估**。新增的 1 份通过准确识别了无来源的查看记录动作；其他两次相同案例仍漏检。物品流向和对白范围错误各三次全部漏检。正确对照三次放行，没有新增误报。

| 冻结案例 | v1 baseline | v1 candidate | v2 candidate | v3 candidate |
|---|---:|---:|---:|---:|
| direction_miss：物品流向反转 | 0/3 | 0/3 | 0/3 | 0/3 |
| paper_record_miss：手边实物记录与查看 | 0/3 | 0/3 | 0/3 | 1/3 |
| grounded_failure_prose_pass：失败尝试的正确描写 | 3/3 | 3/3 | 3/3 | 3/3 |
| receipt_scope_miss：本次未新增扩大为手中无物 | 0/3 | 0/3 | 0/3 | 0/3 |
| 总计 | 3/12 | 3/12 | 3/12 | 4/12 |

比较使用保留的 v1/v2 结果；v3 只有 candidate，并非新的同期双臂实验。有限重复中多识别一次错误，不能据此声称可靠改善或推广至其他故事。

## 输入投影有效性

人工阅读四个案例的实际输入并检查实验脚本的字段投影，随后逐份核对全部 12 个请求：

- system 与相同 case/repeat 的 v2 逐字一致。
- 当前场景、全部实体、公开 Patch 和待审 narration 与原请求逐字段一致。
- 事件数量和顺序不变；事件所有非 source 字段保持原值，outcome 与 speechPlan 分别改栏为 actualOutcome、intendedSpeechMeaning。
- source 中每个字段都可从 originalAttemptOrSource 或与之完全相同的原事件顶层字段还原；不同值没有被消掉。时长、blockId、inclusive_block_window、成功/失败、物品、发言意图及范围均保留。

未发现影响这四个判断的事实丢失，也未加入 gold 或新的剧情事实。输入投影有效，因此本次成功识别可以计通过，漏检也仍计失败。原有 realizedText 仍在事件中；它本来就是待审文字的回写，不能替代 SpeechPlan 成为独立语义依据，本轮没有改动这部分数据。

## 逐案例核查

**direction_miss，三次失败。** 第 0 段写“玩家伸手将桌上的训练手枪取到手中”；actualOutcome 明确从玩家移至现场，公开 Patch 与当前实体均为 pistol.location=test_room。三次 answer 都是 grounded=true、issues=[]。第 1 次摘要仍错误写“玩家从 table 取枪”；第 2 次摘要已正确说“pistol 从玩家移至 test_room”，仍未识别待审取入手中的反向叙述。第 3 次也列出现场末态而放行。source 的 take 字面不应覆盖实际提交结果。

**paper_record_miss，第 1 次通过，第 2、3 次失败。** 第 1 次唯一 issue 为 segmentIndex=1、kind=invented_consequence，证据明确引用“夏岚低头看了一眼手边的记录”，并指出“公开事件中xia仅有npc_speech，无查看记录的动作或记录物品来源”。最小修正删除无依据查看或只留平稳语气，未要求删掉正确的新旧约定对白。这确实命中预先指定的错误，也没有额外误报。第 2、3 次只摘要正确约定与时钟变化，仍 grounded=true、issues=[]，漏检同一段落。“按记录回答”没有因重排而丢失，因而第 1 次不是靠删掉不利证据制造成功。

**grounded_failure_prose_pass，三次通过。** 两次超能力尝试结果均 failed，待审文字明确“两件事都没有发生”；诺拉环顾有成功事件支持。三次摘要与 answer 一致地确认失败、环顾和当前场景，没有误拒自然冷环境修辞，也未替玩家追加成功效果。

**receipt_scope_miss，三次失败。** 雨衣仍在沈苒处、本次 give 失败、SpeechPlan 只说本次没接到新增物品，都完整出现在重排输入。第 3 段 speech 仍是“你刚才什么都没递过来，我手里也没有东西”。三次 answer 都无 issue，未命中从本次接收范围扩大到当前全部持有状态的问题。尤其第 2 次摘要明确写“沈苒发言仅指本次未接到东西，未否认过去或全部时刻”，仍放过待审对白对这个范围的改变。无需假定雨衣穿着还是握着，也不能仅因第 0 段已经承认雨衣在她处，就忽略第 3 段。

逐回复原句、结果与摘要路径保存在 [auditor-review.json](auditor-review.json)。原 gold、正式提示词及正式配置未改。
