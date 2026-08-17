/**
 * 一次性校验 seed 行数（pnpm / CI 可调用）
 * PRESET_EXERCISE_COUNT 须与 prisma/seeds/exercises/index.ts 一致
 * 社交断言仅在演示用户存在时执行（未跑 seed:social 不失败）
 */
import { PrismaClient } from '../src/generated/index.js';

const PRESET_EXERCISE_COUNT = 86;
const OFFICIAL_FOOD_COUNT = 10;
const DEMO_PHONES = ['13900000001', '13900000002', '13900000003', '13900000004'];
const MIN_DEMO_USERS = 4;
const MIN_DEMO_POSTS = 24;

const prisma = new PrismaClient();

try {
  const presetExercises = await prisma.exercise.count({
    where: { isPreset: true, deletedAt: null },
  });
  const officialFoods = await prisma.food.count({
    where: { source: 'OFFICIAL', deletedAt: null },
  });

  const demoUsers = await prisma.user.findMany({
    where: { phone: { in: DEMO_PHONES }, deletedAt: null },
    select: { id: true, phone: true },
  });

  const social = { demoUsers: demoUsers.length, demoPosts: 0, countMismatches: 0 };

  if (demoUsers.length > 0) {
    const demoUserIds = demoUsers.map((u) => u.id);
    social.demoPosts = await prisma.post.count({
      where: { userId: { in: demoUserIds }, deletedAt: null },
    });

    const posts = await prisma.post.findMany({
      where: { deletedAt: null },
      select: { id: true, likeCount: true, commentCount: true },
    });
    const postIds = posts.map((p) => p.id);

    const [likeGroups, commentGroups] = await Promise.all([
      postIds.length === 0
        ? []
        : prisma.reaction.groupBy({
            by: ['postId'],
            where: { postId: { in: postIds } },
            _count: { _all: true },
          }),
      postIds.length === 0
        ? []
        : prisma.comment.groupBy({
            by: ['postId'],
            where: { postId: { in: postIds }, deletedAt: null },
            _count: { _all: true },
          }),
    ]);

    const likeMap = new Map(likeGroups.map((row) => [row.postId, row._count._all]));
    const commentMap = new Map(commentGroups.map((row) => [row.postId, row._count._all]));
    social.countMismatches = posts.filter(
      (p) =>
        p.likeCount !== (likeMap.get(p.id) ?? 0) || p.commentCount !== (commentMap.get(p.id) ?? 0),
    ).length;
  }

  console.log(JSON.stringify({ presetExercises, officialFoods, social }, null, 0));

  if (presetExercises !== PRESET_EXERCISE_COUNT || officialFoods !== OFFICIAL_FOOD_COUNT) {
    console.error(
      `预期 ${PRESET_EXERCISE_COUNT} 个预置动作、${OFFICIAL_FOOD_COUNT} 个官方食物，实际 ${presetExercises} / ${officialFoods}`,
    );
    process.exitCode = 1;
  }

  if (demoUsers.length > 0) {
    if (social.demoUsers < MIN_DEMO_USERS) {
      console.error(`预期至少 ${MIN_DEMO_USERS} 个社交演示用户，实际 ${social.demoUsers}`);
      process.exitCode = 1;
    }
    if (social.demoPosts < MIN_DEMO_POSTS) {
      console.error(`预期至少 ${MIN_DEMO_POSTS} 条社交演示帖，实际 ${social.demoPosts}`);
      process.exitCode = 1;
    }
    if (social.countMismatches > 0) {
      console.error(
        `发现 ${social.countMismatches} 条帖子 likeCount/commentCount 与实际行数不一致`,
      );
      process.exitCode = 1;
    }
  }
} finally {
  await prisma.$disconnect();
}
