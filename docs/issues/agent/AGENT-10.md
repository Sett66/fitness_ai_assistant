# AGENT-10 — Agent 验收脚本与 M5 文档

| 字段           | 值                                                   |
| -------------- | ---------------------------------------------------- |
| **Type**       | AFK                                                  |
| **Wave**       | W4                                                   |
| **Blocked by** | [AGENT-07](./AGENT-07.md), [AGENT-08](./AGENT-08.md) |
| **Blocks**     | Epic 关闭                                            |
| **估时**       | 1–2 天                                               |

---

## 1. 目标

为 Coach 真 Agent Epic 提供 **可重复验收** 与 **接手文档**，使后续维护者无需读全量 PR 即可验证回归。

交付：

1. `scripts/m5-agent-acceptance.ps1`
2. `docs/HANDOFF-M5.md`（或扩展现有 README M5 节）
3. Geo 单测纳入 CI 说明

---

## 2. 背景

- 现有 [`scripts/m4-acceptance.ps1`](../../../scripts/m4-acceptance.ps1) 测非 Agent 路径（`COACH_AGENT_ENABLED=false`）
- Agent 需测：tool 链路、flag 回退、可选 enqueue
- 用户环境可能没有高德 Key → 脚本须支持 skip 开关

---

## 3. 前置阅读

1. [AGENT-06](./AGENT-06.md) ~ [AGENT-08](./AGENT-08.md) 验收标准
2. [`m4-acceptance.ps1`](../../../scripts/m4-acceptance.ps1)
3. [`docs/HANDOFF-M4-REMAINING.md`](../../HANDOFF-M4-REMAINING.md) §6 关闭定义（作格式参考）

---

## 4. 详细规格

### 4.1 `scripts/m5-agent-acceptance.ps1`

**参数**：

| 参数                 | 默认                       | 说明                                |
| -------------------- | -------------------------- | ----------------------------------- |
| `BaseUrl`            | `http://127.0.0.1:3000/v1` |                                     |
| `Phone` / `Password` | demo 账号                  |                                     |
| `-SkipCoachChat`     |                            | 无 DeepSeek 余额时跳过 LLM          |
| `-SkipGeoTools`      |                            | 无高德 Key 时跳过 POI 断言          |
| `-RequireAgent`      |                            | 若未设 `COACH_AGENT_ENABLED` 则失败 |

**建议步骤**（在 m4 基础上扩展）：

1. Auth（同 m4）
2. `GET /plans?type=MEAL`（保留）
3. **Agent CHAT**（非 stream 路径或 stream 若脚本可解析 SSE）：
   - 消息 A：`M5 agent weather check` + body 含 `locationContext` 固定坐标（上海）
   - 轮询 `ai/tasks` 或解析 stream 至 DONE
   - 断言：`outputJson.toolTrace` 含 `get_weather` 或 assistant 内容含温度相关词（`-SkipGeoTools` 时放宽）
4. 消息 B：`我下周去上海市出差，附近有什么健身房`
   - 断言：`toolTrace` 含 `geocode_place` 或 `search_nearby_gyms`（或回复含「健身」+ 地名）
5. **回退**：文档说明先 `COACH_AGENT_ENABLED=false` 再跑 `m4-acceptance.ps1` 必须绿

**SSE 注意**：若 PowerShell 解析 SSE 成本高，可复用 `POST .../messages`（Worker COACH_CHAT）测 toolTrace，与 m4 一致；在 HANDOFF 中说明 stream 与 non-stream 等价性。

### 4.2 `docs/HANDOFF-M5.md`

建议章节：

1. **阶段目标**：M5 = APK CI + Sentry + Agent Epic 验收
2. **环境变量表**：

   | 变量                  | 必需       | 说明       |
   | --------------------- | ---------- | ---------- |
   | `COACH_AGENT_ENABLED` | Agent 手测 | true/false |
   | `AMAP_WEB_KEY`        | Geo 手测   |            |
   | `DEEPSEEK_API_KEY`    | LLM        | 现有       |

3. **启动顺序**：docker → worker → api → mobile
4. **手测用例 3 条**（与 AGENT-07/08 一致）
5. **Epic 关闭检查表**（勾选框）
6. **链接** `docs/issues/agent/README.md`

### 4.3 CI

- 确认 `pnpm --filter api test` 含 AGENT-03 geo mock 测试
- 根 README「验收脚本」增加 `m5-agent-acceptance.ps1` 一行

### 4.4 更新 [`AGENT-ISSUES.md`](../../AGENT-ISSUES.md)

Epic 状态改为「实施完成待验收」；链到 HANDOFF-M5。

---

## 5. 建议改动文件

| 路径                              | 动作     |
| --------------------------------- | -------- |
| `scripts/m5-agent-acceptance.ps1` | 新建     |
| `docs/HANDOFF-M5.md`              | 新建     |
| `README.md`                       | 验收命令 |
| `docs/AGENT-ISSUES.md`            | 状态     |

---

## 6. Acceptance criteria

- [ ] `m5-agent-acceptance.ps1` 在 `COACH_AGENT_ENABLED=true` + Key 齐全时 exit 0
- [ ] `-SkipCoachChat` / `-SkipGeoTools` 文档化且可用
- [ ] `COACH_AGENT_ENABLED=false` 时 `m4-acceptance.ps1` exit 0
- [ ] HANDOFF-M5 含完整 env 与手测步骤

---

## 7. 验证步骤

```powershell
$env:COACH_AGENT_ENABLED='true'
pnpm --filter api start:worker
pnpm --filter api start:api
.\scripts\m5-agent-acceptance.ps1

$env:COACH_AGENT_ENABLED='false'
.\scripts\m4-acceptance.ps1
```

---

## 8. 不做

- GitHub Actions 跑 Agent 验收（可记 M5 后续，需 Key secret）
- E2E Detox

---

## 9. 交付物 / Epic 关闭

全部 AGENT-01~10 合并且本脚本通过后，Coach 真 Agent MVP 可标 **Done**。

并行轨道 `MEAL-QUALITY-01` 独立验收，不阻塞本 Epic。
