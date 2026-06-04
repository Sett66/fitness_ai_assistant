import {
  AuthSuccessResponseSchema,
  LoginRequestSchema,
  ProfileResponseSchema,
  RegisterRequestSchema,
} from '@fitness/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { ApiError, apiAuth, apiFetch } from '../client';
import { queryKeys } from '../queryKeys';
import { useAuthStore } from '../../store/auth-store';

export function useLogin() {
  const setTokens = useAuthStore((s) => s.setTokens);
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: Parameters<typeof LoginRequestSchema.parse>[0]) => {
      const data = AuthSuccessResponseSchema.parse(
        await apiAuth('/auth/login', LoginRequestSchema.parse(input)),
      );
      await setTokens(data.tokens);
      return data;
    },
    onSuccess: () => qc.invalidateQueries(),
  });
}

export function useRegister() {
  const setTokens = useAuthStore((s) => s.setTokens);
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: Parameters<typeof RegisterRequestSchema.parse>[0]) => {
      const data = AuthSuccessResponseSchema.parse(
        await apiAuth('/auth/register', RegisterRequestSchema.parse(input)),
      );
      await setTokens(data.tokens);
      return data;
    },
    onSuccess: () => qc.invalidateQueries(),
  });
}

export function useLogout() {
  const clearAuth = useAuthStore((s) => s.clearAuth);
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      await clearAuth();
    },
    onSuccess: () => qc.clear(),
  });
}

export function useProfile() {
  return useQuery({
    queryKey: queryKeys.profile,
    queryFn: async () => {
      try {
        const json = await apiFetch<unknown>('/users/me/profile');
        return ProfileResponseSchema.parse(json);
      } catch (err) {
        if (err instanceof ApiError && err.status === 404) {
          return null;
        }
        throw err;
      }
    },
    retry: false,
  });
}
