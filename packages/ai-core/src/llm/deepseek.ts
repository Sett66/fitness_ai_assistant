import { LLM_MODELS } from '@fitness/shared';
import { OpenAiCompatibleJsonClient } from './openai-compatible';

export const createDeepSeekClient = () =>
  new OpenAiCompatibleJsonClient({
    providerName: 'DeepSeek',
    apiKey: process.env.DEEPSEEK_API_KEY,
    baseUrl: process.env.DEEPSEEK_BASE_URL ?? 'https://api.deepseek.com/v1',
    defaultModel: process.env.DEEPSEEK_MODEL ?? LLM_MODELS.DEEPSEEK_V4_PRO,
    inputTokenCnyPer1K: 0,
    outputTokenCnyPer1K: 0,
  });
