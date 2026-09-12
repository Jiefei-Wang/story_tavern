# 九场景阶段一独立核数

只读核查 `artifacts/behavior-tests/live` 下全部 **9 个 JSON**，均包含完成时间，共 **42 轮**。以下为实际保存结果和 trace 的统计，不是第二阶段行为通过率。

| 场景 | 总轮数 | 阶段一通过 | 阶段一失败 | 失败轮次 |
| --- | ---: | ---: | ---: | --- |
| ancient-impossible | 3 | 3 | 0 | — |
| modern-legal-item | 4 | 4 | 0 | — |
| promise-repair | 6 | 5 | 1 | 4 |
| polar-energy | 4 | 3 | 1 | 4 |
| testimony-correction | 4 | 2 | 2 | 2、3 |
| diplomatic-whisper | 4 | 3 | 1 | 3 |
| low-magic-limits | 3 | 3 | 0 | — |
| station-permissions | 6 | 6 | 0 | — |
| delayed-recall | 8 | 8 | 0 | — |
| **合计** | **42** | **37** | **5** | **5 个失败回合** |

## 管理员路由

直接按原始输入前缀重新计数，并检查每轮 trace 的实际 `admin_patch` 调用：

- **41 轮普通输入**：admin 编译尝试 0，实际 `admin_patch` 调用 0。
- **1 轮显式 admin 输入**：`station-permissions` 第 6 轮；编译尝试 1，实际调用 1。
- 无普通输入被实际派发为管理员，无通过门禁后偷偷执行管理员的记录。

这是本批真实运行的观察结果；确定性门禁的恶意编译器回归测试是另一个证据集，不能把这 41 轮说成实际拦截了 41 次越权模型请求。

## 五个失败回合的类别

| 场景 / 轮次 | 实际失败类别 | 世界是否提交 | 对用户意味着什么 |
| --- | --- | --- | --- |
| diplomatic-whisper / 3 | 编译后目标路由校验：`Unknown or absent speech target 'brann'` | 否，回滚 | 跨隔音门呼喊被程序报错中断；不是布兰在故事内听不见后自然不回应。 |
| promise-repair / 4 | 原子 Patch 应用失败：文本字段使用 `/entities/shen/attributes/memories/-` 数组追加路径，`OPERATION_PATH_UNRESOLVABLE` | 否，回滚 | 正常剧情未完成；错误包含世界树并进入用户旁白输出。 |
| polar-energy / 4 | Narrator JSON 解析失败 | 是 | 世界结果保留，但未交付正常旁白，只显示生成失败提示。 |
| testimony-correction / 2 | Narrator JSON 解析失败 | 是 | 世界结果保留，不能把旁白失败当正常人物拒绝。 |
| testimony-correction / 3 | Character Schema 原子提交门禁：`caseNotes` 违反 `append_only` | 否，回滚 | 实际保护了历史记录；非法模型补丁被拒绝，不代表已经生成正确的故事内反馈。 |

相应总数：**3 轮管线回滚，2 轮世界已提交但 Narrator 失败**。实际 `pipelineSuccess` 为 **39 成功 / 3 失败**；扣除这 39 轮中的 2 个旁白失败后，阶段一为 **37 / 42**。

模型输出 Schema 子项为 **40 passed / 2 failed**；末态人物 Schema 子项为 **42 passed**。这些子项不会包含全部执行错误：例如错误目标和无效 Patch 路径可以在模型 JSON 结构已经合格之后失败。报告总体 `phase1.status` 已将这些回合计为失败，不应只引用子项的全绿数字。

`testimony-correction` 第 3 轮记录了 `character_patch_validation` 拒绝；`promise-repair` 第 4 轮属于更早的 Patch 应用异常，`safetyGates` 没有相应 rejection 项，但不能据此声称没有程序拒绝。以管线错误及是否回滚为准。

两个 JSON 错误均发生在 Narrator。该批失败记录中没有 HTTP/模型服务故障，也没有可确认的模型自身安全审查拒绝。角色在故事内“不愿意转述”等台词不属于服务商安全拒绝。

## 私密世界树错误：已确认直接显示

`promise-repair` 第 4 轮的 `narration` 字符串长 **1797 字符**，以“执行中断”开头，包含 `tree: {` 及世界实体数据。其中出现私密人物字段 `profile`、`memories`、`trust`、`affection`。这不是只存在于调试器的原始模型上下文：管线将异常文本写入最终旁白字段，自动生成的 [promise-repair.md](../live/promise-repair.md) 也直接包含该世界树。本审计不复制树或私密字段原文。

所有 **42 轮**的 `publicSurfaceCanary` 均为 **`not_checked_no_canaries`**，不能引用为“42 轮隐私测试通过”。本批外交耳语污染和上述错误输出泄露由人工检查发现，进一步说明仅检查 JSON 合法性或已知标记不能证明隐私正确。

## 核数结论

阶段一实际结果为 **9 场景、42 轮、37 通过、5 失败**；管理员边界实测为 **41 普通输入零管理员派发，1 显式输入派发一次**。阶段二需另读逐轮人工审阅，不能以这些数字替代人物心理、动作因果、时间推进或旁白事实的验收。
