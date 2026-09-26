# 项目档案 · Fitness AI Assistant

> 用途：秋招面试（**前端开发**为主，**AI 应用 / Agent 开发**为辅）的项目素材库。
> 所有数据来自本仓库实测（`git log` / PowerShell 统计 / `.VSCodeCounter` 2026-08-22），未做修饰。

---

## 项目描述

面向健身爱好者与增肌减脂人群的 AI 私教 App：用户上传体检报告与身体档案后，AI 自动生成 4 周训练/饮食周期计划，拍照即可识别餐食营养并记账，并可与具备工具调用能力的 Coach Agent 多轮流式对话（查天气、找附近健身房、改计划），同时提供健身社区动态流的发帖、点赞、评论与全文检索。

个人独立开发的全栈 Monorepo，**约 3 个月 / 47 次提交 / 29.5k 行 TypeScript**（`apps/mobile` 10.6k、`apps/api` 10.7k、`packages/*` 8.1k），移动端 123 个 TSX/TS 文件，含 5 个 Tab、11 个二级页面。

---

## 技术栈

**移动端（主）**
React Native 0.83（bare，非 Expo）· React 19 · TypeScript strict · React Navigation 7（Native Stack + Bottom Tabs）· TanStack Query v5 · Zustand v5 · NativeWind 4 / Tailwind · MMKV + Keychain · react-native-markdown-display · react-native-image-picker · Jest

**后端**
NestJS 11（HTTP / BullMQ Worker / Cron 三进程同 codebase）· Prisma 6 + PostgreSQL 16（26 模型 / 11 次迁移 / 46 索引）· Redis + BullMQ · Meilisearch · MinIO（S3 兼容预签名）· Argon2id + JWT 双 Token

**AI / Agent**
LangChain.js + LangGraph.js（自定义 ReAct 图）· DeepSeek-V3.2（文本 / Function Calling）· Qwen-VL-Max（餐照、体检报告多模态）· Langfuse（trace / generation / tool span 全链路观测）· Zod 结构化输出校验

**工程化**
pnpm workspace + Turborepo · `@fitness/shared` Zod 契约端到端共享（前后端零手写重复类型）· ESLint 9 flat + Prettier · Husky + lint-staged + commitlint · GitHub Actions（lint → typecheck → test，118 个单测门禁）

---

## 项目要点

### 第一步：候选要点池（全量罗列，含自评）

> 标注含义：**★★★** = 前端岗最有说服力 / **★★** = 有亮点但常见 / **★** = 只适合口述补充。
> 「风险」列 = 面试官深挖时容易被问穿的点。

#### A. 移动端 / 前端工程（主战场）

| 编号 | 候选要点                                                                                                                                                                                                                                                   | 价值 | 风险                                             |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- | ------------------------------------------------ |
| A1   | **RN 无原生 EventSource**，基于 XHR `onprogress` 增量解析 `responseText` 自研 SSE 客户端，支持 POST body、401 静默刷新后重试、用户主动 abort、120s 超时                                                                                                    | ★★★  | 需说清 fetch ReadableStream 在 RN 上不可用的原因 |
| A2   | **流式渲染性能**：32ms trailing throttle 批量 flush delta（首包立即渲染）+ inverted FlatList + `requestAnimationFrame` 每帧至多一次滚动跟随 + `memo` 消息体，把 token 级高频 setState 收敛为帧级重绘                                                       | ★★★  | 无 before/after 帧率实测数据                     |
| A3   | **跨列表点赞乐观更新竞态**：自研 `SocialLikeCoordinator`（generation 递增 + inFlight 计数 + `useSyncExternalStore`），快速连点只认最后一次意图、丢弃 stale 响应，并同步 patch Feed / 详情 / 搜索 / 用户主页 4 类 infinite query 缓存，onSettled 拉真值校准 | ★★★  | 失败无显式 rollback，靠 reconcile 兜底           |
| A4   | **统一 API 层**：`apiFetch` 封装 401 → refresh 单例 Promise（多请求并发只刷一次 token）、结构化 `ApiError`、响应经 `@fitness/shared` 的 Zod schema 运行时校验，编译期 + 运行期双重类型安全                                                                 | ★★★  | —                                                |
| A5   | **MinIO 预签名三段式直传**（sign → PUT → complete）：Android `content://` URI 无法被 fetch 读取，改用 XHR 发送 `{ uri, type, name }`，一套抽象复用于社区图片 / 头像 / 餐照 / 体检报告 4 类 scope                                                           | ★★   | 未做上传进度与二次压缩                           |
| A6   | **离线打卡队列**：训练打卡失败写入 MMKV 队列，AppState 回前台顺序重放并 invalidate React Query 缓存，弱网/地下健身房不丢数据                                                                                                                               | ★★   | 仅覆盖打卡一个场景                               |
| A7   | **社区 Feed 无限滚动**：`useInfiniteQuery` + 后端 keyset 游标分页，下拉刷新 / 触底加载 / 正文 140 字折叠 / 1-2-3 列自适应图片网格                                                                                                                          | ★★   | 用的是 FlatList 而非 FlashList                   |
| A8   | **Markdown 表格自定义渲染**：扩展 `react-native-markdown-display` 的 `RenderRules`，实现暗色主题下的训练计划 / 营养表格（RN 原生无 table 布局）                                                                                                            | ★★   | —                                                |
| A9   | **Monorepo 跨端复用**：`@fitness/ui` NativeWind 原子组件库（Button/Card/ProgressRing SVG 环形进度等）+ `@fitness/shared` Zod 契约，配 `strict` + `noUncheckedIndexedAccess`                                                                                | ★★   | ui 包仅 437 行                                   |
| A10  | **分层存储与鉴权安全**：accessToken 存内存（Zustand），refreshToken 进 Keychain（`WHEN_UNLOCKED`），业务草稿 / 主题 / 离线队列走 MMKV                                                                                                                      | ★★   | —                                                |
| A11  | **异步 AI 任务前端状态机**：AI 任务 202 返回 taskId，客户端 1/2/4/8s 退避轮询，对话内以「卡片消息」承载 pending → done 状态流转                                                                                                                            | ★★   | —                                                |
| A12  | 定位能力 opt-in：Android 运行时权限封装 + MMKV 记录用户同意 + `Linking.openSettings()` 引导，仅在 Coach 需要 LBS 时懒加载                                                                                                                                  | ★    | —                                                |
| A13  | 暗色模式（MMKV 持久化 + Navigation Theme 联动）、5 Tab / 11 Stack 页面导航体系                                                                                                                                                                             | ★    | 常见能力                                         |

#### B. AI 应用 / Agent 开发

| 编号 | 候选要点                                                                                                                                                                                                                                  | 价值 | 风险                          |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- | ----------------------------- |
| B1   | **LangGraph 自定义 ReAct Agent**：`agent` ↔ `tools` 两节点 + 条件边，7 个工具、最大 5 轮迭代，超限时注入指令强制收敛；图定义在 `ai-core`、工具执行在 API 侧 `ToolRegistry`，通过 `InvokeToolFn` 注入，密钥不出服务端                      | ★★★  | —                             |
| B2   | **工具系统治理**：每个工具 Zod 入参校验 + 按用户自然日配额（天气 10 / 地理编码 20 / 健身房 10 / 快照 30）+ `toolTrace` 审计（入参出参摘要、耗时、成败，坐标脱敏到 2 位小数）+ 工具失败以 observation 回喂模型而非抛 500                   | ★★★  | —                             |
| B3   | **重任务不阻塞对话**：`enqueue_plan_generate` / `enqueue_meal_vision` 工具只创建 AiRun 并入 BullMQ 队列 + 回卡片消息，Qwen-VL 与完整计划生成在 Worker 进程跑，SSE 连接秒级返回                                                            | ★★★  | —                             |
| B4   | **三层记忆**：工作记忆（当轮 tool observation）/ 情景记忆（档案+今日营养+活跃计划注入 system prompt）/ 长期记忆（`UserAgentMemory` 表）；对话结束后异步 LLM 抽取事实，confidence ≥ 0.6 且每轮至多 3 条 patch 才落库                       | ★★   | 无向量检索，是 KV 事实表      |
| B5   | **结构化输出容错链**：JSON mode + Zod 严格校验 → markdown fence 提取 → 字段别名映射 → 纯文本兜底，避免整轮对话因模型 JSON 瑕疵失败                                                                                                        | ★★   | 未做「校验失败再调 LLM 修复」 |
| B6   | **SSE 事件契约**：`accepted` / `tool_start` / `tool_end` / `delta` / `done` / `error`，把 Agent 工具调用中间态实时推给前端渲染进度条；经典链路与 Agent 链路共用同一 `SseEmitFn`，Feature Flag 可无损回退                                  | ★★★  | 无心跳包与背压控制            |
| B7   | **Langfuse 全链路观测**：`traceId = aiRunId`、`sessionId = conversationId`，包装 LLM 客户端自动上报 generation（token / 延迟 / 成本），工具单独 span，`flushAsync` 不阻塞 SSE 热路径，trace URL 回写 `AiRun.outputJson` 供 UI 深链调试    | ★★★  | 仅覆盖 COACH_CHAT 链路        |
| B8   | **多模态链路**：餐照两阶段（Qwen-VL 识别菜品克重 → DeepSeek 结合当日剩余配额给建议 → 落库 MealLog）；体检报告 PDF 服务端 pdfjs 渲染最多 15 页 PNG → VLM 抽取指标 → 二阶段风险评估 + guardrails，结果作为 `healthContext` 注入后续计划生成 | ★★★  | —                             |
| B9   | **Prompt 体系**：8 套模板、`json` / `stream` / `agent` 三模式 system prompt，动态注入当前时间与时区、长期记忆块、健康上下文、LBS 上下文                                                                                                   | ★★   | 无运行时版本管理              |
| B10  | DeepSeek 流式正文偶发泄漏内部工具标记，实现 `stripDsmlMarkup` 清洗 + POI 场景兜底回复                                                                                                                                                     | ★    | 细节向，适合口述              |

#### C. 后端 / 数据 / 工程化（加分项）

| 编号 | 候选要点                                                                                                                                                                                                                 | 价值 | 风险                             |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---- | -------------------------------- |
| C1   | NestJS 模块化单体，`main.ts` / `worker.ts` / `schedule.ts` 三入口共享同一套 Module，Worker 裁剪掉 HTTP Controller，重 LLM 任务与 API 进程隔离                                                                            | ★★   | —                                |
| C2   | BullMQ + `AiRun` 状态机（QUEUED/RUNNING/DONE/FAILED/CANCELLED），9 种任务类型、3 次指数退避、`removeOnFail: false` 保留死信、按类型独立日配额、token/成本/耗时全量落库                                                   | ★★★  | —                                |
| C3   | 幂等点赞：用 `PUT/DELETE` 而非 toggle `POST`，事务内维护冗余 `likeCount`，捕获 Prisma `P2002` 后不重复计数（且必须在事务外读计数，避免 PG 事务 abort）                                                                   | ★★★  | —                                |
| C4   | Keyset 游标分页：`orderBy [createdAt desc, id desc]` + `take: limit+1`，用 id 做 tie-breaker 防止同秒并列导致漏行/重复                                                                                                   | ★★   | —                                |
| C5   | 可插拔检索：`SearchProvider` 接口双实现（Meilisearch 生产 / PG `contains` 供 CI），独立 `fitness-social-index` 队列做增量索引且 Processor 回库取最新状态（重复与乱序消费安全），配 `reindex:social` 全量重建脚本兜底漂移 | ★★★  | —                                |
| C6   | Feed 列表 N+1 治理：整页摊平后三次批量查询（作者 / 媒体 / 我的点赞）替代逐帖查询                                                                                                                                         | ★★   | —                                |
| C7   | JWT 双 Token（access 15min / refresh 30d）+ `Session` 表存 refresh hash，改密即撤销全部会话；Argon2id 哈希；滑块验证码 + Redis 一次性 token 防短信轰炸                                                                   | ★★   | 有 Role 枚举但无路由级 RBAC 守卫 |
| C8   | 端到端契约：`packages/shared` 单一 Zod 源，`z.infer` 导出类型，后端 `parseWith` 校验入参、前端 `Schema.parse` 校验响应，前后端禁止手写同名 interface                                                                     | ★★★  | —                                |
| C9   | Turborepo 任务缓存 + Husky/lint-staged/commitlint + GitHub Actions（lint → typecheck → test，118 个单测）+ 9 个 PowerShell 端到端验收脚本 + 11 篇 ADR 架构决策记录                                                       | ★★   | 无 E2E、无覆盖率统计             |

---

## 第二步 · 简历定稿（前端主投 · 4 条，可直接复制）

- **AI 对话流式渲染**：针对 RN 无 EventSource，用 XHR 增量解析自研 SSE 客户端（支持 POST、401 静默重试、可中断），配 32ms 节流与帧级滚动跟随，将 token 级重渲染收敛为帧级，长回复流式输出稳定跟手。
- **社区点赞并发一致性**：自研 generation 序号协调器丢弃连点产生的 stale 响应，并联动 patch Feed / 详情 / 搜索 / 主页 4 类列表缓存，实现跨页面即时一致的乐观更新。
- **跨端类型安全与网络层**：以 `@fitness/shared` 的 Zod schema 作为前后端唯一契约源，封装 401 refresh 单例合并、结构化错误与响应运行时校验的统一 API 层，配合 MinIO 预签名三段式直传（XHR 解决 Android `content://` 无法被 fetch 读取），杜绝前后端类型漂移。
- **Coach Agent 工具编排**：基于 LangGraph 自定义 ReAct 双节点图接入 7 个工具（最大 5 轮迭代），图定义与工具执行分层使密钥不出服务端，按用户日配额与 toolTrace 审计约束调用；识图 / 计划生成等重任务由工具入队 BullMQ，对话侧 SSE 秒级返回而非阻塞等待。

> 量化口径说明：不写未实测的性能百分比，只用代码内可核实的事实（7 工具 / 5 轮上限 / 4 类缓存联动 / 32ms 节流 / 118 个单测），面试时可当场翻代码佐证。

## 备选要点组（若改投 AI 应用 / Agent 岗，整组替换上面 4 条）

- **Coach Agent 编排**：基于 LangGraph 自定义 ReAct 双节点图（7 工具 / 最大 5 轮），图定义与工具执行分层（密钥不出服务端），工具全部 Zod 校验 + 用户日配额 + toolTrace 审计，失败以 observation 回喂模型，Feature Flag 可无损回退经典链路。
- **流式与异步分层**：SSE 统一 `tool_start/tool_end/delta` 事件契约把工具中间态实时推给客户端；识图与计划生成等重任务由工具入队 BullMQ（`AiRun` 状态机 + 3 次指数退避 + 死信保留），对话响应从分钟级降到秒级返回。
- **LLM 可观测与稳定性**：接入 Langfuse（`traceId = aiRunId`，generation/tool span 记录 token、延迟、成本，异步 flush 不阻塞热路径），配合 JSON mode + Zod 校验的多级容错解析链，可定位每轮对话的工具决策与成本。

---

## 面试深挖预案

| 大概率追问                                        | 准备好的回答方向                                                                                                                            |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| 为什么不用 `react-native-sse` / fetch stream？    | RN 的 fetch 不支持 `ReadableStream`；`react-native-sse` 对 POST body 支持与鉴权重试不够灵活，且需要自己接管 401 刷新与 abort，索性 XHR 自研 |
| 32ms 这个数字怎么来的？                           | 对齐 30fps 帧预算；首包立即 flush 保证首字延迟，后续 trailing throttle 合并                                                                 |
| generation 方案 vs 请求串行化 / AbortController？ | 串行化会让连点体感变卡、abort 无法撤销已到服务端的写操作；generation 允许并发但只认最后意图，最后再用 GET reconcile 校准                    |
| 乐观更新失败为什么不 rollback？                   | onSettled 统一拉服务端真值 reconcile；弱网失败时保留本地态避免闪烁，代价是短暂不一致                                                        |
| Agent 怎么防止工具被滥用/刷量？                   | 服务端独占密钥 + 按用户自然日配额 + 单轮会话内计数 + objectKey 路径段校验用户归属                                                           |

## 诚实边界（避免被问穿）

- 列表用 FlatList 未上 FlashList；图片未用 FastImage / 未做懒加载与骨架屏
- `react-hook-form` 已引入但页面实际用受控 `useState`
- 无 E2E 测试、无覆盖率统计、无 i18n、无推送与深链、上传无进度条
- 记忆层是 KV 事实表，非向量 RAG；Prompt 无运行时版本管理
- SSE 服务端无心跳与背压；有 `Role` 枚举但未落地路由级 RBAC 守卫
- 软删除靠业务层显式 `where deletedAt: null`，Prisma extension 未实装
- 个人项目，无真实线上用户量与性能对比数据（面试时主动说明，不编造指标）

---

## 要点① 深挖手册 · AI 对话流式渲染

> 简历原句：XHR 增量解析自研 SSE 客户端（POST / 401 静默重试 / 可中断），配 32ms 节流与帧级滚动跟随，将 token 级重渲染收敛为帧级。
> 措辞与代码逐一核对结论：**每条都有实现**，注意「帧级」= 30Hz 文本刷新 + rAF 帧级滚动，不是「每帧同步渲染」（见 C2 陷阱）。

### 事实卡（回答所有问题的弹药）

| 组件           | 实现事实                                                                                                                                                    | 代码锚点                                                         |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| SSE 客户端     | XHR `POST` + `onprogress` + `responseText.slice(lastIndex)` 增量读取；`\n\n` 分帧 + remainder 半包缓存                                                      | `apps/mobile/src/api/client.ts` `apiStreamSSE` / `parseSseChunk` |
| 事件协议       | `accepted` / `tool_start` / `tool_end` / `delta` / `done` / `error`，payload 由 `@fitness/shared` Zod 契约约束                                              | `client.ts` + `packages/shared/src/schemas/conversation.ts`      |
| 401 重试       | `refreshPromise` 单飞（并发 401 只刷一次 token）→ 重放流式请求一次 → 失败 `clearAuth`                                                                       | `client.ts` `ensureRefreshed`                                    |
| 可中断         | `abortActiveSseStream()`：标志位 + `xhr.abort()`；`onabort` 内用标志区分「用户停止」（`STREAM_ABORTED`）与网络中断                                          | `client.ts`                                                      |
| 32ms 节流      | 首包立即 flush（保首字延迟）+ trailing throttle 32ms（≈30Hz）+ 结束强制 flush                                                                               | `features/coach/coach-stream-delta-throttle.ts`                  |
| 渲染驱动       | Zustand `streamRevision` 自增；`stopStream()` 只停流、**保留已生成文本**；`failStream/finishStream/reset` 分工                                              | `features/coach/coach-stream-store.ts`                           |
| 帧级滚动跟随   | inverted FlatList（offset 0 = 底部，`scrollToEnd = scrollToOffset(0)`）+ rAF 合帧（一帧最多滚一次）+ 程序滚动 120ms 标记防 `onScroll` 反馈 + 自动跟随状态机 | `features/coach/components/ChatMessageList.tsx`                  |
| 历史消息免渲染 | `ChatBubble` `memo` 自定义比较器：id/content/contentType/role/metadata 相等即跳过，流式只重渲染最新气泡                                                     | `ChatBubble.tsx` L161–171                                        |
| 超时           | 流式 120s；轮询任务 3min / 计划生成 6min 分级                                                                                                               | `client.ts` / `env.ts`                                           |

### 提问方向地图（5 类 24 问）

**A. 动机与选型**：为什么不用 EventSource？RN fetch 为什么不能流式？为什么不用 WebSocket？为什么自研不引 `react-native-sse`？选型决策链一句话怎么说？

**B. 协议与解析**：粘包/半包怎么处理？6 个事件怎么分工？XHR `onprogress` 有什么坑？前后端事件契约怎么对齐？

**C. 渲染性能（最可能深挖）**：token 级 setState 为什么卡？32ms 怎么定出来的？「帧级滚动跟随」具体四件套？用户上滑看历史怎么办？历史消息怎么不重渲染？有没有量化数据？

**D. 健壮性**：401 重试细节与边界？中断与网络断开怎么区分？前端 abort 后服务端还在生成吗？超时/错误怎么分类？停止生成后状态机？

**E. 深水区对比**：重做一次怎么设计？Web 与 RN 流式差异？流式 vs 一次性返回的产品权衡？后端 SSE 有哪些坑？

### 逐问预答

**A1 为什么不用 EventSource？** EventSource 规范只支持 GET；Coach 消息要 POST 提交 JSON 体（图片 objectKey、locationContext）+ `Authorization` 头，RN 侧 polyfill 对自定义 header 支持也不可靠。
**A2 RN fetch 为什么不能流式？** RN 的 fetch 没有标准 `ReadableStream`（`response.body.getReader()` 不可用），Web 的标准做法在 RN 走不通；XHR `onprogress` 是 RN 生态最稳的增量读取手段。（加分：知道 `expo/fetch` 已补齐 stream + AbortController，放 E1 讲。）
**A3 为什么不用 WebSocket？** 链路是「发一条消息 → 服务端单向持续推送」，单工 SSE 语义匹配；WS 要双工升级、心跳、重连协议和网关改造，收益不成比例。承认 WS 更适合多路双向实时场景。
**A4 为什么自研？** 组合需求 = POST + Bearer + 超时 + 中止 + 401 重试 + 事件分帧，三方库只覆盖一部分；自研约 200 行、类型可控、事件契约由 Zod 锁死。别说贬低库的话。

**B1 粘包/半包？** 网络切块边界任意：buffer 按 `\n\n` split，最后一段残余留到下次；帧内解析 `event:` / `data:` 行；data JSON 解析失败降级原字符串。XHR `responseText` 是完整累计文本，用 `lastIndex` 只取增量。
**B2 事件分工？** `accepted` 先回（受理 + 拿到 messageId，气泡立刻有稳定 id）→ `tool_start/tool_end` 渲染「正在查询天气…」的 Agent 中间态 → `delta` 正文 → `done` 带 suggestedActions/toolTrace → `error` 结构化错误码。
**B3 XHR onprogress 的坑？** ① `responseText` 每次全量读取，切片是 O(n) 累计拷贝，超长回复有 O(n²) 隐患——当前 120s 内回复量级可接受，重做换 stream 方案（E1）；② progress 事件频率由引擎控制，所以渲染层必须再做 32ms 节流。

**C1 token 级 setState 为什么卡？（最高频，背熟）** DeepSeek 中文约 1 token ≈ 1 字，流式速率每秒几十个 delta；每 delta 一次 setState = 整树协调 + Markdown 重新 parse AST，JS 线程被打满。三层解法：① 32ms trailing throttle 收敛渲染频率；② `ChatBubble` memo 保证历史消息零重渲染；③ rAF 合帧滚动与文本渲染解耦。
**C2 32ms 怎么来的？** 60Hz 下 32ms ≈ 每 2 帧更新一次，肉眼仍是连续打字机；比 16.7ms 省一半渲染预算，比 50ms+ 跟手；首包立即 flush 保 TTFT，trailing 保证最后一帧不丢，结束 `flush()` 兜底。**陷阱**：面试官若问「32ms 不是 16.7ms，凭什么说帧级」——主动澄清「帧级指滚动跟随按帧合并、文本收敛到 ~30Hz 两帧一次，是视觉连续与 JS 余量的折中」，别硬说每帧渲染。
**C3 帧级滚动四件套？** ① inverted FlatList：新消息永远在 offset 0，无需算 contentHeight 差；② `scheduleFollow` rAF 合帧：一帧内多次内容变化只滚一次；③ 反馈防护：程序滚动会触发 `onScroll`，用 120ms 标记窗口忽略，防止把自己判成「用户离开底部」；④ 自动跟随状态机：拖拽暂停、回到底部 120px 内恢复。加分细节：流结束 `followNow` + 320ms 后二次校正等布局稳定；键盘弹出 rAF 后滚动。
**C4 用户上滑看历史？** 拖拽即暂停跟随、绝不打断阅读，回到底部阈值内恢复——「跟手」与「不打扰」的平衡，AI 聊天产品最容易翻车的体验点。
**C5 历史消息怎么不重渲染？** `ChatBubble` memo 自定义比较器（id/content/role/metadata 相等跳过）；流式期间只有最新气泡 content 在变；FlatList `extraData` 只传 `streamScrollTick` + toolActivities 摘要，控制重渲染触发面。
**C6 有量化数据吗？** 诚实版：开发期靠机制（revision + throttle + memo）保障，未做系统 benchmark；可说「机制上从每 token 一次收敛到 ~30 次/秒」。**强烈建议面试前补测**（见准备动作 3），没测就明说，绝不编数字。

**D1 401 重试边界？** refresh 单飞 + 重放一次 + 失败登出。「静默」= 用户无感知，不是吞错。边界：入口 401 时服务端未创建消息，重放无副作用；流中途 401 只发生在 token 临过期（15min 有效期 vs 120s 超时，正常不发生），生产会加客户端幂等键。主动说出这个边界是加分项。
**D2 中断 vs 网络断开？** `abortActiveSseStream()` 先置标志再 `xhr.abort()`；`onabort` 里标志为真 → 主动停止（`STREAM_ABORTED`），UI 平静收尾；否则按网络错误处理。停止生成 / 切换会话 / 新建会话三处复用同一入口。
**D3 abort 后服务端还在生成吗？（诚实，展示深度）** 前端关的是连接；服务端 SSE 写入断连后能感知，但本项目未把 abort 透传为 LLM 层 AbortSignal，极端情况浪费一次 token 预算。生产方案：连接断开 → 取消 LLM 生成。
**D4 超时/错误分类？** 流式 120s（覆盖长思考回复）；`error` 事件映射结构化错误码；`STREAM_ABORTED` / 超时 / 网络错误三类走不同 UI。轮询任务另有 3min / 6min 分级（`env.ts`）。
**D5 停止后状态机？** `stopStream()` 只翻转 `isStreaming`，**保留**已生成文本与 toolActivities——用户看到「已停止的完整片段」；切换会话才 `reset()`。

**E1 重做一次？** ① 换 `expo/fetch` / `react-native-fetch-api` 拿 ReadableStream + AbortController，删掉 responseText 切片；② 流式请求带幂等键，401 重放零副作用；③ abort 透传后端取消 LLM 生成。32ms 节流 / rAF 滚动 / memo 策略保留。面试官在测「你知不知道自研方案的边界」。
**E2 Web vs RN？** Web 有 ReadableStream + EventSource + AbortController + `X-Accel-Buffering: no` 防代理缓冲；RN 缺 ReadableStream、EventSource 受限，XHR 兜底；共享同一套事件契约与节流/渲染策略，差异只在传输层。
**E3 流式 vs 一次性？** 流式价值 = 首字延迟（TTFT）感知 + 长文本逐步可读 + 中途可停省 token；短结构化输出（计划 JSON、识图结果）走轮询更划算——本项目正是「对话流式 + 重任务轮询」双轨按任务路由。
**E4 后端 SSE 的坑？** nginx 缓冲假流式（`X-Accel-Buffering: no`）、长连接超时与心跳、HTTP/1.1 连接数限制、断连后 LLM 取消。本项目 RN 直连 API 无代理，第一个问题不存在，其余靠 120s 超时 + 单会话单流约束。

### 准备动作清单

1. **吃透 3 个文件**：`client.ts`（SSE 部分）、`coach-stream-delta-throttle.ts`、`ChatMessageList.tsx`——每处 if/ref 能说清为什么（本点 90% 追问在此）。
2. **画 2 分钟时序图**：POST → `accepted` → `delta`(32ms 节流) → `tool_start/tool_end` → `done`；标注 401 重放与 abort 两个分支。
3. **补一个量化数据（强烈建议）**：React Profiler 或渲染计数对比「每 delta setState vs 32ms 节流」一条 300 token 回复的渲染次数，把 C6 从「没测」变「实测收敛约 X 倍」。
4. **背熟 5 个数字**：32ms（节流）、120s（流式超时）、120px（跟随阈值）、15min（access 有效期，答 D1 用）、~30Hz（收敛后刷新率）。
5. **准备 1 个踩坑故事**：onScroll 反馈导致跟随状态误判（已用程序滚动标记修复）/ 401 并发刷新（单飞修复）/ responseText 全量拷贝隐患（E1 演进）——git 历史有对应 fix 可指。

### 实际踩坑记录 · 聊天流式四大问题与解法

> 这四条是真实开发中遇到的问题，**代码里都有对应解法**；其中节流有明确的「修复前 → 修复后」git 证据（见问题 1），是最有说服力的面试素材。

#### 问题 1 · 流式渲染卡顿（token 级 setState）

**根因**：每来一个 `delta` 就 `setAssistantContent` → Zustand 更新 → `CoachScreen` 重渲染 → `mergeStreamMessages` 重建 messages → FlatList data 变 → 最新气泡重渲染 → `react-native-markdown-display` 对**整段累积文本重新 parse AST**。中文 1 token ≈ 1 字，每秒几十个 delta = 每秒几十次全量 markdown 解析，JS 线程被打满。

**修复前（`8789a6b^` 的 `coach.ts`，2026-07-19 之前）**：

```ts
} else if (event === 'delta') {
  const parsed = CoachStreamDeltaEventSchema.parse(data);
  streamStore.setAssistantContent(parsed.text);   // ← 每个 token 一次 setState
}
```

**修复后（当前）**：

```ts
const deltaThrottle = createCoachDeltaThrottle((text) => streamStore.setAssistantContent(text));
// accepted → startStream；delta → deltaThrottle.push(parsed.text)
// done   → deltaThrottle.flush() + finishStream
// catch STREAM_ABORTED → flush()（保留已生成文本）；其他错误 → dispose()
// finally → dispose()（清定时器，防泄漏）
```

**三层解法**：① 32ms trailing throttle（首包立即 flush 保 TTFT，done/abort 强制 flush 保尾字）；② `ChatBubble` 自定义 memo 比较器 + `CoachMessageBody` memo，历史消息零重渲染；③ 滚动跟随用 rAF 合帧，与文本渲染次数解耦。

**话术**：「最初 delta 是直连 setState 的，长回复会持续掉帧；后来抽出节流器把渲染收敛到 ~30Hz，并在 done/abort 时 flush 保证不丢字——错误路径 dispose、中止路径 flush 是刻意的区分。」（能讲清「最初→后来」比背最终代码可信得多，git 里那一行还在。）

#### 问题 2 · 拖拽上滑与自动跟随冲突

**根因**：① 程序化 `scrollToOffset` **也会触发 `onScroll`**，若在 onScroll 里判定「离开底部就停止跟随」，跟随会被自己关掉，表现为「跟几次就失效」；② 用户上滑看历史时，新 delta 又把他拽回底部，打断阅读；③ 惯性滚动期间 onScroll 持续触发，恢复跟随的时机难以判定。

**解法四件套（`ChatMessageList.tsx`）**：

1. **inverted FlatList**：`inverted` + `displayMessages = [...messages].reverse()`，新消息永远在 offset 0 → 「滚到底」= `scrollToOffset({ offset: 0 })`，不用算 contentHeight、避开布局竞态。
2. **程序滚动标记**：`markProgrammaticScroll()` 置 `isProgrammaticScrollRef = true` 并 120ms 后清除；`updateAutoFollow` 首行 `if (isProgrammaticScrollRef.current) return;` → 只让**真实用户滚动**改变跟随状态。
3. **拖拽即暂停 + 回底恢复**：`onScrollBeginDrag` → 暂停跟随；`onScrollEndDrag` / `onMomentumScrollEnd` → `autoFollow = contentOffset.y <= 120`（`NEAR_BOTTOM_THRESHOLD`）。
4. **rAF 合帧 + 门控**：`scheduleFollow()` 先 `shouldFollow()`（autoFollow && !userDragging），`followRafRef` 去重保证一帧最多一次滚动；触发源三处——`onContentSizeChange`、`streamScrollTick`（每次 flush 后 +1）、最新气泡 `onLayout`。

**收尾细节**：流结束时 `followNow()` + `setTimeout(followNow, 320)` 等 markdown 最终布局稳定后再贴底；键盘弹出在 `CoachScreen` 里 rAF 后 `scrollToEnd`；`scrollToBottom` 内部再套一次 rAF 校正异步布局。

**话术**：「冲突本质是程序化滚动和用户滚动共用一个 `onScroll`，我用 120ms 标记窗口把两者分开；再配合 inverted 列表把『滚到底』降级成 offset 0，顺带解决布局竞态。」

#### 问题 3 · 文字超出气泡宽度不换行

**根因**：外层是 `flex-row`，气泡作为 flex item **默认 `min-width: auto`**（不肯收缩到内容宽度以下）——`max-w-[85%]` 只限上限，长英文/长 URL 的 intrinsic width 会把气泡撑破，Text 拿不到可用宽度自然不换行。

**解法（当前 `ChatBubble.tsx` 气泡 class）**：

```
max-w-[85%] min-w-0 shrink rounded-2xl px-4 py-3 overflow-hidden
```

- `max-w-[85%]`：气泡最多占 85% 宽，留视觉边距
- **`min-w-0`：关键**——覆盖 flex item 的 `min-width: auto`，允许被压到小于内容宽度，内容才进入换行流程
- `shrink`：`flex-shrink: 1`，允许收缩
- `overflow-hidden`：兜底裁剪不可断行的超长串，保护圆角背景
- 配套：`CoachMessageBody` 的 markdown 容器 `alignSelf: 'stretch', width: '100%'`，保证渲染撑满气泡可用宽度

**话术**：「不换行的根因不是 Text，是 Row 里 flex item 的 `min-width: auto` 不允许它收缩到内容宽度以下；加 `min-w-0 + shrink` 让内容进入换行，再用 `overflow-hidden` 兜底不可断行长串。」

#### 问题 4 · Markdown 表格渲染

**根因**：RN 没有 `<table>` / `display: table`，也没有自动表格列宽算法；库默认 table 渲染在 RN 上错位、不换行或撑破气泡。

**解法（`CoachMessageBody.tsx`）**：

1. **自定义 RenderRules**：`buildTableRules()` 覆写 `table / tr / th / td` 四个规则，用 `View + flexDirection: 'row'` 手写表格，弃用库默认实现。
2. **列宽显式分配**：两列表格第一列（标签）`TABLE_FIRST_COL_FLEX = 0.28`、第二列（说明）`1 - 0.28 = 0.72`；每格 `minWidth: 0` 保证长内容换行不撑破。
3. **极简视觉**：`table` 只保留 `borderTopWidth`，`tr` 加 `borderBottomWidth`，列间 `borderLeftWidth`（`rgba(255,255,255,0.1)`），与正文同宽、不做独立卡片。
4. **主题一致**：th/td 显式 `fontSize: 15 / lineHeight: 22`，与 body 对齐，避免表格内字号突变。
5. **引用稳定**：`useMemo(() => buildTableRules(), [])` + `memo(CoachMessageBody)`，避免流式期间重建 rules 触发 markdown 全量重渲染（与问题 1 联动）。
6. `width: '100%' as const` 是 RN style 类型要求的字面量修复（`2fdcfa7` 提交）。

**话术**：「RN 没有 table 布局，库默认实现撑不出可用表格；我覆写 4 个 render rule 用 flex row 手写，列宽 0.28/0.72 显式分配 + `minWidth: 0` 保证换行，视觉做成与正文同宽的极简分隔线。」

**四问串联讲法（推荐）**：先说「这三个渲染问题的根因是同一条链路——流式高频更新 + RN 没有表格/自动换行布局 + 程序滚动与用户滚动共用一个回调」，再逐个给机制，最后收在「所以我把渲染频率、布局收缩、滚动跟随三件事分别解耦」，比逐条罗列更像工程判断。

### rAF（requestAnimationFrame）实现细节

> 全仓库仅 5 处 rAF，全部集中在 Coach 聊天组件：`ChatMessageList.tsx` 4 处 + `CoachScreen.tsx` 1 处。说明是**为滚动跟随刻意引入**，不是随手撒的。

#### 三个职责（不是重复调用，各管一件事）

**职责 A · 合帧去重（batch/coalesce）— `scheduleFollow`**

```ts
const scheduleFollow = useCallback(() => {
  if (!shouldFollow()) return; // 门控：自动跟随开启且用户没在拖
  if (followRafRef.current != null) return; // ← 本帧已排过，直接返回
  followRafRef.current = requestAnimationFrame(() => {
    followRafRef.current = null; // 先清句柄再执行，允许下一帧再排
    scrollToBottom(false);
  });
}, [scrollToBottom, shouldFollow]);
```

三个触发源（`onContentSizeChange`、`streamScrollTick`、最新气泡 `onLayout`）在一帧内可能全部触发 → 靠 ref 句柄去重，**一帧最多下发一次滚动指令**。意义：避免一帧内多次 `scrollToOffset` 造成重复 layout pass（Android 上尤其明显）。

**职责 B · 下一帧校正（next-frame correction）— `scrollToBottom`**

```ts
flatListRef.current?.scrollToOffset({ offset: 0, animated }); // 立刻滚
requestAnimationFrame(() => {
  flatListRef.current?.scrollToOffset({ offset: 0, animated: false }); // 下一帧再校正
});
```

原因：流式内容高度在本帧布局 pass 结束后才真正稳定（markdown 异步测量、文本换行、图片 `onLayout`），只滚一次常差最后几像素。第二次用 `animated: false` 硬贴底，避免与内容撑开竞争出「回弹」。

**职责 C · 取消并立即执行 — `followNow`**

```ts
const followNow = useCallback(() => {
  if (!shouldFollow()) return;
  if (followRafRef.current != null) {
    cancelAnimationFrame(followRafRef.current); // 撤掉排队中的帧回调
    followRafRef.current = null;
  }
  scrollToBottom(false); // 不等下一帧，马上贴底
}, [scrollToBottom, shouldFollow]);
```

用于「流开始 / 流结束」两个时刻——需要立即贴底，不能被排队中的帧回调延后。**清 ref 必须和 cancel 一起做**，否则句柄悬空会让后续 `scheduleFollow` 永远认为「已排过」而彻底失效。

**清理**：`useEffect(..., [])` 卸载时 `cancelAnimationFrame(followRafRef.current)`，避免对已卸载组件下发滚动指令。

#### 与 32ms 节流的分工（最容易被追问的点）

|          | 32ms throttle                                             | rAF 合帧                                 |
| -------- | --------------------------------------------------------- | ---------------------------------------- |
| 管什么   | **React 状态更新频率**（`setAssistantContent` → data 变） | **原生滚动指令频率**（`scrollToOffset`） |
| 频率     | ~30Hz（两帧一次）                                         | 每帧最多一次                             |
| 在哪执行 | JS 定时器                                                 | 帧回调（与 vsync 对齐）                  |

这就是「解耦」的精确含义：文本按 30Hz 更新，滚动仍按帧合并——即便一帧内文本更新两次（flush + 布局回调），滚动也只发生一次。

#### 为什么用 ref 而不是 state

`followRafRef` / `autoFollowRef` / `userDraggingRef` / `isProgrammaticScrollRef` / `isStreamingRef` / `wasStreamingRef` 全是 ref：① 被 rAF 回调与原生事件回调读取，必须拿**最新值**，state 会因闭包捕获旧值而判定错误；② 改变它们不应触发重渲染。`isStreamingRef.current = isStreaming` 直接在渲染期同步（不在 `useEffect` 里），保证事件回调读到本轮最新值；`shouldFollow` 用 `useCallback(..., [])` + 读 ref，保持身份稳定无过期闭包。

#### 一次 delta 到滚动的完整时序

```
throttle flush → setAssistantContent → streamRevision+1
  → React 重渲染 → FlatList data/extraData 变 → 最新气泡内容更新
  → CoachMessageBody.onLayout + FlatList.onContentSizeChange 触发
  → scheduleFollow：shouldFollow()? → 本帧未排过? → 排一个 rAF
  → 下一帧回调：清 ref → scrollToBottom(false)
      → markProgrammaticScroll()（置标记，120ms 后清）
      → scrollToOffset({offset:0}) + 再排 rAF 校正一次
  → 两次滚动触发的 onScroll 均被 120ms 标记窗口忽略（不会误判成"用户离开底部"）
```

#### 边界与诚实点

- 校正用的那个 rAF **没有存句柄、卸载时不取消**；靠 `flatListRef.current?.` 可选链兜底，无崩溃风险，最多浪费一帧回调（可优化项，面试可主动讲）。
- 跟随滚动一律 `animated: false`（贴底要"跟手"不要动画）；只有外部命令式 `scrollToEnd()`（`useImperativeHandle`）用 `animated: true`。
- 列表为空时 `scrollToBottom` 直接 return，避免对空列表下发滚动。
- JS 线程繁忙时 rAF 回调会被推迟——这恰好是想要的：不加重卡顿；节流降低了 JS 负载，反过来又让 rAF 更准时，两者协同。
- 不用 `InteractionManager.runAfterInteractions`：那是「等交互动画结束再跑非关键任务」，语义是延迟执行，不适合「每帧跟随」。
- 不用 `FlatList.scrollToEnd()`：inverted 列表下容易抖动/回弹，且需测量 contentSize；`scrollToOffset({offset:0})` 是确定性操作。

#### 可能的追问预答

| 追问                               | 回答                                                                                                     |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------- |
| rAF 和 setTimeout(16) 有什么区别？ | rAF 与 vsync 对齐、后台自动暂停、同帧多次调度天然合并且不会堆积；定时器只是"到点执行"，与渲染节奏无关    |
| 为什么不干脆用 rAF 做节流？        | rAF = 每帧一次 = 60Hz，比现在贵一倍；且 markdown 全量 parse 成本高，30Hz 视觉已连续，没必要吃满帧预算    |
| 为什么第二次校正不 animated？      | 与内容撑开同步时动画会互相竞争产生回弹，硬贴底更稳                                                       |
| 一帧内滚动多次会怎样？             | 重复 layout/滚动指令，Android 上可见抖动；这正是 `followRafRef` 去重要解决的                             |
| 用户快速反复拖拽会怎样？           | `userDraggingRef` 期间 `shouldFollow()` 恒为 false，不排任何 rAF；松手后按最终位置一次性判定是否恢复跟随 |
