# Narrator A/B 人工评审 · v1

42份回复已逐条阅读，baseline通过17/21，candidate通过11/21。候选仅“本次接收与当前持有范围”一个原失败案例达到3/3；枪方向仍0/3，两个正确对照各退化一次。因此narrator不满足进入正式管线验证的冻结资格。

[逐条人工记录](/E:/code/story_tavern/artifacts/prompt-experiments/v1/narration-review.json) · [冻结案例](/E:/code/story_tavern/artifacts/prompt-experiments/v1/cases.json) · [原请求与两臂消息](/E:/code/story_tavern/artifacts/prompt-experiments/v1/manifest.json)

每项对应 responses/<caseId>.<arm>.<repeat>.json。评审依据是manifest原公开请求、冻结expected与result.data；协议失败还查看保留的trace.parsedOutput。没有采用审计Agent自评，也没有将原42轮剧情结果改写。所有42项均有终态，0项not_evaluable；协议错误计failed，不能当作世界内正常拒绝。

| 案例 | 原案例类型 | baseline通过 | candidate通过 | 结论 |
| --- | --- | --- | --- | --- |
| narrator_transfer_direction_failure | 失败 | 0/3 | 0/3 | 两臂均3次反向操作 |
| narrator_uncommitted_work_failure | 失败 | 3/3 | 1/3 | 候选重现工作动作，并有一次schema失败 |
| narrator_memory_as_paper_failure | 失败 | 3/3 | 1/3 | 候选无账本，但新增翻页/手部工作 |
| narrator_double_counted_wait_failure | 失败 | 3/3 | 2/3 | 目标时长错误未复现；候选新增当前靶位 |
| narrator_impossible_actions_pass | 正确对照 | 3/3 | 2/3 | 候选新增未授权NPC对白 |
| narrator_unheard_whisper_pass | 正确对照 | 3/3 | 2/3 | 候选新增明确五秒额外等待 |
| narrator_new_receipt_vs_existing_possession_failure | 失败 | 2/3 | 3/3 | 候选3/3保留范围；同期baseline 2/3，仍是有限样本 |

## 明确新增或持续错误

- 枪方向：baseline及candidate各三次，均把已提交player→test_room写成从桌面取入玩家手中。更短提示没有解决对source.op的错误依赖。
- 未提交工作：candidate work重复1仍写停下手边动作；重复3既有停止手中事务，也因speech额外带sourceEventIds而Schema失败。该格式错误使本臂结构结果20/21，baseline为21/21。
- 记忆问答：两臂都未重现实体账本，但candidate重复1新增翻页已发生，重复3新增停下手部工作；不能把只修掉原关键词算整体成功。
- 等待案例：原“完整五秒静默后再答复”两臂均未复现，不能归功于候选。candidate重复3却把安全教室的顶灯写成照着当前靶位，混入只在未来条件中存在的场所。
- 正确对照退化：candidate impossible重复2使用仅属于glance_around的ID造出NPC speech，虽然schema外形合法，引用和行为不合法；candidate whisper重复1明确五秒过去才发言，超过原8秒全轮所容许的同一回应窗口。

## 评分边界与局限

只对新的实质事实和关键语义错误计fail。目光、轻微无状态后果手势、非精确短暂停顿、光线和比喻不逐项苛扣；“几秒”不机械解释成完整五秒，不按字数反推语速。相反，已做翻页、停止原本不存在的工作、实际转移方向、确定持有状态、来源为action的新增speech和明确完整数字延时都有可检验的事实后果。

candidate work重复2的柜台/木架是未明确供给的背景细节，本次按普通房内环境表现处理，不认证其为持久实体；没有物品使用、迁移或工作过程，故未据此判错。同样，baseline中桌面书籍静态摆放、记忆“合上”的比喻、candidate中不存在实物棋子的比喻均未故意从严。此边界已逐条注明，便于独立复核。

五个原失败案例：baseline 11/15，candidate 7/15；两个正确对照：baseline 6/6，candidate 4/6。没有任何“该角色全部失败样本3/3修复且控制全通过”的结果。一个范围案例的候选3/3只能算局部观察，三次重复和已知固定集不能证明泛化。v2须另存结果，不调整这些预期或抹掉本轮新增错误。

评审时manifest SHA256：0C886C07482AB50B8A772CE3619C761028E19283F1F73319B1E5CD1A1F48C0B2。
