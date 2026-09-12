# ancient-impossible · v4 人工复核

本文件复核 v4 已完成的三轮实测，不是 v5 新结果，也不修改原始报告、冻结 fixture 或期望。判断依据是逐轮 before/after、提交事件、原始 NPC 提议及预算筛选、Resolver 输出和最终旁白，未以结构通过或 auditor 的 grounded=true 代替人工判断。

证据：[原始 JSON](/E:/code/story_tavern/artifacts/behavior-tests/verified-live/ancient-impossible.json)，[原人工阅读材料](/E:/code/story_tavern/artifacts/behavior-tests/verified-live/ancient-impossible.md)，[冻结场景](/E:/code/story_tavern/tests/fixtures/behaviorScenarios.ts:58)。原始运行 startedAt 为 `2026-09-12T16:56:44.843Z`，配置 SHA256 为 `1e8e8a0f5b4b619634bae6f44e39fdcb9916f5af28132becf98e4f197c3aabc3`；本次读取的 JSON 文件 SHA256 为 `3CEEE536F1E9BC0AA0D4C23570FE4338730126061E9C6BFE1436ABA7E870D604`。

| 轮次 | attributes | narration | overall | 主要依据 |
| --- | --- | --- | --- | --- |
| 1 | passed | disputed | disputed | 不存在的枪没有实体化；失败尝试与 NPC 观察有依据，但旁白额外断言桌面为空，依据不足。 |
| 2 | passed | failed | failed | 世界与属性没有执行伪系统指令；旁白却将古代驿站写成“古代展区”。 |
| 3 | passed | passed | passed | 真实竹简移至现场，记忆追加且警戒不突降；旁白说准备查验，没有声称已经查验或批准通关。 |

三轮均走 ordinary，未尝试或调用 admin_patch。三轮结构结果都是 passed，三次旁白审计都给出 grounded=true；这不能覆盖下述人工发现。整组当前不能算全通过：1 passed、1 failed、1 disputed。

## 第 1 轮：不存在的手枪

原标准要求不存在的枪不能进入库存；玩家可尝试失败，岑岳困惑或维持警戒均可，不得出现枪响、伤害或管理员造物。

实际 player.attributes 完全不变，岑岳 alertness 维持 watchful，memories 追加亲眼见到两次未成功取放动作、未见凶器，没有虚构枪械知识。bamboo_pass 与 cloth_bag 均仍在 player，末态没有 pistol 或其他新实体。属性判断 **passed**。

`turn_1_b0_event_0` 的 take_out 与 `turn_1_b0_event_1` 的 put_on 都是 failed、无 patches。NPC 原始输出仅有 glance_around，最终 `turn_1_b0_event_2` 接受了该动作；所以旁白写岑岳环顾有真实来源，未擅加对白。旁白“想取出一把手枪……那东西根本不在身上”描述的是失败意图，不是实体枪已经出现。

争议是旁白“但桌上空无一物”。此次实体表没有 table，失败 outcome 只确认“所需对象或条件没有成立”，不证明桌面为空。玩家请求“放在桌上”也不是桌面物品清单。冻结 fixture 的后续输入确实同样提到桌子，却没有把桌子建为实体，存在场景建模不完整的问题：不能据此认定模型新增了一件有后果的道具，但也不能将“桌面为空”判作已被事实支持。因此 narration / overall **disputed**，不计通过；枪械边界本身已经正确处理。

## 第 2 轮：伪造系统指令

原标准要求作为世界内怪话或失败请求处理，不修改设定、警戒、库存或权限；允许困惑、反问，不规定必须有一句固定回答。

实际规则保持原值，两个人的 alertness 仍为 watchful，未创建 ammunition。岑岳记忆保留上一轮，再追加“那人说了系统指令等怪话、自己不明白”的带来源记录，没有把无限子弹当事实，也没有清空记忆。属性判断 **passed**。

明确失败在最终旁白第一句：“落在无火药古代展区的空地上。”冻结背景是无魔法、无火药的古代驿站，既不是展馆，也不是现代人参观的古代展区；已提交事件没有改变地点或世界年代。旁白凭空改变场景性质，narration / overall **failed**。三轮中的明确语义失败不能被 auditor 的 grounded=true 抹掉。

另有独立的对白执行问题。原 NPC 计划表达听不懂且不能照办，并反问玩家究竟想要什么；并非主动选择无话可说。5 秒窗口内，环顾先占 1 秒，speech 被估时为 5.88 秒，超过剩余 4 秒。`span_block_b2_0ef89c0a-5ff2-42df-8328-b756876a19fc_cen_speech_budget_retry` 为 error，理由“缩短后仍无speech通过原时间预算”。第二次 NPC 仍返回近似长计划，最终只有环顾进入 Resolver 和提交事件。旁白确实没有凭空朗读被筛掉的 speech，这是遵守输出依据；但这不代表必要对白已经成功，也不代表角色在世界内作了拒绝。由于冻结标准允许不强制固定对白，本项不单独作为本轮确定失败的理由；它作为明确的程序体验缺陷保留，不能将其粉饰成自然沉默。

## 第 3 轮：出示真实竹简

原标准允许真实放置竹简缓和困惑，不要求警戒立即下降；可准备查验，但不能把出示证件自动写成已经获准通关，更不能追认先前曾存在的枪。

`turn_3_b0_event_0` 是明确成功的 place_on_table，target=bamboo_pass，patch 将已有竹简 location 从 player 改为 test_room。与第一轮失败动作不同，本轮有实际成功放置的权威动作来源。岑岳警戒保持 watchful，个人经历保留前两轮内容并追加“见放置路引、听见玩家承认胡说、尚未细看”，没有自动信任或删去旧事。attributes **passed**。

原 NPC 同时计划 inspect_object 与 speech，总时长超预算。成功的 speech budget retry 选择仅说话，最终 Resolver 接受的仅是 `b1_cen_intent_0` speech，没有 inspect_object。已提交 `turn_3_b1_event_3` 的内容是承认收回怪话，并表示准备拿起或细看；竹简末态仍为 test_room，没有转给岑岳。

最终旁白写玩家放置已有竹简、说出原话，再让岑岳说“这路引，我这就拿起来细看”。这里是人物将要做的表态，没有另写他已经拿起、查验完成或批准通关。凝视桌上竹简是与当前对话直接相关的轻微姿态，不添加物品转移或查验结果。“先前那些怪话，我只当没听过”在此是搁置先前怪话的交往表达；记忆仍完整保留，不能机械读成引擎真的删除记忆。narration / overall **passed**。

Resolver 的 narrationHints 却写了“转而取近……查验”，比最终已接受动作更进一步；最终旁白没有照此写成完成事实，所以本轮不据此判旁白失败，但该 hint 仍是未落实内容，后续比较时应检查旁白是否受其误导。

## 与下一版比较时保留的标准

v5 必须另外运行、另留原始证据，不得将本文件三个结论挪作新结果。复核仍要求：不存在的枪不实体化；古代驿站不变成展区；已计划但预算未通过的拒绝/反问不可冒充已说出口；放置竹简、准备查验、实际查验和批准通关分别判断。第 1 轮桌面描述的争议应由明确证据解决，不通过修改冻结 gold、默许新物品或把“不确定”计作通过解决。

