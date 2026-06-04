import type { Profile, StrengthLevel, User } from '@fitness/db';
import type { ExerciseEquipment } from '@fitness/shared';
import { Injectable } from '@nestjs/common';
import {
  CreateProfileSchema,
  CreateStrengthLevelSchema,
  IdSchema,
  UpdateMeSchema,
  UpdateProfileSchema,
  UpdateStrengthLevelSchema,
} from '@fitness/shared';
import type { MeResponse, OnboardingStep } from '@fitness/shared';
import { errorMessagesZhCN } from '@fitness/shared';

import type { JwtUserPayload } from '../../common/decorators/current-user.decorator';
import { BizException } from '../../common/exceptions/biz-exception';
import { parseWith } from '../../common/zod/parse-with';
import { type S3StorageService } from '../../infra/storage/s3-storage.service';
import { type PrismaService } from '../../infra/prisma/prisma.service';

type StrengthWithExercise = StrengthLevel & {
  exercise: { nameZh: string; equipment: ExerciseEquipment };
};

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: S3StorageService,
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
      user: mapMeUser(row, this.storage),
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
      user: mapMeUser(updated, this.storage),
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

  /** 全量 upsert（首建 / 完整覆盖共用同一契约） */
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

function mapMeUser(
  user: User & { avatarMedia?: { objectKey: string } | null },
  storage: S3StorageService,
) {
  return {
    id: user.id,
    phone: user.phone,
    displayName: user.displayName,
    avatarMediaId: user.avatarMediaId,
    avatarUrl: user.avatarMedia ? storage.getPublicUrl(user.avatarMedia.objectKey) : null,
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
