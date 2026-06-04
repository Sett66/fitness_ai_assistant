import { z } from 'zod';

/** 饮食日志来源 —— 手动录入 / 拍照识别（PRD §3.1 F5） */
export const MEAL_LOG_SOURCE_VALUES = ['MANUAL', 'VISION'] as const;
export const MealLogSourceSchema = z.enum(MEAL_LOG_SOURCE_VALUES);
export type MealLogSource = z.infer<typeof MealLogSourceSchema>;

/** MealLogItem 条目来源标签 —— 与 FoodSource 同义；按 ARCH §4 单独建模便于审计 */
export const ITEM_SOURCE_TAG_VALUES = ['OFFICIAL', 'USER', 'AI_ESTIMATE'] as const;
export const ItemSourceTagSchema = z.enum(ITEM_SOURCE_TAG_VALUES);
export type ItemSourceTag = z.infer<typeof ItemSourceTagSchema>;
