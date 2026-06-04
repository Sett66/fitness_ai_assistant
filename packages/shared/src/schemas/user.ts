import { z } from 'zod';
import { ExerciseEquipmentSchema, GenderSchema, GoalSchema, RoleSchema } from '../enums';
import { DateTimeSchema, EntityBaseSchema, IdSchema } from './_common';

// ============================== 字符串规则 ==============================

/** 中国大陆手机号；demo 阶段不做严格运营商段校验 */
export const PhoneSchema = z.string().regex(/^1[3-9]\d{9}$/, '请输入有效的 11 位手机号');
export type Phone = z.infer<typeof PhoneSchema>;

/** 注册密码：8–64 位，至少一个字母 + 一个数字 */
export const PasswordPlainSchema = z
  .string()
  .min(8, '密码至少 8 位')
  .max(64, '密码不超过 64 位')
  .regex(/[A-Za-z]/, '密码需含字母')
  .regex(/\d/, '密码需含数字');
export type PasswordPlain = z.infer<typeof PasswordPlainSchema>;

/** 用户名 / 昵称 */
export const DisplayNameSchema = z
  .string()
  .trim()
  .min(2, '用户名至少 2 个字符')
  .max(20, '用户名不超过 20 个字符');
export type DisplayName = z.infer<typeof DisplayNameSchema>;

// ============================== User ==============================

export const UserSchema = EntityBaseSchema.extend({
  phone: PhoneSchema,
  passwordHash: z.string().min(1),
  displayName: DisplayNameSchema.nullable().optional(),
  avatarMediaId: IdSchema.nullable().optional(),
  role: RoleSchema.default('USER'),
});
export type User = z.infer<typeof UserSchema>;

export const CreateUserSchema = z.object({
  phone: PhoneSchema,
  password: PasswordPlainSchema,
});
export type CreateUserInput = z.infer<typeof CreateUserSchema>;

export const UpdateUserSchema = z
  .object({
    phone: PhoneSchema,
    role: RoleSchema,
    displayName: DisplayNameSchema.nullable(),
    avatarMediaId: IdSchema.nullable(),
  })
  .partial();
export type UpdateUserInput = z.infer<typeof UpdateUserSchema>;

/** PATCH /users/me — 客户端可更新字段 */
export const UpdateMeSchema = z
  .object({
    displayName: DisplayNameSchema,
    avatarMediaId: IdSchema.nullable(),
  })
  .partial();
export type UpdateMeInput = z.infer<typeof UpdateMeSchema>;

/** 对外脱敏：不含 passwordHash（ARCH §8.1 跨端类型一致） */
export const UserResponseSchema = UserSchema.omit({ passwordHash: true });
export type UserResponse = z.infer<typeof UserResponseSchema>;

export const MeUserResponseSchema = UserResponseSchema.extend({
  avatarUrl: z.string().nullable().optional(),
});
export type MeUserResponse = z.infer<typeof MeUserResponseSchema>;

// ============================== Profile ==============================

export const ProfileSchema = z.object({
  userId: IdSchema,
  gender: GenderSchema,
  birthDate: DateTimeSchema,
  heightCm: z.number().positive().min(30).max(300),
  weightKg: z.number().positive().min(10).max(500),
  trainingYears: z.number().nonnegative().max(80),
  goal: GoalSchema,
  updatedAt: DateTimeSchema.optional(),
});
export type Profile = z.infer<typeof ProfileSchema>;

export const CreateProfileSchema = ProfileSchema.omit({
  userId: true,
  updatedAt: true,
});
export type CreateProfileInput = z.infer<typeof CreateProfileSchema>;

/** Onboarding Step 1：基础体征 */
export const OnboardingBasicProfileSchema = z.object({
  gender: GenderSchema,
  birthDate: DateTimeSchema,
  heightCm: z.number().positive().min(30).max(300),
  weightKg: z.number().positive().min(10).max(500),
});
export type OnboardingBasicProfileInput = z.infer<typeof OnboardingBasicProfileSchema>;

/** Onboarding Step 2：身份与目标 */
export const OnboardingIdentitySchema = z.object({
  displayName: DisplayNameSchema,
  goal: GoalSchema,
  avatarMediaId: IdSchema.nullable().optional(),
});
export type OnboardingIdentityInput = z.infer<typeof OnboardingIdentitySchema>;

/** Onboarding Step 3：可选训练背景 */
export const OnboardingOptionalProfileSchema = z.object({
  trainingYears: z.number().nonnegative().max(80).optional(),
});
export type OnboardingOptionalProfileInput = z.infer<typeof OnboardingOptionalProfileSchema>;

export const UpdateProfileSchema = CreateProfileSchema.partial();
export type UpdateProfileInput = z.infer<typeof UpdateProfileSchema>;

export const ProfileResponseSchema = ProfileSchema;
export type ProfileResponse = z.infer<typeof ProfileResponseSchema>;

// ============================== Onboarding 状态 ==============================

export const OnboardingStepSchema = z.enum(['BASIC', 'IDENTITY', 'OPTIONAL', 'DONE']);
export type OnboardingStep = z.infer<typeof OnboardingStepSchema>;

export const OnboardingStatusSchema = z.object({
  complete: z.boolean(),
  step: OnboardingStepSchema,
});
export type OnboardingStatus = z.infer<typeof OnboardingStatusSchema>;

export const MeResponseSchema = z.object({
  user: MeUserResponseSchema,
  profile: ProfileResponseSchema.nullable(),
  onboarding: OnboardingStatusSchema,
});
export type MeResponse = z.infer<typeof MeResponseSchema>;

// ============================== StrengthLevel ==============================

export const StrengthLevelSchema = z.object({
  id: IdSchema,
  userId: IdSchema,
  exerciseId: IdSchema,
  exerciseName: z.string().min(1).optional(),
  exerciseEquipment: ExerciseEquipmentSchema.optional(),
  oneRm: z.number().positive().max(1000).nullable().optional(),
  workingWeightKg: z.number().positive().max(1000).nullable().optional(),
  maxReps: z.number().int().min(1).max(200).nullable().optional(),
  loadAdjustmentKg: z.number().min(-500).max(500).nullable().optional(),
  recordedAt: DateTimeSchema,
});
export type StrengthLevel = z.infer<typeof StrengthLevelSchema>;

const strengthRecordRefine = (
  data: {
    oneRm?: number | null;
    workingWeightKg?: number | null;
    maxReps?: number | null;
    loadAdjustmentKg?: number | null;
  },
  ctx: z.RefinementCtx,
) => {
  const hasLoaded =
    (data.oneRm != null && data.oneRm > 0) ||
    (data.workingWeightKg != null && data.workingWeightKg > 0);
  const hasBodyweight =
    (data.maxReps != null && data.maxReps > 0) ||
    (data.loadAdjustmentKg != null && data.loadAdjustmentKg !== 0);
  if (!hasLoaded && !hasBodyweight) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: '请填写重量或次数/辅助/负重信息',
      path: ['oneRm'],
    });
  }
};

export const CreateStrengthLevelSchema = z
  .object({
    exerciseId: IdSchema,
    oneRm: z.number().positive().max(1000).nullable().optional(),
    workingWeightKg: z.number().positive().max(1000).nullable().optional(),
    maxReps: z.number().int().min(1).max(200).nullable().optional(),
    loadAdjustmentKg: z.number().min(-500).max(500).nullable().optional(),
  })
  .superRefine(strengthRecordRefine);
export type CreateStrengthLevelInput = z.infer<typeof CreateStrengthLevelSchema>;

export const UpdateStrengthLevelSchema = z
  .object({
    exerciseId: IdSchema,
    oneRm: z.number().positive().max(1000).nullable().optional(),
    workingWeightKg: z.number().positive().max(1000).nullable().optional(),
    maxReps: z.number().int().min(1).max(200).nullable().optional(),
    loadAdjustmentKg: z.number().min(-500).max(500).nullable().optional(),
  })
  .partial()
  .superRefine((data, ctx) => {
    if (
      data.oneRm === undefined &&
      data.workingWeightKg === undefined &&
      data.maxReps === undefined &&
      data.loadAdjustmentKg === undefined
    ) {
      return;
    }
    strengthRecordRefine(
      {
        oneRm: data.oneRm ?? null,
        workingWeightKg: data.workingWeightKg ?? null,
        maxReps: data.maxReps ?? null,
        loadAdjustmentKg: data.loadAdjustmentKg ?? null,
      },
      ctx,
    );
  });
export type UpdateStrengthLevelInput = z.infer<typeof UpdateStrengthLevelSchema>;

export const StrengthLevelResponseSchema = StrengthLevelSchema;
export type StrengthLevelResponse = z.infer<typeof StrengthLevelResponseSchema>;

// ============================== Session（refresh token） ==============================

export const SessionSchema = z.object({
  id: IdSchema,
  userId: IdSchema,
  refreshTokenHash: z.string().min(1),
  deviceLabel: z.string().max(128).nullable().optional(),
  expiresAt: DateTimeSchema,
  revokedAt: DateTimeSchema.nullable().optional(),
  createdAt: DateTimeSchema,
});
export type Session = z.infer<typeof SessionSchema>;

export const CreateSessionSchema = SessionSchema.omit({
  id: true,
  createdAt: true,
  revokedAt: true,
});
export type CreateSessionInput = z.infer<typeof CreateSessionSchema>;

export const UpdateSessionSchema = z
  .object({
    revokedAt: DateTimeSchema.nullable(),
    expiresAt: DateTimeSchema,
  })
  .partial();
export type UpdateSessionInput = z.infer<typeof UpdateSessionSchema>;

/** 对外只暴露非敏感字段 */
export const SessionResponseSchema = SessionSchema.omit({ refreshTokenHash: true });
export type SessionResponse = z.infer<typeof SessionResponseSchema>;

// ============================== Auth 请求 / 响应（ARCH §7） ==============================

export const RegisterRequestSchema = CreateUserSchema;
export type RegisterRequest = z.infer<typeof RegisterRequestSchema>;

export const LoginRequestSchema = z.object({
  phone: PhoneSchema,
  password: PasswordPlainSchema,
});
export type LoginRequest = z.infer<typeof LoginRequestSchema>;

export const TokenPairSchema = z.object({
  accessToken: z.string().min(1),
  refreshToken: z.string().min(1),
  expiresInSec: z.number().int().positive(),
});
export type TokenPair = z.infer<typeof TokenPairSchema>;

export const RefreshRequestSchema = z.object({
  refreshToken: z.string().min(1),
});
export type RefreshRequest = z.infer<typeof RefreshRequestSchema>;

/** 登录 / 注册成功统一响应 */
export const AuthSuccessResponseSchema = z.object({
  user: UserResponseSchema,
  tokens: TokenPairSchema,
});
export type AuthSuccessResponse = z.infer<typeof AuthSuccessResponseSchema>;
