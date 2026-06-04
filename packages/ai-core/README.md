# @fitness/ai-core

Fitness AI Assistant 的 AI 工作流核心包。M3 已落地：

- `llm/deepseek.ts`: DeepSeek OpenAI-compatible JSON 客户端
- `llm/qwen-vl.ts`: DashScope compatible Qwen-VL JSON 客户端
- `chains/meal-vision`: 餐食图片识别（Qwen-VL）+ 可选 DeepSeek 营养建议，输出校验 `MealVisionResultSchema`
- `graphs/plan-generator`: 训练 / 饮食计划生成最小图路径，输出走 Zod 校验
- `parsers/json-zod.ts`: 从 LLM 文本中抽取 JSON 并用 Zod 解析

## 环境变量

```powershell
DEEPSEEK_API_KEY=...
DEEPSEEK_BASE_URL=https://api.deepseek.com/v1
DASHSCOPE_API_KEY=...
```

`DEEPSEEK_BASE_URL` 可省略，默认 `https://api.deepseek.com/v1`。
`DASHSCOPE_BASE_URL` 也可覆盖，默认 `https://dashscope.aliyuncs.com/compatible-mode/v1`。

无 API Key 时，调用会抛出 `AI_CORE_MISSING_API_KEY`，worker 会把对应 `AiRun` 标为 `FAILED` 并写入 `errorMsg`。

## 输入约定

`MEAL_VISION` 的 `inputJson`（HTTP 投递；Worker 会自动注入 `nutritionContext`）：

```json
{
  "imageUrl": "https://example.com/meal.jpg",
  "notes": "可选补充说明",
  "mealType": "LUNCH",
  "saveMealLog": true,
  "timezoneOffsetMinutes": 480
}
```

`PLAN_GENERATE_WORKOUT` / `PLAN_GENERATE_MEAL` 的 `inputJson`（Worker 会自动合并用户 Profile / 力量数据 / 今日饮食快照）：

```json
{
  "mesocycleWeeks": 4,
  "goal": "减脂",
  "profile": {},
  "strengthLevels": {},
  "notes": "可选偏好"
}
```

## 验证

```powershell
pnpm --filter @fitness/shared build
pnpm --filter @fitness/ai-core typecheck
pnpm --filter @fitness/ai-core build
pnpm --filter @fitness/ai-core lint
```
