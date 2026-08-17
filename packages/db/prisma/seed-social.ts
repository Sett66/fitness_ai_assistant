/**
 * 社交演示数据 seed —— 独立于动作库 / 食物库
 *
 * 4 个演示用户，每人 6–7 条公开已审帖，带评论与点赞。
 * 幂等：用户按手机号 upsert，帖子用固定 id upsert；评论 / 点赞按 seed 帖重建。
 * 跑完后必须执行 `pnpm --filter api reindex:social`，否则搜索搜不到。
 */
import * as argon2 from 'argon2';
import { Gender, Goal, PrismaClient, ReactionKind } from '../src/generated';

const prisma = new PrismaClient();

const DEMO_PASSWORD = 'Demo@12345';

type DemoUserDef = {
  phone: string;
  displayName: string;
  gender: Gender;
  birthDate: Date;
  heightCm: number;
  weightKg: number;
  trainingYears: number;
  goal: Goal;
  posts: readonly string[];
};

const DEMO_USERS: readonly DemoUserDef[] = [
  {
    phone: '13900000001',
    displayName: '铁馆老张',
    gender: Gender.MALE,
    birthDate: new Date('1984-03-12T00:00:00.000Z'),
    heightCm: 178,
    weightKg: 82,
    trainingYears: 12,
    goal: Goal.MUSCLE_GAIN,
    posts: [
      '今晚卧推 80kg 5x5，第三组差点没推起来，锁骨那块有点酸。老伙计们肩怎么热身的？',
      '铁馆人太多了，卧推架等位半小时。趁空做了面拉和哑铃推，肩还是得练。',
      '蛋白粉喝腻了，改成鸡胸拌饭。增肌期真的每天都在找蛋白质。',
      '硬拉 140 破了自己的小纪录。腰带勒太紧，晚饭吃不下。值。',
      '有人跟我抢深蹲架，我让了。年纪大了不跟年轻人较劲，去拉背了。',
      '肩袖有点紧，今天只做了轻重量侧平举。宁可不练也不想养伤。',
      '跟馆里教练聊了一下周期化，下周改 5/3/1。有同龄人在用的吗？',
    ],
  },
  {
    phone: '13900000002',
    displayName: '减脂中的小李',
    gender: Gender.FEMALE,
    birthDate: new Date('1996-08-21T00:00:00.000Z'),
    heightCm: 162,
    weightKg: 56.5,
    trainingYears: 1.5,
    goal: Goal.FAT_LOSS,
    posts: [
      '减脂第三周，体重掉了 1.2kg，围度更明显。继续控碳水。',
      '中午自己带了鸡胸西兰花，同事都在点奶茶。减脂真的是意志力游戏。',
      '跑步机 30 分钟快走，心率一直在 140。有氧好无聊但有效。',
      '晚上饿到想偷吃，咬了两口黄瓜顶住了。减脂期的晚上最难熬。',
      '称了一下，这周平台期。教练说坚持训练，别只看体重。',
      '第一次尝试低重量高次数腿举，第二天走路都在笑。',
      '打卡今日饮食：燕麦+鸡蛋+沙拉。热量打满还差一点。',
    ],
  },
  {
    phone: '13900000003',
    displayName: '深蹲爱好者',
    gender: Gender.MALE,
    birthDate: new Date('1992-11-04T00:00:00.000Z'),
    heightCm: 175,
    weightKg: 74,
    trainingYears: 4,
    goal: Goal.MUSCLE_GAIN,
    posts: [
      '今天深蹲 100kg 三组，深度还行。膝盖有一点点响，但无痛。',
      '有人说深蹲伤膝，我只想说：学会髋主导再开口。',
      '暂停深蹲真的能挖臀。今天多做了两组，明天估计下不了楼梯。',
      '买了举重鞋，深蹲发力稳多了。后悔没早买。',
      '高杆 vs 低杆，我还是更喜欢高杆深蹲，上背能绷住。',
      '腿日结束：深蹲、罗马尼亚、腿举。蛋白奶昔续上。',
      '请教：深蹲时脚尖外展多少比较自然？我现在大概 15 度。',
    ],
  },
  {
    phone: '13900000004',
    displayName: '新手第一天',
    gender: Gender.OTHER,
    birthDate: new Date('2002-05-18T00:00:00.000Z'),
    heightCm: 168,
    weightKg: 61,
    trainingYears: 0,
    goal: Goal.MAINTAIN,
    posts: [
      '办了卡，第一次进健身房。器械太多了，今天只走了跑步机。',
      '教练让我从徒手深蹲和推墙开始。感觉自己好弱啊。',
      '看别人卧推好轻松，我空杆都在抖。慢慢来吧。',
      '买了手套和水壶。有没有新手友好的三分化推荐？',
      '今天学会调座椅了。坐姿推胸 15kg，推完胳膊在抖。',
      '第一次练完居然有点开心。明天还来。',
    ],
  },
];

const COMMENT_POOL = [
  '这个重量可以，稳着来别逞强。',
  '同款感受，上周我也是这样。',
  '已收藏，回头跟练。',
  '求组间休息怎么排？',
  '加油，别忘了热身。',
  '真实，我昨晚也差点饿崩。',
  '建议把离心再放慢一点。',
  '一起冲，下个月见。',
] as const;

const REPLY_POOL = ['谢谢提醒！', '一起练。', '收到，下周试试。'] as const;

function pad3(n: number): string {
  return String(n).padStart(3, '0');
}

function hashStr(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function seededCreatedAt(seed: string, maxDaysAgo: number): Date {
  const h = hashStr(seed);
  const days = h % maxDaysAgo;
  const hours = (h >>> 8) % 24;
  const minutes = (h >>> 16) % 60;
  const d = new Date();
  d.setUTCHours(hours, minutes, (h >>> 24) % 50, 0);
  d.setUTCDate(d.getUTCDate() - days);
  return d;
}

function countKeyword(posts: readonly string[], keyword: string): number {
  return posts.filter((body) => body.includes(keyword)).length;
}

function pick<T>(items: readonly T[], index: number): T {
  const item = items[index % items.length];
  if (item === undefined) {
    throw new Error('seed pool is empty');
  }
  return item;
}

async function recountPostCounters(postIds: string[]): Promise<void> {
  const [likeGroups, commentGroups] = await Promise.all([
    prisma.reaction.groupBy({
      by: ['postId'],
      where: { postId: { in: postIds } },
      _count: { _all: true },
    }),
    prisma.comment.groupBy({
      by: ['postId'],
      where: { postId: { in: postIds }, deletedAt: null },
      _count: { _all: true },
    }),
  ]);

  const likeMap = new Map(likeGroups.map((row) => [row.postId, row._count._all]));
  const commentMap = new Map(commentGroups.map((row) => [row.postId, row._count._all]));

  for (const postId of postIds) {
    await prisma.post.update({
      where: { id: postId },
      data: {
        likeCount: likeMap.get(postId) ?? 0,
        commentCount: commentMap.get(postId) ?? 0,
      },
    });
  }
}

async function main(): Promise<void> {
  console.log('社交 seed 开始');

  const passwordHash = await argon2.hash(DEMO_PASSWORD, { type: argon2.argon2id });
  const userIds: string[] = [];

  for (const def of DEMO_USERS) {
    const user = await prisma.user.upsert({
      where: { phone: def.phone },
      create: {
        phone: def.phone,
        passwordHash,
        displayName: def.displayName,
      },
      update: {
        passwordHash,
        displayName: def.displayName,
        deletedAt: null,
      },
    });
    userIds.push(user.id);

    await prisma.profile.upsert({
      where: { userId: user.id },
      create: {
        userId: user.id,
        gender: def.gender,
        birthDate: def.birthDate,
        heightCm: def.heightCm,
        weightKg: def.weightKg,
        trainingYears: def.trainingYears,
        goal: def.goal,
      },
      update: {
        gender: def.gender,
        birthDate: def.birthDate,
        heightCm: def.heightCm,
        weightKg: def.weightKg,
        trainingYears: def.trainingYears,
        goal: def.goal,
      },
    });
  }

  const postIds: string[] = [];
  const postAuthorIds: string[] = [];
  let postSeq = 0;

  for (let u = 0; u < DEMO_USERS.length; u += 1) {
    const def = DEMO_USERS[u];
    const authorId = userIds[u];
    if (!def || !authorId) continue;

    for (const body of def.posts) {
      postSeq += 1;
      const id = `seed-post-${pad3(postSeq)}`;
      postIds.push(id);
      postAuthorIds.push(authorId);
      const createdAt = seededCreatedAt(id, 30);
      await prisma.post.upsert({
        where: { id },
        create: {
          id,
          userId: authorId,
          body,
          mediaIds: [],
          visibility: 'PUBLIC',
          moderation: 'APPROVED',
          createdAt,
        },
        update: {
          userId: authorId,
          body,
          mediaIds: [],
          visibility: 'PUBLIC',
          moderation: 'APPROVED',
          moderationReason: null,
          deletedAt: null,
          createdAt,
        },
      });
    }
  }

  await prisma.post.deleteMany({
    where: {
      id: { startsWith: 'seed-post-' },
      NOT: { id: { in: postIds } },
    },
  });

  await prisma.comment.updateMany({
    where: { postId: { in: postIds }, parentId: { not: null } },
    data: { parentId: null },
  });
  await prisma.comment.deleteMany({ where: { postId: { in: postIds } } });
  await prisma.reaction.deleteMany({ where: { postId: { in: postIds } } });

  const commentRows: {
    id: string;
    postId: string;
    userId: string;
    body: string;
    parentId: string | null;
    createdAt: Date;
  }[] = [];
  const reactionRows: { postId: string; userId: string; kind: ReactionKind }[] = [];
  let commentSeq = 0;

  for (let i = 0; i < postIds.length; i += 1) {
    const postId = postIds[i];
    const authorId = postAuthorIds[i];
    if (!postId || !authorId) continue;

    const others = userIds.filter((id) => id !== authorId);
    const commentCount = i % 6;
    let firstCommentId: string | null = null;

    for (let c = 0; c < commentCount; c += 1) {
      commentSeq += 1;
      const id = `seed-cmt-${pad3(commentSeq)}`;
      const commenter = others[c % others.length];
      if (!commenter) continue;

      const isReply = c >= 2 && firstCommentId != null && c % 2 === 0;
      if (!isReply && firstCommentId == null) firstCommentId = id;

      commentRows.push({
        id,
        postId,
        userId: commenter,
        body: isReply ? pick(REPLY_POOL, c) : pick(COMMENT_POOL, i + c),
        parentId: isReply ? firstCommentId : null,
        createdAt: seededCreatedAt(`${id}-cmt`, 28),
      });
    }

    const skipLikes = hashStr(`${postId}:likes`) % 7 === 0;
    if (!skipLikes) {
      for (const otherId of others) {
        if (hashStr(`${postId}:${otherId}`) % 3 === 0) continue;
        reactionRows.push({ postId, userId: otherId, kind: ReactionKind.LIKE });
      }
    }
  }

  const rootComments = commentRows.filter((row) => row.parentId == null);
  const replyComments = commentRows.filter((row) => row.parentId != null);
  if (rootComments.length > 0) {
    await prisma.comment.createMany({ data: rootComments });
  }
  if (replyComments.length > 0) {
    await prisma.comment.createMany({ data: replyComments });
  }
  if (reactionRows.length > 0) {
    await prisma.reaction.createMany({ data: reactionRows });
  }

  await recountPostCounters(postIds);

  const allBodies = DEMO_USERS.flatMap((u) => [...u.posts]);
  console.log(
    `  + 演示用户 ${DEMO_USERS.length} 人，帖子 ${postIds.length} 条，评论 ${commentRows.length} 条，点赞 ${reactionRows.length} 条`,
  );
  console.log(
    `  + 关键词：深蹲 ${countKeyword(allBodies, '深蹲')} 条，减脂 ${countKeyword(allBodies, '减脂')} 条，卧推 ${countKeyword(allBodies, '卧推')} 条`,
  );
  console.log('社交 seed 完成');
  console.log('');
  console.log('下一步请执行：pnpm --filter api reindex:social');
  console.log('否则搜索会「明明有帖子却搜不到」。');
}

main()
  .catch((err: unknown) => {
    console.error('社交 seed 失败:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
