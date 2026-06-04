import { Injectable } from '@nestjs/common';
import type {
  PlanResponse,
  WorkoutPlanItemResponse,
  WorkoutSessionResponse,
} from '@fitness/shared';
import {
  CreateWorkoutSessionSchema,
  IdSchema,
  PaginationQuerySchema,
  PlanResponseSchema,
  UpdateWorkoutPlanItemSchema,
  WorkoutSessionResponseSchema,
  errorMessagesZhCN,
} from '@fitness/shared';

import type { JwtUserPayload } from '../../common/decorators/current-user.decorator';
import { BizException } from '../../common/exceptions/biz-exception';
import { parseWith } from '../../common/zod/parse-with';
import { type PrismaService } from '../../infra/prisma/prisma.service';

@Injectable()
export class PlansService {
  constructor(private readonly prisma: PrismaService) {}

  async list(
    user: JwtUserPayload,
    query: unknown,
  ): Promise<{ items: PlanResponse[]; nextCursor: string | null }> {
    const { cursor, limit } = parseWith(PaginationQuerySchema, query);
    const type =
      typeof query === 'object' && query != null && 'type' in query
        ? String((query as { type?: string }).type ?? '')
        : '';

    const pageLimit = limit ?? 20;
    const where: {
      userId: string;
      deletedAt: null;
      type?: 'WORKOUT' | 'MEAL';
    } = { userId: user.userId, deletedAt: null };

    if (type === 'WORKOUT' || type === 'MEAL') {
      where.type = type;
    }

    const rows = await this.prisma.client.plan.findMany({
      where,
      take: pageLimit + 1,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      orderBy: { createdAt: 'desc' },
    });

    const hasMore = rows.length > pageLimit;
    const page = hasMore ? rows.slice(0, pageLimit) : rows;
    return {
      items: page.map((plan) => PlanResponseSchema.parse(plan)),
      nextCursor: hasMore && page.length > 0 ? (page[page.length - 1]?.id ?? null) : null,
    };
  }

  async getById(user: JwtUserPayload, idParam: unknown): Promise<PlanResponse> {
    const id = IdSchema.parse(idParam);
    const plan = await this.prisma.client.plan.findFirst({
      where: { id, userId: user.userId, deletedAt: null },
      include: {
        workoutDays: {
          orderBy: [{ weekIdx: 'asc' }, { dayIdx: 'asc' }],
          include: {
            items: {
              orderBy: { itemIdx: 'asc' },
              include: { exercise: { select: { nameZh: true } } },
            },
          },
        },
        mealDays: {
          orderBy: [{ weekIdx: 'asc' }, { dayIdx: 'asc' }],
          include: { items: true },
        },
      },
    });
    if (!plan) {
      throw new BizException('NOT_FOUND', errorMessagesZhCN.NOT_FOUND, 404);
    }

    return PlanResponseSchema.parse({
      ...plan,
      workoutDays: plan.workoutDays.map((day) => ({
        id: day.id,
        planId: day.planId,
        weekIdx: day.weekIdx,
        dayIdx: day.dayIdx,
        title: day.title,
        restDay: day.restDay,
        items: day.items.map((item) => mapWorkoutPlanItem(item)),
      })),
      mealDays: plan.mealDays.map((day) => ({
        id: day.id,
        planId: day.planId,
        weekIdx: day.weekIdx,
        dayIdx: day.dayIdx,
        totalKcal: day.totalKcal,
        macros: {
          protein: day.macroProtein,
          carbs: day.macroCarbs,
          fat: day.macroFat,
          fiber: day.macroFiber ?? undefined,
          sodium: day.macroSodium ?? undefined,
        },
        items: day.items.map((item) => ({
          id: item.id,
          mealPlanDayId: item.mealPlanDayId,
          meal: item.meal,
          dishName: item.dishName,
          ingredients: item.ingredients,
          cookingMethod: item.cookingMethod,
          kcal: item.kcal,
          macros: {
            protein: item.macroProtein,
            carbs: item.macroCarbs,
            fat: item.macroFat,
            fiber: item.macroFiber ?? undefined,
            sodium: item.macroSodium ?? undefined,
          },
        })),
      })),
    });
  }

  async updateWorkoutPlanItem(
    user: JwtUserPayload,
    planIdParam: unknown,
    dayIdParam: unknown,
    itemIdParam: unknown,
    body: unknown,
  ): Promise<WorkoutPlanItemResponse> {
    const planId = IdSchema.parse(planIdParam);
    const dayId = IdSchema.parse(dayIdParam);
    const itemId = IdSchema.parse(itemIdParam);
    const input = parseWith(UpdateWorkoutPlanItemSchema, body);

    const plan = await this.prisma.client.plan.findFirst({
      where: { id: planId, userId: user.userId, deletedAt: null, type: 'WORKOUT' },
    });
    if (!plan) {
      throw new BizException('NOT_FOUND', errorMessagesZhCN.PLAN_NOT_FOUND, 404);
    }

    const day = await this.prisma.client.workoutPlanDay.findFirst({
      where: { id: dayId, planId: plan.id },
    });
    if (!day) {
      throw new BizException('NOT_FOUND', errorMessagesZhCN.NOT_FOUND, 404);
    }

    const existing = await this.prisma.client.workoutPlanItem.findFirst({
      where: { id: itemId, workoutPlanDayId: day.id },
    });
    if (!existing) {
      throw new BizException('NOT_FOUND', errorMessagesZhCN.NOT_FOUND, 404);
    }

    if (input.exerciseId) {
      const exercise = await this.prisma.client.exercise.findFirst({
        where: {
          id: input.exerciseId,
          deletedAt: null,
          OR: [{ isPreset: true }, { ownerUserId: user.userId }],
        },
      });
      if (!exercise) {
        throw new BizException('NOT_FOUND', errorMessagesZhCN.NOT_FOUND, 404);
      }
    }

    const updated = await this.prisma.client.workoutPlanItem.update({
      where: { id: existing.id },
      data: {
        ...(input.exerciseId != null ? { exerciseId: input.exerciseId } : {}),
        ...(input.plannedSets != null ? { plannedSets: input.plannedSets } : {}),
        ...(input.plannedReps != null ? { plannedReps: input.plannedReps } : {}),
        ...(input.plannedWeightKg !== undefined ? { plannedWeightKg: input.plannedWeightKg } : {}),
        ...(input.plannedRestSec != null ? { plannedRestSec: input.plannedRestSec } : {}),
        ...(input.notes !== undefined ? { notes: input.notes } : {}),
      },
      include: { exercise: { select: { nameZh: true } } },
    });

    return mapWorkoutPlanItem(updated);
  }

  async softDelete(user: JwtUserPayload, idParam: unknown): Promise<{ ok: true }> {
    const id = IdSchema.parse(idParam);
    const result = await this.prisma.client.plan.updateMany({
      where: { id, userId: user.userId, deletedAt: null },
      data: { deletedAt: new Date() },
    });
    if (result.count !== 1) {
      throw new BizException('NOT_FOUND', errorMessagesZhCN.PLAN_NOT_FOUND, 404);
    }
    return { ok: true };
  }
}

function mapWorkoutPlanItem(item: {
  id: string;
  workoutPlanDayId: string;
  exerciseId: string;
  plannedSets: number;
  plannedReps: number;
  plannedWeightKg: number | null;
  plannedRestSec: number;
  notes: string | null;
  exercise: { nameZh: string };
}): WorkoutPlanItemResponse {
  return {
    id: item.id,
    workoutPlanDayId: item.workoutPlanDayId,
    exerciseId: item.exerciseId,
    exerciseName: item.exercise.nameZh,
    plannedSets: item.plannedSets,
    plannedReps: item.plannedReps,
    plannedWeightKg: item.plannedWeightKg,
    plannedRestSec: item.plannedRestSec,
    notes: item.notes,
  };
}

@Injectable()
export class WorkoutsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(
    user: JwtUserPayload,
    query: unknown,
  ): Promise<{ items: WorkoutSessionResponse[]; nextCursor: string | null }> {
    const { cursor, limit } = parseWith(PaginationQuerySchema, query);
    const pageLimit = limit ?? 20;

    const rows = await this.prisma.client.workoutSession.findMany({
      where: { userId: user.userId, deletedAt: null },
      include: { sets: { orderBy: { setIdx: 'asc' } } },
      take: pageLimit + 1,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      orderBy: { performedAt: 'desc' },
    });

    const hasMore = rows.length > pageLimit;
    const page = hasMore ? rows.slice(0, pageLimit) : rows;
    return {
      items: page.map(mapSession),
      nextCursor: hasMore && page.length > 0 ? (page[page.length - 1]?.id ?? null) : null,
    };
  }

  async getById(user: JwtUserPayload, idParam: unknown): Promise<WorkoutSessionResponse> {
    const id = IdSchema.parse(idParam);
    const row = await this.prisma.client.workoutSession.findFirst({
      where: { id, userId: user.userId, deletedAt: null },
      include: { sets: { orderBy: { setIdx: 'asc' } } },
    });
    if (!row) {
      throw new BizException('NOT_FOUND', errorMessagesZhCN.NOT_FOUND, 404);
    }
    return mapSession(row);
  }

  async create(user: JwtUserPayload, body: unknown): Promise<WorkoutSessionResponse> {
    const input = parseWith(CreateWorkoutSessionSchema, body);
    const row = await this.prisma.client.workoutSession.create({
      data: {
        userId: user.userId,
        plannedDayId: input.plannedDayId ?? null,
        performedAt: input.performedAt,
        durationSec: input.durationSec ?? null,
        mood: input.mood ?? null,
        note: input.note ?? null,
        sets: {
          create: input.sets.map((set) => ({
            exerciseId: set.exerciseId,
            setIdx: set.setIdx,
            actualReps: set.actualReps,
            actualWeightKg: set.actualWeightKg,
            rir: set.rir ?? null,
            isCompleted: set.isCompleted ?? false,
          })),
        },
      },
      include: { sets: { orderBy: { setIdx: 'asc' } } },
    });
    return mapSession(row);
  }
}

function mapSession(row: {
  id: string;
  userId: string;
  plannedDayId: string | null;
  performedAt: Date;
  durationSec: number | null;
  mood: string | null;
  note: string | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
  sets: Array<{
    id: string;
    sessionId: string;
    exerciseId: string;
    setIdx: number;
    actualReps: number;
    actualWeightKg: number;
    rir: number | null;
    isCompleted: boolean;
  }>;
}): WorkoutSessionResponse {
  return WorkoutSessionResponseSchema.parse({
    id: row.id,
    userId: row.userId,
    plannedDayId: row.plannedDayId,
    performedAt: row.performedAt,
    durationSec: row.durationSec,
    mood: row.mood,
    note: row.note,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    deletedAt: row.deletedAt,
    sets: row.sets,
  });
}
