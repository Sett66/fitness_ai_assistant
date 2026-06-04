import type { MealVisionResult, NutritionDailySummary } from '@fitness/shared';
import { LLM_MODELS } from '@fitness/shared';
import { createQwenVlClient } from '../../llm/qwen-vl';
import type { JsonChatClient, LlmUsage } from '../../llm/types';
import { parseJsonWithSchema } from '../../parsers/json-zod';
import { MEAL_VISION_PROMPT } from '../../prompts/meal-vision';
import { mergeLlmUsage, runMealVisionAdvice } from './advice';
import {
  MealVisionItemsOnlySchema,
  RunMealVisionInputSchema,
  type RunMealVisionInput,
} from './schema';

export type MealVisionOutput = {
  result: MealVisionResult;
  usage: LlmUsage;
  rawText: string;
};

/** 仅 VLM 识图（阶段 1） */
export const runMealVision = async (
  input: unknown,
  options?: { model?: string; client?: JsonChatClient },
): Promise<MealVisionOutput> => {
  const parsedInput: RunMealVisionInput = RunMealVisionInputSchema.parse(input);
  const response = await (options?.client ?? createQwenVlClient()).generateJson({
    model: options?.model ?? LLM_MODELS.QWEN_VL_MAX,
    temperature: 0.1,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: `${MEAL_VISION_PROMPT}\n补充说明：${parsedInput.notes ?? '无'}` },
          { type: 'image_url', image_url: { url: parsedInput.imageUrl } },
        ],
      },
    ],
  });

  const itemsOnly = parseJsonWithSchema(
    MealVisionItemsOnlySchema,
    response.text,
    'MealVisionItems',
  );
  return {
    result: { items: itemsOnly.items },
    usage: response.usage,
    rawText: response.text,
  };
};

/** VLM 识图 + DeepSeek 营养建议（阶段 2，需 nutritionContext） */
export const runMealVisionWithAdvice = async (
  input: unknown,
  options?: { model?: string; visionClient?: JsonChatClient; adviceClient?: JsonChatClient },
): Promise<MealVisionOutput> => {
  const parsedInput = RunMealVisionInputSchema.parse(input);
  const vision = await runMealVision(parsedInput, {
    model: options?.model,
    client: options?.visionClient,
  });

  if (!parsedInput.nutritionContext) {
    return vision;
  }

  const ctx: NutritionDailySummary = parsedInput.nutritionContext;
  const mealKcal = vision.result.items.reduce((sum: number, item) => sum + item.kcal, 0);
  const contextWithMeal: NutritionDailySummary = {
    ...ctx,
    consumedKcal: ctx.consumedKcal + mealKcal,
    remainingKcal: ctx.remainingKcal - mealKcal,
  };

  const advice = await runMealVisionAdvice(
    {
      items: vision.result.items,
      nutritionContext: contextWithMeal,
      mealType: parsedInput.mealType,
      notes: parsedInput.notes,
    },
    { client: options?.adviceClient },
  );

  return {
    result: {
      items: vision.result.items,
      nutritionContext: contextWithMeal,
      advice: advice.result,
    },
    usage: mergeLlmUsage(vision.usage, advice.usage),
    rawText: `${vision.rawText}\n---\n${advice.rawText}`,
  };
};
