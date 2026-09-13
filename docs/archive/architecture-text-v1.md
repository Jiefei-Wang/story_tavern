# 文本优先架构

## 实际默认路径

`useGameStore.sendPlayerInput` 对有 `textWorld` 的存档直接调用 `TextProcessor.execute`，不进入 `GamePipeline`。新建存档和空数据库初始存档有 textWorld。旧存档在显式迁移前使用旧 GamePipeline。

```text
用户原文 → 代码识别指令块 → Organizer 输入整理/公开背景
  → 前置 admin 文本工具 → 捕获玩家言行感知 → 暂存玩家造成的场景变化
  → 后置 admin 文本工具 → 补充可感知变化
  → 人物独立三轮/两轮回应草稿
  → Organizer 选择下一位 → 执行言行 → 投递 NPC 事件
  → 必要时一轮局部接续 → 各人的个人记忆编辑
  → Narrator 自然正文草稿 → 文档/回合/正文一致提交
```

只有 Organizer、Processor（普通代码）与 Narrator 是主要协调层。人物和受限文本编辑器由 Processor 调用。局部接续最多一轮，不能解决的依赖停在未完成位置。默认不运行全世界后台模拟，也不运行行动资格裁决、逐秒预算、数值属性结算、世界 JSON Patch、narration auditor 或分段 JSON Narrator。

## 模型与消息

沿用 AgentRuntime 的 Backend/Group 绑定、流式、取消、并发限制和 Trace。`text_*` 模板版本为 `text-first-v1`，不调用旧 withConversationContract、withCharacterContract 或 withInputAuthorityContract；角色和旁白不解析 JSON。后续人物轮次通过真实 user/assistant 消息携带本人之前的摘要。

Organizer 的小结构仅用于授权 ID 时序、最小文档范围、动作/语言摘录、公开背景、感知信封与局部接续 ID/已确定的公开言行。JSON 解析/验证最多重试一次，不静默修复语义；人物/旁白没有 JSON 修复。

编辑器通过原生 `document_command` function calling 调用 read/replace/done，模型请求设定工具名称及 `parallel_tool_calls:false`，返回真实 assistant/tool 消息及 tool_call_id。部分服务仍返回多个调用，代码在剩余预算内顺序检查执行；一个批次失败就恢复批次前工作副本，并返回真实回滚错误。admin 可创建人物或场景、切换当前场景，程序分配稳定 ID；普通记录没有此权限。每个编辑任务最多20次操作，失败最多一次重试；每个回合总预算100次调用。

## 数据与访问边界

TextWorld 只含寻址和操作元数据：版本、人物 ID、玩家 ID、当前场景路径、人物轮次模式、文档版本。权威事实是自然文档正文。

| 文档 | 权限用途 |
| --- | --- |
| world/common.md | 候选常识；Organizer 再按人物认知投递 |
| world/private.md | 后台设定，只用于已授权 admin 编辑 |
| scenes/*.md | 后台客观场景；进入人物/旁白前投影 |
| characters/ID/public.md | 公开外在资料 |
| characters/ID/profile.md | 本人设定，其他人物/Organizer/Narrator 不读取 |
| characters/ID/memory.md | 本人的知识与经历，记忆编辑不接收全知小说 |
| turns/*.md | 代码生成的历史记录，模型编辑和配置助手不可写 |

人物没有任意文件工具。无 seen/heard/felt 内容就不调用人物、不记录玩家事件到其记忆。NPC 事件同样按感知投递，旁听者可只保存经历。场景编辑和个人记忆编辑分开分配权限；普通记录不能访问 world/private 或 profile。路径白名单拒绝 traversal、绝对路径、ADS、反斜杠与非文档后缀。桌面侧还拒绝 symlink/reparse 目录。

admin 每条指令仅授权 Organizer 从当前存档路径清单选择的相关文件，编辑器不能自行扩大范围。后台修改先结合实际差异与原始授权投影为可见变化；私人记忆修改只有在该文件确实变化时，才允许调整对应人物本轮暂存经历。其他人物的经历与私人文件不进入这个调整请求。NPC 条件计划经过 Organizer 投影，未触发的计划和未完成依赖不作为公开已发生事件写入。

可确定验证的是“哪些文件/字段和消息实际进入请求”。自由文本投影是否仍语义泄漏、是否恰当地描述陌生物品，需真实试玩评估；不声称数学保证。场景文档中的语义编辑仍依赖模型正确区分事实、发言和猜测。

## 提交、取消与恢复

DocumentWorkspace 复制本轮相关状态，精确替换需先读、匹配预期 revision，并且 old_text 在文档中唯一。失败不模糊匹配，也不回退 JSON Patch。前置修改在捕获感知前生效；玩家造成的场景变化在后置 admin 读取前暂存；后置黑暗不删除已有感知。

桌面 `text_save_commit` 由共享 DB mutex 串行比较 revision。每次写新 generation，逐文件 sync_all，再以 SQLite 单语句更新存档 head。数据库的当前文档条目只保存元数据，正文从指向的 Markdown 文件加载；历史快照和备份是只读审计材料，不是第二份运行时世界。进程中断前未换 head 时仍恢复上一完整状态；未引用目录保留供诊断。

取消发生在模型阶段时丢弃工作副本。进入原子提交后完成该短提交，取消不再开启新回合竞争。保存失败关闭 Trace 为 error，界面不发布成功回合。浏览器在 Web Lock 内执行单次完整集合替换，revision 检测过期写入；无浏览器环境的测试同步替换独立存储。

## 迁移与兼容

`migrateToText` 是显式、幂等纯转换，先复制完整原存档为 legacyBackup。名字、已有文本、自定义字段和关系描述转为可读条目；不会把旧 Schema 再注入运行时。未知字段原样留在可恢复备份，历史正文生成只读文档。迁移前后都检查玩家与必要文档引用。迁移失败不替换原存档。

恢复原版本：文档页面的恢复按钮取出 legacyBackup，校验后以新 ID 保存为独立旧存档，可在首页载入。当前文本存档保留。默认不自动回退覆盖当前文本进度。桌面 generation 与数据库完整备份可用于恢复文本 head；不要单独覆盖活跃 generation 文件。

Backend、认证、应用设置和配置助手继续使用结构化协议。AI 助手 `textSaves` 实际注册 read/schema/validate/save/UI sync，不暴露 legacyBackup 或 turns。旧助手动作、未知字段与 `model_assistant_backend` / `model_assistant_model` 偏好保留。

旧代码和测试保留用于旧存档读取/执行和历史兼容，原架构说明已移至 docs/archive。它们不参与新文本存档运行。
