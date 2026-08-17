import { z } from 'zod';
import {
  CreatablePostVisibilitySchema,
  ModerationStatusSchema,
  PostVisibilitySchema,
  ReactionKindSchema,
} from '../../enums';
import { DateTimeSchema, IdSchema, PaginationQuerySchema, paginatedSchema } from '../_common';

export const SocialAuthorSchema = z.object({
  id: IdSchema,
  displayName: z.string(),
  avatarUrl: z.string().url().nullable(),
});
export type SocialAuthor = z.infer<typeof SocialAuthorSchema>;

export const PostSchema = z.object({
  id: IdSchema,
  userId: IdSchema,
  body: z.string().min(1).max(2000),
  mediaIds: z.array(IdSchema).max(9).default([]),
  visibility: PostVisibilitySchema.default('PUBLIC'),
  likeCount: z.number().int().nonnegative().default(0),
  commentCount: z.number().int().nonnegative().default(0),
  moderation: ModerationStatusSchema.default('PENDING'),
  moderationReason: z.string().nullable().optional(),
  createdAt: DateTimeSchema,
  updatedAt: DateTimeSchema.optional(),
  deletedAt: DateTimeSchema.nullable().optional(),
});
export type Post = z.infer<typeof PostSchema>;

export const PostSummarySchema = z.object({
  id: IdSchema,
  author: SocialAuthorSchema,
  body: z.string(),
  imageUrls: z.array(z.string().url()).default([]),
  visibility: PostVisibilitySchema,
  moderation: ModerationStatusSchema,
  moderationReason: z.string().nullable(),
  likeCount: z.number().int().nonnegative(),
  commentCount: z.number().int().nonnegative(),
  likedByMe: z.boolean().default(false),
  isMine: z.boolean(),
  createdAt: DateTimeSchema,
});
export type PostSummary = z.infer<typeof PostSummarySchema>;

export const PostListResponseSchema = paginatedSchema(PostSummarySchema);
export type PostListResponse = z.infer<typeof PostListResponseSchema>;

export const CreatePostRequestSchema = z.object({
  body: z.string().trim().min(1).max(2000),
  mediaIds: z.array(IdSchema).max(9).default([]),
  visibility: CreatablePostVisibilitySchema.default('PUBLIC'),
});
export type CreatePostRequest = z.infer<typeof CreatePostRequestSchema>;

export const CreatePostResponseSchema = PostSummarySchema;
export type CreatePostResponse = z.infer<typeof CreatePostResponseSchema>;

export const SocialFeedQuerySchema = PaginationQuerySchema;
export type SocialFeedQuery = z.infer<typeof SocialFeedQuerySchema>;

export const LikeResponseSchema = z.object({
  postId: IdSchema,
  likeCount: z.number().int().nonnegative(),
  likedByMe: z.boolean(),
});
export type LikeResponse = z.infer<typeof LikeResponseSchema>;

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
