import { z } from 'zod';

/** 账户角色 */
export const ROLE_VALUES = ['USER', 'ADMIN'] as const;
export const RoleSchema = z.enum(ROLE_VALUES);
export type Role = z.infer<typeof RoleSchema>;

/** 生理性别 */
export const GENDER_VALUES = ['MALE', 'FEMALE', 'OTHER'] as const;
export const GenderSchema = z.enum(GENDER_VALUES);
export type Gender = z.infer<typeof GenderSchema>;

/** 训练目标 —— 增肌 / 减脂 / 维持（PRD §5.2） */
export const GOAL_VALUES = ['MUSCLE_GAIN', 'FAT_LOSS', 'MAINTAIN'] as const;
export const GoalSchema = z.enum(GOAL_VALUES);
export type Goal = z.infer<typeof GoalSchema>;
