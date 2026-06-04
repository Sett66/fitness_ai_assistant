import { z } from 'zod';
import { PostVisibilitySchema, ReactionKindSchema } from '../../enums';
import { DateTimeSchema, IdSchema } from '../_common';

/**
 * Phase 2 占位 schema —— MVP 不开放对外 API。
 * 仅用于在 packages/db 中建表，并保留未来上线时前后端类型一致性。
 * Create/Update/Response 系列等 Phase 2 启用时再补。
 */

export const PostSchema = z.object({
  id: IdSchema,
  userId: IdSchema,
  body: z.string().min(1).max(2000),
  mediaIds: z.array(IdSchema).max(9).default([]),
  visibility: PostVisibilitySchema.default('PUBLIC'),
  createdAt: DateTimeSchema,
  updatedAt: DateTimeSchema.optional(),
  deletedAt: DateTimeSchema.nullable().optional(),
});
export type Post = z.infer<typeof PostSchema>;

export const CommentSchema = z.object({
  id: IdSchema,
  postId: IdSchema,
  userId: IdSchema,
  body: z.string().min(1).max(1000),
  parentId: IdSchema.nullable().optional(),
  createdAt: DateTimeSchema,
});
export type Comment = z.infer<typeof CommentSchema>;

export const ReactionSchema = z.object({
  postId: IdSchema,
  userId: IdSchema,
  kind: ReactionKindSchema,
  createdAt: DateTimeSchema,
});
export type Reaction = z.infer<typeof ReactionSchema>;
