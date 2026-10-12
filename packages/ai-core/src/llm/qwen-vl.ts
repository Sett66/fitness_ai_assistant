import { LLM_MODELS } from '@fitness/shared';
import { OpenAiCompatibleJsonClient } from './openai-compatible';

const DEFAULT_QWEN_VL_MODEL = 'qwen3-vl-plus';

/**
 * 实际调用的视觉模型：`QWEN_VL_MODEL` 环境变量，缺省 `qwen3-vl-plus`。
 * `LLM_MODELS.QWEN_VL_MAX` 视为「默认视觉模型」别名（旧客户端仍会传 `qwen-vl-max`，DashScope 已下线）。
 */
export const resolveQwenVlModel = (requested?: string): string => {
  const configured = process.env.QWEN_VL_MODEL?.trim() || DEFAULT_QWEN_VL_MODEL;
  if (!requested || requested === LLM_MODELS.QWEN_VL_MAX) return configured;
  return requested;
};

export const createQwenVlClient = () =>
  new OpenAiCompatibleJsonClient({
    providerName: 'Qwen-VL',
    apiKey: process.env.DASHSCOPE_API_KEY,
    baseUrl: process.env.DASHSCOPE_BASE_URL ?? 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    defaultModel: resolveQwenVlModel(),
    inputTokenCnyPer1K: 0,
    outputTokenCnyPer1K: 0,
  });
