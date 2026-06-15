import { LLM_MODELS } from '@fitness/shared';

import { createQwenVlClient } from '../../llm/qwen-vl';
import type { JsonChatClient, LlmUsage } from '../../llm/types';
import { parseJsonWithSchema } from '../../parsers/json-zod';
import { COACH_IMAGE_DESCRIBE_PROMPT } from '../../prompts/coach-image-describe';
import { DescribeCoachImagesInputSchema, DescribeCoachImagesOutputSchema } from './schema';

export type DescribeCoachImagesResult = {
  descriptions: string[];
  augmentedUserText: string;
  usage: LlmUsage;
  rawText: string;
};

export function buildAugmentedUserText(descriptions: string[], userText?: string): string {
  const lines = descriptions.map((desc, index) => `图${index + 1}：${desc.trim()}`);
  const imageBlock = `[用户附带了 ${descriptions.length} 张图片]\n${lines.join('\n')}`;
  const trimmed = userText?.trim();
  return trimmed ? `${imageBlock}\n\n用户消息：${trimmed}` : imageBlock;
}

export async function describeCoachImages(
  input: unknown,
  options?: { model?: string; client?: JsonChatClient },
): Promise<DescribeCoachImagesResult> {
  const parsedInput = DescribeCoachImagesInputSchema.parse(input);
  const userHint = parsedInput.userText?.trim()
    ? `\n用户同时发送的文字：${parsedInput.userText.trim()}`
    : '';

  const response = await (options?.client ?? createQwenVlClient()).generateJson({
    model: options?.model ?? LLM_MODELS.QWEN_VL_MAX,
    temperature: 0.2,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: `${COACH_IMAGE_DESCRIBE_PROMPT}${userHint}` },
          ...parsedInput.imageUrls.map((url) => ({
            type: 'image_url' as const,
            image_url: { url },
          })),
        ],
      },
    ],
  });

  const parsed = parseJsonWithSchema(
    DescribeCoachImagesOutputSchema,
    response.text,
    'CoachImageDescribe',
  );

  if (parsed.descriptions.length !== parsedInput.imageUrls.length) {
    parsed.descriptions = parsedInput.imageUrls.map(
      (_, index) => parsed.descriptions[index] ?? '（未能识别图片内容）',
    );
  }

  return {
    descriptions: parsed.descriptions,
    augmentedUserText: buildAugmentedUserText(parsed.descriptions, parsedInput.userText),
    usage: response.usage,
    rawText: response.text,
  };
}
