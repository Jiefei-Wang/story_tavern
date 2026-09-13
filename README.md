# Story Tavern

基于 React、TypeScript 和 Tauri 的 AI 故事游戏。游戏与独立文本任务使用同一个组合执行器，可以复用 Agent、串联结果并选择最终输出。

## 运行

安装依赖后运行 npm run dev；桌面开发运行 npm run tauri dev。

在 Backend 页面配置 OpenAI-compatible 服务，在 Agent 组中绑定模型。在“文本组合”页面创建组合，或复制默认故事组合后修改。选择“游戏使用的组合”并保存，从下一回合生效；未选择时使用默认故事组合。

默认故事组合包含路由、按需人物卡生成、按需交互设计和正文生成。人物创建、引用检查、历史锚点与原子保存由游戏适配器管理；所有模型调用统一由 runWorkflow 调度。独立文本运行只展示最终文本，不修改存档。

每次调用使用独立步骤 ID，同一个 Agent 可以多次出现。JSON Pointer 可选择上一步结果字段。游戏中的普通步骤可显式读取 context 的 world、characters、player、history；独立运行不自动提供游戏材料。无循环、动态代码或并行调度。

## 存储与兼容

浏览器开发版和构建预览会启动本地 Rust 服务，因此需要 Rust/Cargo。正式数据位于 %APPDATA%/story_tavern，浏览器与桌面共享 SQLite 和 Markdown 存档。凭证由既有 Windows 凭证管理器或项目环境配置读取，不打入浏览器包。

旧执行器已移除。已有文本故事默认使用新组合继续，历史和未知字段保留；无 textWorld 的旧存档可只读查看并显式迁移，初始化不删除它。旧状态分支重放已退役，不会把历史重新执行为新世界。正文、人物卡与状态按 revision 一次提交，失败或取消不留下半轮数据。

AI 助手位于“历史”下方，可编辑组合、故事选择及已注册配置；Backend/模型保持独立。组合 JSON 示例见 [助手能力](docs/ai-assistant.md)，设计见 [架构说明](ARCHITECTURE.md)。

## 验证与构建

- npm run typecheck：类型检查。
- npm run check:csp：禁止动态代码生成的回归测试。
- npm run check:rust：原生存储测试。
- npm run build：前端构建。
- npm run build:exe：正式可执行文件构建。

真实游戏组合评测：npm run eval:workflow -- --group=group_fast --calls=20 --output=.tmp/workflow-eval。它会调用真实模型，只读现有连接配置，使用隔离测试存档；场景与调用预算请按任务限制。普通回归使用 mock/stub，不默认启动游戏窗口。

测试共享存储时设置独立 STORY_TAVERN_TEST_DIR，不要指向正式存档。正式使用不设置该变量。
