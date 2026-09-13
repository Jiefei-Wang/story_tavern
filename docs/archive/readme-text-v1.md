# Story Tavern

用自然语言参与故事，让人物依据自己实际获得的信息理解与回应。新游戏默认使用文本世界：玩家已陈述的普通自身行动默认发生；意愿、尝试、发言与事实保持区别。旁白负责表达，代码负责权限、顺序、隔离与可靠保存。

项目继续使用 Tauri 2、React、TypeScript、Rust、SQLite 与现有 OpenAI-compatible Backend。Backend 凭证仍经既有安全接口管理。

## 运行

```sh
npm ci
npm run dev            # 浏览器预览
npm run tauri dev      # Windows 桌面
```

在 Backend 页面配置服务，在 Agent 组绑定 `text_organizer`、`text_character`、`text_editor`、`text_narrator` 的模型。升级时只添加缺失模板，并分别继承现有 input_compiler、npc_reaction、admin_patch、narrator 绑定，不覆盖自定义提示词或已有新绑定。无法继承的绑定会明确报错，需在组页面补齐。

新游戏使用真实模型。Mock 开关仅保留旧存档演示兼容，文本流程不会回退 Mock 或其他模型。人物模式可在世界/人物文档页面切换为三轮（认知、言语、动作）或两轮（认知、言行）。这些模式改变调用成本，不自动选择。

所选 Backend/模型需要支持 OpenAI-compatible `json_object`（Organizer）与 function calling（文档编辑器）。工具调用使用原生 `tool_calls` / `tool_call_id` 消息；不支持时明确失败，不把正文 JSON 当作生产环境的替代工具协议。

## 输入

```text
[admin]
在我的行动之前，把门外的光照改为黑暗。
[/admin]
我推门走进去，说：“有人在吗？”
[narrator]
用克制、简短的文风。
[/narrator]
```

起止标记独占一行。代码先识别授权块及位置，Organizer 只能安排这些 ID。显式“行动之前/之后”优先，否则玩家言行之前的 admin 前置，其余后置；中间的 admin 不能拆开玩家言行单位。整条 `admin:` / `管理员:` 输入继续兼容。

字面量用 `\[admin]`、`\[/admin]` 转义，或放入 fenced code block、Markdown 引用行或引号中。普通对白中提到 admin 不授权。narrator 指令只作用于当前请求，单独输入时重新呈现最近正文，不重演事件。

## 文档、保存与迁移

世界、场景、人物设定及记忆使用 Markdown。世界/人物页面可以直接编辑，状态检查页面展示文件前后差异。AI 助手在“历史”下方，有独立 Backend/模型，并通过 `textSaves` 资源编辑相同文档，不能访问凭证、其他目录或回合日志。

桌面文件位于 `%APPDATA%/story_tavern/text-saves/<save-id>/generation_<revision>_<unique>/`。每轮在工作副本上修改，全部完成后写新一代文件、flush，再原子更新 SQLite 中的版本指针。读档按指针读取文本，未引用的中断版本不成为正式状态。不会自动删除旧版本。浏览器预览使用同一文档接口的 LocalStorage 实现和 Web Locks，不声称桌面落盘；Node 离线测试用独立内存存储。

旧存档仍可打开；游戏页提供“迁移为文本故事”。显式迁移保留 `legacyBackup`、历史回合、原人物名字、关系与自定义材料，重复迁移不重复生成。备份只用于恢复/审计，不进入新运行时。迁移不清除 Backend、凭证、旧 Agent 或其他存档。文档页面可以将旧备份恢复为独立存档，保留当前文本进度。恢复说明见 [文本架构](ARCHITECTURE.md)。

文本回合总是整体保存；流式正文在提交前显示“草稿，尚未提交”。模型失败、编辑冲突或保存失败不会追加成功回合。文本版本暂不支持旧版的历史 variation 回放，旧存档仍保留此功能；需要比较新回应请使用独立测试存档。

示例文本世界位于 [examples/text-first](examples/text-first/manifest.json)，寻址清单与 Markdown 分开保存，内容与新建游戏的港口场景一致。该目录用于说明文档布局；实际存档由应用创建和提交。

## 验证

```sh
npm run typecheck
npm test
npm run check:csp
npm run check:rust
npm run build
npm run eval:text-first
npm run build:exe
```

真实评估复用已有桌面数据库的配置（只读），选择最近存档绑定组；也可传 `--config=<不含凭证的配置文件>`、`--group=<已有组ID>`。Node 入口只使用既有环境凭证，不读取自定义 OS Keyring；缺少凭证或服务时明确报告未运行。默认最多18回合/500调用，每回合最多100调用/10分钟，支持 `--turns=10 --calls=400 --mode=combined --output=...`。报告包含模型、耗时、tokens、实际 Trace、受限感知、人物概要、正文、后续状态及人工评价标准。代码通过与模型语义效果分开报告，不用 Mock 冒充真实试玩。

最新实施与验证记录见 [验收报告](docs/text-first-validation.md)。原七阶段说明已归档在 [旧架构](docs/archive/ARCHITECTURE-legacy.md)，仅用于理解迁移前的实现。

续跑用 `--resume=原输出目录/test-save.json`，默认保留该测试存档的 Agent 组，并检查与原报告的绑定是否一致。不要把不同模型的报告合并为同模型对比。每次评估记录实际绑定、参数差异与运行时源文件摘要。

## Windows 交付约定

每次代码修复后重新执行 `npm run build:exe`，交付 `src-tauri/target/release/story_tavern.exe`，核对修改时间与大小。若用户正运行的 EXE 无法覆盖，不终止用户进程，不改名旧程序；在独立 Cargo target 构建后，将新 EXE 以新名称放入 release 目录。只有明确要求仅改文档时才不重新打包。
