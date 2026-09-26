import {
  ExerciseResponseSchema,
  MeResponseSchema,
  paginatedSchema,
  StrengthLevelResponseSchema,
  UserLocationNullableResponseSchema,
  UserLocationResponseSchema,
} from '@fitness/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';

import { apiFetch } from '../client';
import { queryKeys } from '../queryKeys';

const MemoryItemSchema = z.object({
  id: z.string(),
  key: z.string(),
  category: z.string(),
  value: z.string(),
  updatedAt: z.string().or(z.date()),
});
export type MemoryItem = z.infer<typeof MemoryItemSchema>;

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

export function useMyLocation(enabled = true) {
  return useQuery({
    queryKey: queryKeys.myLocation,
    enabled,
    queryFn: async () => {
      const json = await apiFetch<unknown>('/users/me/location');
      return UserLocationNullableResponseSchema.parse(json);
    },
  });
}

export function useUpsertMyLocation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: unknown) => {
      const json = await apiFetch<unknown>('/users/me/location', { method: 'PUT', body });
      return UserLocationResponseSchema.parse(json);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.myLocation });
    },
  });
}

export function useMemories() {
  return useQuery({
    queryKey: ['memories'],
    queryFn: async () =>
      z.array(MemoryItemSchema).parse(await apiFetch<unknown>('/users/me/memories')),
  });
}
export function useDeleteMemory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiFetch(`/users/me/memories/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['memories'] }),
  });
}
export function useCreateMemory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: unknown) => apiFetch('/users/me/memories', { method: 'POST', body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['memories'] }),
  });
}
export function useUpdateMemory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, value }: { id: string; value: string }) =>
      apiFetch(`/users/me/memories/${id}`, { method: 'PATCH', body: { value } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['memories'] }),
  });
}
