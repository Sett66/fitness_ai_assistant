import { z } from 'zod';

/** Phase 2 · 社区动态可见性（ARCH §4） */
export const POST_VISIBILITY_VALUES = ['PUBLIC', 'FOLLOWERS', 'PRIVATE'] as const;
export const PostVisibilitySchema = z.enum(POST_VISIBILITY_VALUES);
export type PostVisibility = z.infer<typeof PostVisibilitySchema>;

/** Phase 2 · 反应类型 */
export const REACTION_KIND_VALUES = ['LIKE', 'FIRE', 'CLAP', 'HEART'] as const;
export const ReactionKindSchema = z.enum(REACTION_KIND_VALUES);
export type ReactionKind = z.infer<typeof ReactionKindSchema>;
