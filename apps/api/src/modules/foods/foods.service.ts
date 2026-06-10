import type { Food as FoodEntity } from '@fitness/db';
import type { FoodSource } from '@fitness/db';
import { Injectable } from '@nestjs/common';
import type { FoodResponse } from '@fitness/shared';
import {
  CreateFoodSchema,
  IdSchema,
  PaginationQuerySchema,
  UpdateFoodSchema,
} from '@fitness/shared';
import { errorMessagesZhCN } from '@fitness/shared';

import type { JwtUserPayload } from '../../common/decorators/current-user.decorator';
import { BizException } from '../../common/exceptions/biz-exception';
import { parseWith } from '../../common/zod/parse-with';
import { PrismaService } from '../../infra/prisma/prisma.service';

export type PaginatedFoodList = {
  items: FoodResponse[];
  nextCursor: string | null;
};

const OFFICIAL: FoodSource = 'OFFICIAL';

@Injectable()
export class FoodsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(user: JwtUserPayload, query: unknown): Promise<PaginatedFoodList> {
    const { cursor, limit } = parseWith(PaginationQuerySchema, query);
    const pageLimit = limit ?? 20;

    const items = await this.prisma.client.food.findMany({
      where: {
        deletedAt: null,
        OR: [{ ownerUserId: null, source: OFFICIAL }, { ownerUserId: user.userId }],
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
    return { items: page.map(mapFood), nextCursor };
  }

  async getById(user: JwtUserPayload, idParam: unknown): Promise<FoodResponse> {
    const id = IdSchema.parse(idParam);
    const f = await this.prisma.client.food.findFirst({
      where: {
        id,
        deletedAt: null,
        OR: [{ ownerUserId: null, source: OFFICIAL }, { ownerUserId: user.userId }],
      },
    });
    if (!f) {
      throw new BizException('NOT_FOUND', errorMessagesZhCN.NOT_FOUND, 404);
    }
    return mapFood(f);
  }

  async create(user: JwtUserPayload, body: unknown): Promise<FoodResponse> {
    const data = parseWith(CreateFoodSchema, body);
    const created = await this.prisma.client.food.create({
      data: {
        nameZh: data.nameZh,
        nameEn: data.nameEn ?? null,
        per100gKcal: data.per100g.kcal,
        per100gProtein: data.per100g.protein,
        per100gCarbs: data.per100g.carbs,
        per100gFat: data.per100g.fat,
        per100gFiber: data.per100g.fiber ?? null,
        per100gSodium: data.per100g.sodium ?? null,
        source: 'USER',
        ownerUserId: user.userId,
      },
    });
    return mapFood(created);
  }

  async update(user: JwtUserPayload, idParam: unknown, body: unknown): Promise<FoodResponse> {
    const id = IdSchema.parse(idParam);
    const patch = parseWith(UpdateFoodSchema, body);

    const existing = await this.prisma.client.food.findFirst({
      where: { id, deletedAt: null },
    });
    if (!existing) {
      throw new BizException('NOT_FOUND', errorMessagesZhCN.NOT_FOUND, 404);
    }
    if (existing.ownerUserId !== user.userId || existing.source !== 'USER') {
      throw new BizException('FORBIDDEN', errorMessagesZhCN.FORBIDDEN, 403);
    }

    const per = patch.per100g;
    const updated = await this.prisma.client.food.update({
      where: { id },
      data: {
        ...(patch.nameZh !== undefined ? { nameZh: patch.nameZh } : {}),
        ...(patch.nameEn !== undefined ? { nameEn: patch.nameEn } : {}),
        ...(per
          ? {
              per100gKcal: per.kcal,
              per100gProtein: per.protein,
              per100gCarbs: per.carbs,
              per100gFat: per.fat,
              ...(per.fiber !== undefined ? { per100gFiber: per.fiber } : {}),
              ...(per.sodium !== undefined ? { per100gSodium: per.sodium } : {}),
            }
          : {}),
      },
    });
    return mapFood(updated);
  }

  async softDelete(user: JwtUserPayload, idParam: unknown): Promise<{ ok: true }> {
    const id = IdSchema.parse(idParam);
    const existing = await this.prisma.client.food.findFirst({
      where: { id, deletedAt: null },
    });
    if (!existing) {
      throw new BizException('NOT_FOUND', errorMessagesZhCN.NOT_FOUND, 404);
    }
    if (existing.ownerUserId !== user.userId || existing.source !== 'USER') {
      throw new BizException('FORBIDDEN', errorMessagesZhCN.FORBIDDEN, 403);
    }

    await this.prisma.client.food.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
    return { ok: true };
  }
}

function mapFood(f: FoodEntity): FoodResponse {
  return {
    id: f.id,
    nameZh: f.nameZh,
    nameEn: f.nameEn,
    ownerUserId: f.ownerUserId ?? undefined,
    source: f.source,
    createdAt: f.createdAt,
    updatedAt: f.updatedAt ?? f.createdAt,
    deletedAt: f.deletedAt ?? undefined,
    per100g: {
      protein: f.per100gProtein,
      carbs: f.per100gCarbs,
      fat: f.per100gFat,
      fiber: f.per100gFiber ?? undefined,
      sodium: f.per100gSodium ?? undefined,
      kcal: f.per100gKcal,
    },
  };
}
