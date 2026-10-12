/**
 * 推荐使用的 LLM 模型常量集合（ARCH §1）。
 * 非强约束：LlmModelSchema 接受任意字符串，便于版本升级。
 * 但项目内调用应统一从这里取，避免硬编码。
 */
export const LLM_MODELS = {
  /** DeepSeek V4 Pro（OpenAI-compatible），用于计划生成、餐照建议文案 */
  DEEPSEEK_V4_PRO: 'deepseek-v4-pro',
  /** DeepSeek V4 Flash，低成本快速路径 */
  DEEPSEEK_V4_FLASH: 'deepseek-v4-flash',
  /** @deprecated 部分账号已迁移至 V4，请用 DEEPSEEK_V4_PRO */
  DEEPSEEK_V3_2: 'deepseek-v3.2',
  /** 默认视觉模型别名（DashScope 已下线该名）；实际模型由 ai-core `resolveQwenVlModel` 按 `QWEN_VL_MODEL` 解析 */
  QWEN_VL_MAX: 'qwen-vl-max',
} as const;
export type LlmModelKey = keyof typeof LLM_MODELS;
export type LlmModelValue = (typeof LLM_MODELS)[LlmModelKey];
