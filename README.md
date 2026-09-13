# Story Tavern

用自然语言参与故事、纠正描写或调整场景。文本存档使用 **命令路由 → Designer → Narrator**，保留原有对话、人物卡片、历史、Trace 与 AI 助手界面。

## 运行

```sh
npm ci
npm run dev
npm run tauri dev
```

在 Backend 页面配置 OpenAI-compatible 服务。Agent 组中的三个角色为：

| 角色 ID | 职责 |
| --- | --- |
| `text_router` | 理解原始输入，选择人物、提出新人物需求，给后续阶段处理指示 |
| `text_designer` | 必要时创建人物卡片；一次批量生成选中人物的表达、动作和完毕状态 |
| `text_storyteller` | 根据消息记录、原始输入、路由指示和非空人物表现写本轮正文 |

路由、Designer 需要 `json_object`；Narrator 输出自然文本，不需要 function calling。普通回合三次调用，没有人物回应则两次，需要新人物则四次。结构无效最多重试一次，不自动换模型或回退 Mock。

升级会添加缺失的新角色配置，依次继承已有 `text_organizer`、`text_character`、`text_narrator` 的模型与参数；没有这些绑定时继承旧 input_compiler、npc_reaction、narrator。保留旧模板、自定义提示词、Backend 凭证和历史，新角色已有绑定不覆盖。

## 输入与人物状态

直接输入动作、对白、纠正、场景调整或文风要求。例如：“我向路上的另一位女孩打招呼”“不是一个扫帚”“先不要让任何人说话，描写海风”。三阶段都收到原始输入，Designer 与 Narrator 还收到路由的指示。不再把普通纠正强制改写为上一轮玩家行动并回滚重演。

人物卡片、初始场景和背景仍可在人物/世界页面及 AI 助手中编辑。Designer 的完毕状态与正文一起保存；人物页可查看最新状态，通过游戏输入提出调整。未选中人物保持原状态；无表达和动作的人物不进入旁白整合，但可以保存内在状态变化。

旧 `[admin]` / `[narrator]` 等文字仍可作为需求交给路由理解，不再启动文档工具写入配置。持久作者配置请通过界面或 AI 助手修改。旧 characterMode 字段兼容保留，三轮/两轮选项不再控制文本流程。

## 锚点与存档

程序为每次成功保存的正文附加 `【时间点 i】`。锚点真实出现在三个角色的历史请求里，人物状态引用对应索引；正文展示与复制不显示它。历史消息、编号和顺序固定，新回合材料追加到尾部，避免动态人物材料破坏历史前缀。缓存是否实际命中取决于 Backend/模型的缓存策略。

正文、人物状态、新卡片与锚点原子保存。取消或失败不消耗正式索引，不留下半轮人物状态。桌面采用不可变 Markdown generation 与 SQLite head，浏览器预览使用浏览器存储。Trace 保留实际请求、JSON 校验错误与保存结果；开发者 Raw Messages 中的锚点属于请求诊断内容。

未迁移 RPG 存档仍走旧流程，可显式迁移并保留备份。已有文本存档直接使用新流程；旧回合保留，首次成功提交时补齐稳定的历史锚点。

## 验证与构建

```sh
npm run typecheck
npm run check:csp
npm run check:rust
npm run build:exe
npm run eval:text-first -- --scenario=routed --turns=6 --calls=35 --group=group_fast
```

真实评估只读现有配置，使用独立测试存档，不修改用户游戏或打印凭证。模型对需求和人物知识的语义判断仍可能出错；代码确保 ID、JSON 形状、保存边界和消息来源，不声称强制实现人物心理或知识隔离。

运行结构见 [ARCHITECTURE.md](ARCHITECTURE.md)，助手能力见 [docs/ai-assistant.md](docs/ai-assistant.md)，验证记录见 [docs/text-first-validation.md](docs/text-first-validation.md)。旧实现与旧验收记录保留在 docs/archive。

## 浏览器与桌面共享存储

使用 `npm run dev` 启动浏览器开发版，或先 `npm run build` 再 `npm run preview` 启动构建预览。两个命令会自动启动本地 Rust 存储服务，因此需要 Rust/Cargo；页面直接访问桌面版 `%APPDATA%/story_tavern/story_tavern.db` 和同目录的 `text-saves`。浏览器原有数据会被清除，不迁移；请不要把静态文件单独放到其他 Web 服务上运行。

游戏、AI 助手、连接测试和模型列表的网络请求均由本地服务代发，凭证留在 Windows 凭证管理器或项目 `.env`，不会打入浏览器包。存储位置可在系统设置查看。正式使用时不要设置 `STORY_TAVERN_TEST_DIR`；它仅用于隔离测试。
