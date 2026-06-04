/**
 * 一次性校验 seed 行数（pnpm / CI 可调用）
 * PRESET_EXERCISE_COUNT 须与 prisma/seeds/exercises/index.ts 一致
 */
import { PrismaClient } from '../src/generated/index.js';

const PRESET_EXERCISE_COUNT = 86;
const OFFICIAL_FOOD_COUNT = 10;

const prisma = new PrismaClient();

try {
  const presetExercises = await prisma.exercise.count({
    where: { isPreset: true, deletedAt: null },
  });
  const officialFoods = await prisma.food.count({
    where: { source: 'OFFICIAL', deletedAt: null },
  });
  console.log(JSON.stringify({ presetExercises, officialFoods }, null, 0));
  if (presetExercises !== PRESET_EXERCISE_COUNT || officialFoods !== OFFICIAL_FOOD_COUNT) {
    console.error(
      `预期 ${PRESET_EXERCISE_COUNT} 个预置动作、${OFFICIAL_FOOD_COUNT} 个官方食物，实际 ${presetExercises} / ${officialFoods}`,
    );
    process.exitCode = 1;
  }
} finally {
  await prisma.$disconnect();
}
