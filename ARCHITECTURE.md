# 组合执行器

src/engine/workflows/Workflow.ts 是唯一的模型步骤调度器。独立文本页面直接调用 runWorkflow；游戏由 useGameStore.sendPlayerInput 调用 StoryWorkflow.execute，后者只提供游戏材料、领域校验和待提交存档，同样使用 runWorkflow 调度。

旧状态 GamePipeline 和硬编码文本 TextProcessor 已删除。旧存档和历史证据的结构、验证器、显式迁移、只读分析仍保留，不再提供旧状态回合重试或分支重放。

## 配置与执行

Workflow 包含 id/name/steps/output。每一步以独立 ID 引用 Agent，可以重复使用同一 Agent；模型由所选 Agent 组绑定。输入仅从声明来源读取：

- from:input：本次用户输入。
- from:step：已完成步骤的结果，stepId 指调用实例，pointer 使用 JSON Pointer。
- from:context：调用方明确提供的材料，pointer 选择字段。游戏提供 world、characters、player、history、input，独立文本运行默认没有上下文。

执行器校验引用、步骤 ID、模型绑定、输入基础 JSON 类型和输出 schema。最多 32 步，顺序执行，不支持循环或动态 JavaScript。最终结果必须选出非空文本。配置和绑定在开始时取快照；取消信号贯穿请求和校验，失败停止后续步骤。

配置库存储可选的 workflows 与 storyWorkflowId。没有故事选择时使用 DEFAULT_STORY_WORKFLOW；指定选择不存在则拒绝，不静默回退。页面可复制默认故事组合、更换 Agent，并选择从下回合起使用的组合。普通文本组合也可用于游戏，它只追加正文，不更新人物设计或创建人物。

## 默认故事组合

默认组合是四个有序步骤的数据定义。storyStage 明确指定领域协议，不根据 Agent ID 推断。

| 阶段 | 默认 Agent | 适配器职责 |
| --- | --- | --- |
| route | text_router | 提供人物卡，校验人物 ID 与创建/重新生成需求 |
| cards | text_character_designer | 按需生成卡片，验证 request_id，程序分配新 ID 并检查世界不变量 |
| outlines | text_outline_designer | 按需批量设计人物回应，校验完整角色覆盖、表达、动作与 end_state |
| narration | text_storyteller | 提供公开表现、路由指示与历史，要求自然正文 |

故事阶段必须按 route、cards、outlines、narration 顺序各出现一次；普通步骤可穿插，并显式读取此前结果。没有创建请求时 cards 跳过，没有选中人物时 outlines 跳过。阶段适配器不调用模型；JSON 校验最多一次重试也由共同执行器完成。新增/重新生成的人物使用现有文本世界校验器。草稿只在工作副本中改变。

默认提示词内容、请求材料和角色状态规则延续上一文本版本。完整 Prompt 通过一次模板渲染生成请求，不二次解释用户输入中的占位符。thought/end_state 不作为 narration 的表现材料；定义中明确引用的作者资料仍按现有规则提供。语义上的知识边界依赖模型，结构校验不是语义正确性的保证。

## 保存与兼容

游戏适配器返回候选存档，useGameStore 在提交前再次检查取消和存档存在性，再调用 commitTextGame 按 revision 原子保存。历史锚点只在成功提交后生效；失败或取消不产生半轮正文、人物卡或状态。其他存档的未保存进度不覆盖。通用独立运行不写存档。

新回合记录 textTurn.pipeline=workflow-v1 和 workflowId。旧 routed-v2 回合、历史变体、未知字段保持可读，不重写过去的管线标记。无 textWorld 的存档保留为只读，用户可显式迁移后使用新组合；初始化不因管线退役而删除存档。

助手通过独立 workflows 资源编辑定义，通过 library.storyWorkflowId 选择游戏组合。两者同时修改时共用一次配置库 CAS 提交，避免删除当前组合产生悬空引用。旧助手动作和独立 Backend/模型偏好保留。凭证不进入组合输入或普通配置。

Trace 记录每步调用、输出校验、重试与保存结果。BehaviorEvaluation 等遗留证据读取器仅用于历史报告，不含运行旧管线的入口。

## 验证

tests/workflows.test.ts 覆盖通用组合；tests/story_workflow.test.ts 覆盖游戏接入、选择、历史、取消、CAS 和助手跨资源提交。原文本回归已改为测试新游戏适配器，保留人物创建、重新生成、无角色回合、失败恢复、提示词与存储验证。纯领域验证器测试保留，依赖已删除状态执行器的测试退役。
