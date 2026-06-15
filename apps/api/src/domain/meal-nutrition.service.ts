import { Injectable } from '@nestjs/common';
import type { Food as FoodEntity, FoodSource } from '@fitness/db';
import type { CreateManualMealLogItemInput, CreateMealLogItemInput } from '@fitness/shared';
import { scaleFoodNutrition } from '@fitness/shared';

import { BizException } from '../common/exceptions/biz-exception';
import { PrismaService } from '../infra/prisma/prisma.service';

const OFFICIAL: FoodSource = 'OFFICIAL';

@Injectable()
export class MealNutritionService {
  constructor(private readonly prisma: PrismaService) {}

  async resolveManualItems(
    userId: string,
    items: CreateManualMealLogItemInput[],
  ): Promise<CreateMealLogItemInput[]> {
    const resolved: CreateMealLogItemInput[] = [];
    for (const item of items) {
      resolved.push(await this.resolveManualItem(userId, item));
    }
    return resolved;
  }

  private async resolveManualItem(
    userId: string,
    item: CreateManualMealLogItemInput,
  ): Promise<CreateMealLogItemInput> {
    const food = await this.resolveFood(userId, item);
    const scaled = scaleFoodNutrition(mapPer100g(food), item.grams);

    return {
      dishName: item.dishName.trim(),
      grams: item.grams,
      kcal: scaled.kcal,
      macros: scaled.macros,
      foodId: food.id,
      sourceTag: food.source === OFFICIAL ? 'OFFICIAL' : 'USER',
    };
  }

  private async resolveFood(
    userId: string,
    item: CreateManualMealLogItemInput,
  ): Promise<FoodEntity> {
    if (item.foodId) {
      const food = await this.prisma.client.food.findFirst({
        where: {
          id: item.foodId,
          deletedAt: null,
          OR: [{ ownerUserId: null, source: OFFICIAL }, { ownerUserId: userId }],
        },
      });
      if (!food) {
        throw BizException.validation({ field: 'foodId', reason: '食物不存在或无权使用' });
      }
      return food;
    }

    const matched = await this.findBestMatch(userId, item.dishName);
    if (!matched) {
      throw BizException.validation({
        field: 'dishName',
        reason: `未在食物库找到「${item.dishName.trim()}」，请从搜索列表选择食物`,
      });
    }
    return matched;
  }

  private async findBestMatch(userId: string, query: string): Promise<FoodEntity | null> {
    const name = query.trim();
    if (!name) return null;

    const scope = {
      deletedAt: null,
      OR: [{ ownerUserId: null, source: OFFICIAL }, { ownerUserId: userId }],
    };

    const exact = await this.prisma.client.food.findFirst({
      where: { ...scope, nameZh: name },
    });
    if (exact) return exact;

    const candidates = await this.prisma.client.food.findMany({
      where: { ...scope, nameZh: { contains: name } },
      take: 8,
      orderBy: { nameZh: 'asc' },
    });
    if (candidates.length === 0) return null;

    const startsWith = candidates.filter((food) => food.nameZh.startsWith(name));
    if (startsWith.length === 1) return startsWith[0]!;

    if (candidates.length === 1) return candidates[0]!;

    const exactIgnoreCase = candidates.find(
      (food) => food.nameZh.toLowerCase() === name.toLowerCase(),
    );
    return exactIgnoreCase ?? candidates[0] ?? null;
  }
}

function mapPer100g(food: FoodEntity) {
  return {
    kcal: food.per100gKcal,
    protein: food.per100gProtein,
    carbs: food.per100gCarbs,
    fat: food.per100gFat,
    ...(food.per100gFiber != null ? { fiber: food.per100gFiber } : {}),
    ...(food.per100gSodium != null ? { sodium: food.per100gSodium } : {}),
  };
}
