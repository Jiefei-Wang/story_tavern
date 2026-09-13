# 世界级自定义人物属性 Schema

实现与验收日期：2026-09-12。功能入口：**角色 → 编辑世界人物 Schema**。Visual 面向普通用户；Source 编辑同一份 human-friendly definition JSON。

## 1. 架构

`GameSave.worldDefinition.characterSchema` 是世界定义；`WorldState` 只保存人物值，回合快照不复制 Schema。Section 只分组，没有心理、记忆或关系好感度等内置语义。Harbor Tavern 的职业、情绪、目标、记忆、信任只是其默认世界定义。

```text
世界定义 → definition 校验 → JSON Schema / 字段提示 / UI
NPC Reaction → scoped stateUpdates → 提议校验 → Resolver
Resolver RFC6902 → 原始操作逐步审计 → 独立新人物生成
                 → 最终 candidate 全人物校验 → commit
世界状态 → 按 visibility 递归投影 → Perception / Narrator
NPC 自己的完整状态 + 自己观察到的事件 → NPC Reaction
```

复用现有 `SchemaValidator`、`PatchEngine`、`AgentRuntime`、独立 `CharacterGenerator` 和对话来源/时间校验，没有引入新 JSON Schema 引擎或 YAML 依赖。模块逻辑位于 `src/engine/character-schema/`，Pipeline 只负责接线和事务。

## 2. 数据结构

```ts
interface WorldDefinition {
  version: number;
  characterSchema: CharacterSchemaDefinition;
}
interface CharacterSchemaDefinition {
  version: number;
  sections: { id: string; label: string; fields: CharacterFieldDefinition[] }[];
  relationship?: { label?: string; fields: CharacterFieldDefinition[] };
}
interface CharacterStateUpdate {
  path: string;
  op: 'set' | 'delta' | 'append';
  value: unknown;
  reason?: string;
}
// 人物值示例；没有 relationship definition 的世界不含 relationships。
const character = {
  type: 'character', name: '艾琳', location: 'tavern_room',
  attributes: { suspicion: 0.42, knownFacts: [] },
  relationships: { player: { trust: 0.45 } },
};
```

Field 支持 text / number / integer / boolean / enum / list / object；label、description、llmGuidance、default、required、visibility、updatePolicy、freedom、min/max、enumValues、item/fields 和 changePolicy 全部可编辑。关系维度使用相同 Field 定义，目标 ID 来自实际人物。

`strict / guided / free` 分别显示为“严格 / 引导 / 自由”，并解释语义。三者都严格验证外壳、类型与范围；自由文本可自行编写，不能夹带任意新 JSON 字段。

## 3. Migration 与编辑事务

- 无 `worldDefinition` 的旧存档自动接上 Harbor 定义。旧顶层人物字段移入 `attributes`，`mentalState` 的成员展开至 attributes。
- `relationships.player: 20` 转为 `relationships.player.trust: 20`，原值不缩放；负值也保留。未知旧字段推断为私密、不可变的严格字段，避免静默丢弃。
- 当前世界、每个回合 before/after、所有 variations 都迁移。旧原始 Patch 保留在 `legacyPatches`，可执行回合 Patch 从已迁移快照重建。再次加载不会再次迁移或重写旧字段。
- 浏览器和 Tauri 存储先验证整批存档，再写回需要升级的记录。格式不合法时提供错误，保留原始数据；不会用空存档覆盖损坏记录。
- 在现有存档应用定义时，递归补入默认值，并验证当前状态和全部历史；删除已有字段、缩紧范围导致不兼容时，整个编辑失败。既有世界定义的扩展元数据保留。
- “以此 Schema 创建新世界”建立独立存档、仅包含按默认值初始化的玩家、空历史和空关系。旧存档继续保留。缺少默认值的必填字段需要先配置可用初值。
- AI 助手的 saves 配置资源同步公开递归 definition 合约，复用业务校验和 migration；测试覆盖保存、取消、冲突、历史及其他未保存存档不受影响。

## 4. Deterministic 约束

| 约束 | 执行方式 |
|---|---|
| Definition 本身 | 拒绝非法/重复 ID、危险原型键、错误范围/default、空 enum、缺 item/fields、不支持组合；深度最多 8、总字段最多 256，检测循环 |
| 类型、范围、枚举、required | 编译闭合 JSON Schema，交给原有 SchemaValidator；递归对象与列表额外字段不允许 |
| 自由载荷 | 仍受容器约束；拒绝非有限数字、循环/非 JSON 值、未知字段 |
| Scoped proposal | 只接受 `attributes.field`、`relationships.target.field` 点分路径；禁止 RFC6902、跨人物路径与未定义目标；列表项用 append |
| immutable / setup_only | 比较每次操作前后人物；创建可初始化，运行中禁止修改、删除或用父对象替换绕过 |
| append_only | 文本新值必须以前值为完整前缀；列表前缀元素逐项相等；禁止重写/删除历史 |
| set / delta | Proposal 按 changePolicy.mode 限制操作，数值 delta 必须有现值/default；Resolver 的 RFC6902 最终值仍受变化额度限制 |
| maxPerEvent / maxPerTurn | 累计绝对变化量，包含拆分操作和来回振荡；event 按一个 resolution block 保守计量，turn 跨全部 block、wait、admin、time-skip 累计；超限拒绝，不 clamp |
| 任意 Patch 绕过 | 先验证原始 Patch 每个中间状态，再验证最终全部人物；whole entity/root、remove+add、copy/move、类型改写都不能逃过；生成器压缩 diff 前也审计原始变化 |
| 原子提交 | 非法 NPC proposal 可逐项拒绝并记录，合法项仍是候选；非法 Resolver 批次整体不提交、账本不消耗。生成失败也不提交草稿 |
| Relationship | 完全可选；每个目标必须是现存 character，每个维度必须在当前世界定义中 |
| Privacy | visibility 递归投影；私密父节点遮蔽全部子节点；public Patch 来自前后公开世界的 diff，避免整对象/列表夹带私密子字段；NPC View 只包含自身状态 |
| Trace | `character_update_validation` 展示 proposed/accepted/rejected、规则和 before/after；`character_patch_validation` 展示原始/生成 Patch、最终提交或拒绝原因 |

## 5. 本功能涉及的文件

以下是功能文件清单；工作区开始时已有其他修改，未将无关的助手、对话或模型配置改动冒充为本功能。

- 新增核心：`CharacterSchema.ts`、`HarborSchema.ts`、`AgentContract.ts`、`GuardedPatches.ts`、`Migration.ts`、`EditSchema.ts`、`AuthoringContract.ts`，均位于 `src/engine/character-schema/`。
- 类型与存储：`src/types/index.ts`、`src/db/initialData.ts`、`src/db/storage.ts`、`src/stores/useGameStore.ts`、`src/engine/world/WorldState.ts`。
- 流水线集成：`src/engine/pipeline/GamePipeline.ts`、`src/engine/characters/CharacterGenerator.ts`、`src/engine/world/WorldViews.ts`、`src/engine/runtime/AgentRuntime.ts`、`ConversationContracts.ts`、`MockSimulator.ts`、`src/engine/errors/PipelineStageError.ts`。
- 当前 UI：角色与世界公共库使用 `src/pages/Library/LibraryPage.tsx`，本局配置使用 `SaveConfigurationPage.tsx`；旧人物页及专用 Schema 编辑器已移除，底层 Schema 校验、迁移和 `CharacterFields.tsx` 测试仍保留。
- 助手接入：`src/engine/assistantConfiguration.ts`、`docs/ai-assistant.md`。
- 新增测试：`tests/character_schema.test.ts`、`tests/character_schema_assistant.test.ts`、`tests/fixtures/characterWorlds.ts`。
- 旧测试相关 fixture/assertion 迁移：`tests/character_generation.test.ts`、`comprehensive_test.ts`、`conversation.test.ts`、`explicit_admin.test.ts`、`invariants.test.ts`、`test_suite.ts`。
- 实测工具：`scripts/character_schema_playtest.ts`、`scripts/character_schema_generation_playtest.ts`、`scripts/native-character-playtest.mjs`、`package.json`。
- 交付：本文与 `artifacts/character-schema/` 下的真实运行记录和验收摘要。

## 6. 新测试与运行结果

新增测试文件合计 **37 项**（含参数化展开）：A–O 全覆盖，并额外覆盖嵌套私密列表、跨回合绝对变化累计、循环/非有限载荷、类型洗白、整世界替换、生成器 diff 压缩绕过、默认值递归填充、存储只迁移一次、历史 variations、Schema 编辑事务、AI 助手取消/冲突/历史保留。四个 mock pipeline 场景也是实际执行 GamePipeline，不只调用单个 validator。

| 命令 / 验证 | 结果 |
|---|---|
| `npm test` | 139/139 通过 |
| `npm run check:csp` | 139/139 通过，禁止从字符串动态生成代码 |
| `npm run build` | TypeScript + Vite 通过 |
| `cargo test --manifest-path src-tauri/Cargo.toml` | 12/12 Rust 测试通过 |
| `npx tsx tests/test_suite.ts` | 通过 |
| `npx tsx tests/test_user_admin.ts` | 通过 |
| `npx tsx tests/comprehensive_test.ts` | 通过 |
| `npx tsx tests/test_live_llm.ts` | 真实 LLM 通过 |
| `npx tsx tests/test_retry_and_timeskip.ts` | 首次网络 AbortError，重跑通过；原失败日志保留 |
| 新真实多轮 Schema 场景 | 四种世界，最终选定运行共 13/13 轮通过自动结构检查；叙事合理性未通过完整验收 |
| 新真实人物生成 | 四种世界各生成一人，4/4 通过 |
| 浏览器人工操作 | Harbor 展示、Source 错误阻断、Visual/Source 同步、新建无关系世界、应用字段标签、刷新持久化验证通过 |

现有 conversation、finite perspective、privacy、narrator provenance、generation、streaming、retry 测试保留并通过。`git diff --check` 通过。构建仍提示约 993 kB 主 JS chunk 超过 Vite 的 500 kB 建议值。

详细的输入、关键输出、状态变化、失败及复测见 [真实运行验收报告](../artifacts/character-schema/REPORT.md)。每轮原始记录保存完整 agent context/output、validation trace、before/after、Patch 和 narration，可核查模型实际看到的内容。

复现方式（使用已配置环境凭证；脚本不会打印密钥）：

```powershell
npm run eval:character-schema
npm run eval:character-schema -- --scenario=free
npm run eval:character-generation
# 离线回归仅在显式传入 --mock 时启用
npm run eval:character-schema -- --mock
```

可通过 `CHARACTER_EVAL_MODEL` 指定实测模型，通过 `CHARACTER_EVAL_OUTPUT` 指定输出目录。

## 7. 已知限制

- 玩家动作裁决的模型 `summary/reason` 仅保留在内部 decisions 和 trace。发送给 Perception、NPC 与 Narrator 的 `events[].outcome` 由程序根据已校验的物品转移、消费、移动和对象状态效果生成，不采用模型自由说明。模型判定失败时公开原因仅为“所需对象或条件没有成立”；只有存在性、可达性等确定性预检查可给出更具体原因。这样会降低部分失败反馈的细节，但避免把模型编造的袋内物品、隐藏知识或额外动作当作已确认事实。无持久效果的动作也不凭摘要补充动作步骤。

- Schema 能严格控制结构、类型、权限和数值额度，但不会证明自然语言记忆的真假，也不会自动决定信任应该升还是降。社交实测中“坦白道歉”被人物理解为值得增加信任，但忽视了承诺落空；该结果不能作为人物反应合理的证据。社交场景没有保存 NPC 交往经历，旁白还将口头借伞写成了实际交接，详见实测报告顶部更正。
- 有限视角是上下文隔离；NPC 可在自己的公开言语中表达内容。任意自然语言改写后的秘密泄露无法仅凭字段投影完全证明不存在；实际运行同时检查私密 canary 和人工阅读。Narrator 仍可能添加杯子、动作等细节，这些文字不会直接成为人物属性或绕过提交校验。
- 实测出现过角色离场、过长 speech、错误来源 ID、非法列表包装、文本覆盖等模型违规；运行时拒绝而非自动放宽。修正相关提示后复测成功，不保证任意模型每次都生成合法结果。
- 状态更新是提议，不保证每个动作或快进都会造成数值变化；最终生存测试搬柴后疲劳增加，但末轮快进只更新时钟，未强行注入恢复值。
- Field ID 仅允许安全 ASCII 字母/数字/下划线/连字符，首字符不能为数字，长度最多 64；中文名称使用 label。NPC proposal 暂不支持按列表索引修改单项，但整个动态列表可 set，追加型列表可 append。
- 现有存档定义编辑要求全部历史仍兼容；没有自动删除历史、缩放旧值或复杂批量重命名映射。无法推断的 legacy null、异构列表等会报错并保留原记录。
- Tauri 批量迁移先全部校验，但逐记录存储写入不是跨存档数据库事务；中断后依赖幂等迁移继续完成。浏览器为整列表单次写入。
- 本次没有构建安装包或运行需要 native test token 的完整桌面自动化；已完成网页 UI、真实 Pipeline、TypeScript 构建及 Rust 回归。
