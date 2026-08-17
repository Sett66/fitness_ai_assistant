import { z } from 'zod';

export const RunSocialModerateInputSchema = z.object({
  body: z.string().min(1),
});

export type RunSocialModerateInput = z.infer<typeof RunSocialModerateInputSchema>;

export const SocialModerateDecisionSchema = z.enum(['APPROVED', 'REJECTED']);

export const SocialModerateResultSchema = z.object({
  decision: SocialModerateDecisionSchema,
  reason: z.string().max(100),
});

export type SocialModerateResult = z.infer<typeof SocialModerateResultSchema>;
