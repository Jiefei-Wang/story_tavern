# 让人物变化与旁白遵守已经发生的事

这次改动把“玩家提出了什么”“世界实际发生了什么”“人物看见了什么”和“旁白如何表达”分开处理。自定义人物 Schema 继续负责字段、范围、可变性和变化额度；新的裁决与经历链负责给这些变化提供事实依据。它们不能单靠合法 JSON 证明人物行为合理，最终仍需要多轮人工审阅。

## 一轮现在如何执行

1. 编译输入，并检查管理员权限。只有整条输入以 `admin:` 或兼容的 `管理员:` 开头才允许管理员流程；句中引用或世界内不可能行为不会取得管理员权限。
2. `action_adjudicator` 先判玩家的动作尝试。每个动作得到成功或失败结果；只有受限的物品转移、消耗、人物移动、物体状态操作可以形成物理效果。引用、归属、锁定状态等还经过程序检查。玩家说自己拥有东西不会自动创建它，提出给予也不等于对方接过。
3. 感知层根据实际事件和声音范围提供各人的观察。失败尝试仍可被看见，但不能被记成成功；私语不会作为所有同室人物都听到的消息传播。
4. NPC 根据当前观察、自己的近期经历、当前世界的字段定义提出 `stateUpdates` 和 `intents`。属性提议需引用本次实际可见的 `sourceEventIds`；已经结算过的同一事件不能对同一字段再次计分。反应阶段不能预支自己尚未执行的进食、休息或施法带来的身体、资源、能力收益与成本。`character_change_auditor` 只读该人物的个人上下文，独立核对属性变化与计划发言中的确定事实；即使没有属性更新，也检查 speech 是否违背自己的经历或可见物品状态。有问题时允许一次修正，物理动作保持冻结，仅被指出问题的 speechPlan 可纠正事实，不能更换立场、丢掉必要回应或突破原时间预算。复核后仍不合法的属性提议或发言不提交；审查服务失败会使整轮回滚。
5. Resolver 用 `acceptedStateUpdates` 选择合法提议，由程序处理数值运算与文本/列表追加。它不再需要手写人物属性 Patch 来实现算术。物理动作先被实际接受并记录，随后在同一事务的 `completed_process` 阶段统一结算该 NPC 已完成过程的身体、资源、能力效果；这一阶段不再生成动作或对白，也不重复计算社交奖励。候选效果仍经过人物因果审查与 Schema 提交门禁。部分进食只能支持相应有限效果；几秒等待不等于充分休息，口头意愿也不等于行动完成。过程失败或缺乏足够时长不能兑现完整收益。
6. Narrator 表达公开裁决结果，随后 `narration_auditor` 独立核对。发现明确事实错误时允许一次定向重写，再审仍失败则不展示该旁白。旁白失败不会撤销已经提交的世界变化，界面明确显示生成失败。

实现入口：[GamePipeline.ts](../src/engine/pipeline/GamePipeline.ts)、[ActionResolution.ts](../src/engine/world/ActionResolution.ts)、[CharacterEffects.ts](../src/engine/world/CharacterEffects.ts)、[InputAuthority.ts](../src/engine/runtime/InputAuthority.ts)。

涉及物品与目的地的编译事件统一使用 `item` 和 `target`。事件顶层按输出 Schema 校验，未声明的 `object` 等别名在编译阶段报协议错误，并沿用最多一次的格式修正；不会让错误字段进入物理裁决后再放宽实体引用检查。已保存的编译器定义执行时也会得到这份协议，原配置数据不被重写。

回应请求不限于引号对白。用户明确面向某个在场人物听取讲解时，编译器保留 `listen_to` 动作及 `responseRequest`（现有人物 ID 与原文片段），不虚构玩家已经说出的话。路由核对原文来源、当前而非引用/否定/假设的请求、目标一致且在场；动作成功后仅该人物获得回应权限。旁观者、缺席者、偷听或仅旁听他人对话不因此获得发言权限。编译器遗漏请求仍可能造成回应不足，新的协议需要真实测试验证，不声称程序已经完整理解任意自然语言。见 [ConversationRouter.ts](../src/engine/world/ConversationRouter.ts)、[ConversationContracts.ts](../src/engine/runtime/ConversationContracts.ts)。

## 近期经历不是给每个人发送全聊天

`recentTurns` 是管线取得历史的接口。程序仅从当前选中分支、当前回合之前的成功回合中，提取该 NPC 自己的 `npcExperiences`；目前最多取最近 24 条经历。记录包含它实际感知的观察和已结算字段，不把其他人物的私密状态、全局玩家原文或旁白补写内容当作它的经历。人物自己已经执行的动作和发言也会记录。重试使用目标回合之前的历史，不让未来分支的信息倒流。

因此，世界没有自定义 `memory` 字段也能保持近期对话连续性。Schema 中可编辑的长期记忆字段仍可用于世界自己的玩法，它与引擎保留的近期个人经历是不同层次。旧存档没有记录的观察不会被凭空补造；不能声称升级能还原过去没有保存的主观经历。

实现：[ReactionEvidence.ts](../src/engine/world/ReactionEvidence.ts)、[WorldViews.ts](../src/engine/world/WorldViews.ts)、[useGameStore.ts](../src/stores/useGameStore.ts)。

## 旁白的事实优先级

Narrator 和 Auditor 使用同一份规则：先核对实体存在性、物品位置和人物动作，再核对事件时序、成功或失败、对白含义和耗时。当前实体位置优先于旧背景与名称暗含的归属；裁决摘要里的额外文字也不能创建实体。等待或说话不能被写成走开、交接、进食等未执行动作，更不能虚构其他人物背后的行动。

时间窗口的 `duration` 单位是秒。旁白声称经过的时长应与已提交时间窗口及程序时间线一致，并行动作不能简单累加。时钟推进与物品或人物状态变化是独立事实。用户应读到自然叙事，不应读到“字段没变”“数值未更新”等实现说明。

明确“一秒”“两秒”“二十分钟”的等待按用户原时长严格执行。用户没有指定等待时长、编译器追加的自然回应窗口由程序标记为 `implicit_response`：NPC 可在 30 秒上限内规划完整回应，但上限不代表时间已经过去。结算只计算 Resolver 实际接受的动作与发言，同一 NPC 的动作顺序累加，不同 NPC 共用并行窗口，至少保留原有 5 秒停顿。实际耗时同时写入 block、时钟、提交的 wait 事件和个人经历；被拒绝的意图不增加时间。没有回复时也不会固定推进 30 秒。这是运行时排程元数据，不是新用户配置域；实现见 [TurnTiming.ts](../src/engine/scheduling/TurnTiming.ts)。

提交的 wait.source 标明 `timeSemantics=inclusive_block_window` 与 `includesNpcEventsInBlock=true`：其时长已经包含同 block 的 NPC 动作和对白。旁白不能先写完整等待时长的沉默，再把该窗口中的回答另算一遍。共享旁白及审计规则按 block 对照先后关系；允许自然短暂停顿，只有明确额外时长与已提交窗口矛盾时才拒绝，不要求固定措辞。

规则保留自然措辞、语气和修辞自由，不规定固定台词。源码：[NarrationGroundingPolicy.ts](../src/engine/narration/NarrationGroundingPolicy.ts)、[NarratorComposition.ts](../src/engine/narration/NarratorComposition.ts)、[NarrationAuditor.ts](../src/engine/narration/NarrationAuditor.ts)。

## Agent 配置、迁移和测试组

新增三个运行时角色：玩家动作裁决 `action_adjudicator`、旁白事实核查 `narration_auditor`、人物变化与发言事实审查 `character_change_auditor`。旧组缺少它们时，一次性迁移为动作裁决和人物审查复制该组已有 `world_resolver` 的绑定，为旁白审查复制 `narrator` 的绑定，包括 Backend、模型和覆盖参数；已有同名角色定义和绑定不会被覆盖，原角色参数与其他存档保留。`unit test` 最初复制 Fast 的原有设置；后续加入新角色及独立的拒绝检测绑定后，完整组已不再与复制前 Fast 字节一致，但原角色设置没有因此改写。

这些角色和组仍通过 AI 助手既有 `agents` / `groups` 资源读取和修改，没有新的隐藏配置存储。运行时的字段与权限协议仍会验证自定义输出。CLI 测试读取显式导出的配置快照；修改应用内设置后，需要重新导出才能让新测试使用它。配置迁移见 [storage.ts](../src/db/storage.ts)、[initialData.ts](../src/db/initialData.ts)；助手能力与兼容约定见 [ai-assistant.md](ai-assistant.md)。

## 重试、错误和证据

JSON 形状的回复发生语法错误，或已解析 JSON 未通过输出 Schema 的结构校验时，运行时共用最多一次额外请求，不是语法一次再加结构一次。重试材料包含错误与字段协议，不在本地悄悄替换引号或修改实际内容。原始回复、解析结果（如有）、错误、重试原因 `json_syntax` / `json_schema` 和后一次回复分别保留在 trace。普通文本安全拒绝不会作为格式错误强行重试。后续领域门禁发现的物理不可行、非法人物提议或叙事事实错误不是这次通用格式重试的范围，它们按各自的有界裁决、修正或拒绝流程处理；格式修正也不能授权越权或把失败行为改成成功。

已明确关联到成功重试的 JSON 语法或结构失败，报告会列入 `recoveredFormatErrors`，同时保留 `firstAttemptSucceeded=false`；未恢复错误继续算失败。`phase1.recovery` 另列格式重试、动作协议重试、人物修正与旁白重写的首次/最终结果。重试标记只证明曾安排重试，必须有正确关联的最终成功调用才记恢复；人物候选被修正或撤回不等于世界属性已经改变。旁白的定向重写同样保留原稿和审计结果。模型安全拒绝有独立检测及人工标签评分，检测正确只表示拒绝分支成功，该样本没有验证正常剧情或属性变化。

玩家错误横幅只使用安全摘要，调试 trace 和内部诊断仍保留原错误。后端请求截止时间与用户主动取消分别识别：请求超时会记录为运行失败，不会仅因 fetch 抛出 AbortError 就伪称“用户已暂停”；只有调用方的取消信号表示主动停止。发送、重试以及抛出异常的路径都有测试防止 `result.error` 中的世界树或私密值进入横幅。源码：[AgentRuntime.ts](../src/engine/runtime/AgentRuntime.ts)、[PipelineStageError.ts](../src/engine/errors/PipelineStageError.ts)、[BehaviorEvaluation.ts](../src/engine/evaluation/BehaviorEvaluation.ts)、[BehaviorRecovery.ts](../src/engine/evaluation/BehaviorRecovery.ts)、[CharacterChangeAuditor.ts](../src/engine/world/CharacterChangeAuditor.ts)；拒绝测试说明见 [refusal-evaluation.md](refusal-evaluation.md)。

## 仍需人工判断的部分

程序能够检查结构、引用、范围、事务回滚和部分物理前置条件，不能完全理解任意自然语言。已完成过程结算覆盖当前程序能识别的过程动作，并非自动理解任意新动作名；效果方向与幅度仍由人物定义和实际证据约束。动作裁决器、人物反应和旁白审计器仍可能误判。实测曾出现合法来源引用却错误完成动作、裁决摘要创造不存在物品、审计忽略实时归属，以及把秒误写为分钟；补充协议和测试后仍需用新真实运行核查，不能把审计器返回 `grounded=true` 当作事实正确的证明。

信任、亲近感、生理状态是否变化合理，需要结合人物性格、实际经历、动作时长和反事实对照审阅；不存在适用于所有世界的固定加减分表。已知标记检测也不能证明没有改写式泄密。测试分别报告结构、门禁、拒绝检测与人工语义结论，保留失败和重试链，避免用成功末态掩盖中途问题。
