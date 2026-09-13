# AI 助手配置能力

入口位于侧栏「历史」下方，名称为「AI 助手」。Backend 与模型独立选择，偏好键仍为 `model_assistant_backend` 和 `model_assistant_model`。

## 当前游戏模型

角色、世界和故事是独立的可复用配置；开始故事时复制一份本局设定，开头消息直接成为第一条正文。后续修改公共库不改变已有存档，剧情生成的新人物只属于当前存档。主角由故事选择，配角可为空，不可重复或包含主角。

旧存档和历史保留；无 textWorld 的状态存档仅可读或显式迁移，文本存档直接使用新的组合执行器继续。初始化不因管线退役删除存档，Backend、凭证、助手偏好和未知字段保留。

Agent 编辑器直接编辑完整 Prompt 与有效生成参数，不再展示消息角色、兼容开关或手工输入变量声明；文本 Agent 不展示运行时忽略的输出 Schema。其他 Agent 的输出校验仍可配置。Agent 组常规修改自动保存，extraBody 单独保存。

## 已注册资源

所有能力由 `src/engine/assistantConfiguration.ts` 的 `assistantResources` 生成，并实际发送给助手。

| 资源 | 内容 |
| --- | --- |
| `library` | 角色、世界、故事和首页故事选择；关联数据一起原子保存 |
| `workflows` | 独立文本组合：步骤、输入引用、最终输出；运行时选择模型组 |
| `textSaves` | 已有存档的世界描述、人物文档、人物列表及玩家引用 |
| `saves` | 已有存档名称、故事展示信息和 Agent 组；新游戏的旧数字世界占位数据不可修改 |
| `agents` | Agent 定义、完整 `prompt` 模板、默认生成参数 |
| `groups` | Agent 组及独立 Backend / 模型 / 参数绑定 |
| `repositoryDefaults` | 开发服务中的仓库默认 Agent 与组；独立文件保存，不自动应用到本机 |
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

每个故事 Agent 的完整输入由 `agents.<id>.prompt` 决定。程序只渲染一次模板，作为一条 user 消息发送；不再在模板外补拼 system、世界定义、“收到”、历史或本轮材料。UI 的“Prompt”是编辑概念，不是 API 消息角色。默认模板包含以下材料，用户可以删除、重排或改变其文字包装；移除变量就不会发送该数据。

| 变量 | 内容 |
| --- | --- |
| `{{world}}` | 本局世界描述 |
| `{{characters}}` / `{{player}}` | 配角列表／玩家定义（id、name、definition、initialMemory） |
| `{{history}}` | 含开头、已完成回合与时间锚点的消息列表；只读 |
| `{{input}}` | 当前用户原始输入 |
| `{{task}}` | 本阶段任务与输出要求 |
| `{{material}}` | 当前阶段材料 |
| `{{routingInstructions}}` | Router 的解释；Router 阶段为空 |
| `{{retry}}` | 本次格式重试反馈；首次请求为空 |

对象和数组默认输出 JSON；支持 `{{json material}}`、`{{player.name}}`、`{{material.cards.0.profile}}` 等点路径。变量必须由当前阶段提供，不存在的字段会在请求前报错；不执行表达式、循环或动态代码。注入内容中的双花括号保持原文，不做二次插值。变量列表不是授权扩展，不能访问凭证、任意存储或其他上下文。检测器仅提供 `{{responseText}}` 与 `{{retry}}`；格式重试说明也通过变量渲染，不在 Prompt 外追加。修改 Prompt 不改变 ID 引用、人物不变量和程序输出协议校验。

`material` 按角色区分：Router 为 `player_id/cards`；Character Designer 为 `requests/existing_cards`；Outline Designer 为 `cards`（包含初始记忆与状态历史）；Narrator 为 `performances/updated_cards`，不额外提供 thought 或 end_state。预览与真实调用共用同一渲染器；样本 JSON 只是测试数据，模型测试必须使用当前组的明确绑定，不临时猜选模型。

示例：“把 Narrator 的 Prompt 改为先列出 <input>{{input}}</input>，再用 <actions>{{material.performances}}</actions> 包裹动作材料”；“只把配角数据从 JSON 外围标题改成 XML 标签，其余 Prompt 保留”。

旧记录没有 `prompt` 时，读取时显式投影旧有效行为文本和默认材料模板，不自动落盘或丢弃 messages、未知字段。保存 Prompt 后以它为准。旧 `save_agent` 和 messages JSON Patch 仍能修改提示词：仅在本批没有同时修改 prompt 时，将变更后的旧消息转换成 prompt；优先使用 `/agents/<id>/prompt` 对应的资源内路径 `/<id>/prompt`。旧无效角色消息留作归档，不作为编辑设置。
世界配置只有 `description` 进入游戏请求；世界名称、概要、图片，以及故事标题、简介都不作为定义发送。完整描述在生成环节共用，不再有独立的后台世界秘密通道。人物仍应保持自己的知识边界。角色、玩家、历史和当前输入正常提供。

运行流程为 `text_router → text_outline_designer → text_storyteller`；Router 仅解释需求、选择人物和提出创建/重做需求，不安排节奏或方向。没有人物交互时直接交 Narrator。创建或重新生成人物卡时先按需调用 `text_character_designer`。Outline Designer 负责人物思维、表达概要、动作和 end_state；Narrator 扩写完整对白，不新增持久后果。玩家不是可由路由选择的 NPC。动态创建人物时沿用人物文档验证与原子存档提交，且不会写入公共角色库。memory 文档是初始记忆与背景；Outline Designer 的 thought、expression_outline、end_state 和历史锚点是只读运行记录。

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

### Designer 拆分与重新生成人物

- 新角色 `text_character_designer` / `text_outline_designer` 的提示词和独立 Backend/模型绑定沿用 `agents` / `agentGroups` 资源的 schema、校验和局部 JSON Patch 读写、保存与界面同步。例如修改 `/text_outline_designer/messages/0/content`。
- 游戏输入支持“重新生成艾琳的人物设定，保留经历”以及“重新生成艾琳和守卫的人物卡”。Router 通过 `regenerate_characters: [{character_id, description}]` 指定一位或多位已有角色；玩家卡也可重做，但玩家不可成为代演的 NPC。未知/重复 ID、遗漏卡片、非法状态均拒绝。只要求重做人物反应时交 Outline Designer，不重建卡片。
- 重做保留 ID、文档未知元数据、其他人物和历史，以当前卡片覆盖冲突的旧状态。变更只进入本轮候选存档，取消、失败或保存冲突均不部分提交；不修改公共角色库。模型遵守语义意图仍需真实模型评测，程序仅校验结构和引用。
- 原 `text_designer` 已退役：初始化先将其 Backend、模型与参数迁移到缺少的新角色绑定，保留已有新绑定，再删除旧定义及各组旧绑定。自定义组不会因为只有旧 Designer 绑定而被删除。旧提示词不会自动复制为两套不同职责提示词；旧 ID 的助手动作明确报资源不存在，请改用 `text_character_designer` 或 `text_outline_designer`。旧历史 `expression` 继续显示；新输出使用 `expression_outline`，仍兼容 routed-v2 存档。独立助手偏好键不变。

## 仓库默认配置编辑

开发服务（`npm run dev`）的 Agents、Agent 编辑器与 Agent 组页面提供「编辑目标：本机配置 / 仓库默认」。正式安装版和 `npm run preview` 不提供仓库写入接口。

- 本机模式延续现有存储与自动保存行为。仓库模式复用表单并保留草稿；Agent 表单先点击「更新 Agent 草稿」，组字段、复制和删除直接更新草稿，再点击「保存仓库修改」统一落盘。切回本机不会应用或丢弃已记录的仓库草稿；重新载入会丢弃草稿。
- 唯一默认数据源是 `src/db/repositoryDefaults.json`（`agents` 和 `groups` 均以 ID 为键），初始化、运行时默认导出和打包读取同一文件。已有本机自定义值继续保留；修改仓库不自动覆盖本机。开发保存不触发页面重载，避免打断未保存的游戏进度。
- 「应用到本机」要求仓库已保存且没有正在生成的回合；逐项更新同 ID 的 Agent 与组，保留未来字段、本机其他 Agent/组、Backend 凭证、助手偏好、当前组选择、历史与存档草稿。本机必须已有所引用的 Backend。发生失败会显示已完成项数并停止，不声称整批事务回滚。
- 仓库组只引用项目默认的 `backend_openrouter` / `backend_local`，模型 ID 可以自由填写。必须保留五个运行时核心 Agent 和 `group_fast` / `group_quality` / `group_local`；退役 ID 不可重新注册。禁止凭证字段、认证头和非法/重复绑定；未知非凭证字段保留。
- 开发接口只读写上述固定文件，检查本机 Host、同源请求及专用请求头，并用文件内容版本拒绝过期保存。临时文件放在 `.tmp/repository-config/`。仓库冲突需要重新载入后编辑；成功回执返回后才同步已保存版本。

助手资源 `repositoryDefaults` 包含只读的 `available`、`revision` 和可写的 `data.agents` / `data.groups`。`available=false` 表示未连接仓库开发接口，不能修改；界面存在未保存的 Agent 表单或仓库草稿时拒绝助手保存，以免覆盖用户工作。Agent 与组可以在同一资源的 JSON Patch 中一起更新并校验引用。示例：

```json
{"type":"patch_config","resource":"repositoryDefaults","patches":[{"op":"replace","path":"/data/groups/group_fast/bindings/0/model","value":"example/model"}]}
```

这只保存仓库默认，不应用到本机。助手若被明确要求修改本机，继续使用原 `agents` / `groups` 资源；旧 `save_agent` / `save_group` 动作和助手 Backend/模型偏好键含义不变。

定向回归：`node --disallow-code-generation-from-strings --import tsx --test tests/repository_configuration.test.ts`。测试使用 `.tmp/` 隔离文件及本机存储替身，覆盖实际开发 HTTP/文件落盘、局部 Patch、未知字段、非法引用/凭证、取消、冲突、失败回执与显式应用；不证明 Tauri 原生存储或真实模型行为。

## 文本组合配置

`workflows` 是已注册的独立助手资源，集合按流程 ID 索引。页面入口为“文本组合”。支持创建、局部修改、删除流程；配置操作不会运行模型。用户在页面选择模型组独立运行时，只展示最终文本；游戏选择通过 library.storyWorkflowId 配置，游戏回合保留原子存档提交。

例如：`{"type":"patch_config","resource":"workflows","patches":[{"op":"add","path":"/writing","value":{"id":"writing","name":"写作","steps":[{"id":"draft","agentId":"my_writer","inputs":{"input":{"from":"input"}}},{"id":"polish","agentId":"my_writer","inputs":{"input":{"from":"step","stepId":"draft","pointer":""}}}],"output":{"from":"step","stepId":"polish","pointer":""}}}]}`。`my_writer` 必须已在 agents 注册，并在运行时所选模型组配置绑定；可先创建 prompt 为 `{{input}}` 的自定义 Agent。

步骤按列表顺序执行，最多 32 步，允许同一个 Agent 多次出现，也允许一步读取多个先前结果。引用只允许原始输入或先前步骤；JSON Pointer 空字符串指完整结果，`/text` 指 text 字段。禁止前向引用、循环、重复步骤 ID、原型路径和动态代码。输入遵守 Agent inputs 的基础 JSON 类型，输出遵守 outputSchema，最终结果必须是非空字符串。运行中遇到失败或取消立即停止，不展示中间结果。定义和模型绑定在运行开始时取快照；模型凭证仅由既有安全接口读取，不作为输入。

流程以配置库中的可选 workflows 字段原子保存，但助手须使用独立 workflows 资源，不得经 library 重复编辑。缺失字段视为空集合，保留未来未知字段和旧 Agent/模型偏好。保存带 revision 冲突检查，页面未保存草稿遇到外部更新不会被覆盖，需重新载入再保存。助手执行仍使用统一取消、冲突与失败回执。游戏与独立文本运行现在统一使用 runWorkflow。默认故事组合通过 storyStage 提供 route/cards/outlines/narration 四个有序领域阶段，保留按需人物创建、角色校验和原子提交。普通步骤可穿插；context 来源可读取游戏提供的 world、characters、player、history、input，独立运行没有这些材料。library.storyWorkflowId 选择游戏组合，null/缺失使用默认组合。与 workflows 同批修改时一次原子保存，非法选择拒绝。旧 GamePipeline 与 TextProcessor 已移除，旧回合标记保留，新回合记录 workflow-v1。没有并行、循环或动态代码。
