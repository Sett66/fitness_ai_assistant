import type { Prisma } from '../../../src/generated';

import { ABS_EXERCISES } from './abs';
import { BACK_EXERCISES } from './back';
import { BICEPS_EXERCISES } from './biceps';
import { CALVES_EXERCISES } from './calves';
import { CHEST_EXERCISES } from './chest';
import { FOREARMS_EXERCISES } from './forearms';
import { GLUTES_EXERCISES } from './glutes';
import { HAMSTRINGS_EXERCISES } from './hamstrings';
import { OTHER_EXERCISES } from './other';
import { QUADS_EXERCISES } from './quads';
import { SHOULDER_EXERCISES } from './shoulder';
import { TRICEPS_EXERCISES } from './triceps';

export const PRESET_EXERCISES: Prisma.ExerciseCreateManyInput[] = [
  ...CHEST_EXERCISES,
  ...BACK_EXERCISES,
  ...SHOULDER_EXERCISES,
  ...BICEPS_EXERCISES,
  ...TRICEPS_EXERCISES,
  ...QUADS_EXERCISES,
  ...HAMSTRINGS_EXERCISES,
  ...GLUTES_EXERCISES,
  ...CALVES_EXERCISES,
  ...ABS_EXERCISES,
  ...FOREARMS_EXERCISES,
  ...OTHER_EXERCISES,
];

/** 供 verify-seed 等脚本对齐的预置动作总数 */
export const PRESET_EXERCISE_COUNT = PRESET_EXERCISES.length;
