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

/** 发帖可选城市名：只展示，不存坐标。空串 / null 视为未附带。 */
const OptionalPostCitySchema = z
  .union([z.string(), z.null()])
  .optional()
  .transform((value, ctx) => {
    if (value == null) return undefined;
    const trimmed = value.trim();
    if (!trimmed) return undefined;
    if (trimmed.length > 64) {
      ctx.addIssue({
        code: z.ZodIssueCode.too_big,
        maximum: 64,
        type: 'string',
        inclusive: true,
      });
      return z.NEVER;
    }
    return trimmed;
  });

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
  city: z.string().max(64).nullable().optional(),
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
  city: z
    .string()
    .max(64)
    .nullish()
    .transform((value) => value ?? null),
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
  city: OptionalPostCitySchema,
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

export const CommentLikeResponseSchema = z.object({
  commentId: IdSchema,
  likeCount: z.number().int().nonnegative(),
  likedByMe: z.boolean(),
});
export type CommentLikeResponse = z.infer<typeof CommentLikeResponseSchema>;

export const CommentSchema = z.object({
  id: IdSchema,
  postId: IdSchema,
  userId: IdSchema,
  body: z.string().min(1).max(1000),
  parentId: IdSchema.nullable().optional(),
  createdAt: DateTimeSchema,
});
export type Comment = z.infer<typeof CommentSchema>;

export const CommentSummarySchema = z.object({
  id: IdSchema,
  postId: IdSchema,
  author: SocialAuthorSchema,
  body: z.string(),
  parentId: IdSchema.nullable(),
  replyToName: z.string().nullable(),
  likeCount: z.number().int().nonnegative(),
  likedByMe: z.boolean().default(false),
  isMine: z.boolean(),
  createdAt: DateTimeSchema,
});
export type CommentSummary = z.infer<typeof CommentSummarySchema>;

export const CommentListResponseSchema = paginatedSchema(CommentSummarySchema);
export type CommentListResponse = z.infer<typeof CommentListResponseSchema>;

export const CreateCommentRequestSchema = z.object({
  body: z.string().trim().min(1).max(1000),
  parentId: IdSchema.optional(),
});
export type CreateCommentRequest = z.infer<typeof CreateCommentRequestSchema>;

export const CreateCommentResponseSchema = CommentSummarySchema;
export type CreateCommentResponse = z.infer<typeof CreateCommentResponseSchema>;

export const CommentListQuerySchema = PaginationQuerySchema;
export type CommentListQuery = z.infer<typeof CommentListQuerySchema>;

export const ReactionSchema = z.object({
  postId: IdSchema,
  userId: IdSchema,
  kind: ReactionKindSchema,
  createdAt: DateTimeSchema,
});
export type Reaction = z.infer<typeof ReactionSchema>;

export const SocialSearchTypeSchema = z.enum(['POST', 'USER']);
export type SocialSearchType = z.infer<typeof SocialSearchTypeSchema>;

export const SocialSearchQuerySchema = z.object({
  q: z.string().trim().min(1).max(64),
  type: SocialSearchTypeSchema.default('POST'),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});
export type SocialSearchQuery = z.infer<typeof SocialSearchQuerySchema>;

export const SocialUserProfileSchema = z.object({
  id: IdSchema,
  displayName: z.string(),
  avatarUrl: z.string().url().nullable(),
  postCount: z.number().int().nonnegative(),
  joinedAt: DateTimeSchema,
});
export type SocialUserProfile = z.infer<typeof SocialUserProfileSchema>;

export const SocialUserListResponseSchema = paginatedSchema(SocialUserProfileSchema);
export type SocialUserListResponse = z.infer<typeof SocialUserListResponseSchema>;

export const SocialSearchResponseSchema = z.object({
  type: SocialSearchTypeSchema,
  posts: PostListResponseSchema.optional(),
  users: SocialUserListResponseSchema.optional(),
});
export type SocialSearchResponse = z.infer<typeof SocialSearchResponseSchema>;

export const SocialUserPostsQuerySchema = PaginationQuerySchema;
export type SocialUserPostsQuery = z.infer<typeof SocialUserPostsQuerySchema>;
