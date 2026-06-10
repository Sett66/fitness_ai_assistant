import { z } from 'zod';

import {
  CoachActionSchema,
  MessageContentTypeSchema,
  MessageRoleSchema,
} from '../enums/conversation';
import { MealTypeSchema } from '../enums/plan';
import { CoachToolTraceItemSchema, LocationContextSchema } from './agent';
import { DateTimeSchema, IdSchema } from './_common';
import { CreateMealLogSchema } from './nutrition';
import { WorkoutPlanPreferencesSchema } from './plan';

export const MessageSchema = z.object({
  id: IdSchema,
  conversationId: IdSchema,
  role: MessageRoleSchema,
  contentType: MessageContentTypeSchema,
  content: z.string(),
  metadata: z.record(z.unknown()).nullable().optional(),
  aiRunId: IdSchema.nullable().optional(),
  createdAt: DateTimeSchema,
});
export type Message = z.infer<typeof MessageSchema>;

export const ConversationSchema = z.object({
  id: IdSchema,
  userId: IdSchema,
  title: z.string().max(128).nullable().optional(),
  isDefault: z.boolean(),
  createdAt: DateTimeSchema,
  updatedAt: DateTimeSchema,
});
export type Conversation = z.infer<typeof ConversationSchema>;

export const ConversationWithMessagesSchema = ConversationSchema.extend({
  messages: z.array(MessageSchema),
});
export type ConversationWithMessages = z.infer<typeof ConversationWithMessagesSchema>;

export const ConversationListItemSchema = ConversationSchema.pick({
  id: true,
  title: true,
  updatedAt: true,
  createdAt: true,
  isDefault: true,
}).extend({
  preview: z.string().max(120).nullable().optional(),
  messageCount: z.number().int().nonnegative().optional(),
});
export type ConversationListItem = z.infer<typeof ConversationListItemSchema>;

export const ConversationListResponseSchema = z.object({
  items: z.array(ConversationListItemSchema),
  nextCursor: z.string().nullable(),
});
export type ConversationListResponse = z.infer<typeof ConversationListResponseSchema>;

export const CreateConversationSchema = z.object({
  title: z.string().max(128).nullable().optional(),
});
export type CreateConversationInput = z.infer<typeof CreateConversationSchema>;

export const CoachActionParamsSchema = z.object({
  mesocycleWeeks: z.number().int().min(1).max(12).optional(),
  notes: z.string().max(2000).optional(),
  preferences: WorkoutPlanPreferencesSchema.optional(),
  saveMealLog: z.boolean().optional(),
  manualMeal: CreateMealLogSchema.optional(),
});
export type CoachActionParams = z.infer<typeof CoachActionParamsSchema>;

export const CreateCoachMessageSchema = z
  .object({
    content: z.string().max(4000).optional(),
    contentType: z.enum(['TEXT', 'IMAGE']).optional(),
    imageObjectKey: z.string().max(512).optional(),
    mealType: MealTypeSchema.optional(),
    action: CoachActionSchema,
    actionParams: CoachActionParamsSchema.optional(),
    timezoneOffsetMinutes: z.number().int().min(-720).max(840).optional(),
    locationContext: LocationContextSchema.optional(),
  })
  .superRefine((val, ctx) => {
    if (val.action === 'CHAT' && (typeof val.content !== 'string' || !val.content.trim())) {
      ctx.addIssue({ code: 'custom', message: 'CHAT 需要 content', path: ['content'] });
    }
    if (val.action === 'MEAL_VISION' && !val.imageObjectKey) {
      ctx.addIssue({
        code: 'custom',
        message: 'MEAL_VISION 需要 imageObjectKey',
        path: ['imageObjectKey'],
      });
    }
    if (
      val.action === 'MANUAL_MEAL_LOG' &&
      !(val.actionParams && 'manualMeal' in val.actionParams && val.actionParams.manualMeal)
    ) {
      ctx.addIssue({
        code: 'custom',
        message: 'MANUAL_MEAL_LOG 需要 actionParams.manualMeal',
        path: ['actionParams', 'manualMeal'],
      });
    }
  });
export type CreateCoachMessageInput = z.infer<typeof CreateCoachMessageSchema>;

export const CoachMessageAcceptedResponseSchema = z.object({
  userMessageId: IdSchema,
  taskId: IdSchema.nullable(),
  pendingAssistantMessageId: IdSchema,
});
export type CoachMessageAcceptedResponse = z.infer<typeof CoachMessageAcceptedResponseSchema>;

export const CoachChatOutputSchema = z.object({
  reply: z.string().max(8000),
  suggestedActions: z
    .array(
      z.object({
        action: CoachActionSchema.exclude(['CHAT', 'MANUAL_MEAL_LOG']),
        label: z.string().max(64),
      }),
    )
    .max(4)
    .optional(),
});
export type CoachChatOutput = z.infer<typeof CoachChatOutputSchema>;

export const CoachStreamAcceptedEventSchema = z.object({
  userMessageId: IdSchema,
  pendingAssistantMessageId: IdSchema,
});
export type CoachStreamAcceptedEvent = z.infer<typeof CoachStreamAcceptedEventSchema>;

export const CoachStreamDeltaEventSchema = z.object({
  text: z.string(),
});
export type CoachStreamDeltaEvent = z.infer<typeof CoachStreamDeltaEventSchema>;

export const CoachStreamDoneEventSchema = z.object({
  assistantMessageId: IdSchema,
  userMessageId: IdSchema,
  suggestedActions: CoachChatOutputSchema.shape.suggestedActions,
  toolTrace: z.array(CoachToolTraceItemSchema).optional(),
  usage: z
    .object({
      tokenIn: z.number(),
      tokenOut: z.number(),
      costCny: z.number(),
    })
    .optional(),
});
export type CoachStreamDoneEvent = z.infer<typeof CoachStreamDoneEventSchema>;

export const CoachStreamErrorEventSchema = z.object({
  message: z.string(),
  code: z.string().optional(),
});
export type CoachStreamErrorEvent = z.infer<typeof CoachStreamErrorEventSchema>;
