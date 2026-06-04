import type { MealLog as MealLogEntity, MealLogItem as MealLogItemEntity } from '@fitness/db';
import { Injectable } from '@nestjs/common';
import type {
  MealLogResponse,
  MealType,
  MealVisionResult,
  NutritionDailySummary,
} from '@fitness/shared';
import {
  CreateMealLogSchema,
  IdSchema,
  PaginationQuerySchema,
  localDateString,
  localDayUtcRange,
} from '@fitness/shared';
import { errorMessagesZhCN } from '@fitness/shared';

import type { JwtUserPayload } from '../../common/decorators/current-user.decorator';
import { BizException } from '../../common/exceptions/biz-exception';
import { parseWith } from '../../common/zod/parse-with';
import { type NutritionDailyService } from '../../domain/nutrition-daily.service';
import { type PrismaService } from '../../infra/prisma/prisma.service';

@Injectable()
export class MealLogsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly nutritionDaily: NutritionDailyService,
  ) {}

  async list(
    user: JwtUserPayload,
    query: unknown,
  ): Promise<{ items: MealLogResponse[]; nextCursor: string | null }> {
    const { cursor, limit } = parseWith(PaginationQuerySchema, query);
    const date =
      typeof query === 'object' && query != null && 'date' in query
        ? String((query as { date?: string }).date ?? '')
        : '';
    const tz =
      typeof query === 'object' && query != null && 'timezoneOffsetMinutes' in query
        ? Number((query as { timezoneOffsetMinutes?: number }).timezoneOffsetMinutes ?? 480)
        : 480;

    const pageLimit = limit ?? 20;
    const where: {
      userId: string;
      deletedAt: null;
      takenAt?: { gte: Date; lt: Date };
    } = { userId: user.userId, deletedAt: null };

    if (date && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
      const range = localDayUtcRange(date, tz);
      where.takenAt = { gte: range.start, lt: range.end };
    }

    const rows = await this.prisma.client.mealLog.findMany({
      where,
      include: { items: true },
      take: pageLimit + 1,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      orderBy: { takenAt: 'desc' },
    });

    const hasMore = rows.length > pageLimit;
    const page = hasMore ? rows.slice(0, pageLimit) : rows;
    return {
      items: page.map(mapMealLog),
      nextCursor: hasMore && page.length > 0 ? (page[page.length - 1]?.id ?? null) : null,
    };
  }

  async getById(user: JwtUserPayload, idParam: unknown): Promise<MealLogResponse> {
    const id = IdSchema.parse(idParam);
    const row = await this.prisma.client.mealLog.findFirst({
      where: { id, userId: user.userId, deletedAt: null },
      include: { items: true },
    });
    if (!row) {
      throw new BizException('NOT_FOUND', errorMessagesZhCN.NOT_FOUND, 404);
    }
    return mapMealLog(row);
  }

  async create(user: JwtUserPayload, body: unknown): Promise<MealLogResponse> {
    const input = parseWith(CreateMealLogSchema, body);
    const totalKcal = input.items.reduce((sum, item) => sum + item.kcal, 0);
    const macroProtein = input.items.reduce((sum, item) => sum + item.macros.protein, 0);
    const macroCarbs = input.items.reduce((sum, item) => sum + item.macros.carbs, 0);
    const macroFat = input.items.reduce((sum, item) => sum + item.macros.fat, 0);

    const created = await this.prisma.client.mealLog.create({
      data: {
        userId: user.userId,
        takenAt: input.takenAt,
        mealType: input.mealType,
        source: input.source,
        imageMediaId: input.imageMediaId ?? null,
        totalKcal,
        macroProtein,
        macroCarbs,
        macroFat,
        items: {
          create: input.items.map((item) => ({
            foodId: item.foodId ?? null,
            dishName: item.dishName,
            grams: item.grams,
            kcal: item.kcal,
            macroProtein: item.macros.protein,
            macroCarbs: item.macros.carbs,
            macroFat: item.macros.fat,
            macroFiber: item.macros.fiber ?? null,
            macroSodium: item.macros.sodium ?? null,
            sourceTag: item.sourceTag,
          })),
        },
      },
      include: { items: true },
    });
    return mapMealLog(created);
  }

  async softDelete(user: JwtUserPayload, idParam: unknown): Promise<{ ok: true }> {
    const id = IdSchema.parse(idParam);
    const result = await this.prisma.client.mealLog.updateMany({
      where: { id, userId: user.userId, deletedAt: null },
      data: { deletedAt: new Date() },
    });
    if (result.count !== 1) {
      throw new BizException('NOT_FOUND', errorMessagesZhCN.NOT_FOUND, 404);
    }
    return { ok: true };
  }

  async getDailySummary(
    user: JwtUserPayload,
    query: unknown,
  ): Promise<NutritionDailySummary | null> {
    const date =
      typeof query === 'object' && query != null && 'date' in query
        ? String((query as { date?: string }).date ?? '')
        : '';
    const tz =
      typeof query === 'object' && query != null && 'timezoneOffsetMinutes' in query
        ? Number((query as { timezoneOffsetMinutes?: number }).timezoneOffsetMinutes ?? 480)
        : 480;
    const resolvedDate =
      date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : localDateString(new Date(), tz);
    return this.nutritionDaily.buildTodaySummary(user.userId, {
      date: resolvedDate,
      timezoneOffsetMinutes: tz,
    });
  }

  /** Worker：将餐照识别结果写入饮食日志 */
  async createFromVisionResult(
    userId: string,
    vision: Pick<MealVisionResult, 'items'>,
    options: {
      mealType: MealType;
      takenAt?: Date;
      imageMediaId?: string;
    },
  ): Promise<string> {
    const takenAt = options.takenAt ?? new Date();
    const totalKcal = vision.items.reduce((sum, item) => sum + item.kcal, 0);
    const macroProtein = vision.items.reduce((sum, item) => sum + item.macros.protein, 0);
    const macroCarbs = vision.items.reduce((sum, item) => sum + item.macros.carbs, 0);
    const macroFat = vision.items.reduce((sum, item) => sum + item.macros.fat, 0);

    const created = await this.prisma.client.mealLog.create({
      data: {
        userId,
        takenAt,
        mealType: options.mealType,
        source: 'VISION',
        imageMediaId: options.imageMediaId ?? null,
        totalKcal,
        macroProtein,
        macroCarbs,
        macroFat,
        items: {
          create: vision.items.map((item) => ({
            dishName: item.dishName,
            grams: item.grams,
            kcal: item.kcal,
            macroProtein: item.macros.protein,
            macroCarbs: item.macros.carbs,
            macroFat: item.macros.fat,
            macroFiber: item.macros.fiber ?? null,
            macroSodium: item.macros.sodium ?? null,
            sourceTag: 'AI_ESTIMATE',
          })),
        },
      },
    });
    return created.id;
  }
}

const mapMealLog = (row: MealLogEntity & { items: MealLogItemEntity[] }): MealLogResponse => ({
  id: row.id,
  userId: row.userId,
  takenAt: row.takenAt,
  mealType: row.mealType,
  source: row.source,
  imageMediaId: row.imageMediaId,
  totalKcal: row.totalKcal,
  macros: {
    protein: row.macroProtein,
    carbs: row.macroCarbs,
    fat: row.macroFat,
    ...(row.macroFiber != null ? { fiber: row.macroFiber } : {}),
    ...(row.macroSodium != null ? { sodium: row.macroSodium } : {}),
  },
  items: row.items.map((item) => ({
    id: item.id,
    mealLogId: item.mealLogId,
    foodId: item.foodId,
    dishName: item.dishName,
    grams: item.grams,
    kcal: item.kcal,
    macros: {
      protein: item.macroProtein,
      carbs: item.macroCarbs,
      fat: item.macroFat,
      ...(item.macroFiber != null ? { fiber: item.macroFiber } : {}),
      ...(item.macroSodium != null ? { sodium: item.macroSodium } : {}),
    },
    sourceTag: item.sourceTag,
  })),
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
});
