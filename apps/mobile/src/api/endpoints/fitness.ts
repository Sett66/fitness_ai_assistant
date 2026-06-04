import {
  CreateMealLogSchema,
  NutritionDailySummarySchema,
  paginatedSchema,
  MealLogResponseSchema,
  PlanResponseSchema,
  WorkoutPlanItemResponseSchema,
  WorkoutSessionResponseSchema,
} from '@fitness/shared';
import type { CreateMealLogInput, CreateWorkoutSessionInput } from '@fitness/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type {
  GenerateMealPlanInput,
  GenerateWorkoutPlanInput,
} from '../../features/plan/plan-types';
import { apiFetch, pollAiTask, uploadToPresignedUrl } from '../client';
import { presignRequestBody } from './media';
import { queryKeys } from '../queryKeys';
import {
  AI_POLL_INTERVAL_MS,
  AI_POLL_TIMEOUT_MS,
  AI_POLL_TIMEOUT_PLAN_MS,
  DEFAULT_TIMEZONE_OFFSET_MINUTES,
} from '../../env';

const MealLogListSchema = paginatedSchema(MealLogResponseSchema);
const PlanListSchema = paginatedSchema(PlanResponseSchema);
const WorkoutListSchema = paginatedSchema(WorkoutSessionResponseSchema);

export function useDailySummary(date: string) {
  return useQuery({
    queryKey: queryKeys.dailySummary(date),
    queryFn: async () => {
      const json = await apiFetch<unknown>(
        `/meal-logs/daily-summary?date=${date}&timezoneOffsetMinutes=${DEFAULT_TIMEZONE_OFFSET_MINUTES}`,
      );
      return NutritionDailySummarySchema.parse(json);
    },
  });
}

export function useMealLogs(date?: string) {
  const qs = date ? `?date=${date}&timezoneOffsetMinutes=${DEFAULT_TIMEZONE_OFFSET_MINUTES}` : '';
  return useQuery({
    queryKey: queryKeys.mealLogs(date),
    queryFn: async () => {
      const json = await apiFetch<unknown>(`/meal-logs${qs}`);
      return MealLogListSchema.parse(json);
    },
  });
}

export function usePlans(type?: 'WORKOUT' | 'MEAL') {
  const qs = type ? `?type=${type}` : '';
  return useQuery({
    queryKey: queryKeys.plans(type),
    queryFn: async () => {
      const json = await apiFetch<unknown>(`/plans${qs}`);
      return PlanListSchema.parse(json);
    },
  });
}

export function usePlan(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.plan(id ?? ''),
    enabled: Boolean(id),
    queryFn: async () => {
      const json = await apiFetch<unknown>(`/plans/${id}`);
      return PlanResponseSchema.parse(json);
    },
  });
}

export function useWorkoutSessions() {
  return useQuery({
    queryKey: queryKeys.workoutSessions,
    queryFn: async () => {
      const json = await apiFetch<unknown>('/workouts/sessions');
      return WorkoutListSchema.parse(json);
    },
  });
}

export function useCreateWorkoutSession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateWorkoutSessionInput) =>
      apiFetch('/workouts/sessions', { method: 'POST', body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.workoutSessions }),
  });
}

export function useGenerateWorkoutPlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: GenerateWorkoutPlanInput) => {
      const accepted = await apiFetch<{ taskId: string }>('/ai/tasks', {
        method: 'POST',
        body: {
          taskType: 'PLAN_GENERATE_WORKOUT',
          model: 'deepseek-v4-pro',
          inputJson: {
            mesocycleWeeks: input.mesocycleWeeks,
            notes: input.notes ?? '',
            preferences: input.preferences,
            timezoneOffsetMinutes: DEFAULT_TIMEZONE_OFFSET_MINUTES,
          },
        },
      });
      const result = await pollAiTask<{ planId?: string; days?: unknown[] }>(
        accepted.taskId,
        AI_POLL_INTERVAL_MS,
        AI_POLL_TIMEOUT_PLAN_MS,
      );
      return result;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.plans('WORKOUT') }),
  });
}

export function useGenerateMealPlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: GenerateMealPlanInput) => {
      const accepted = await apiFetch<{ taskId: string }>('/ai/tasks', {
        method: 'POST',
        body: {
          taskType: 'PLAN_GENERATE_MEAL',
          model: 'deepseek-v4-pro',
          inputJson: {
            mesocycleWeeks: input.mesocycleWeeks,
            notes: input.notes ?? '',
            timezoneOffsetMinutes: DEFAULT_TIMEZONE_OFFSET_MINUTES,
          },
        },
      });
      const result = await pollAiTask<{ planId?: string; days?: unknown[] }>(
        accepted.taskId,
        AI_POLL_INTERVAL_MS,
        AI_POLL_TIMEOUT_PLAN_MS,
      );
      return result;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.plans('MEAL') }),
  });
}

export function useCreateMealLog() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: CreateMealLogInput) => {
      const parsed = CreateMealLogSchema.parse(body);
      const json = await apiFetch<unknown>('/meal-logs', { method: 'POST', body: parsed });
      return MealLogResponseSchema.parse(json);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.mealLogs() });
      qc.invalidateQueries({ queryKey: ['daily-summary'] });
    },
  });
}

export function useUpdateWorkoutPlanItem(planId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (params: { dayId: string; itemId: string; body: unknown }) =>
      apiFetch(`/plans/${planId}/workout-days/${params.dayId}/items/${params.itemId}`, {
        method: 'PATCH',
        body: params.body,
      }).then((json) => WorkoutPlanItemResponseSchema.parse(json)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.plan(planId) });
      qc.invalidateQueries({ queryKey: queryKeys.plans('WORKOUT') });
    },
  });
}

export function useDeletePlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiFetch(`/plans/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.plans('WORKOUT') });
      qc.invalidateQueries({ queryKey: queryKeys.plans('MEAL') });
    },
  });
}

export function useMealVision() {
  return useMutation({
    mutationFn: async (params: {
      fileUri: string;
      mime: string;
      sizeBytes: number;
      mealType: string;
    }) => {
      const signed = await apiFetch<{ uploadUrl: string; objectKey: string }>('/uploads/sign', {
        method: 'POST',
        body: presignRequestBody('MEAL_PHOTO', {
          mime: params.mime,
          sizeBytes: params.sizeBytes,
        }),
      });

      await uploadToPresignedUrl(signed.uploadUrl, params.fileUri, params.mime);
      await apiFetch('/uploads/complete', {
        method: 'POST',
        body: { objectKey: signed.objectKey },
      });

      const accepted = await apiFetch<{ taskId: string }>('/ai/tasks', {
        method: 'POST',
        body: {
          taskType: 'MEAL_VISION',
          model: 'qwen-vl-max',
          inputJson: {
            objectKey: signed.objectKey,
            mealType: params.mealType,
            saveMealLog: false,
            timezoneOffsetMinutes: DEFAULT_TIMEZONE_OFFSET_MINUTES,
          },
        },
      });

      return pollAiTask(accepted.taskId, AI_POLL_INTERVAL_MS, AI_POLL_TIMEOUT_MS);
    },
  });
}
