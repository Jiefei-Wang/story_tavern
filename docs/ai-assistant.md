# AI 助手配置能力

入口位于侧栏「历史」下方，名称为「AI 助手」。Backend 与模型独立选择，偏好键仍为 `model_assistant_backend` 和 `model_assistant_model`。

## 当前游戏模型

角色、世界和故事是独立的可复用配置；开始故事时复制一份本局设定，开头消息直接成为第一条正文。后续修改公共库不改变已有存档，剧情生成的新人物只属于当前存档。主角由故事选择，配角可为空，不可重复或包含主角。

本版本不兼容旧存档。初始化时移除不含 `textWorld.setupVersion=2` 的旧存档记录，不清除 Backend、凭证、保留的当前 Agent 自定义配置、助手偏好或新存档。默认只预填配置库，不自动创建游戏存档；清空故事库后不会再次填充默认故事。

## 已注册资源

所有能力由 `src/engine/assistantConfiguration.ts` 的 `assistantResources` 生成，并实际发送给助手。

| 资源 | 内容 |
| --- | --- |
| `library` | 角色、世界、故事和首页故事选择；关联数据一起原子保存 |
| `textSaves` | 已有存档的世界描述、人物文档、人物列表及玩家引用 |
| `saves` | 已有存档名称、故事展示信息和 Agent 组；新游戏的旧数字世界占位数据不可修改 |
| `agents` | Agent 定义、system 行为提示、默认生成参数 |
| `groups` | Agent 组及独立 Backend / 模型 / 参数绑定 |
| `backends` | 服务地址、认证方式、启用状态、超时、并发和模型列表；不包含凭证 |
| `settings` | 语言、主题、开发者模式、模拟模式、自动保存和日志等级 |
| `selection` | 当前 Agent 组、当前存档；与首页所选故事分开 |
| `assistant` | AI 助手的独立 Backend 与模型 |

### library 字段

- `characters.<id>`：`id`、`name`、`setting`、`details`、`initialMemory`、可选 `image`。名字和设定不能为空；详细资料和初始记忆可以为空。头像默认为空。
- `worlds.<id>`：`id`、`name`、`summary`、`description`、可选 `image`。名字和完整描述不能为空；概要仅展示。
- `stories.<id>`：`id`、`name`、`summary`、`worldId`、`playerId`、`supportingIds`、`opening`。标题和开头不能为空；引用必须有效。
- `selectedStoryId`：有效故事 ID 或 null。修改它只更换首页故事，不切换当前存档。
- `image` 支持 HTTP(S) 地址或 PNG/JPEG/WebP data URL，UI 上传上限 1 MB；图片不参与游戏提示词。

三个集合组成同一个配置域 `library`，由 SQLite 单次原子提交或浏览器互斥提交持久化。这允许在同一批 Patch 中创建角色和引用它的故事，也允许同时解除引用与删除角色。集合键必须等于对象 ID。删除仍被故事引用的世界／人物会被拒绝；删除当前故事时需同步将 selectedStoryId 改为 null 或其他有效故事。

示例：

- 「创建一个沙漠世界，概要写给读者看，完整描述交代商路、气候与社会规则。」
- 「将艾琳的设定改得更谨慎，保留详细资料和记忆。」
- 「创建故事《沙海来信》，选旅行者为主角、艾琳为配角，写好开场并设为首页故事。」
- 「取消这个故事中的卫兵配角，再从角色库删除卫兵。」
- 「只修改本局艾琳的设定，不修改角色库。」

## 模型消息协议

新游戏的每个生成请求固定使用以下顺序：

1. `system`：当前 Agent 的行为说明。仅拼接已配置的 system 文本，不插入世界、角色、玩家数据，不执行模板插值；配置的其他角色模板消息不参与新故事请求。
2. `user`：完整世界描述 + 配角定义 + 玩家定义，要求回复「收到」。角色定义包含名字、设定、详细资料与初始记忆。
3. `assistant`：`收到`，由程序预填，不额外调用模型。
4. `assistant`：用户填写的开头消息，随后为已保存的历史消息。
5. `user`：本轮原始输入、任务、路由指示和必要的动态材料。

世界配置只有 `description` 进入游戏请求；世界名称、概要、图片，以及故事标题、简介都不作为定义发送。完整描述在生成环节共用，不再有独立的后台世界秘密通道。人物仍应保持自己的知识边界。角色、玩家、历史和当前输入正常提供。

运行流程保留 `text_router → text_designer → text_storyteller`；没有选中人物时跳过 Designer。玩家不是可由路由选择的 NPC。动态创建人物时沿用人物文档验证与原子存档提交，且不会写入公共角色库。memory 文档是初始记忆与背景；Designer 的 end_state 和历史锚点是只读运行记录。

## 校验、持久化与限制

助手使用 JSON Patch 的 add/replace/remove/test。先在副本上验证最终状态，再保存；校验使用领域校验器，不用解析结果覆盖原始数据，因此保留未知字段。版本号由程序维护，不能通过 Patch 改写。`library` 发生冲突、取消或落盘失败时不更新 UI、不报告保存成功。不同资源之间不承诺跨资源事务，回执只列出已经完成的操作。

公共库保存在独立的 `story_library_v2` 配置记录中，不混入普通系统设置。文本存档继续使用 Markdown 版本文件与 SQLite 指针原子提交；浏览器通过同源本地服务访问同一 SQLite 与 Markdown 目录；不再使用浏览器数据库，也不回退到 localStorage。保存不覆盖其他存档的未保存进度。

存档文档只接受授权路径。新存档世界描述为 `world/description.md`，人物为 `characters/<id>/{public,profile,memory}.md`；新增人物必须同时创建三个文档且玩家必须存在。历史回合、状态、版本、追踪、备份和运行中任务不可作为配置编辑。凭证与自定义认证头继续通过既有安全表单管理，不进入上下文或回执。

保留 `save_agent`、`save_group`、`set_active_group` 助手动作协议，以及已有 Backend/模型偏好；旧动作不会覆盖未知字段。这是助手协议兼容，不代表旧游戏存档兼容。新增独立配置域仍须注册 schema、读取、业务校验、保存和即时同步，不能声称助手自动理解未注册存储。

验证覆盖：配置读写与落盘、未知字段保留、非法引用、空配角与自选主角、快照隔离、消息顺序与展示字段排除、取消、冲突、失败回执、旧存档清理及 CSP 禁止动态代码生成的运行条件。

## 浏览器与桌面共用本地服务

`npm run dev` 和 `npm run preview` 自动启动 Rust 本地服务；桌面仍走原生 IPC，双方复用相同数据库与文本存档实现。默认目录为 Windows 的 `%APPDATA%/story_tavern`。浏览器使用同源 `/__story_local/rpc`，服务不可用时明确失败，不建立第二套数据。跨进程的配置库与存档版本检查在 SQLite 写事务内完成，冲突不覆盖现有版本。另一已打开实例需重新加载以读取外部更改。

浏览器首次及后续启动会清除本站旧 `story_tavern_*`、`secret_*`、`model_assistant_*` 与 `openrouter_key` 数据，不导入、不合并、不向后兼容。桌面已有配置和凭证保留。当前组选择和助手独立 Backend/模型偏好改存 SQLite settings 表；助手仍通过 selection 和 assistant 资源读取、修改、保存与更新当前 UI。偏好键名保留，不导入旧浏览器值。

所有正式浏览器模型调用，包括游戏生成、模型列表、连接测试和 AI 助手，都由 Rust 服务读取 Windows 凭证管理器或既有 OpenRouter `.env` 备用来源并代发。浏览器不读取 API Key，环境密钥不注入前端包，服务不提供读取凭证的 RPC。安全表单只允许设置或删除凭证。侧车只监听随机 loopback 端口，访问令牌仅在本地宿主进程间传递；网页入口校验 Host、Origin 与专用请求头，无跨站访问许可。

验证脚本 `node --import tsx scripts/shared_host_smoke.ts` 使用 E 盘项目下 `.tmp` 独立目录，覆盖跨进程共享、版本冲突、重启、Markdown 落盘、流式代理与鉴权隔离。指定 `STORY_TAVERN_TEST_DIR` 启动 Vite 时仅该测试宿主使用独立目录；正式启动不设置它。测试结束只关闭本次启动的子进程。

## Agent 默认目录与旧配置清理

正式静态默认配置位于 `src/db/initialData.ts`，提示词来自 `src/engine/text/Agents.ts` 的 `ROUTED_AGENTS` 和 `src/engine/evaluation/RefusalDetector.ts`。空数据库会获得路由、Designer、Narrator、模型安全拒绝检测四个 Agent，以及 Fast、Quality、Local 三组完整绑定；检测 Agent 独立使用，不自动插入故事回合。默认 Backend 和角色／世界／故事库也从仓库初始化，凭证仍通过安全接口单独设置。

`src/db/agentCatalog.ts` 清理已退役 Agent、非默认旧流程组与 `group_unit_test`，默认组只保留四个当前绑定。保留当前提示词、当前模型绑定、未知字段及安全拒绝检测配置，不从旧绑定继承配置。缺失默认项由静态目录补齐；被清理组的存档当前引用切换为 Fast，历史回合不修改。历史管线定义仅作为 `tests/fixtures/legacyInitialData.ts` 的回归夹具，不进入正式初始化或恢复默认操作。

AI 助手的 `agents`、`groups` 资源读取清理后的实际配置，仍支持局部 JSON Patch、引用校验、取消、冲突及失败回执。例如可修改 `/text_router/messages/0/content` 或 `/model_refusal_detector/defaults/temperature`；不要重新创建已退役的默认 ID。
