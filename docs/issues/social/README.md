# 社区动态流 · 分切片实施文档

> **Epic**：Phase 2 社区 — 发帖 / 点赞 / 评论 / 搜索，公开广场模型
> **架构依据**：[ADR 0011](../../adr/0011-social-feed-and-search.md)（社区动态流：公开广场、外部检索与先发后审）
> **前提**：M0–M5 已关闭；体检报告 Epic（ADR 0009）已交付
> **状态（2026-08-17）**：已交付（SOCIAL-01～07）

## 给接手 Agent 的通用说明

复制下面整段到新会话开头，再附上你所负责切片的文档全文。

```
你是 Fitness AI Assistant monorepo 的实施 Agent，负责 docs/issues/social/SOCIAL-XX.md 所描述的单一切片。

环境：Windows + PowerShell；pnpm monorepo；bare React Native（禁止 Expo）。
契约：packages/shared 的 Zod 为唯一端到端真相；重大架构变更需 ADR。
硬性约束：
- 客户端禁止直连 LLM / 存储 / Meilisearch Key（ADR 0003/0004/0011）
- 重任务（LLM 审核、检索索引）仅在 BullMQ Worker；HTTP 只 enqueue
- 计数（likeCount/commentCount）必须在事务内维护，且幂等接口不得无条件 increment（ADR 0011 §5）
- User.phone 不得进入任何社交 DTO 或检索索引（ADR 0011 §9）
- 搜索失败不得静默降级到 ILIKE（ADR 0011 §8）
- 用户未明确要求不要 git commit；回复简体中文

本地启动：
pnpm install
docker compose -f docker/docker-compose.yml up -d
pnpm --filter db migrate:dev
pnpm --filter api start:worker
pnpm --filter api start:api
pnpm lint && pnpm typecheck

必读（按切片文档「前置阅读」为准）：
docs/issues/social/SOCIAL-XX.md
docs/adr/0011-social-feed-and-search.md
docs/ARCHITECTURE.md
```

## 切片列表

| ID        | 文档                           | 类型 | 阻塞          | 状态 | 交付                                             |
| --------- | ------------------------------ | ---- | ------------- | ---- | ------------------------------------------------ |
| SOCIAL-01 | [SOCIAL-01.md](./SOCIAL-01.md) | AFK  | ADR 0011      | ✅   | 发帖 + 广场 feed 闭环（含全部 migration）        |
| SOCIAL-02 | [SOCIAL-02.md](./SOCIAL-02.md) | AFK  | 01            | ✅   | 点赞：幂等接口 + 事务计数 + 乐观更新             |
| SOCIAL-03 | [SOCIAL-03.md](./SOCIAL-03.md) | AFK  | 01            | ✅   | 评论：单层平铺 + 帖子详情页                      |
| SOCIAL-04 | [SOCIAL-04.md](./SOCIAL-04.md) | AFK  | 01            | ✅   | 检索基建：Meili 容器 + SearchProvider + 索引队列 |
| SOCIAL-05 | [SOCIAL-05.md](./SOCIAL-05.md) | AFK  | 04            | ✅   | 搜索体验：搜索 API + 搜索页 + 用户主页           |
| SOCIAL-06 | [SOCIAL-06.md](./SOCIAL-06.md) | AFK  | 01（04 更佳） | ✅   | 内容审核：关键词 + LLM 先发后审                  |
| SOCIAL-07 | [SOCIAL-07.md](./SOCIAL-07.md) | AFK  | 02·03·05·06   | ✅   | seed 演示数据 + 端到端验收脚本                   |

### 依赖图

```
ADR 0011
   │
   ▼
SOCIAL-01 ─┬─► SOCIAL-02 ─┐
           ├─► SOCIAL-03 ─┤
           ├─► SOCIAL-04 ──► SOCIAL-05 ─┼─► SOCIAL-07
           └─► SOCIAL-06 ──────────────┘
```

**建议实施顺序**：ADR 0011 → 01 →（02 / 03 / 04 / 06 可并行）→ 05 → 07。

> **并行提示**：02 / 03 / 06 都会改 `PostSummarySchema` 与 `posts.service` 的映射函数，同时开多个会话时冲突集中在这两处；04 与它们几乎无交集，最适合并行。
>
> **06 的建议时机**：审核判定 `REJECTED` 时需要把帖子从检索索引删除。若 04 尚未交付，06 先只写 DB 状态，把索引删除的调用留到 04 落地后补（06 文档 §4.5 标注了该衔接点）。

## 关键决策速查（详见 ADR 0011）

- 纯公开广场，无 `Follow`；API 拒收 `FOLLOWERS` 可见性
- 文本 + 图片（最多 9 张）；结构化打卡附件本 Epic 不做
- `mediaIds String[]` 保留，服务层校验归属 / READY / 图片 mime；整页摊平一次查询防 N+1
- 只做 `LIKE`，`PUT` / `DELETE` 幂等；靠主键唯一约束 + `P2002` 判定是否真的 `increment`
- `likeCount` / `commentCount` 冗余列，全部在事务内维护
- 评论单层平铺，`parentId` 仅用于「回复 @某某」展示；`Comment` 补 `deletedAt`
- 帖子不可编辑；作者软删；系统下架用 `moderation = REJECTED`，不复用 `deletedAt`
- 检索用 Meilisearch，封装为 `SearchProvider`（meili / pg 双实现，env 显式切换，禁止隐式 fallback）
- 索引只存倒排（`{ id, userId, body, createdAtTs }`），展示数据一律回 Postgres → 点赞评论**不**触发重索引
- 索引同步走独立队列 `fitness-social-index`；必须有全量 reindex 脚本
- 搜索分页把 offset 编码进 cursor，保持 `{ cursor, limit }` + `nextCursor` 契约统一
- feed 排序 `[{ createdAt: 'desc' }, { id: 'desc' }]`，消除并列时间戳的翻页漏行
- 先发后审：同步关键词 400 + 异步 LLM 下架；落 `AiRun` 但**不计入**用户每日 AI 配额
- 路由前缀 `/v1/social/*`（对 ARCH §8.3 的有意偏离）
- 移动端五屏平铺进 `RootStack`；新建 `features/social/`，清理错置的 `features/coach/SocialPlaceholderScreen.tsx`
- 全部 schema 变更集中在 SOCIAL-01 的单次 migration `social_mvp`

## 完成后交接

每份切片文档末尾有 **「交付物 / 下游」**。合并前请：

1. 勾选文档内 Acceptance criteria
2. PR 描述链接 `SOCIAL-XX.md`
3. 若契约 / schema 变更，确保 `pnpm typecheck` 全仓通过
