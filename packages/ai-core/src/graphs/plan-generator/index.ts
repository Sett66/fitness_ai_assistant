import { LLM_MODELS } from '@fitness/shared';
import { createDeepSeekClient } from '../../llm/deepseek';
import type { JsonChatClient, LlmUsage } from '../../llm/types';
import { parseJsonWithSchema } from '../../parsers/json-zod';
import { MEAL_PLAN_PROMPT, WORKOUT_PLAN_PROMPT } from '../../prompts/plan-generator';
import {
  GeneratedMealPlanSchema,
  GeneratedWorkoutPlanSchema,
  MealPlanGeneratorInputSchema,
  WorkoutPlanGeneratorInputSchema,
  type GeneratedMealPlan,
  type GeneratedWorkoutPlan,
} from './schema';

export type { GeneratedMealPlan, GeneratedWorkoutPlan } from './schema';

export type PlanGeneratorOutput<TPlan> = {
  result: TPlan;
  usage: LlmUsage;
  rawText: string;
};

export const runWorkoutPlanGenerator = async (
  input: unknown,
  options?: { model?: string; client?: JsonChatClient },
): Promise<PlanGeneratorOutput<GeneratedWorkoutPlan>> => {
  const parsedInput = WorkoutPlanGeneratorInputSchema.parse(input);
  const response = await (options?.client ?? createDeepSeekClient()).generateJson({
    model: options?.model ?? LLM_MODELS.DEEPSEEK_V4_PRO,
    messages: [
      { role: 'system', content: WORKOUT_PLAN_PROMPT },
      { role: 'user', content: JSON.stringify(parsedInput) },
    ],
  });
  return {
    result: parseJsonWithSchema(GeneratedWorkoutPlanSchema, response.text, 'WorkoutPlan'),
    usage: response.usage,
    rawText: response.text,
  };
};

export const runMealPlanGenerator = async (
  input: unknown,
  options?: { model?: string; client?: JsonChatClient },
): Promise<PlanGeneratorOutput<GeneratedMealPlan>> => {
  const parsedInput = MealPlanGeneratorInputSchema.parse(input);
  const response = await (options?.client ?? createDeepSeekClient()).generateJson({
    model: options?.model ?? LLM_MODELS.DEEPSEEK_V4_PRO,
    messages: [
      { role: 'system', content: MEAL_PLAN_PROMPT },
      { role: 'user', content: JSON.stringify(parsedInput) },
    ],
  });
  return {
    result: parseJsonWithSchema(GeneratedMealPlanSchema, response.text, 'MealPlan'),
    usage: response.usage,
    rawText: response.text,
  };
};
