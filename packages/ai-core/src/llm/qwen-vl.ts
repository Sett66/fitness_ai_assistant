import { LLM_MODELS } from '@fitness/shared';
import { OpenAiCompatibleJsonClient } from './openai-compatible';

export const createQwenVlClient = () =>
  new OpenAiCompatibleJsonClient({
    providerName: 'Qwen-VL',
    apiKey: process.env.DASHSCOPE_API_KEY,
    baseUrl: process.env.DASHSCOPE_BASE_URL ?? 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    defaultModel: LLM_MODELS.QWEN_VL_MAX,
    inputTokenCnyPer1K: 0,
    outputTokenCnyPer1K: 0,
  });
