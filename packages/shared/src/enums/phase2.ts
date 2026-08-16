import { z } from 'zod';

/** Phase 2 · 社区动态可见性（ARCH §4） */
export const POST_VISIBILITY_VALUES = ['PUBLIC', 'FOLLOWERS', 'PRIVATE'] as const;
export const PostVisibilitySchema = z.enum(POST_VISIBILITY_VALUES);
export type PostVisibility = z.infer<typeof PostVisibilitySchema>;

/** Phase 2 · 反应类型 */
export const REACTION_KIND_VALUES = ['LIKE', 'FIRE', 'CLAP', 'HEART'] as const;
export const ReactionKindSchema = z.enum(REACTION_KIND_VALUES);
export type ReactionKind = z.infer<typeof ReactionKindSchema>;

/** API 层实际允许的发帖可见性：FOLLOWERS 不开放（ADR 0011 §1） */
export const CREATABLE_POST_VISIBILITY_VALUES = ['PUBLIC', 'PRIVATE'] as const;
export const CreatablePostVisibilitySchema = z.enum(CREATABLE_POST_VISIBILITY_VALUES);
export type CreatablePostVisibility = z.infer<typeof CreatablePostVisibilitySchema>;

/** 内容审核状态（ADR 0011 §13 / §17） */
export const MODERATION_STATUS_VALUES = ['PENDING', 'APPROVED', 'REJECTED'] as const;
export const ModerationStatusSchema = z.enum(MODERATION_STATUS_VALUES);
export type ModerationStatus = z.infer<typeof ModerationStatusSchema>;
