import { z } from 'zod';

export const MESSAGE_ROLE_VALUES = ['USER', 'ASSISTANT', 'SYSTEM'] as const;
export const MessageRoleSchema = z.enum(MESSAGE_ROLE_VALUES);
export type MessageRole = z.infer<typeof MessageRoleSchema>;

export const MESSAGE_CONTENT_TYPE_VALUES = [
  'TEXT',
  'IMAGE',
  'PLAN_CARD',
  'MEAL_VISION_CARD',
  'SYSTEM_NOTICE',
] as const;
export const MessageContentTypeSchema = z.enum(MESSAGE_CONTENT_TYPE_VALUES);
export type MessageContentType = z.infer<typeof MessageContentTypeSchema>;

export const COACH_ACTION_VALUES = [
  'CHAT',
  'GENERATE_WORKOUT',
  'GENERATE_MEAL',
  'MEAL_VISION',
  'MANUAL_MEAL_LOG',
] as const;
export const CoachActionSchema = z.enum(COACH_ACTION_VALUES);
export type CoachAction = z.infer<typeof CoachActionSchema>;
