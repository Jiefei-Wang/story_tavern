# Story Tavern 系统架构设计与核心概念

本文档详细说明 **Story Tavern** AI 纯文字角色扮演游戏引擎的核心实体与管道架构，重点阐述各个模块之间的依赖关系、数据流转与设计意图。

---

## 一、核心实体与分层架构

```text
┌─────────────────────────────────────────────────────────────┐
│                       UI / Presentation                     │
│  Play Screen   React Flow Debugger   Inspector   Editor    │
└──────────────────────────────┬──────────────────────────────┘
                               │ User Action / Prompt
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                         Game Pipeline                       │
│  TemporalBlock ──► Perception ──► NPC Reactions ──► Resolver│
└──────────────────────────────┬──────────────────────────────┘
                               │ runAgent({ agentId, context })
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                         Agent Runtime                       │
│  PlaceholderEngine ──► ConcurrencyLimiter ──► TraceManager   │
└──────────────────────────────┬──────────────────────────────┘
                               │
               ┌───────────────┴───────────────┐
               ▼                               ▼
       [ Mock Simulator ]             [ Agent Group Binding ]
       Deterministic Demo                      │
                                       Backend + Model
                                               │
                                               ▼
                                      [ Rust Native Layer ]
                                      reqwest HTTP + Keyring
```

---

## 二、关键概念关系与职责界定

### 1. Backend (模型调用宿主)
* **核心职责**: 只回答“模型从哪里调用”。
* **定义**: 表示一个兼容 OpenAI Chat Completions API 的服务（如 OpenRouter、本地 Ollama/vLLM/NInfer、官方 OpenAI 等）。
* **关键属性**: `baseUrl`, `authType`, `secretRef`, `timeoutMs`, `maxConcurrency`。
* **安全性**: API Key 绝不以明文存入 SQLite，仅在 Rust 端经由 OS Credential Manager / Keyring 存取。React 前端仅持有 `secretRef` 唯一标识。

---

### 2. Agent = Prompt Template (智能体即提示词模板)
* **核心理念**: **Agent 本身就是 Prompt Template**，系统内不存在多余的模板实体。
* **定义**:
  $$\text{Agent} = \text{名字} + \text{描述} + \text{Messages (System/User/Assistant)} + \text{输入变量定义} + \text{输出 Schema} + \text{默认生成参数}$$
* **设计原则**: Agent **不绑定** 具体的 Backend 或 Model，从而保证提示词逻辑与具体运行硬件/供应商解耦。

---

### 3. Agent Group (智能体绑定群组)
* **核心职责**: 回答“在当前方案下，各个 Agent 分别由哪个 Backend 的哪款 Model 提供计算”。
* **定义**: 一整套 `AgentBinding[]` 的集合：
  ```text
  Quality Group:
    input_compiler ──► OpenRouter / nvidia/nemotron-3-super-120b-a12b:free
    perception     ──► OpenRouter / nvidia/nemotron-3-super-120b-a12b:free
    npc_reaction   ──► OpenRouter / nvidia/nemotron-3-super-120b-a12b:free
    world_resolver ──► OpenRouter / nvidia/nemotron-3-super-120b-a12b:free
    narrator       ──► OpenRouter / nvidia/nemotron-3-super-120b-a12b:free
  ```
* **一键切换**: 游戏引擎所有业务逻辑均不直接硬编码模型，用户在 TopBar 切换 Agent Group 后，下一回合的整套路由配置立即生效。

---

### 4. Agent Runtime (统一执行运行时)
* **核心职责**: 游戏引擎中**唯一合法调用大模型**的执行门户。禁止任何业务组件跳过 Runtime 直接发起 HTTP 请求。
* **调用接口**:
  ```ts
  agentRuntime.runAgent({
    agentId: "npc_reaction",
    groupId: activeGroupId,
    context: { npc, observations, scene, reaction }
  })
  ```
* **内部处理流水线**:
  1. 读取 Agent Definition。
  2. 读取当前活跃 Agent Group，解析对应的 Backend 和 Model。
  3. 合并 Agent 默认参数与 Group Overrides（Temperature、Max Tokens 等）。
  4. 调用 `PlaceholderEngine` 注入变量上下文，生成 concrete OpenAI messages。
  5. 经由 `ConcurrencyLimiter` 依照 Backend 的 `maxConcurrency` 进行排队控制。
  6. 通过 Tauri Rust native 层的 `reqwest` 发起网络调用（或在 Mock Mode 下交由 `MockSimulator` 处理）。
  7. 解析返回结果，执行 Zod / JSON Schema 校验。
  8. 创建并更新层级化的 `TraceSpan`，记录耗时、原始报文与 Token。
  9. 返回结构化数据。

---

### 5. Game Pipeline (游戏推演主管道)
* **核心职责**: 将玩家的单次回合自然语言输入转化为具有因果顺序、有限视角和物理合法性的世界状态变化与小说旁白。
* **执行步骤**:
  1. **初始化 Trace**: 为当前回合生成全局唯一的 `traceId`。
  2. **Input Compiler**: 将玩家输入拆解为一个或多个 `TemporalBlock`。
  3. **时序块分支结算**:
     - 若为 `admin` 块：调用 `admin_patch` 产生局部法则补丁。
     - 若为 `time_skip` 块：调用 `time_skip` 推演环境演变与时间流逝。
     - 若为 `normal` 块：
       - 调用 `perception` 获取各 NPC 的有限观察。
       - 计算可用反应预算（`reaction.available_time`）。
       - 筛选受影响的 NPC，使用 `Promise.all()` 并行触发各自独立的 `npc_reaction`。
       - 将事件与 NPC 意图汇总提交给 `world_resolver` 仲裁，生成 RFC 6902 JSON Patch。
       - 将 Patch 不可变地应用至当前世界状态快照。
  4. **Narrator**: 仅基于本轮已提交的物理事实、已生效的 World Patch 与公开言行，生成沉浸式正文。

---

### 6. Temporal Block 与 Reaction Time Budget (时序块与反应预算)
* **TemporalBlock**: 游戏的核心时序单位，而非传统回合制单纯的 Turn Action。一个 Block 内部允许并行物理事件（如玩家一边走向窗台，一边对艾琳低语）。
* **Reaction Time Budget (`reaction.available_time`)**:
  - 系统根据事件动作类型（走动、短语、长对白、等待响应）动态计算时间预算。
  - NPC 在推演自身心智时必须遵守此预算：在 1.5 秒的瞬间，NPC 无法进行长篇回忆或连续十个肢体动作。
  - 若玩家最后动作声明了“等待回应”，则系统激活 `responseWindow = true`，为 NPC 开放充裕的反应时长。

---

### 7. Perception (有限视角感知判定)
* **职责**: 隔离世界的上帝全知视角。
* **规则**:
  - 判断某事件对特定 NPC 是否 `saw: boolean`、`heard: boolean`。
  - 处在不同房间或距离过远的 NPC 不会无端获得外界信息。
  - 每个 NPC 只能在其后续的 `npc_reaction` 中收到自身确实感知到的有限事实。

---

### 8. NPC Reaction (有限心智与意图)
* **职责**: 单个 NPC 依据自身的有限记忆、目标、当前情绪与刚刚被感知的信息，独立决定内心独白 (`thought`)、心智变化 (`mentalUpdates`) 以及预谋动作与对白 (`intents`)。
* **容错性**: 合法输出完全允许 `{ thought: null, mentalUpdates: [], intents: [] }`（NPC 选择发呆、沉默或毫无察觉）。

---

### 9. World Resolver 与 RFC 6902 JSON Patch (世界仲裁结算与原子补丁)
* **核心法则**: **任何 Agent 都不能直接修改真正的全局世界状态**。
* **统一提交**:
  - 所有 NPC 和玩家的意图都只是“候选提议 (Proposed Intents)”。
  - 只有 `world_resolver` 可以校验提议是否违反物理规则、超出反应预算或发生冲突。
  - 校验通过后，`world_resolver` 输出严格兼容 RFC 6902 的 JSON Patch（例如 `[{ "op": "replace", "path": "/entities/erin/mentalState/mood", "value": "alert" }]`）。
  - 由底层 `PatchEngine` 原子化、不可变地应用补丁，形成最终生效的 Committed World State。

---

### 10. Trace 与 React Flow 可视化调试体系
* **全程可观测性**:
  - 游戏运行的每一个环节绝非黑盒。
  - 顶层由 `TurnTrace` 挂载一次玩家行动。
  - 子节点由 `TraceSpan` 记录每个 Agent 的父子关系、耗时、调用参数、模板前后的完整 Messages、原始 LLM 响应与 Token 计量。
* **React Flow 拓扑呈现**:
  - 拓扑图中，`perception` 下属的多个 NPC 并行节点在视觉上整齐并排。
  - 节点状态实时呈现灰（Pending）、蓝（Running）、绿（Success）、红（Error）。
  - 点击任何节点，可在右侧抽屉一览完整的 Input Context、Prompt、Raw JSON 与 State Diff。
  - 配合 Gantt 并发时序视图，开发者可清晰洞察整个多智能体集群的推演时延与并发性能。
