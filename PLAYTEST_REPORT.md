# 代码修复与实玩记录

测试日期：2026-09-11（美国中部时间，部分测试跨至 09-12）。

## 修复

- 新增“人物生成” Agent：管理员、普通行动、等待及时间快进结算引入新角色时自动触发。先声明最小人物草稿，再并行生成姓名、外貌、职业、个人背景、性格、日常目标与情绪，全部成功后原子提交。现有角色的普通状态更新不会重新生成身份。
- 人物生成上下文采用白名单：仅地点、天气、光照、世界时间及玩家本次输入，不传完整世界、场景长描述、规则、其他角色、旧人物草稿的私密字段或历史。生成后只保留独立个人记忆，初始关系为空。新增人物的后续 NPC 视角也不接收场景长描述。整实体 Patch 的公开视图会移除背景、性格、记忆等私密数据。
- 游戏页新增可展开的“正在生成 / 生成过程”面板。浏览器通过 SSE，exe 通过 Rust HTTP + Tauri Channel 实时更新各任务正文；不同任务独立显示排队、生成、完成或失败状态。只展示正文，不展示模型 reasoning 字段。支持并行任务、自动跟随新内容及手动回看。
- 老配置自动补充人物生成 Agent 和分组绑定，沿用该组管理员的后端/模型，不覆盖现有提示词；生成参数可在人物生成 Agent 中独立配置。
- 后续回归：`admin:让士兵晕倒` 曾被模型错误解析为 `normal` 块中的 `admin` 事件。现在开头的 `admin:` / `管理员：` 直接编译为管理员块，跳过 LLM Input Compiler；大小写、全角冒号与首尾空白均支持。空命令明确报错，普通对白中提到 `admin:` 不会触发直接管理员路由。Trace 记录本地解析过程，管理员 Patch 与旁白仍调用所配置模型。
- Schema 校验改为解释执行，保留 JSON Schema 定义校验与 Agent 语义校验，不再依赖 `new Function`。未放宽 Tauri CSP，也未加入 `unsafe-eval`。
- 浏览器后端连接测试、模型刷新改用 HTTP，不再误调用 Tauri IPC。
- 修复浏览器存储并发读写覆盖、创建/删除存档时丢失其他存档未保存进度、异步推演完成后抢回当前存档等问题。
- 修复分支重复选择/非法索引造成历史截断；执行期间禁止切换分支。
- 重新加载时恢复最近更新的存档及对应 Trace。
- 修复 Debug 默认 Trace 选择、实时节点更新及游戏页 Trace 跳转。
- 复制旁白等待剪贴板写入成功后再显示成功；失败时提示原因。
- 英文界面、跟随系统主题及日志级别过滤尚未实现，设置页已明确说明并禁用对应控件。

## 实际验证

网页版使用生产构建和与 exe 相同的严格 CSP，通过本机代理调用 OpenRouter；exe 使用自身 Rust HTTP 后端、系统凭据存储和独立 SQLite 测试库。真实模型为 `nvidia/nemotron-3-super-120b-a12b:free`，并非 Mock。

| 功能 | 结果 |
| --- | --- |
| 原样输入 `admin:让卫兵晕倒` | 网页和 exe 均成功；exe 提交 `/entities/guard/mentalState/mood = unconscious`，生成卫兵倒地旁白，无 CSP 错误 |
| 后续原样输入 `admin:让士兵晕倒` | 修复直接路由后，exe 真实调用与重试均通过；首次提交 `/entities/guard/fainted = true`，重试提交 `/entities/guard/mentalState/mood = unconscious`。证据为 `.tmp/admin-regression.json` |
| `admin:让我遇到个漂亮女孩` | 网页和 exe 真实 OpenRouter 调用通过。exe 生成“林雅婷”，含完整独立个人档案；确认生成器输入不含旧角色秘密。见 `.tmp/native-character-playtest.json` |
| 两人并行生成 | 网页出现“2 个任务并行中”，最终生成“林雅琳”“李晴”；实测第一位正文由 39、43、48 字继续增长时，第二位已完成，内容未串流 |
| exe 实时正文 | API 观察到 character_generator 在 running 状态时正文由 105、155、184 字增加，之后旁白也实时增长；不是完成后模拟打字 |
| 人物保存 | 网页刷新保留两份档案；exe 关闭重启后完整人物对象深比较一致 |
| 对艾琳说话并等待回答 | 网页和 exe 均完成多阶段推演，返回艾琳对白 |
| 快进 10 分钟 | 网页和 exe 世界时钟均从 08:16 到 08:26；exe 脚本断言增加 600000 毫秒 |
| 重试与分支切换 | 网页、exe 均产生两条分支并切回原分支 |
| 失败恢复 | exe 一次重试收到模型错误路径 `/erin/mentalState/mood`，原子拒绝且保留原回合；再次重试成功 |
| 保存与恢复 | exe 手动保存后关闭进程再启动，存档 ID、回合数、完整世界状态深比较一致；网页刷新恢复最新存档 |
| 后端连接/模型列表 | 网页连接测试和刷新成功；exe 原生连接成功，返回 445 个模型 |
| Agent 编辑器 | 网页预览渲染、独立 Agent 真实测试、新建、改名保存和复制均成功 |
| 调试 | 网页 Trace 图、时间线、节点输出、State Inspector、历史 Patch 可查看 |
| 角色/世界 | 网页显示推演后的角色和场景状态 |
| Mock/Agent 组 | 网页 Mock 开关刷新后保留，Mock 回合成功；Quality/Fast 切换并恢复成功 |

## 自动检查与构建

- `npm run check`：68 项 TypeScript 测试通过（全部在 `--disallow-code-generation-from-strings` 下运行），12 项 Rust 测试通过，TypeScript 类型检查通过。新增覆盖人物生成隔离、并行失败回滚、普通行动自动触发、旧配置升级、SSE 分块/中文/并行/异常中断。
- `cargo check --manifest-path src-tauri/Cargo.toml --features test-control` 通过。
- 测试功能构建及最终默认生产构建均成功：`npm run tauri -- build --no-bundle`。
- 最终 exe：`src-tauri/target/release/story_tavern.exe`。最终构建未启用 `test-control`。
- Vite 仍提示主包大于 500 kB；不影响这次验证结果。

## 验证边界

没有宣称所有配置组合、所有模型或任意输入均必然成功。免费模型仍可能生成错误 Patch、重复对白或与状态不一致的旁白；本次已实际观察到这些输出质量问题。引擎对非法 Patch 的拒绝及重试恢复已验证。

新人物一次最多生成 8 位；生成失败会回滚整轮。已存在人物不会自动改名或重写经历，可通过重试原创建回合生成新分支。人物生成的信息隔离避免引擎传递未知剧情，不代表能约束用户自行修改的提示词或用户主动在输入里提供的内容。

后端需支持 OpenAI 兼容 SSE 才能实时显示；若后端忽略 stream 参数、返回完整 JSON，则完成时显示正文。多人首次实测遇到旧管理员阶段输出过长，已通过最小人物声明协议减少重复生成；重测通过。生成截图见 `.tmp/generation-page.png`。

剪贴板点击反馈已测试，但未独立确认系统剪贴板内容。Agent 删除确认窗口在浏览器自动化中超时，因此不将删除 UI 记为通过；存储删除逻辑由回归测试覆盖。未遍历全部后端类型及导入/导出组合。

## exe 控制 API

控制 API 仅在 Cargo `test-control` 功能构建中可启动，绑定 `127.0.0.1`，要求长 Bearer token 与独立数据目录；拒绝浏览器 Origin 请求，无任意脚本执行接口。正式构建不开启 HTTP 监听。

```powershell
npm run tauri -- build --no-bundle --features test-control
$env:STORY_TAVERN_TEST_PORT = '4174'
$env:STORY_TAVERN_TEST_TOKEN = [guid]::NewGuid().ToString('N')
$env:STORY_TAVERN_TEST_DIR = Join-Path $PWD '.tmp\native-playtest'
$testExe = Join-Path $PWD 'src-tauri\target\release\story_tavern.exe'
$testProcess = Start-Process -FilePath $testExe -WorkingDirectory $PWD -WindowStyle Hidden -PassThru
# 等待应用初始化后执行。真实测试需要已配置 OpenRouter 凭据或仓库 .env。
node scripts/native-playtest.mjs
# 原样复测士兵晕倒及其重试（真实模型）：
node scripts/native-admin-regression.mjs
# 真实人物生成、上下文隔离与流式正文检查：
node scripts/native-character-playtest.mjs
# 关闭并以同样环境重启测试 exe 后：
node scripts/native-playtest.mjs --verify-restart
```

POST `/command`，Header 为 `Authorization: Bearer <token>`，JSON 格式为 `{ "action": "state" }`。支持 `state`、`newGame`、`send`（input）、`sendAsync`（input，立即返回）、`progress`（本轮 Trace 与实时正文）、`retry`（可选 index）、`variation`（index/variation）、`save`、`mock`（enabled）与 `connection`。操作由实际前端 Store 执行，模型及存储仍走真实原生路径。单次命令最长等待 300 秒。`--resume` 可在已完成回合和成功重试后继续分支/保存核验，不会掩盖首次失败。

测试产物位于忽略提交的 `.tmp/`，不包含 OpenRouter 密钥。运行中的控制 token 为临时文件，收尾时移除。
