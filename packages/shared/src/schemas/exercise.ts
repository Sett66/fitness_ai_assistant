import { z } from 'zod';
import { ExerciseDifficultySchema, ExerciseEquipmentSchema, PrimaryMuscleSchema } from '../enums';
import { EntityBaseSchema, IdSchema } from './_common';

// ============================== Exercise ==============================

export const ExerciseSchema = EntityBaseSchema.extend({
  nameZh: z.string().min(1).max(64),
  nameEn: z.string().max(64).nullable().optional(),
  primaryMuscle: PrimaryMuscleSchema,
  secondaryMuscles: z.array(PrimaryMuscleSchema).max(8).default([]),
  equipment: ExerciseEquipmentSchema,
  difficulty: ExerciseDifficultySchema,
  isPreset: z.boolean(),
  ownerUserId: IdSchema.nullable().optional(),
  mediaUrl: z.string().url().nullable().optional(),
});
export type Exercise = z.infer<typeof ExerciseSchema>;

/**
 * 创建用户自建动作。
 * 用户自建动作 isPreset 固定 false，由后端写入，不接受客户端传入。
 */
export const CreateExerciseSchema = ExerciseSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  deletedAt: true,
  isPreset: true,
  ownerUserId: true,
});
export type CreateExerciseInput = z.infer<typeof CreateExerciseSchema>;

export const UpdateExerciseSchema = CreateExerciseSchema.partial();
export type UpdateExerciseInput = z.infer<typeof UpdateExerciseSchema>;

export const ExerciseResponseSchema = ExerciseSchema;
export type ExerciseResponse = z.infer<typeof ExerciseResponseSchema>;
