# SOCIAL-06 — 内容审核：关键词同步拦截 + LLM 先发后审

| 字段           | 值                                               |
| -------------- | ------------------------------------------------ |
| **Type**       | AFK                                              |
| **Blocked by** | [SOCIAL-01](./SOCIAL-01.md)                      |
| **Blocks**     | SOCIAL-07                                        |
| **软依赖**     | [SOCIAL-04](./SOCIAL-04.md)（索引删除，见 §4.5） |
| **估时**       | 1.5–2 天                                         |
| **状态**       | ⬜ 未开工                                        |

---

## 1. 目标

落地 ARCHITECTURE §9 承诺的「简单内容审核（关键词 + LLM 兜底）」，采用**先发后审**：

- 发帖 / 发评论时同步过关键词表，命中直接 400 不落库
- 帖子以 `moderation = PENDING` 创建并**立即可见**，异步 LLM 判定后回写 `APPROVED` / `REJECTED`
- 被拒帖子对他人不可见，作者仍能看到它与拒绝原因

---

## 2. 背景 / 可复用基建

- `Post.moderation` / `moderationReason` 列与 `AiTaskType.SOCIAL_MODERATE` 枚举值已由 SOCIAL-01 的 migration 建好，本切片**不加 migration**
- feed / 详情 / 搜索的过滤条件 `moderation: { not: 'REJECTED' }` 已在 01 / 05 写好，本切片只负责把状态真正流转起来
- AI 异步范式：`apps/api/src/workers/ai-task.processor.ts` 的 `dispatch()` 分支 + `AiRun` 记账
- ai-core 链范式：`packages/ai-core/src/chains/` 下已有 `meal-vision` / `coach-chat` / `report-extract` 三例
- `COACH_AGENT_ENABLED` 展示了「布尔开关型 env」的既有写法

---

## 3. 前置阅读

1. [ADR 0011](../../adr/0011-social-feed-and-search.md) §7、§13（**先发后审的判据与配额规则**）
2. `apps/api/src/workers/ai-task.processor.ts`（`dispatch` 分支与失败处理）
3. `packages/ai-core/src/chains/report-extract/`（Zod 解析 + 重试范式）
4. `packages/shared/src/constants/limits.ts`、`packages/shared/src/constants/ai-task.ts`

---

## 4. 详细规格

### 4.1 关键词表（`packages/shared/src/constants/social-moderation.ts`）

```ts
/**
 * 同步拦截词表。demo 用途，仅收录少量示例词；
 * 真实项目应接入词库服务，这里只验证链路。
 */
export const BANNED_KEYWORDS: readonly string[] = [
  /* 广告 / 引流 / 辱骂类示例词 */
];

/** 命中返回第一个匹配词，未命中返回 null。大小写不敏感，去除空白后匹配 */
export function findBannedKeyword(text: string): string | null;
```

要求：

- **不要**在仓库里堆真实敏感词大列表，收录 5–10 个中性示例词即可，注释说明可扩展
- 匹配前先归一化（`toLowerCase()` + 去除空白与常见分隔符），避免「深\_蹲」式绕过——但不做复杂的变体识别，那是词库服务的职责
- 纯函数，配单测

### 4.2 同步拦截

`posts.service.createPost` 与 `comments.service.createComment` 的**第一步**（在 Zod 校验之后、任何 DB 写入之前）：

```ts
const hit = findBannedKeyword(body);
if (hit) {
  throw new BizException('SOCIAL_CONTENT_REJECTED', errorMessagesZhCN.SOCIAL_CONTENT_REJECTED, 400);
}
```

错误码 `'SOCIAL_CONTENT_REJECTED'` + 文案「内容包含不允许发布的词语，请修改后重试」。**不要**在响应里回带命中的具体词（等于告诉刷子怎么绕）。

评论只做同步关键词，**不走 LLM 审核**——评论量大、单条价值低，为每条评论调一次 LLM 不划算。

### 4.3 环境开关

`SOCIAL_MODERATION_ENABLED`（`'true'` / `'false'`，默认 `'true'`），照抄 `COACH_AGENT_ENABLED` 在 `env.schema.ts` / `EnvShape` / `mapEnv` 的三处写法。

`false` 时：发帖直接以 `moderation = 'APPROVED'` 创建，**不入队**。这保证无 DeepSeek 额度时社区依然完全可用。

### 4.4 异步 LLM 审核

**入队**（`posts.service.createPost`，事务提交后）：

```ts
const run = await this.prisma.client.aiRun.create({
  data: {
    userId,
    taskType: 'SOCIAL_MODERATE',
    model: LLM_MODELS.DEEPSEEK_V4_FLASH,
    status: 'QUEUED',
    inputJson: { postId: post.id },
  },
});
await this.aiQueue.add(AI_TASK_JOB_NAME, { aiRunId: run.id });
```

**配额纪律（ADR 0011 §13）**：**不调用** `assertDailyLimit`。审核是系统行为，计入 PRD §7 的用户每日 AI 配额会导致发几条帖就耗光计划生成额度。同时**不在** `AI_TASK_DAILY_LIMITS` 里登记 `SOCIAL_MODERATE`。

**ai-core 链**（`packages/ai-core/src/chains/social-moderate/`）：

```ts
runSocialModerate(
  { body: string },
  options?: { model?: string },
): Promise<{ result: { decision: 'APPROVED' | 'REJECTED'; reason: string }, usage: LlmUsage }>
```

- prompt 放 `packages/ai-core/src/prompts/social-moderate.ts`，约束：只判断是否违反社区规范（色情 / 暴力 / 政治敏感 / 广告引流 / 人身攻击），**健身相关的争议内容（如激进饮食法、非处方补剂讨论）一律放行**——这是健身社区，不是医疗平台，过度拦截比漏拦更伤体验
- 低温度；`reason` 限 100 字以内、中文；用 `parseJsonWithSchema` + 现有重试

**Processor 分支**（`ai-task.processor.ts` 的 `dispatch`）：

```ts
if (taskType === 'SOCIAL_MODERATE') {
  return this.dispatchSocialModerate(userId, clientInput);
}
```

`dispatchSocialModerate` 的职责：

1. 从 `inputJson.postId` 取帖子（不存在或已软删 → 直接返回 `{ outputJson: { skipped: true }, usage: 零 }`，不报错）
2. 调 `runSocialModerate({ body: post.body })`
3. 回写 `Post.moderation` 与 `moderationReason`（`APPROVED` 时 reason 置 `null`）
4. `REJECTED` 时 enqueue `{ op: 'DELETE_POST', id: postId }` 到索引队列（见 §4.5）
5. 返回 `{ outputJson: { decision, reason }, usage }` 供 `AiRun` 记账

**失败兜底**：LLM 调用失败时 `AiRun` 走现有的 `FAILED` 分支与退避重试；帖子**保持 `PENDING` 且保持可见**。宁可漏审也不要因为审核服务不可用而让用户的帖子凭空消失。在 `process()` 的 catch 里**不要**给 `SOCIAL_MODERATE` 加特殊的状态回写。

### 4.5 与 SOCIAL-04 的衔接

`REJECTED` 后需要把帖子从检索索引删除。

- 若 SOCIAL-04 **已交付**：直接注入索引队列 enqueue `DELETE_POST`
- 若 SOCIAL-04 **尚未交付**：本切片只写 DB 状态，并在 `dispatchSocialModerate` 内留一行 `// TODO(SOCIAL-04): enqueue DELETE_POST` 注释；SOCIAL-04 落地时按其 §4.4 的入队点表补上

搜索侧的兜底是双保险：SOCIAL-05 的搜索回库时本来就带 `moderation: { not: 'REJECTED' }` 过滤，因此即使索引删除延迟或遗漏，被拒帖子也不会出现在搜索结果里。

### 4.6 移动端

- **发帖被同步拦截**：`SOCIAL_CONTENT_REJECTED` 400 时在发帖页展示错误提示，**保留用户已输入的内容与已选图片**（不要清空重来）
- **被拒帖子的展示**：在 `SocialUserScreen`（本人）里，`moderation === 'REJECTED'` 的帖子卡片顶部加一条醒目提示条：「该动态未通过审核，仅自己可见 · {moderationReason}」
- **`PENDING` 不做任何特殊 UI**：先发后审的前提就是用户无感，不要显示「审核中」造成焦虑

---

## 5. 建议改动文件

| 路径                                                      | 动作                              |
| --------------------------------------------------------- | --------------------------------- |
| `packages/shared/src/constants/social-moderation.ts`      | 词表 + `findBannedKeyword` + 单测 |
| `packages/shared/src/errors/codes.ts` + `i18n/zh-CN.ts`   | `SOCIAL_CONTENT_REJECTED`         |
| `packages/ai-core/src/chains/social-moderate/`            | 新建审核链                        |
| `packages/ai-core/src/prompts/social-moderate.ts`         | 新建 prompt                       |
| `packages/ai-core/src/index.ts`                           | 导出                              |
| `apps/api/src/config/env.schema.ts`                       | `SOCIAL_MODERATION_ENABLED`       |
| `apps/api/src/modules/social/posts.service.ts`            | 同步拦截 + 入队                   |
| `apps/api/src/modules/social/comments.service.ts`         | 同步拦截                          |
| `apps/api/src/workers/ai-task.processor.ts`               | `SOCIAL_MODERATE` 分支            |
| `apps/mobile/src/features/social/PostComposerScreen.tsx`  | 拦截错误提示（保留输入）          |
| `apps/mobile/src/features/social/components/PostCard.tsx` | 被拒提示条                        |

---

## 6. Acceptance criteria

- [ ] `pnpm typecheck` 全仓通过；`findBannedKeyword` 有单测（含归一化绕过用例）
- [ ] 发含拦截词的帖 / 评论返回 400 `SOCIAL_CONTENT_REJECTED`，**数据库无记录**，且响应不回带命中词
- [ ] 正常发帖立即出现在 feed（`PENDING` 可见），数秒后 `moderation` 变为 `APPROVED`
- [ ] 构造一条会被 LLM 判违规的帖子：变为 `REJECTED` 后从他人 feed / 搜索消失，作者主页仍可见并显示拒绝原因
- [ ] 连发 6 条帖**不会**触发 `AI_TASK_LIMIT_EXCEEDED`（审核不计入用户配额）
- [ ] 每条审核产生一条 `AiRun(SOCIAL_MODERATE)`，含 token 与 cost
- [ ] `SOCIAL_MODERATION_ENABLED=false` 时发帖直接 `APPROVED` 且无 `AiRun` 产生
- [ ] 断开 LLM（如清空 key）后发帖仍成功，帖子停留在 `PENDING` 且**保持可见**
- [ ] 健身相关的争议内容（如「我在做 500 kcal 极低热量减脂」）不被误拦

---

## 7. 验证步骤

```powershell
pnpm typecheck
pnpm --filter shared build
pnpm --filter api start:api      # 需 DeepSeek Key
pnpm --filter api start:worker
# 手测：正常帖 → 观察 moderation PENDING→APPROVED
# 手测：含拦截词 → 400
# 手测：SOCIAL_MODERATION_ENABLED=false 重启 → 直接 APPROVED
```

---

## 8. 不做

- 评论走 LLM 审核（只做同步关键词）
- 图片内容审核（VLM 鉴黄）
- 举报入口与人工复审后台（ADR 0011 §7：无后台则举报是装饰）
- 用户封禁、发帖频率限制
- 申诉流程

---

## 9. 交付物 / 下游

| 交付物                                       | 消费者                               |
| -------------------------------------------- | ------------------------------------ |
| `moderation` 状态流转 + `SOCIAL_MODERATE` 链 | SOCIAL-07（验收脚本断言状态变化）    |
| `findBannedKeyword`                          | 未来任何 UGC 入口（伙伴匹配 bio 等） |
| `SOCIAL_MODERATION_ENABLED` 开关             | 无 LLM 额度时的本地开发与 CI         |
