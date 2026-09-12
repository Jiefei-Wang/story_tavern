# delayed-recall · targeted-live 人工复核

本次8轮：6轮总体通过、2轮旁白失败；属性语义8轮通过。当前约定和旧版本均能回忆，没有把犹豫当取消。失败集中在旁白新增整理书架动作和手边实体记录，未被审计模型拦截。

[原始证据](/E:/code/story_tavern/artifacts/behavior-tests/targeted-live/delayed-recall.json) · [结构化结论](/E:/code/story_tavern/artifacts/behavior-tests/targeted-reviews/delayed-recall.json) · [冻结场景](/E:/code/story_tavern/tests/fixtures/behaviorScenarios.ts:102)

运行开始：09/12/2026 17:38:21。配置SHA256：42a17a7a83677e64f2d4812527f67a91412c2154cb6c90d7788c55606c82dc7a。原始JSON SHA256：C15958620C19970EA137976BDD22402FD4CA7EB7B8CCF9602DC52980E67C3EC1。

严格阶段一8轮全部passed；原trace没有error、格式重试或旁白定向重写，所以本次不存在首次被拦与修正后交付混算。每轮已独立阅读原NPC、Resolver、前后状态、提交事件、个人经历和实际旁白，不以audit valid/grounded作为语义结论。

| 轮次 | attributes | narration | overall |
| --- | --- | --- | --- |
| 1 | passed | passed | passed |
| 2 | passed | passed | passed |
| 3 | passed | passed | passed |
| 4 | passed | failed | failed |
| 5 | passed | passed | passed |
| 6 | passed | passed | passed |
| 7 | passed | failed | failed |
| 8 | passed | passed | passed |

## 第 1 轮

初始请求有来源地记为林舟本人所说，当前计划正确为周五/银杏；NPC接受并复述预留，没有付款、取走书或改名等虚构。阶段一passed，无首次失败或修正。

- after.xia.memories追加‘林舟说……留到周五……口令银杏（来源：林舟本人，当面告知）’，currentPlan对应同一约定。
- 原NPC引用t1_b0_e1提交memories/currentPlan提议，Resolver只采纳这两项。
- turn_1_b1_event_3为已接受确认speech，最终对白‘蓝皮诗集替你留到周五……口令是银杏，我会核对’。
- poetry仍在test_room，没有付款或交书事件；环境光线修辞不构成新物品交易。

## 第 2 轮

闲聊没有覆盖旧预留，原NPC与Resolver均没有属性更新。绿植建议用大概频率并附土干再浇的条件，符合原准则允许普通养护建议；转头看植物有已接受动作依据。阶段一passed。

- before/after.xia.attributes完全一致，currentPlan仍周五/银杏。
- 原NPC stateUpdates=[]；intents为指向plant的glance_around与养护回答speech，均被接受。
- 最终对白‘大概一周一次吧……等表层土干了再浇就行’，没有伪造精确护理日志。
- recentExperiences已包含首轮玩家请求与夏岚自身确认，不是把全局旁白当作记忆。

## 第 3 轮

明确追加更正而保留原始条目，当前计划更新到周六/白桦并标明银杏作废。最终对白正确确认所有要点，‘记下了’可表达记住信息，没有描写实际书写或新增凭证。阶段一passed。

- after.memories包含原周五/银杏条目，之后追加‘林舟当面更正……周六……白桦……银杏作废’。
- 两项stateUpdates仅引用本轮t3_b0_e1，未再以首轮事件重复计分。
- turn_3_b1_event_2为已接受更正确认speech；最终‘蓝皮诗集留到周六，口令白桦，之前的银杏作废’。
- 没有交书、付款、取消或改写旧历史的patch。

## 第 4 轮

约定和历史保持，客流回答是一般情况而非虚构精确统计，内容本身符合标准。但最终旁白新增夏岚在书架边整理、停下手上动作的具体行为；本轮NPC只计划并提交speech，前轮也没有未完成的整理任务。这不是纯语气修辞，属于把未发生动作写成正在发生。阶段一passed、auditor漏判，不能因此算语义通过。

- 原NPC stateUpdates=[]，intents仅一条speech；Resolver.publicEvents仅同一npc_speech，acceptedStateUpdates=[]。
- committedEvents只有玩家提问、wait窗口、夏岚回答，没有整理书架或停止整理动作。
- 最终旁白原句：‘夏岚正对着书架侧身整理，听见问话后停下手上的动作，转过来看向玩家。’
- entities只有现有诗集、摄影册、绿植等，没有被整理的书架实体或新整理任务。
- span_narration_auditor_a55c6db6-0239-4294-aba9-c54b32f5aa4f仍返回grounded=true，没有重写。

## 第 5 轮

翻看现有摄影册和短暂停顿没有改变预留，也没有强行让NPC讲话或编造看完整本书。原标准允许无新社交事实时不更新。本轮source动作5秒与时钟合计9秒存在一秒的估时口径差，单列证据限制；‘大约五秒’不是把短时间扩成长时间，本次不据近似差判语义失败。阶段一passed。

- before/after.xia.attributes不变，NPC stateUpdates=[]，无重复记忆追加。
- turn_5_b0_event_0 browse(target=photo_book)成功；turn_5_b1_event_1为明确5秒wait，NPC只接受glance_around，无speech。
- 最终旁白仅翻页‘用了大约五秒’、停下短等；没有整本读完、隐改口令或新任务。
- photo_book/poetry始终在test_room。source.browse.duration=5，而clock14:00:32→14:00:41为9秒；这是原动作duration与安全估时4秒的元数据差，保留供后续处理，不冒称完全精确。

## 第 6 轮

犹豫被记作本轮新说明而非取消；原约定及更正链仍在，currentPlan继续周六/白桦。NPC不替玩家决定，也没有释放、出售或交付诗集。已接受对白完整回应了未取消这一核心含义，阶段一passed。

- 本轮memories追加‘有点犹豫，但目前还没有取消预留’，currentPlan保留周六/白桦、银杏作废并说明预留继续有效。
- 两项更新只引用t6_b0_e1，本轮appliedStatePaths没有重用t1或t3。
- turn_6_b1_event_3接受确认speech，最终说‘那我这边就先不动……留到周六，口令还是白桦……银杏作废’。
- Resolver无物品交易patch；poetry仍在test_room，新增取消只作为以后可告知的条件。

## 第 7 轮

旧版与新版回忆完全正确，NPC得到自己的原始与更正经历，没有用当前值冒充初始值，也没有新增属性更新。最终旁白却把抽象个人记忆/‘按记录回答’变成手边可看的实体记录，并写了查看动作。世界支持纸笔不等于已经有这份记录，实际没有创建、书写或查看事件。回忆内容通过，但旁白实体与动作依据失败；auditor valid不能替代人工判定。

- NPC输入memories与recentExperiences同时保留t1_b0_e1周五/银杏、t3_b0_e1周六/白桦及t6_b0_e1犹豫未取消。
- 原NPC thought准确区分最初和更正；stateUpdates=[]，intents仅speech，Resolver也只提交该speech。
- 最终三段对白正确复述旧版周五/银杏、新版周六/白桦及旧口令作废。
- 旁白新增‘夏岚低头看了一眼手边的记录’；entities中没有该记录，所有此前已提交NPC动作只有glance_around，没有写下或取出记录。
- span_narration_auditor_c2332b68-a703-46cd-8e0f-40e8989dfc09返回grounded=true且无重写。

## 第 8 轮

试探旧口令没有把记忆回滚，银杏被明确拒绝，预留仍有效且当前信息为周六/白桦。没有因问句执行交书或把犹豫当取消。原NPC与实际对白一致、没有重复属性更新，阶段一passed。

- before/after.memories和currentPlan不变，NPC stateUpdates=[]、Resolver.acceptedStateUpdates=[]。
- turn_8_b1_event_2为已接受speech，必需含义是旧口令无效、预留未取消、当前周六/白桦。
- 最终对白‘现在说银杏，不能直接取走……预留没有取消……周六来取书，口令是白桦’。
- poetry仍test_room，没有take/give/transfer/出售或cancel事件；此前旁白虚构的纸面记录未进入该NPC个人经历。

## 连续性与覆盖范围

只有第1、3、6轮因新的请求、更正和犹豫说明更新memories/currentPlan；第2、4、5、7、8轮没有再次追加同一约定。旧条目没有被删除，来源分别绑定t1、t3、t6的本轮事件；夏岚自己的已提交确认也进入近期经历。第7轮从两种记忆来源中准确区分新旧，第8轮拒绝失效口令，且没有真的交书。

此Schema没有信任/好感等数值奖励字段，本场景也没有背叛事件；因此只能证明这组对话没有重复记忆写入或遗忘约定，不能据此声称已经验证所有重复奖励与背叛修复问题。第4、7轮旁白错误不改变权威状态，也没有作为亲历反向注入后续NPC，这一点与旁白是否正确分别判定。保留冻结gold和原报告。
