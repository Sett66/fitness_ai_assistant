import { z } from 'zod';

/** 主要发力肌群 */
export const PRIMARY_MUSCLE_VALUES = [
  'CHEST',
  'BACK',
  'SHOULDER',
  'BICEPS',
  'TRICEPS',
  'QUADS',
  'HAMSTRINGS',
  'GLUTES',
  'CALVES',
  'ABS',
  'FOREARMS',
  'OTHER',
] as const;
export const PrimaryMuscleSchema = z.enum(PRIMARY_MUSCLE_VALUES);
export type PrimaryMuscle = z.infer<typeof PrimaryMuscleSchema>;

/** 训练器械 */
export const EQUIPMENT_VALUES = [
  'BARBELL',
  'DUMBBELL',
  'MACHINE',
  'CABLE',
  'BODYWEIGHT',
  'KETTLEBELL',
  'BAND',
  'OTHER',
] as const;
export const ExerciseEquipmentSchema = z.enum(EQUIPMENT_VALUES);
export type ExerciseEquipment = z.infer<typeof ExerciseEquipmentSchema>;

/** 动作难度 */
export const DIFFICULTY_VALUES = ['BEGINNER', 'INTERMEDIATE', 'ADVANCED'] as const;
export const ExerciseDifficultySchema = z.enum(DIFFICULTY_VALUES);
export type ExerciseDifficulty = z.infer<typeof ExerciseDifficultySchema>;

/** 1RM 力量测试动作（PRD §5.1：仅卧推 / 深蹲 / 硬拉） */
export const STRENGTH_KIND_VALUES = ['BENCH_PRESS', 'SQUAT', 'DEADLIFT'] as const;
export const StrengthExerciseKindSchema = z.enum(STRENGTH_KIND_VALUES);
export type StrengthExerciseKind = z.infer<typeof StrengthExerciseKindSchema>;
