/**
 * 数据库 seed —— 预置动作库 + 官方食物
 *
 * - 预置动作：12 个部位各 6–8 条，共 86 条（见 prisma/seeds/exercises/）
 * - 官方食物：10 条常见食材（USDA 近似值）
 *
 * 数值参考 USDA 食物数据库近似值，demo 阶段精度不严格。
 * 一切重量、热量、营养素仅用公制（PRD §5.2）。
 */
import { FoodSource, PrismaClient, type Prisma } from '../src/generated';

import { PRESET_EXERCISES } from './seeds/exercises';

const prisma = new PrismaClient();

// =================================================================
// 官方食物
// 数值为每 100 g 营养，USDA 近似
// =================================================================
const OFFICIAL_FOODS: Prisma.FoodCreateManyInput[] = [
  {
    nameZh: '鸡胸肉（去皮、生）',
    nameEn: 'Chicken Breast, raw',
    per100gKcal: 165,
    per100gProtein: 31,
    per100gCarbs: 0,
    per100gFat: 3.6,
    per100gSodium: 74,
    source: FoodSource.OFFICIAL,
  },
  {
    nameZh: '全鸡蛋（生）',
    nameEn: 'Whole Egg, raw',
    per100gKcal: 155,
    per100gProtein: 13,
    per100gCarbs: 1.1,
    per100gFat: 11,
    per100gSodium: 124,
    source: FoodSource.OFFICIAL,
  },
  {
    nameZh: '瘦牛肉（生）',
    nameEn: 'Lean Beef, raw',
    per100gKcal: 250,
    per100gProtein: 26,
    per100gCarbs: 0,
    per100gFat: 15,
    per100gSodium: 72,
    source: FoodSource.OFFICIAL,
  },
  {
    nameZh: '三文鱼（生）',
    nameEn: 'Atlantic Salmon, raw',
    per100gKcal: 208,
    per100gProtein: 20,
    per100gCarbs: 0,
    per100gFat: 13,
    per100gSodium: 59,
    source: FoodSource.OFFICIAL,
  },
  {
    nameZh: '白米饭（熟）',
    nameEn: 'Cooked White Rice',
    per100gKcal: 130,
    per100gProtein: 2.7,
    per100gCarbs: 28,
    per100gFat: 0.3,
    per100gFiber: 0.4,
    per100gSodium: 1,
    source: FoodSource.OFFICIAL,
  },
  {
    nameZh: '全麦面包',
    nameEn: 'Whole Wheat Bread',
    per100gKcal: 247,
    per100gProtein: 13,
    per100gCarbs: 41,
    per100gFat: 4,
    per100gFiber: 7,
    per100gSodium: 472,
    source: FoodSource.OFFICIAL,
  },
  {
    nameZh: '燕麦片（干）',
    nameEn: 'Rolled Oats, dry',
    per100gKcal: 389,
    per100gProtein: 17,
    per100gCarbs: 66,
    per100gFat: 7,
    per100gFiber: 10,
    per100gSodium: 2,
    source: FoodSource.OFFICIAL,
  },
  {
    nameZh: '全脂牛奶',
    nameEn: 'Whole Milk',
    per100gKcal: 60,
    per100gProtein: 3.2,
    per100gCarbs: 4.7,
    per100gFat: 3.3,
    per100gSodium: 40,
    source: FoodSource.OFFICIAL,
  },
  {
    nameZh: '西兰花（生）',
    nameEn: 'Broccoli, raw',
    per100gKcal: 34,
    per100gProtein: 2.8,
    per100gCarbs: 7,
    per100gFat: 0.4,
    per100gFiber: 2.6,
    per100gSodium: 33,
    source: FoodSource.OFFICIAL,
  },
  {
    nameZh: '牛油果',
    nameEn: 'Avocado',
    per100gKcal: 160,
    per100gProtein: 2,
    per100gCarbs: 9,
    per100gFat: 15,
    per100gFiber: 7,
    per100gSodium: 7,
    source: FoodSource.OFFICIAL,
  },
];

// =================================================================
// 主流程
// =================================================================

async function seedPresetExercises(): Promise<void> {
  let created = 0;
  let skipped = 0;

  for (const ex of PRESET_EXERCISES) {
    const existing = await prisma.exercise.findFirst({
      where: { nameZh: ex.nameZh, isPreset: true, deletedAt: null },
    });
    if (existing) {
      skipped += 1;
      continue;
    }
    await prisma.exercise.create({ data: ex });
    created += 1;
  }

  console.log(
    `  + 预置动作：新增 ${created} 条，跳过 ${skipped} 条（共 ${PRESET_EXERCISES.length} 条定义）`,
  );
}

async function seedOfficialFoods(): Promise<void> {
  const existing = await prisma.food.count({ where: { source: FoodSource.OFFICIAL } });
  if (existing > 0) {
    console.log(`  - 官方食物已存在 ${existing} 条，跳过（避免破坏已关联的饮食日志）`);
    return;
  }
  const createdFd = await prisma.food.createMany({ data: OFFICIAL_FOODS });
  console.log(`  + 插入官方食物 ${createdFd.count} 条`);
}

async function main(): Promise<void> {
  console.log('seed 开始');

  await seedPresetExercises();
  await seedOfficialFoods();

  console.log('seed 完成');
}

main()
  .catch((err: unknown) => {
    console.error('seed 失败:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
