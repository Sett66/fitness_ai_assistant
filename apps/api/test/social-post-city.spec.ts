import { CreatePostRequestSchema, PostSummarySchema } from '@fitness/shared';

describe('发帖可选城市契约', () => {
  const base = { body: '今天深蹲 100kg' };

  it('省略 city 时通过，解析结果不含城市', () => {
    expect(CreatePostRequestSchema.parse(base).city).toBeUndefined();
  });

  it('空串 / null / 空白视为未附带', () => {
    expect(CreatePostRequestSchema.parse({ ...base, city: '' }).city).toBeUndefined();
    expect(CreatePostRequestSchema.parse({ ...base, city: '   ' }).city).toBeUndefined();
    expect(CreatePostRequestSchema.parse({ ...base, city: null }).city).toBeUndefined();
  });

  it('合法城市名会 trim', () => {
    expect(CreatePostRequestSchema.parse({ ...base, city: '  上海  ' }).city).toBe('上海');
  });

  it('超过 64 字拒绝', () => {
    expect(() => CreatePostRequestSchema.parse({ ...base, city: '上'.repeat(65) })).toThrow();
  });

  it('PostSummary 缺 city 时视为 null，有值则保留', () => {
    const base = {
      id: 'post-id-xxxxxxxx',
      author: { id: 'user-id-xxxxxxxx', displayName: 'Alice', avatarUrl: null },
      body: '今天深蹲 100kg',
      imageUrls: [],
      visibility: 'PUBLIC',
      moderation: 'APPROVED',
      moderationReason: null,
      likeCount: 0,
      commentCount: 0,
      likedByMe: false,
      isMine: true,
      createdAt: '2026-01-01T00:00:00.000Z',
    };
    expect(PostSummarySchema.parse(base).city).toBeNull();
    expect(PostSummarySchema.parse({ ...base, city: '上海' }).city).toBe('上海');
  });
});
