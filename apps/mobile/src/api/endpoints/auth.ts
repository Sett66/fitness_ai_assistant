import {
  AuthSuccessResponseSchema,
  CaptchaChallengeResponseSchema,
  CaptchaVerifyRequestSchema,
  CaptchaVerifyResponseSchema,
  LoginRequestSchema,
  ProfileResponseSchema,
  RegisterRequestSchema,
  ResetPasswordRequestSchema,
  ResetPasswordResponseSchema,
  SendSmsCodeRequestSchema,
  SendSmsCodeResponseSchema,
} from '@fitness/shared';
import type {
  CaptchaChallengeResponse,
  CaptchaVerifyRequest,
  CaptchaVerifyResponse,
  ResetPasswordResponse,
  SendSmsCodeRequest,
  SendSmsCodeResponse,
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

/** 获取滑块拼图挑战 */
export async function fetchCaptchaChallenge(): Promise<CaptchaChallengeResponse> {
  const json = await apiFetch<unknown>('/auth/captcha/challenge', {
    method: 'POST',
    auth: false,
  });
  return CaptchaChallengeResponseSchema.parse(json);
}

/** 提交滑块位置校验，成功换取一次性 captchaToken */
export async function verifyCaptcha(input: CaptchaVerifyRequest): Promise<CaptchaVerifyResponse> {
  const json = await apiFetch<unknown>('/auth/captcha/verify', {
    method: 'POST',
    auth: false,
    body: CaptchaVerifyRequestSchema.parse(input),
  });
  return CaptchaVerifyResponseSchema.parse(json);
}

/** 发送短信验证码（需先通过滑块拿到 captchaToken） */
export async function sendSmsCode(input: SendSmsCodeRequest): Promise<SendSmsCodeResponse> {
  const json = await apiFetch<unknown>('/auth/send-sms-code', {
    method: 'POST',
    auth: false,
    body: SendSmsCodeRequestSchema.parse(input),
  });
  return SendSmsCodeResponseSchema.parse(json);
}

export function useResetPassword() {
  return useMutation({
    mutationFn: async (
      input: Parameters<typeof ResetPasswordRequestSchema.parse>[0],
    ): Promise<ResetPasswordResponse> => {
      const json = await apiFetch<unknown>('/auth/reset-password', {
        method: 'POST',
        auth: false,
        body: ResetPasswordRequestSchema.parse(input),
      });
      return ResetPasswordResponseSchema.parse(json);
    },
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
