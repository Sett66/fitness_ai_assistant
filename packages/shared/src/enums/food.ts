import { z } from 'zod';

/** 食物数据来源 —— 内置 / 用户自建 / AI 估算（PRD §5.2、ARCH §4） */
export const FOOD_SOURCE_VALUES = ['OFFICIAL', 'USER', 'AI_ESTIMATE'] as const;
export const FoodSourceSchema = z.enum(FOOD_SOURCE_VALUES);
export type FoodSource = z.infer<typeof FoodSourceSchema>;
