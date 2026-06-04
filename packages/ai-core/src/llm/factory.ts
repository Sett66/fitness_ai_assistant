import { LLM_MODELS } from '@fitness/shared';
import { AiCoreError } from '../errors';
import { createDeepSeekClient } from './deepseek';
import type { JsonChatClient } from './types';
import { createQwenVlClient } from './qwen-vl';

export const createJsonClientForModel = (model: string): JsonChatClient => {
  if (model === LLM_MODELS.QWEN_VL_MAX || model.toLowerCase().includes('qwen')) {
    return createQwenVlClient();
  }
  if (
    model === LLM_MODELS.DEEPSEEK_V4_PRO ||
    model === LLM_MODELS.DEEPSEEK_V4_FLASH ||
    model === LLM_MODELS.DEEPSEEK_V3_2 ||
    model.toLowerCase().includes('deepseek')
  ) {
    return createDeepSeekClient();
  }
  throw new AiCoreError('AI_CORE_UNSUPPORTED_TASK', `不支持的模型：${model}`);
};
