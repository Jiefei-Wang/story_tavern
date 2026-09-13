# Story Tavern (AI 纯文字角色扮演游戏引擎)

Story Tavern 是一个基于 **Tauri 2 + React + TypeScript + Rust** 构建的 Windows 桌面端 AI 驱动纯文字角色扮演游戏引擎原型。

这个软件的目标是做一个以世界状态和因果模拟为核心，而不是以聊天为核心的 AI 文字角色扮演引擎：玩家用自然语言行动，系统把输入拆成事件，让每个角色基于自己真正能感知到的信息独立反应，再由统一的世界结算器决定什么实际发生，最后由旁白只根据已提交的公开事实生成故事。

同时，整个 AI 流程必须高度可配置、可替换、可调试：用户可以为不同 Agent 选择不同 Backend/模型、编辑提示词并切换整套 Agent Group，而开发者能够完整看到每一步的输入、输出、状态变化、并行关系和错误来源。

---

## 1. 核心技术栈

* **桌面容器**: Tauri 2
* **前端框架**: React 19 + TypeScript + Vite + Tailwind CSS
* **页面路由**: React Router v7
* **状态管理**: Zustand
* **模式校验**: Zod
* **拓扑与调试可视化**: React Flow (`@xyflow/react`)
* **世界补丁协议**: RFC 6902 JSON Patch (`fast-json-patch`)
* **本地数据库**: SQLite (`rusqlite` bundled MSVC)
* **Native 安全层与网络**: Rust `reqwest` + OS Keyring (Windows Credential Manager / DPAPI)

---

## 2. 目录结构

```text
story_tavern/
├── src-tauri/                     # Tauri 2 Native Rust Core
│   ├── Cargo.toml                 # reqwest, rusqlite, keyring, tokio, tauri 2
│   ├── tauri.conf.json            # 窗口大小、标题与桌面权限配置
│   ├── build.rs
│   └── src/
│       ├── main.rs                # Windows subsystem 入口
│       ├── lib.rs                 # Tauri 插件、数据库初始化与命令注册
│       ├── db/
│       │   └── mod.rs             # SQLite 数据库表初始化 (backends, agents, saves, traces 等)
│       └── commands/
│           ├── mod.rs
│           ├── backend.rs         # test_connection, list_models, chat_completion
│           ├── db.rs              # SQLite 键值与查询接口
│           └── secret.rs          # Windows Credential Manager 安全密钥存取
├── src/                           # React + TypeScript Frontend
│   ├── app/
│   │   ├── App.tsx                # 应用启动、数据库加载与根组件
│   │   ├── routes.tsx             # 路由配置
│   │   └── globals.css            # Tailwind CSS 与轻量现代工具样式
│   ├── components/
│   │   ├── Layout/                # TopBar, Sidebar, Layout 布局框架
│   │   └── Common/                # JsonViewer (折叠树与复制)
│   ├── db/
│   │   ├── initialData.ts         # 7 个内置 Agent、初始 Backend、Group 与港口酒馆存档
│   │   └── storage.ts             # SQLite / LocalStorage 适配与安全 Secret 初始化
│   ├── engine/
│   │   ├── pipeline/
│   │   │   └── GamePipeline.ts    # 协调 Input Compiler → Perception → Promise.all(NPCs) → Resolver → Narrator
│   │   ├── runtime/
│   │   │   ├── AgentRuntime.ts    # 统一模型执行入口，提示词解析、并发控制、Trace 记录
│   │   │   └── MockSimulator.ts   # 零依赖确定性 Mock 仿真模拟器
│   │   ├── scheduling/
│   │   │   ├── ConcurrencyLimiter.ts # 单 Backend maxConcurrency 限流队列
│   │   │   └── TemporalScheduler.ts  # TemporalBlock 与 NPC Reaction Time Budget 计算
│   │   ├── template/
│   │   │   └── PlaceholderEngine.ts  # {{path}}, {{json path}}, {{text path}} 占位符引擎
│   │   ├── tracing/
│   │   │   └── TraceManager.ts    # 层次化 TraceSpan 与 TurnTrace 全生命周期管理
│   │   └── world/
│   │       ├── PatchEngine.ts     # RFC 6902 JSON Patch 校验与不可变状态应用
│   │       └── WorldState.ts      # 港口酒馆世界状态初始原型
│   ├── pages/
│   │   ├── Home/                  # 首页：欢迎、继续游戏、开始 Demo、新建游戏、最近存档
│   │   ├── Play/                  # 游戏主页：小说正文、对话框、右侧角色场景栏、意图快捷 Chips
│   │   ├── Backends/              # Backend 管理：连接测试、拉取模型、API Key 掩码
│   │   ├── Agents/                # Agent 列表与多标签编辑器 (提示词/变量插入/Live Preview)
│   │   ├── AgentGroups/           # Agent Group 列表、切换与 Agent→Model 绑定表格
│   │   ├── Debug/                 # React Flow 拓扑图、并发分支、Gantt 时序与节点抽屉
│   │   ├── StateInspector/        # 世界状态树、上一步 Patch Diff、全生命周期补丁历史
│   │   ├── History/               # 回合历史列表、详细正文与“Open Trace”跳转
│   │   ├── Characters/            # 场景角色有限心智、目标与记忆卡片
│   │   ├── World/                 # 场景气候、光照、时钟与法则设定
│   │   └── Settings/              # Mock 模式开关、开发者模式、语言、主题与数据目录
│   ├── stores/                    # Zustand 全局 Store (Game, Backend, Agent, Group, Trace, Settings)
│   └── types/                     # TypeScript 类型定义
├── tests/
│   └── test_suite.ts              # 覆盖模板引擎、补丁应用、限流器与管道的自动化测试套件
├── package.json
├── vite.config.ts
├── tailwind.config.js
├── ARCHITECTURE.md                # 架构设计与实体关系说明
└── README.md
```

---

## 3. 已实现功能与特性

1. **统一 OpenAI 兼容后端管理 (Backends)**:
   - 支持配置 Base URL、认证方式 (Bearer / None)、自定义 Headers、超时时间、最大并发数 (`maxConcurrency`)。
   - API Key **不存明文 SQLite**，直接写入 Windows Credential Manager / DPAPI 安全存储。
   - 一键“测试连接”（调用 `/v1/models`，计算响应毫秒数，显示绿灯/红灯与错误详情，绝不崩溃）。
   - 一键刷新并缓存可用模型列表，支持手动追加自定义 Model ID。

2. **Agent 即 Prompt Template**:
   - 严格落实“Agent 本身即 Prompt Template”理念，无需多余实体。
   - 包含 System、User、Assistant 消息时序卡片（支持增删、上下移动、复制）。
   - 右侧“可用变量”抽屉，点击任意变量即自动插入到当前光标消息中。
   - 内置输出 JSON Schema 校验与语法检查。
   - 提供 Live Preview：输入 Sample Context JSON，实时渲染已注入变量的消息与一键测试模型调用。

3. **内置 7 大系统 Agent**:
   - `input_compiler`: 拆解玩家自然语言为动作、对白、等待、快进、管理员指令等多意图 TemporalBlock。
   - `perception`: 有限视角感知判定，输出各 NPC 分别 saw / heard 哪些事件。
   - `npc_reaction`: 单 NPC 有限心智与记忆推演，在 `reaction.available_time` 预算内生成动作与言语意图。
   - `world_resolver`: 世界仲裁结算，唯一合法修改世界的手段，输出 RFC 6902 JSON Patch。
   - `time_skip`: 推演时间跨越后的环境与时钟演变。
   - `admin_patch`: 将管理员法则指令精准翻译为局部 JSON Patch（严禁重写世界）。
   - `narrator`: 仅根据公开事实与已生效 Patch 生成沉浸式小说正文（无 "Narrator:" 前缀）。

4. **Agent Group 一键切换运行时**:
   - 定义一整套 Agent → Backend + Model 的映射绑定。
   - 内置 `Quality`（高质量组合）、`Fast`（快速低成本）、`Local`（本地全离线）、`Experimental` 等组。
   - 支持独立参数覆盖（Temperature, Max Tokens, Top P, Extra Body）。
   - 顶部或 Group 页面一键激活，整个游戏引擎立即切换一整套模型路由。

5. **确定性 Mock LLM 模式 (零配置开箱体验)**:
   - 设置中一键开启 Mock 模式，首页点击“开始 Demo (免配置)”即刻体验。
   - 无需配置任何 API Key，7 个 Agent 均提供真实且确定性的推演数据、状态补丁与旁白小说正文。
   - 拓扑调试图、时序图、状态差分器全功能可用。

6. **全链路 Trace 与 React Flow 拓扑可视化调试器**:
   - 每次玩家发送动作生成唯一 `traceId`，每个 Agent 产生层级化 `TraceSpan`。
   - React Flow 拓扑图：清晰显示 Input Compiler → Perception → 并行 NPC Reaction 分支 → World Resolver → Narrator。
   - 节点颜色区分状态（灰色 Pending、蓝色 Running、绿色 Success、红色 Error），显示 Latency 与 Token 消耗。
   - 节点 Inspector 抽屉：可查看概览、输入 Context、注入前后 Messages、原始响应、解析 JSON 与状态 Diff。
   - 并发 Gantt 时序图：直观查看 NPC 之间及各 Agent 步骤的并行与先后耗时。

7. **RFC 6902 JSON Patch 状态审计**:
   - State Inspector 呈现当前世界状态树。
   - “最近变更”直观以红色/绿色 Badge 显示上一步被替换或添加的 JSON Pointer 路径与新值。
   - “Patch 历史流”记录全生命周期的原子化变更。

8. **多意图自然语言与时序预算 (Reaction Time Budget)**:
   - 输入框支持 Auto 混合模式，也可选择动作、对白、快进、管理员快捷意图。
   - 自动估计事件耗时，为 NPC 分配可用反应时间预算（`reaction.available_time`），超出预算时 World Resolver 仲裁拒绝。

---

## 4. 本地开发与启动

### 环境准备
* Node.js >= 18 (已在 Node v25.6.0 验证)
* Rust toolchain (已在 rustc 1.97.1 MSVC x86_64 验证)

### 安装依赖
```bash
npm install
```

### 运行自动化测试套件
```bash
npx tsx tests/test_suite.ts
```

### 启动本地开发模式
```bash
npm run tauri dev
```
或仅在浏览器预览前端 UI：
```bash
npm run dev
```

---

## 5. Windows 生产打包构建

### 每次修复后的必做交付

每次完成修复后，都必须重新构建 Windows release EXE，不能只运行测试或前端构建：

```bash
npm run build:exe
```

交付的可执行文件必须位于 `src-tauri\target\release`。通常直接更新 `story_tavern.exe`，不需要额外生成带时间戳的副本。“占用时换名”仅指当前 EXE 正在被打开或运行，导致无法覆盖更新：此时保留正在使用的旧程序，不强制结束进程、不改名旧程序，将新构建的 EXE 使用新名称交付（例如 `story_tavern-20260912-001500.exe`）。如果默认输出路径被锁定，可在独立 Cargo target 目录构建，再将新 EXE 复制到 release 目录下的新名称。

用户明确要求仅修改文档且不重新生成时，遵循该要求，不触发 EXE 构建。

构建完成后，检查实际输出文件的修改时间和大小，并在回复中给出本次 EXE 的准确路径。

### 生成 Windows 原生 EXE / 安装包
```bash
npm run tauri build
```
若只需独立无打包 EXE 二进制：
```bash
npx tauri build --no-bundle
```

### 可执行程序输出路径
构建成功后，EXE 二进制生成于：
```text
src-tauri\target\release\story_tavern.exe
```
安装程序（MSI / NSIS 安装包）生成于：
```text
src-tauri\target\release\bundle\
```

---

## 6. 数据库与本地持久化位置

SQLite 数据库文件自动保存在 Windows 当前用户的 AppData 漫游目录中：
```text
%APPDATA%\story_tavern\story_tavern.db
```
（例如 `C:\Users\<用户名>\AppData\Roaming\story_tavern\story_tavern.db`）。
包含数据表：`backends`, `agents`, `agent_groups`, `saves`, `traces`, `settings`。

---

## 7. 快速操作指南

### 如何配置第一个 Backend
1. 点击左侧导航栏 **AI 配置 → Backends**。
2. 系统已内置 **OpenRouter**，已自动绑定 `.env` 中的测试 Key。
3. 点击行内“测试”或“编辑”，输入 Base URL（例如 `https://openrouter.ai/api/v1`）与 API Key，点击“测试连接”。
4. 绿色显示“在线”并提示获取到模型数量后，点击“刷新”即可同步所有可用模型。

### 如何创建 / 编辑 Agent
1. 点击左侧导航栏 **AI 配置 → Agents**。
2. 可查看预置的 7 个系统 Agent（如 `npc_reaction`, `world_resolver`）。
3. 点击任意 Agent 的“编辑”进入多标签编辑器：
   - 在“提示词 (Messages)”中添加或修改 System / User / Assistant 消息。
   - 点击右侧“可用变量”直接插入 `{{json npc}}` 或 `{{player.input}}`。
   - 在“测试运行 / 预览”中输入 Sample Context，点击“渲染预览”即时检查替换结果。

### 如何创建 / 切换 Agent Group
1. 点击左侧导航栏 **AI 配置 → Agent 组**。
2. 点击“新建组”或从现有组“复制”。
3. 在绑列表格中，为每一个 Agent 选择对应的 Backend 与 Model（支持直接下拉选择缓存的模型，或手动填写 Model ID，如 `nvidia/nemotron-3-super-120b-a12b:free`）。
4. 点击“启用为此运行时配置 (Activate)”，后续所有游戏回合将立即调用该配置。

### 如何运行 Mock 演示
1. 在“首页”点击 **开始 Demo (免配置)**，系统将自动开启 Mock 模式并载入港口酒馆世界。
2. 在底部输入框输入：
   ```text
   我走到艾琳旁边，对她说“今晚离开这里。”
   ```
3. 点击“发送”。
4. 观察主屏生成的小说正文与艾琳、卫兵的情绪与物理状态变更。
5. 点击右上角“查看 Trace”即可进入 **React Flow Agent Graph** 查看各步骤拓扑与数据快照。

---

## 8. 构建警告说明 (Build Warnings)

在运行 `npm run build` 前端打包时，Vite 输出以下常规提示：
* `Some chunks are larger than 500 kB after minification`：React Flow (`@xyflow/react`) 和全套图标库合并在主 bundle 中，体积为 ~660 kB (gzip ~201 kB)，在桌面应用环境下本地秒级加载，完全符合桌面应用性能标准。

---

## 9. 尚未实现的功能清单 (第一版 MVP 范围明确界限)

按用户需求设计范围，第一版 MVP 保持精简与高稳定性，以下功能留待后续版本演进：
* 战斗属性数值与骰子碰撞系统
* 地图 A* 路径物理碰撞与网格寻路
* 动态经济与商贩货币交易系统
* 语音 TTS 合成与 AI 肖像生图
* 多人联机协同世界与云存档同步
* RAG 向量数据库与 Embedding 长期记忆检索
* 跨平台移动端 (Android / iOS) 打包
