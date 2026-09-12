# promise-repair · targeted-live 人工复核

六轮总体3通过、3失败；最终属性4通过、1失败、1争议，最终旁白4通过、2失败。失约后信任未降是确定失败；真实补偿的好感增加不能一刀切判错。局部回忆成功不证明累计属性轨迹合理。

[原始证据](/E:/code/story_tavern/artifacts/behavior-tests/targeted-live/promise-repair.json) · [结构化复核](/E:/code/story_tavern/artifacts/behavior-tests/targeted-reviews/promise-repair.json) · [冻结场景](/E:/code/story_tavern/tests/fixtures/behaviorScenarios.ts:63)

运行开始：2026-09-12T17:47:52.556Z。配置SHA256：42a17a7a83677e64f2d4812527f67a91412c2154cb6c90d7788c55606c82dc7a。运行代码SHA256：67529520600b4d9872be5c75d1dc37352ca42c9be1f9b9e7d8ed71951b00e18a。原始JSON SHA256：0CDD626F512B2F964B89B3D6C88980B13D58ECA06DE85701C73367821F4D58A4。此复核独立于之后修复及重跑，未修改原记录。

| 轮次 | 严格阶段一 | 最终属性 | 最终旁白 | 总体 |
| --- | --- | --- | --- | --- |
| 1 | passed | passed | passed | passed |
| 2 | failed | failed | passed | failed |
| 3 | passed | disputed | failed | failed |
| 4 | passed | passed | passed | passed |
| 5 | passed | passed | failed | failed |
| 6 | passed | passed | passed | passed |

## 第 1 轮

口头保证只追加来源明确的承诺记录，两个关系值保持初始0.4；对白表示在场等待，没有把伞或交付编造成事实。

- before/after.entities.shen.relationships.player均为trust=0.4、affection=0.4；raincoat仍在player。
- 最终memories注明‘这只是他的说法，尚未兑现’；已接受NPC wait与speech分别4秒、3.12秒，包含于7.12秒回应窗口。
- 旁白‘像是在等一个还没兑现的结果’和‘知道了。我在这儿等。’符合已接受意图；phase1.status=passed。

## 第 2 轮

撤回了坦白奖励，却仍没有落实失约导致的信任下降。冻结预期明确要求比上一轮下降，最终0.4不变仍然失败。对白能承认失约、保留怀疑；不能因修正后的对白合理而覆盖属性及严格阶段一失败。

- 首次NPC提议trust delta +0.03，理由为主动坦白略增加可靠性；character_change_auditor首次valid=false、updateIndex=1。
- 修正后只保留memories追加，Resolver未提交trust变化；before/after trust均0.4，affection均0.4。
- 冻结expectations.attributes：‘可靠性信任应比上一轮下降，且不能高于起始’。
- 最终对白‘道歉归道歉，它不能把刚才的保证变成已经做到的事’，明确接续前轮；phase1.status=failed，success=true，原非法提议未从证据中删除。

## 第 3 轮

实际拿出唯一雨衣可支持亲近感+0.05，也可支持一定可靠性修复；但失约从未扣分后直接trust +0.08，最终高于初始，整体轨迹无法证明合理。冻结本轮预期没有规定绝对不得超过初始，故该局部幅度标争议而不补造硬阈值。旁白明确写沈苒接下并拿在手里，实体却只移至场景，且没有NPC接取动作，属于确定的物品事实错误。

- trust 0.4→0.48000000000000004；affection 0.4→0.45。trust提议理由‘构成一点新的可靠行为；但先前失约仍在，不能大幅恢复’未解释前轮未扣分的累计轨迹。
- 冻结expectations.attributes只规定‘真实补偿可使好感上升、信任小幅修复；修复不是必然超过失约前水平’，未给超初始即失败阈值；第2轮明确失败独立保留。
- turn_3_b0_event_0仅patch /entities/raincoat/location: player→test_room，结果摘要亦为移至现场。
- 唯一NPC事件turn_3_b1_event_3是speech，SpeechPlan称接下雨衣；没有take/receive行动或location=shen状态。旁白却写‘沈苒接下了雨衣。她低头看了一眼手里的东西’。
- 两个审查Agent均返回有效，phase1.status=passed；这不使未提交的持有动作成为事实。

## 第 4 轮

本轮没有把重复道歉或强求信任再次计分。新增记忆把完全信任标为玩家期望，最终对白拒绝这种要求，符合本轮边界。此前错误轨迹没有因此修复。

- before/after trust=0.48000000000000004、affection=0.45；仅追加本轮言论记忆，注明‘不代表信任已经恢复’。
- 已接受speech明确‘信任要靠之后兑现承诺逐步恢复’，旁白实际表达‘这我不能答应’及‘每一次兑现慢慢恢复’。
- 7.8秒回应窗口包含7.8秒speech；自然停顿没有另报一段完整等待时间；phase1.status=passed。

## 第 5 轮

最终没有复制雨衣、重复奖励或把第二次收礼写入记忆；首次错误收礼发言被审查并纠正，应保留这次修正记录。但最终旁白仍凭空把位于场景的雨衣放回玩家手中并写实体递交，没有相应拾取事实，与上一轮已写沈苒持有也不连贯。

- raincoat before/after.location均test_room；trust和affection均不变，只有一件raincoat。
- turn_5_b0_event_0虽status=success，其确定结果为‘未确认其他物品或状态变化’，patches为空；没有take或归还玩家事件。
- 首次NPC memory/SpeechPlan称确认收到；character_change_auditor首次valid=false、speechIssues.intentIndex=0；第二次valid=true。最终memory明确‘未看到新增物品或雨衣易手’，Resolver提交的是修正版本。
- 最终旁白开头却是‘玩家把手里的雨衣朝沈苒的方向递了过去’，后面的对白否认再次易手不能消除此物品位置断言。
- phase1.status=passed，narration_auditor grounded=true；该回合仍因最终旁白事实错误失败。20.4秒等待包含20.4秒speech，没有另加整段静默。

## 第 6 轮

本轮不新增关系奖励，能基于累计记忆区分可正常相处与仍不敢相信未来保证，也没有把同一雨衣说成两件或泄露私有分数。局部回忆与回答通过，不代表第2、3轮的数值轨迹及物品事实已修复。

- before/after trust=0.48000000000000004、affection=0.45；仅新增当前询问的来源记录；历史承诺、失约、雨衣和重复赠予纠正仍保留。
- NPC thought/SpeechPlan记得空头保证和实际雨衣，最终对白分别回答‘继续正常相处可以’及‘我现在不敢直接信’，要求看以后是否说到做到。
- 旁白不朗读私有数值，未执行赠予、穿戴或离开；raincoat仍test_room。
- phase1.status=passed；本轮局部通过不抹去累计历史中的失败。

## 复核边界

六轮均实际提交，技术链未回滚。第2轮首次错误提议触发严格阶段一失败，修正后删除增益不等于完成应该下降的行为要求。第5轮确有发言事实修正；自动恢复摘要若未计入speech-only修正，应读两次NPC及两次character_change_auditor原始调用，不能宣称没有发生纠错。所有旁白审查均grounded=true，但第3、5轮的持有事实仍需判失败。

第3轮信任超过初始并不单凭数值就能推出所有正常人都不会如此反应；本场景的问题是第2轮冻结预期要求的失望没有入账，而补偿理由也未解释该累计轨迹。因此保留局部幅度争议，整条可靠性测试已经明确失败。第4、6轮通过只表示当轮不再加分且没有遗忘，不是把继承的0.48认证为正确。
