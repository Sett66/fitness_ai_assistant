# SOCIAL-07 — seed 演示数据 + 端到端验收脚本

| 字段           | 值                                                                                                                 |
| -------------- | ------------------------------------------------------------------------------------------------------------------ |
| **Type**       | AFK                                                                                                                |
| **Blocked by** | [SOCIAL-02](./SOCIAL-02.md)、[SOCIAL-03](./SOCIAL-03.md)、[SOCIAL-05](./SOCIAL-05.md)、[SOCIAL-06](./SOCIAL-06.md) |
| **Blocks**     | —                                                                                                                  |
| **估时**       | 1 天                                                                                                               |
| **状态**       | ✅ 已完成（seed 幂等 + verify:seed + 验收脚本已过；移动端演示账号手测待确认）                                      |

---

## 1. 目标

社区是本项目第一个**依赖他人数据**才能验收的功能：单账号下广场、搜索、点赞他人、评论他人全是空列表。本切片补齐两件事并关闭整个 Epic：

- **seed**：让广场一打开就有内容，可以浏览、翻页、搜索、给别人点赞评论
- **验收脚本**：证明「发帖 → 审核 → 索引 → 搜到 → 点赞 → 计数正确」端到端通

---

## 2. 背景 / 可复用基建

- `packages/db/prisma/seed.ts` + `packages/db/scripts/verify-seed.mjs` 是既有的 seed 基建（动作库 / 食物库）
- `scripts/m2-acceptance.ps1` / `m4-acceptance.ps1` / `m5-agent-acceptance.ps1` 是既有的 PowerShell 验收脚本范式
- `pnpm --filter api reindex:social`（SOCIAL-04）用于 seed 后重建索引
- 密码哈希用 argon2，与 `auth.service` 的注册路径保持一致

---

## 3. 前置阅读

1. [ADR 0011](../../adr/0011-social-feed-and-search.md) §16
2. `packages/db/prisma/seed.ts`、`packages/db/package.json` 的 scripts 段
3. `scripts/m4-acceptance.ps1`（HTTP 验收脚本的组织方式）
4. [SOCIAL-04](./SOCIAL-04.md) §4.5（reindex 脚本）

---

## 4. 详细规格

### 4.1 社交 seed（`packages/db/prisma/seed-social.ts`）

**独立于产品数据 seed**：`seed.ts` 灌的是动作库 / 食物库这类**产品数据**，社交演示用户属于**测试数据**，两者生命周期不同，混在一起会让人不敢在真实环境跑 seed。

`packages/db/package.json` 增 `"seed:social": "tsx prisma/seed-social.ts"`；`argon2` 加入 `packages/db` 的依赖（seed 需要算密码哈希）。

内容规格：

| 项       | 规格                                                                                                                                          |
| -------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| 演示用户 | 4 个，手机号 `13900000001`–`13900000004`，统一密码 `Demo@12345`，`displayName` 分别为「铁馆老张」「减脂中的小李」「深蹲爱好者」「新手第一天」 |
| 档案     | 每人一条 `Profile`（性别 / 身高 / 体重 / 目标各异），让用户主页不空                                                                           |
| 帖子     | 每人 6–7 条（共 27 条），跨 `createdAt`（过去 30 天内确定性散列），`visibility: 'PUBLIC'`，`moderation: 'APPROVED'`                           |
| 评论     | 每帖 0–5 条，作者为其他演示用户，少量带 `parentId`                                                                                            |
| 点赞     | 随机分布，**且 `likeCount` / `commentCount` 必须与实际行数一致**                                                                              |

实现要点：

- **幂等**：以手机号 `upsert` 用户；帖子用固定的确定性 id（如 `seed-post-001`）`upsert`，重复执行不会翻倍
- **计数一致**：写完 reaction / comment 后，用一次 `groupBy` 回算并 `update` 每帖的 `likeCount` / `commentCount`，**不要**在插入时手工累加——seed 里的计数错误会让 SOCIAL-02 / 03 的验收失去意义
- **帖子文案**要像真人发的健身内容（训练感受、饮食、器械、进度），且**关键词分布可搜**：至少 3 条含「深蹲」、3 条含「减脂」、2 条含「卧推」，供搜索验收使用
- **不造图片**：seed 无法往 MinIO 写对象，`mediaIds` 一律为空数组；带图场景手测覆盖
- `moderation` 直接给 `APPROVED`，不触发 LLM（seed 不应产生 AI 成本）

跑完后提示用户执行 `pnpm --filter api reindex:social` 让 seed 数据进入检索索引——**这一步必须在脚本输出里明确打印**，否则搜索会「明明有帖子却搜不到」。

### 4.2 seed 校验（`packages/db/scripts/verify-seed.mjs`）

在现有校验里追加社交断言（仅当社交 seed 跑过时）：

- 演示用户数 ≥ 4
- 帖子数 ≥ 24（4 人 × 6–7 条）
- **计数一致性**：不存在 `likeCount != 实际 reaction 行数` 或 `commentCount != 未删评论行数` 的帖子

第三条是最有价值的断言——它同时守住了 seed 与 SOCIAL-02 / 03 的计数纪律。

### 4.3 验收脚本（`scripts/social-acceptance.ps1`）

仿 `m4-acceptance.ps1`，参数 `-BaseUrl`（默认 `http://localhost:3000`）、`-SkipModeration`（无 LLM 额度时跳过审核相关断言）、`-SkipSearch`（无 Meili 时跳过）。

步骤：

| #   | 动作                                             | 断言                                                              |
| --- | ------------------------------------------------ | ----------------------------------------------------------------- |
| 1   | 注册 / 登录两个测试账号 A、B                     | 拿到各自 token                                                    |
| 2   | A 发一条含唯一随机词的帖（如 `深蹲 acc-{guid}`） | 201，返回 `moderation`、`likeCount = 0`                           |
| 3   | 轮询 `GET /social/posts/:id`                     | `moderation` 在 30s 内变为 `APPROVED`（`-SkipModeration` 时跳过） |
| 4   | 轮询 `GET /social/search?q={随机词}`             | 30s 内命中该帖（`-SkipSearch` 时跳过）                            |
| 5   | B `PUT /like` **3 次**                           | `likeCount` 恒为 1（幂等）                                        |
| 6   | B `DELETE /like` 2 次                            | `likeCount` 恒为 0，不为负                                        |
| 7   | B 评论 2 条，删 1 条                             | `commentCount` 为 1                                               |
| 8   | A 发含拦截词的帖                                 | 400 `SOCIAL_CONTENT_REJECTED`                                     |
| 9   | B 尝试删 A 的帖                                  | 404                                                               |
| 10  | A 删自己的帖                                     | 204；`GET` 返回 404；搜索不再命中                                 |
| 11  | 全程检查任一响应体                               | **不含 `phone` 字段**                                             |

失败即 `exit 1` 并打印失败步骤，成功打印绿色汇总。第 11 步用一次全局的响应文本扫描实现即可（把每次响应 JSON 累积起来，最后 `-match '"phone"'` 断言为假）。

### 4.4 文档收口

- `README.md`：Roadmap 增社区行、「当前进展」增条目、文档索引增 `docs/issues/social/README.md`
- `docs/issues/social/README.md`：状态改为已交付，切片表状态列打勾
- `README.md` 的「日常开发命令」增 `pnpm --filter db seed:social` 与 `.\scripts\social-acceptance.ps1`

---

## 5. 建议改动文件

| 路径                                  | 动作                          |
| ------------------------------------- | ----------------------------- |
| `packages/db/prisma/seed-social.ts`   | 新建                          |
| `packages/db/package.json`            | `seed:social` script + argon2 |
| `packages/db/scripts/verify-seed.mjs` | 社交断言（含计数一致性）      |
| `scripts/social-acceptance.ps1`       | 新建                          |
| `README.md`                           | Roadmap / 进展 / 命令 / 索引  |
| `docs/issues/social/README.md`        | 状态收口                      |

---

## 6. Acceptance criteria

- [x] `pnpm --filter db seed:social` 幂等：连跑两次，用户与帖子数量不变
- [x] seed 后广场首屏有内容，可翻至少 2 页（27 帖 / limit 20）
- [x] `pnpm --filter db verify:seed` 通过，含计数一致性断言
- [x] `pnpm --filter api reindex:social` 后能搜到 seed 帖子（「深蹲」至少 3 条命中）
- [x] `.\scripts\social-acceptance.ps1` 全绿；`-SkipModeration -SkipSearch` 组合也能跑通
- [x] 验收脚本第 11 步确认所有社交响应无 `phone` 字段
- [x] 用演示账号登录移动端，能看到他人帖子并点赞、评论
- [x] README 与切片索引状态已更新

---

## 7. 验证步骤

```powershell
docker compose -f docker/docker-compose.yml up -d
pnpm --filter db migrate:dev
pnpm --filter db seed
pnpm --filter db seed:social
pnpm --filter db verify:seed
pnpm --filter api reindex:social
pnpm --filter api start:api
pnpm --filter api start:worker
.\scripts\social-acceptance.ps1
```

---

## 8. 不做

- 造带图的 seed 帖子（MinIO 对象无法在 seed 内凭空生成）
- 自动化 E2E（Detox 等）
- 压测与性能基线

---

## 9. 交付物 / 下游

| 交付物                         | 消费者                            |
| ------------------------------ | --------------------------------- |
| `seed:social` + 计数一致性校验 | 后续任何社区改动的回归基线        |
| `social-acceptance.ps1`        | Epic 关闭凭据；后续改动的冒烟测试 |
| README / 索引收口              | 社区 Epic 正式关闭                |
