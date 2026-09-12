# NPC 对话路由与旁白事实一致性修复

本次修改保留工作区已有改动、有限视角、反应时间预算及事务回滚。

## 程序保证

- A：普通回合和继承观察的等待回合都根据独立 interaction 权限过滤 speech。所有实际看到或听到事件的 NPC 仍可运行 Reaction；thought、mentalUpdates 和时间预算内的非语言动作仍保留。
- B：Resolver speech 必须匹配过滤后真实 intent 的程序生成 ID、NPC、speech 类型、原文和目标。同一来源不能重复提交。失败抛出 world_resolver PipelineStageError，整轮世界状态回滚。
- C：Narrator 只能输出结构化 segments。event_ref 必须引用本轮 committed 公开事件；程序原样渲染对白。未知、私有、重复引用以及虚构对白均拒绝。

仅靠引号正则无法证明任意自然语言没有虚构对白，因此 narration.text 使用封闭的连接短句词表，动作与环境由程序模板渲染。这比原先自由小说旁白更严格，叙事表现力有所降低；后续扩展应增加有明确事实来源的模板，不能重新开放任意自由文本。旁白失败保留已经提交的世界状态，并记录 narrationError。

## 文件及作用

| 文件 | 本次作用 |
| --- | --- |
| src/types/index.ts | ConversationState、InteractionContext、NarratorResult 和事件/intent ID 类型 |
| src/engine/world/ConversationRouter.ts | 省略目标补全、有效目标检查、群体目标权限、根据 committed 事件更新 focus |
| src/engine/world/WorldViews.ts | NPC interaction 视图和 public speech 来源校验 |
| src/engine/world/WorldValidator.ts | 可选 conversation 的结构校验，兼容旧存档 |
| src/engine/pipeline/GamePipeline.ts | 普通/等待回合权限过滤、稳定 ID、提交后 conversation 更新、旁白组合及校验 trace |
| src/engine/narration/NarratorComposition.ts | 结构化 schema、封闭叙述词表、引用校验、程序渲染 |
| src/engine/runtime/ConversationContracts.ts | 内置及已保存 Agent 的协议适配，保留模型参数 |
| src/engine/runtime/AgentRuntime.ts | 执行时适配旧 Agent 定义 |
| src/db/initialData.ts | 内置 inputs、prompt、intent/public-event schema 和 Narrator 协议同步 |
| src/engine/schema/SchemaValidator.ts | Narrator 结构与 Resolver sourceIntentId 语义校验 |
| src/engine/runtime/MockSimulator.ts | 模拟目标解析、发言权限、intent 来源、结构化旁白；无外部 intent 时仍处理心理更新 |
| src/pages/Debug/DebugPage.tsx | 展示权限过滤、公开事件来源校验、旁白组合的详细 trace |
| tests/conversation.test.ts | 新增 12 项回归测试，覆盖需求中的九类场景及额外边界 |
| tests/invariants.test.ts | 给有效 public speech 测试补充来源；旁白来源测试提供足够反应预算 |

## 行为约定

- 明确目标优先于 focus；空目标由程序补全有效、在场的 focus。不存在或不在场的明确目标 fail-fast；失效 focus 不会猜测其他 NPC。
- target=all/group 显式允许群体成员发言。独立等待不默认授权发言；紧接普通回合的等待继承该回合的交互目标。
- NPC 对玩家的 committed speech 建立 focus；NPC 之间对白只更新 lastSpeakerId。
- time_skip、场景位置变化及 admin 修改时间清空 focus；普通局部 admin 修改保留。模型 Patch 不能写入 conversation。
- Admin 新建人物不会制造 speech 或建立虚构对话。旧自由旁白文本不会被用于回填 conversation。
- 非 verbal intent、心理更新仍由原有 Resolver 决定是否落实。

## 验证

- 自动化测试：85/85 通过（含 12 项新增测试）。
- CSP 禁止动态代码生成环境：85/85 通过。
- TypeScript 检查及 Vite 生产构建通过；Vite 提示主包超过 500 kB。
- Rust 单元测试：12/12 通过。
- git diff --check 通过，仅有工作区换行符提示。

未调用真实 LLM；上述权限及来源限制通过故意返回违规内容的测试桩验证，不依赖模型服从 prompt。
