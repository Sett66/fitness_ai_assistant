import {
  ExerciseResponseSchema,
  MeResponseSchema,
  paginatedSchema,
  StrengthLevelResponseSchema,
} from '@fitness/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';

import { apiFetch } from '../client';
import { queryKeys } from '../queryKeys';

const ExerciseListSchema = paginatedSchema(ExerciseResponseSchema);

export function useMe(enabled = true) {
  return useQuery({
    queryKey: queryKeys.me,
    enabled,
    queryFn: async () => {
      const json = await apiFetch<unknown>('/users/me');
      return MeResponseSchema.parse(json);
    },
  });
}

export function useUpdateMe() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: unknown) => apiFetch('/users/me', { method: 'PATCH', body }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.me });
    },
  });
}

export function useUpdateProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: unknown) => apiFetch('/users/me/profile', { method: 'PUT', body }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.profile });
      qc.invalidateQueries({ queryKey: queryKeys.me });
    },
  });
}

export function usePatchProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: unknown) => apiFetch('/users/me/profile', { method: 'PATCH', body }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.profile });
      qc.invalidateQueries({ queryKey: queryKeys.me });
    },
  });
}

export function useStrengthLevels() {
  return useQuery({
    queryKey: queryKeys.strengthLevels,
    queryFn: async () => {
      const json = await apiFetch<unknown[]>('/users/me/strength-levels');
      return z.array(StrengthLevelResponseSchema).parse(json);
    },
  });
}

export function useUpsertStrengthLevel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: unknown) => apiFetch('/users/me/strength-levels', { method: 'POST', body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.strengthLevels }),
  });
}

export function useDeleteStrengthLevel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiFetch(`/users/me/strength-levels/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.strengthLevels }),
  });
}

export function useExercises(limit = 100) {
  return useQuery({
    queryKey: [...queryKeys.exercises, limit],
    queryFn: async () => {
      const json = await apiFetch<unknown>(`/exercises?limit=${limit}`);
      return ExerciseListSchema.parse(json);
    },
  });
}
