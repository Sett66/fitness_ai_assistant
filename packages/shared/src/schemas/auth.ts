import { z } from 'zod';

import { PhoneSchema } from './user';

// ============================== 短信场景 ==============================

/** 短信验证码使用场景 */
export const SmsSceneSchema = z.enum(['REGISTER', 'RESET_PASSWORD']);
export type SmsScene = z.infer<typeof SmsSceneSchema>;

/** 6 位数字短信验证码 */
export const SmsCodeSchema = z.string().regex(/^\d{6}$/, '请输入 6 位验证码');
export type SmsCode = z.infer<typeof SmsCodeSchema>;

// ============================== 滑块人机验证 ==============================

/**
 * 滑块拼图挑战。后端生成缺口位置存 Redis，
 * demo 级安全：gapX 会下发用于前端渲染，前端将拼图块拖到缺口后提交 x 校验。
 */
export const CaptchaChallengeResponseSchema = z.object({
  captchaId: z.string().min(8),
  bgIndex: z.number().int().min(0),
  gapX: z.number().int().nonnegative(),
  gapY: z.number().int().nonnegative(),
  boardWidth: z.number().int().positive(),
  boardHeight: z.number().int().positive(),
  pieceSize: z.number().int().positive(),
});
export type CaptchaChallengeResponse = z.infer<typeof CaptchaChallengeResponseSchema>;

export const CaptchaVerifyRequestSchema = z.object({
  captchaId: z.string().min(8),
  x: z.number().int().nonnegative(),
});
export type CaptchaVerifyRequest = z.infer<typeof CaptchaVerifyRequestSchema>;

/** 校验通过签发一次性 captchaToken，用于换取发码资格 */
export const CaptchaVerifyResponseSchema = z.object({
  captchaToken: z.string().min(8),
});
export type CaptchaVerifyResponse = z.infer<typeof CaptchaVerifyResponseSchema>;

// ============================== 发送短信验证码 ==============================

export const SendSmsCodeRequestSchema = z.object({
  phone: PhoneSchema,
  scene: SmsSceneSchema,
  captchaToken: z.string().min(8),
});
export type SendSmsCodeRequest = z.infer<typeof SendSmsCodeRequestSchema>;

export const SendSmsCodeResponseSchema = z.object({
  sent: z.literal(true),
  cooldownSec: z.number().int().positive(),
  /** 开发模式回传固定验证码便于联调；生产为 undefined */
  devCode: z.string().optional(),
});
export type SendSmsCodeResponse = z.infer<typeof SendSmsCodeResponseSchema>;

// ============================== 重置密码 ==============================

export const ResetPasswordRequestSchema = z.object({
  phone: PhoneSchema,
  // 与注册同规则：8–64 位含字母与数字，避免循环依赖此处直接内联
  password: z
    .string()
    .min(8, '密码至少 8 位')
    .max(64, '密码不超过 64 位')
    .regex(/[A-Za-z]/, '密码需含字母')
    .regex(/\d/, '密码需含数字'),
  smsCode: SmsCodeSchema,
});
export type ResetPasswordRequest = z.infer<typeof ResetPasswordRequestSchema>;

export const ResetPasswordResponseSchema = z.object({
  ok: z.literal(true),
});
export type ResetPasswordResponse = z.infer<typeof ResetPasswordResponseSchema>;
