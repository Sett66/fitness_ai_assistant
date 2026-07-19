import { Injectable, Logger } from '@nestjs/common';
import type { LocationSource, Profile, StrengthLevel, User } from '@fitness/db';
import type { ExerciseEquipment } from '@fitness/shared';
import {
  CreateProfileSchema,
  CreateStrengthLevelSchema,
  IdSchema,
  UpdateMeSchema,
  UpdateProfileSchema,
  UpdateStrengthLevelSchema,
  UpsertUserLocationSchema,
  UserLocationNullableResponseSchema,
  UserLocationResponseSchema,
} from '@fitness/shared';
import type { MeResponse, OnboardingStep, UserLocationResponse } from '@fitness/shared';
import { errorMessagesZhCN } from '@fitness/shared';

import type { JwtUserPayload } from '../../common/decorators/current-user.decorator';
import { BizException } from '../../common/exceptions/biz-exception';
import { parseWith } from '../../common/zod/parse-with';
import { AmapClient } from '../../infra/geo/amap.client';
import { S3StorageService } from '../../infra/storage/s3-storage.service';
import { PrismaService } from '../../infra/prisma/prisma.service';

type StrengthWithExercise = StrengthLevel & {
  exercise: { nameZh: string; equipment: ExerciseEquipment };
};

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: S3StorageService,
    private readonly amap: AmapClient,
  ) {}

  async getMe(user: JwtUserPayload): Promise<MeResponse> {
    const row = await this.prisma.client.user.findUnique({
      where: { id: user.userId },
      include: {
        avatarMedia: true,
        profile: true,
      },
    });
    if (!row) {
      throw new BizException('USER_NOT_FOUND', errorMessagesZhCN.USER_NOT_FOUND, 404);
    }

    const onboarding = computeOnboarding(row.profile, row.displayName);
    return {
      user: await mapMeUser(row, this.storage),
      profile: row.profile ? mapProfile(row.profile) : null,
      onboarding,
    };
  }

  async updateMe(user: JwtUserPayload, body: unknown) {
    const data = parseWith(UpdateMeSchema, body);
    if (data.avatarMediaId) {
      await assertMediaOwned(user.userId, data.avatarMediaId, this.prisma);
    }
    const updated = await this.prisma.client.user.update({
      where: { id: user.userId },
      data,
      include: { avatarMedia: true, profile: true },
    });
    const onboarding = computeOnboarding(updated.profile, updated.displayName);
    return {
      user: await mapMeUser(updated, this.storage),
      profile: updated.profile ? mapProfile(updated.profile) : null,
      onboarding,
    };
  }

  async getProfile(user: JwtUserPayload): Promise<Profile> {
    const profile = await this.prisma.client.profile.findUnique({
      where: { userId: user.userId },
    });
    if (!profile) {
      throw new BizException('PROFILE_INCOMPLETE', errorMessagesZhCN.PROFILE_INCOMPLETE, 404);
    }
    return profile;
  }

  /** 全量 upsert（首�?/ 完整覆盖共用同一契约�?*/
  async putProfile(user: JwtUserPayload, body: unknown): Promise<Profile> {
    const data = parseWith(CreateProfileSchema, body);
    return this.prisma.client.profile.upsert({
      where: { userId: user.userId },
      update: data,
      create: { userId: user.userId, ...data },
    });
  }

  async patchProfile(user: JwtUserPayload, body: unknown): Promise<Profile> {
    const data = parseWith(UpdateProfileSchema, body);
    const existing = await this.prisma.client.profile.findUnique({
      where: { userId: user.userId },
    });
    if (!existing) {
      throw new BizException('PROFILE_INCOMPLETE', errorMessagesZhCN.PROFILE_INCOMPLETE, 404);
    }
    return this.prisma.client.profile.update({
      where: { userId: user.userId },
      data,
    });
  }

  async deleteProfile(user: JwtUserPayload): Promise<{ ok: true }> {
    await this.prisma.client.profile.delete({
      where: { userId: user.userId },
    });
    return { ok: true };
  }

  /** GET /users/me/location — 仅本人可读，返回最新 snapshot 或 null */
  async getLatestLocation(user: JwtUserPayload): Promise<UserLocationResponse | null> {
    const row = await this.prisma.client.userLocationSnapshot.findFirst({
      where: { userId: user.userId },
      orderBy: { createdAt: 'desc' },
    });
    if (!row) {
      return UserLocationNullableResponseSchema.parse(null);
    }
    return mapLocationSnapshot(row);
  }

  /** PUT /users/me/location — append-only 快照历史 */
  async upsertLocation(user: JwtUserPayload, body: unknown): Promise<UserLocationResponse> {
    const input = parseWith(UpsertUserLocationSchema, body);
    let city = input.city?.trim() || undefined;
    let source: LocationSource = input.source;

    if (!city && this.amap.isConfigured()) {
      try {
        const regeocoded = await this.amap.regeocode(input.lat, input.lng);
        city = regeocoded.city;
        source = 'GEOCODE';
      } catch (err: unknown) {
        this.logger.debug(
          `逆地理编码跳过 userId=${user.userId} coords=${formatCoordsForLog(input.lat, input.lng)}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    const row = await this.prisma.client.userLocationSnapshot.create({
      data: {
        userId: user.userId,
        lat: input.lat,
        lng: input.lng,
        city: city ?? null,
        source,
      },
    });

    this.logger.debug(
      `位置快照 userId=${user.userId} source=${source} coords=${formatCoordsForLog(row.lat, row.lng)}`,
    );

    return mapLocationSnapshot(row);
  }

  async listStrength(user: JwtUserPayload): Promise<StrengthWithExercise[]> {
    return this.prisma.client.strengthLevel.findMany({
      where: { userId: user.userId },
      include: { exercise: { select: { nameZh: true, equipment: true } } },
      orderBy: { recordedAt: 'desc' },
    });
  }

  async createStrength(user: JwtUserPayload, body: unknown): Promise<StrengthWithExercise> {
    const input = parseWith(CreateStrengthLevelSchema, body);
    const exercise = await assertExerciseAccessible(user.userId, input.exerciseId, this.prisma);
    const payload = normalizeStrengthPayload(exercise.equipment, input);

    const row = await this.prisma.client.strengthLevel.upsert({
      where: {
        userId_exerciseId: {
          userId: user.userId,
          exerciseId: input.exerciseId,
        },
      },
      update: {
        ...payload,
        recordedAt: new Date(),
      },
      create: {
        userId: user.userId,
        exerciseId: input.exerciseId,
        ...payload,
      },
      include: { exercise: { select: { nameZh: true, equipment: true } } },
    });
    return row;
  }

  async updateStrength(
    user: JwtUserPayload,
    idParam: unknown,
    body: unknown,
  ): Promise<StrengthWithExercise> {
    const strengthId = IdSchema.parse(idParam);
    const input = parseWith(UpdateStrengthLevelSchema, body);

    if (input.exerciseId) {
      await assertExerciseAccessible(user.userId, input.exerciseId, this.prisma);
    }

    const existing = await this.prisma.client.strengthLevel.findFirst({
      where: { id: strengthId, userId: user.userId },
      include: { exercise: { select: { equipment: true } } },
    });
    if (!existing) {
      throw new BizException('NOT_FOUND', errorMessagesZhCN.NOT_FOUND, 404);
    }

    const merged = {
      exerciseId: input.exerciseId ?? existing.exerciseId,
      oneRm: input.oneRm !== undefined ? input.oneRm : existing.oneRm,
      workingWeightKg:
        input.workingWeightKg !== undefined ? input.workingWeightKg : existing.workingWeightKg,
      maxReps: input.maxReps !== undefined ? input.maxReps : existing.maxReps,
      loadAdjustmentKg:
        input.loadAdjustmentKg !== undefined ? input.loadAdjustmentKg : existing.loadAdjustmentKg,
    };

    let equipment = existing.exercise.equipment;
    if (input.exerciseId && input.exerciseId !== existing.exerciseId) {
      const exercise = await assertExerciseAccessible(user.userId, input.exerciseId, this.prisma);
      equipment = exercise.equipment;
    }

    const payload = normalizeStrengthPayload(equipment, merged);

    return this.prisma.client.strengthLevel.update({
      where: { id: strengthId },
      data: {
        exerciseId: merged.exerciseId,
        ...payload,
        recordedAt: new Date(),
      },
      include: { exercise: { select: { nameZh: true, equipment: true } } },
    });
  }

  async deleteStrength(user: JwtUserPayload, idParam: unknown): Promise<{ ok: true }> {
    const strengthId = IdSchema.parse(idParam);
    const rows = await this.prisma.client.strengthLevel.deleteMany({
      where: { id: strengthId, userId: user.userId },
    });
    if (rows.count !== 1) {
      throw new BizException('NOT_FOUND', errorMessagesZhCN.NOT_FOUND, 404);
    }
    return { ok: true };
  }
}

function computeOnboarding(
  profile: Profile | null | undefined,
  displayName: string | null | undefined,
): { complete: boolean; step: OnboardingStep } {
  if (!profile) {
    return { complete: false, step: 'BASIC' };
  }
  if (!displayName || displayName.trim().length < 2) {
    return { complete: false, step: 'IDENTITY' };
  }
  return { complete: true, step: 'DONE' };
}

function mapProfile(profile: Profile) {
  return {
    userId: profile.userId,
    gender: profile.gender,
    birthDate: profile.birthDate,
    heightCm: profile.heightCm,
    weightKg: profile.weightKg,
    trainingYears: profile.trainingYears,
    goal: profile.goal,
    updatedAt: profile.updatedAt,
  };
}

/** 头像读链有效期；media bucket 为私有，需签发预签名 URL 才能被客户端加载 */
const AVATAR_READ_URL_TTL_SEC = 60 * 60;

async function mapMeUser(
  user: User & { avatarMedia?: { objectKey: string } | null },
  storage: S3StorageService,
) {
  const avatarUrl = user.avatarMedia
    ? await storage.presignGet(user.avatarMedia.objectKey, AVATAR_READ_URL_TTL_SEC)
    : null;
  return {
    id: user.id,
    phone: user.phone,
    displayName: user.displayName,
    avatarMediaId: user.avatarMediaId,
    avatarUrl,
    role: user.role,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
    deletedAt: user.deletedAt,
  };
}

function mapStrength(row: StrengthWithExercise) {
  return {
    id: row.id,
    userId: row.userId,
    exerciseId: row.exerciseId,
    exerciseName: row.exercise.nameZh,
    exerciseEquipment: row.exercise.equipment,
    oneRm: row.oneRm,
    workingWeightKg: row.workingWeightKg,
    maxReps: row.maxReps,
    loadAdjustmentKg: row.loadAdjustmentKg,
    recordedAt: row.recordedAt,
  };
}

function normalizeStrengthPayload(
  equipment: ExerciseEquipment,
  input: {
    oneRm?: number | null;
    workingWeightKg?: number | null;
    maxReps?: number | null;
    loadAdjustmentKg?: number | null;
  },
): {
  oneRm: number | null;
  workingWeightKg: number | null;
  maxReps: number | null;
  loadAdjustmentKg: number | null;
} {
  if (equipment === 'BODYWEIGHT') {
    const hasBodyweight =
      (input.maxReps != null && input.maxReps > 0) ||
      (input.loadAdjustmentKg != null && input.loadAdjustmentKg !== 0);
    if (!hasBodyweight) {
      throw new BizException('VALIDATION_FAILED', '请填写最大次数或辅助/负重信息', 400);
    }
    return {
      oneRm: null,
      workingWeightKg: null,
      maxReps: input.maxReps ?? null,
      loadAdjustmentKg: input.loadAdjustmentKg ?? null,
    };
  }

  const hasLoaded =
    (input.oneRm != null && input.oneRm > 0) ||
    (input.workingWeightKg != null && input.workingWeightKg > 0);
  if (!hasLoaded) {
    throw new BizException('VALIDATION_FAILED', '请至少填写极限重量或做组重量', 400);
  }
  return {
    oneRm: input.oneRm ?? null,
    workingWeightKg: input.workingWeightKg ?? null,
    maxReps: null,
    loadAdjustmentKg: null,
  };
}

async function assertExerciseAccessible(
  userId: string,
  exerciseId: string,
  prisma: PrismaService,
): Promise<{ id: string; equipment: ExerciseEquipment }> {
  const ex = await prisma.client.exercise.findFirst({
    where: {
      id: exerciseId,
      deletedAt: null,
      OR: [{ isPreset: true }, { ownerUserId: userId }],
    },
    select: { id: true, equipment: true },
  });
  if (!ex) {
    throw new BizException('NOT_FOUND', errorMessagesZhCN.NOT_FOUND, 404);
  }
  return ex;
}

export { mapStrength };

function mapLocationSnapshot(row: {
  lat: number;
  lng: number;
  city: string | null;
  source: LocationSource;
  createdAt: Date;
}): UserLocationResponse {
  return UserLocationResponseSchema.parse({
    lat: row.lat,
    lng: row.lng,
    ...(row.city ? { city: row.city } : {}),
    source: row.source,
    updatedAt: row.createdAt,
  });
}

function formatCoordsForLog(lat: number, lng: number): string {
  const round = (value: number) => Math.round(value * 100) / 100;
  return `${round(lat)},${round(lng)}`;
}

async function assertMediaOwned(
  userId: string,
  mediaId: string,
  prisma: PrismaService,
): Promise<void> {
  const media = await prisma.client.media.findFirst({
    where: { id: mediaId, ownerUserId: userId, status: 'READY' },
  });
  if (!media) {
    throw new BizException('MEDIA_NOT_FOUND', errorMessagesZhCN.MEDIA_NOT_FOUND, 404);
  }
}
