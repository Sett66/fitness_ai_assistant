import { z } from 'zod';
import { AgentMemoryFactSchema, CoachChatOutputSchema, UserAiContextSchema } from '@fitness/shared';

export const CoachChatHistoryItemSchema = z.object({
  role: z.enum(['USER', 'ASSISTANT']),
  content: z.string().max(4000),
  createdAt: z.coerce.date().optional(),
});
export type CoachChatHistoryItem = z.infer<typeof CoachChatHistoryItemSchema>;

export const RunCoachChatInputSchema = z.object({
  latestUserText: z.string().min(1).max(4000),
  history: z.array(CoachChatHistoryItemSchema).max(20),
  userContext: UserAiContextSchema,
  memoryFacts: z.array(AgentMemoryFactSchema).max(20).optional(),
  timezoneOffsetMinutes: z.number().int().min(-720).max(840).optional().default(480),
});
export type RunCoachChatInput = z.infer<typeof RunCoachChatInputSchema>;

export { CoachChatOutputSchema };
export type CoachChatOutput = z.infer<typeof CoachChatOutputSchema>;
