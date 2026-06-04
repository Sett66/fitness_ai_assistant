import { z } from 'zod';

/** 训练分化类型 */
export const WORKOUT_SPLIT_TYPE_VALUES = ['FULL_BODY', 'UPPER_LOWER', 'PPL', 'BRO_SPLIT'] as const;
export const WorkoutSplitTypeSchema = z.enum(WORKOUT_SPLIT_TYPE_VALUES);
export type WorkoutSplitType = z.infer<typeof WorkoutSplitTypeSchema>;
