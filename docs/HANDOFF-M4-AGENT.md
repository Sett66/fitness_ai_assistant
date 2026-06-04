# M4 / Coach 增量交接（会话摘要）

> **日期**：2026-06-04  
> **用途**：补充 [`HANDOFF-M4.md`](./HANDOFF-M4.md) / [`HANDOFF-M4-REMAINING.md`](./HANDOFF-M4-REMAINING.md)，记录 M4 主体完成后的增量与产品决定。  
> **当前入口**：[`HANDOFF-M4-REMAINING.md`](./HANDOFF-M4-REMAINING.md)（收口清单）· 根 [`README.md`](../README.md)

---

## 1. 阶段判断

| 阶段                  | 状态                                                                       |
| --------------------- | -------------------------------------------------------------------------- |
| M0–M3                 | ✅                                                                         |
| **M4 移动端 MVP**     | **主体 ✅**（Auth、档案、仪表盘、训练、餐照、饮食日志、Onboarding 双计划） |
| **Coach（ADR 0007）** | **✅ 已联调**（多轮会话、SSE 流式 CHAT、Markdown 表格、倒置列表跟滚）      |
| **M4 正式关闭**       | ⬜ 见 REMAINING §6（验收脚本、部分 P1、文档曾滞后已同步）                  |
| M5                    | ⬜ APK CI、Sentry、真机联调文档                                            |

---

## 2. Coach 已交付（相对 HANDOFF-M4 原文）

| 能力                                         | 位置                                                                           |
| -------------------------------------------- | ------------------------------------------------------------------------------ |
| `Conversation` / `Message` 持久化            | `packages/db`、ADR [`0007`](./adr/0007-coach-conversation-and-chat.md)         |
| `POST /v1/conversations/:id/messages/stream` | SSE：`accepted` / `delta` / `done`                                             |
| `runCoachChatStream`                         | `packages/ai-core/src/chains/coach-chat/stream.ts`                             |
| Coach Tab                                    | `apps/mobile/src/features/coach/CoachScreen.tsx`                               |
| 流式 UI                                      | `coach-stream-store`、`merge-stream-messages`、`ChatMessageList`（`inverted`） |
| Markdown + 表格                              | `CoachMessageBody` + `react-native-markdown-display`                           |
| 显式动作                                     | 生成训练/饮食计划、餐照、手动记餐（`ManualMealSheet`）等                       |

**后续（ADR 0007）**：推送替代轮询、LLM 意图路由、LangGraph 编排。

---

## 3. 产品决定（2026-06）

| 项                       | 决定                                                                                                                              |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------- |
| **首页「今日体重」卡片** | **不做**。体重保留在档案（`profile.weightKg`）及训练消耗估算（MET×体重）；仪表盘不单独展示体重/趋势。PRD F6 已加注。              |
| Coach 流式渲染           | 跟滚稳定后恢复 **流式 Markdown**（非结束才排版）；出字无节流，慢体感主要来自长文 Markdown 重算 + 流结束 `inferSuggestedActions`。 |

---

## 4. 移动端 Tab 结构（当前）

`首页` · `Coach` · `打卡` · `社区占位` · `我的`；计划列表在 Workout 栈（`PlanList` / `PlanDetail`）。

---

## 5. 关键文件（Coach）

```
apps/mobile/src/features/coach/
apps/mobile/src/api/endpoints/coach.ts
apps/api/src/modules/conversations/
packages/ai-core/src/chains/coach-chat/
docs/adr/0007-coach-conversation-and-chat.md
```

---

_文档版本：v1 · 2026-06-04_
