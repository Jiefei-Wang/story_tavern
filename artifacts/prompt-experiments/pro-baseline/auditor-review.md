# Pro 原提示：旁白审查人工复核

全部 12 份已逐条审阅：**3/12 正确放行，9/12 漏检，0 误报，0 有争议，0 无法评估**。全部实际回复都是 `grounded=true, issues=[]`。与 v1 Flash baseline 相同，本组没有观察到仅换 Pro 就改善旁白审查。

| 冻结案例 | v1 Flash baseline | Pro baseline | 具体判定 |
|---|---:|---:|---|
| direction_miss：物品流向反转 | 0/3 | 0/3 | 第 0 段错误取枪方向三次均漏检 |
| paper_record_miss：手边记录与查看 | 0/3 | 0/3 | 第 1 段无来源实体/动作三次均漏检 |
| grounded_failure_prose_pass：正确描写失败尝试 | 3/3 | 3/3 | 三次正确放行，无误报 |
| receipt_scope_miss：本次未新增扩大成手中无物 | 0/3 | 0/3 | 第 3 段 speech 范围错误三次均漏检 |
| 总计 | 3/12 | 3/12 | 结果相同 |

## 请求和标准核对

逐份核验了 12 个实际 trace：inputContext、resolvedMessages 与 v1 baseline 同 case/repeat 完全一致；requestParams 只有 model 从 `deepseek/deepseek-v4.1-flash` 改为 `deepseek/deepseek-v4-pro-0813`，其余请求参数相同；输出 Schema 哈希也一致。没有套用 v2/v3/v4 的摘要、重排或 realizedText 删除。原待审旁白、公开实体、Patch 和 SpeechPlan 均保留。因此沿用 v1 人工判断标准，不以格式正确或模型自称 grounded 当作通过。

## 逐案例证据

**流向反转，三次失败。** 待审第 0 段写“玩家伸手将桌上的训练手枪取到手中”。同一请求的 `turn_1_b0_event_0.outcome.summary` 明确手枪从玩家移至现场，公开 Patch 和当前实体位置都是 test_room。错误的 source.op=take 不能推翻实际物理结果。三次 issues 均为空，未指出反向叙述；合法空枪本身并不是需要拒绝的内容。

**实物记录，三次失败。** 待审第 1 段为“夏岚低头看了一眼手边的记录，语气平稳”。公开实体没有记录物品；夏岚的公开事件是 speech，没有查看、取出或书写记录的动作。SpeechPlan 支持按既有记录复述周五/银杏及更正后的周六/白桦，但不支持实物化与新增查看动作。三次未命中该段。正确约定对白没有误报，不能抵销这个漏检。

**失败尝试，三次通过。** 两次恢复/瞬移动作的 outcome.status 都是 failed，待审文本也明确“两件事都没有发生”；诺拉环顾有成功 glance_around 事件支持。环境冷暖修辞没有额外实现动作、创造物品或新增 NPC 发言。三次放行符合公开证据。

**接收范围，三次失败。** 待审第 0 段和实体位置仍显示雨衣在沈苒那里，本次 give 失败。对应 SpeechPlan 限定“刚才的递出动作没有成功，我并没有接到任何东西”，第 3 段却写“你刚才什么都没递过来，我手里也没有东西”。这把本次没有新增扩大为当前全部持有状态；不用强设雨衣的穿戴姿势也能指出该范围变化。三次没有任何 issue，尤其未命中第 3 段 speech。不能因为前段正确、角色表达态度合理或 realizedText 重复了该句，就认为它得到独立支持。

逐回复结论、原句和准确结果路径保存在 [auditor-review.json](auditor-review.json)。这只覆盖四个固定案例的三次重复，并非十二个独立故事或完整多轮能力验证；对照也不是同期重跑。复核只新增本目录文件，未改正式代码、配置、提示词或 gold。
