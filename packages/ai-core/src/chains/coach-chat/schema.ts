import { z } from 'zod';
import { CoachChatOutputSchema, UserAiContextSchema } from '@fitness/shared';

export const CoachChatHistoryItemSchema = z.object({
  role: z.enum(['USER', 'ASSISTANT']),
  content: z.string().max(4000),
});
export type CoachChatHistoryItem = z.infer<typeof CoachChatHistoryItemSchema>;

export const RunCoachChatInputSchema = z.object({
  latestUserText: z.string().min(1).max(4000),
  history: z.array(CoachChatHistoryItemSchema).max(20),
  userContext: UserAiContextSchema,
});
export type RunCoachChatInput = z.infer<typeof RunCoachChatInputSchema>;

export { CoachChatOutputSchema };
export type CoachChatOutput = z.infer<typeof CoachChatOutputSchema>;
