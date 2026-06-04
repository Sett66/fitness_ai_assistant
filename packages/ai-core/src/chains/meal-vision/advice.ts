import { LLM_MODELS } from '@fitness/shared';
import { createDeepSeekClient } from '../../llm/deepseek';
import type { JsonChatClient, LlmUsage } from '../../llm/types';
import { parseJsonWithSchema } from '../../parsers/json-zod';
import { MEAL_ADVICE_PROMPT } from '../../prompts/meal-advice';
import {
  MealVisionAdviceOutputSchema,
  RunMealVisionAdviceInputSchema,
  type MealVisionAdviceOutput,
} from './advice-schema';

export type MealVisionAdviceResult = {
  result: MealVisionAdviceOutput;
  usage: LlmUsage;
  rawText: string;
};

export const runMealVisionAdvice = async (
  input: unknown,
  options?: { model?: string; client?: JsonChatClient },
): Promise<MealVisionAdviceResult> => {
  const parsed = RunMealVisionAdviceInputSchema.parse(input);
  const response = await (options?.client ?? createDeepSeekClient()).generateJson({
    model: options?.model ?? LLM_MODELS.DEEPSEEK_V4_PRO,
    messages: [
      { role: 'system', content: MEAL_ADVICE_PROMPT },
      {
        role: 'user',
        content: JSON.stringify({
          items: parsed.items,
          nutritionContext: parsed.nutritionContext,
          mealType: parsed.mealType,
          notes: parsed.notes ?? null,
        }),
      },
    ],
  });
  return {
    result: parseJsonWithSchema(MealVisionAdviceOutputSchema, response.text, 'MealVisionAdvice'),
    usage: response.usage,
    rawText: response.text,
  };
};

export const mergeLlmUsage = (a: LlmUsage, b: LlmUsage): LlmUsage => ({
  tokenIn: a.tokenIn + b.tokenIn,
  tokenOut: a.tokenOut + b.tokenOut,
  costCny: Number((a.costCny + b.costCny).toFixed(4)),
});
