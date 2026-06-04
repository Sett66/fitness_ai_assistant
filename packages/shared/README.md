# @fitness/shared

端到端共享层：Zod schemas / 类型 / 枚举 / 常量 / 错误码 / 中文文案。

所有跨 `apps/api`、`apps/mobile`、`packages/ai-core` 共用的契约都在这里。
跨端类型从 schema 用 `z.infer<typeof XxxSchema>` 推导，**禁止两边手写同名 interface**（ARCH §8.1）。

## 目录

```
src/
├── schemas/            # Zod 定义，按 domain 拆
│   ├── _common.ts      # IdSchema / DateTimeSchema / MacrosSchema / Per100gSchema / 分页
│   ├── user.ts
│   ├── exercise.ts
│   ├── food.ts
│   ├── workout.ts
│   ├── plan.ts
│   ├── nutrition.ts    # 含 MealVisionResult（VLM 输出契约）
│   ├── media.ts        # 含 presigned 上传请求/响应
│   ├── ai-task.ts
│   └── phase2/         # Post / Comment / Reaction / PartnerProfile（仅 schema 形状）
├── enums/              # XXX_VALUES + XxxSchema + Xxx 三件套
├── constants/          # TDEE 系数 / 宏量比例缺省 / AI 限额 / Token TTL ...
├── errors/             # ErrorCode union + ApiErrorSchema + BizExceptionLike
├── i18n/zh-CN.ts       # 错误码 → 中文 + 术语字典
└── index.ts
```

## 用法

```ts
import {
  UserSchema,
  CreateUserSchema,
  type CreateUserInput,
  errorMessagesZhCN,
} from '@fitness/shared';

// 服务端
const data = CreateUserSchema.parse(req.body);

// 客户端
const userData: CreateUserInput = { phone: '13800000000', password: 'abcd1234' };
```

## 设计约定

- 每个核心实体提供 4 类 schema：`XxxSchema` / `CreateXxxSchema` / `UpdateXxxSchema` / `XxxResponseSchema`（脱敏）
- 枚举一律用 `as const` 元组 + `z.enum`，不用 TS `enum` 关键字
- ID 字段 `IdSchema` 仅校验长度（兼容 cuid2 / nanoid），格式严格校验留到 M2
- 时间字段统一 `z.coerce.date()`，前端发 ISO 字符串、Prisma 拿到 Date

## Phase 2 占位

`schemas/phase2/` 下的 social / partner 模型仅声明实体形状，**MVP 不开放对外 API**。
等 Phase 2 启用时再补 Create / Update / Response 系列。
