import type { Exercise as ExerciseEntity } from '@fitness/db';
import { Injectable } from '@nestjs/common';
import type { ExerciseResponse } from '@fitness/shared';
import {
  CreateExerciseSchema,
  IdSchema,
  PaginationQuerySchema,
  UpdateExerciseSchema,
} from '@fitness/shared';
import { errorMessagesZhCN } from '@fitness/shared';

import type { JwtUserPayload } from '../../common/decorators/current-user.decorator';
import { BizException } from '../../common/exceptions/biz-exception';
import { parseWith } from '../../common/zod/parse-with';
import { PrismaService } from '../../infra/prisma/prisma.service';

export type PaginatedExerciseList = {
  items: ExerciseResponse[];
  nextCursor: string | null;
};

@Injectable()
export class ExercisesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(user: JwtUserPayload, query: unknown): Promise<PaginatedExerciseList> {
    const { cursor, limit } = parseWith(PaginationQuerySchema, query);
    const pageLimit = limit ?? 20;

    const items = await this.prisma.client.exercise.findMany({
      where: {
        deletedAt: null,
        OR: [{ isPreset: true }, { ownerUserId: user.userId }],
      },
      take: pageLimit + 1,
      ...(cursor
        ? {
            skip: 1,
            cursor: { id: cursor },
          }
        : {}),
      orderBy: { id: 'asc' },
    });

    const hasMore = items.length > pageLimit;
    const page = hasMore ? items.slice(0, pageLimit) : items;
    const nextCursor = hasMore && page.length > 0 ? (page[page.length - 1]?.id ?? null) : null;
    return { items: page.map(mapExercise), nextCursor };
  }

  async getById(user: JwtUserPayload, idParam: unknown): Promise<ExerciseResponse> {
    const id = IdSchema.parse(idParam);
    const ex = await this.prisma.client.exercise.findFirst({
      where: {
        id,
        deletedAt: null,
        OR: [{ isPreset: true }, { ownerUserId: user.userId }],
      },
    });
    if (!ex) {
      throw new BizException('NOT_FOUND', errorMessagesZhCN.NOT_FOUND, 404);
    }
    return mapExercise(ex);
  }

  async create(user: JwtUserPayload, body: unknown): Promise<ExerciseResponse> {
    const data = parseWith(CreateExerciseSchema, body);
    const created = await this.prisma.client.exercise.create({
      data: {
        ...data,
        isPreset: false,
        ownerUserId: user.userId,
      },
    });
    return mapExercise(created);
  }

  async update(user: JwtUserPayload, idParam: unknown, body: unknown): Promise<ExerciseResponse> {
    const id = IdSchema.parse(idParam);
    const patch = parseWith(UpdateExerciseSchema, body);

    const existing = await this.prisma.client.exercise.findFirst({
      where: { id, deletedAt: null },
    });
    if (!existing) {
      throw new BizException('NOT_FOUND', errorMessagesZhCN.NOT_FOUND, 404);
    }
    if (existing.isPreset || existing.ownerUserId !== user.userId) {
      throw new BizException('FORBIDDEN', errorMessagesZhCN.FORBIDDEN, 403);
    }

    const updated = await this.prisma.client.exercise.update({
      where: { id },
      data: patch,
    });
    return mapExercise(updated);
  }

  async softDelete(user: JwtUserPayload, idParam: unknown): Promise<{ ok: true }> {
    const id = IdSchema.parse(idParam);
    const existing = await this.prisma.client.exercise.findFirst({
      where: { id, deletedAt: null },
    });
    if (!existing) {
      throw new BizException('NOT_FOUND', errorMessagesZhCN.NOT_FOUND, 404);
    }
    if (existing.isPreset || existing.ownerUserId !== user.userId) {
      throw new BizException('FORBIDDEN', errorMessagesZhCN.FORBIDDEN, 403);
    }

    await this.prisma.client.exercise.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
    return { ok: true };
  }
}

function mapExercise(ex: ExerciseEntity): ExerciseResponse {
  return {
    id: ex.id,
    nameZh: ex.nameZh,
    nameEn: ex.nameEn,
    primaryMuscle: ex.primaryMuscle,
    secondaryMuscles: ex.secondaryMuscles,
    equipment: ex.equipment,
    difficulty: ex.difficulty,
    isPreset: ex.isPreset,
    ownerUserId: ex.ownerUserId ?? undefined,
    mediaUrl: ex.mediaUrl ?? undefined,
    createdAt: ex.createdAt,
    updatedAt: ex.updatedAt ?? ex.createdAt,
    deletedAt: ex.deletedAt ?? undefined,
  };
}
