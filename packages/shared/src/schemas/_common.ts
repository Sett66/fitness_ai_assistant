import { z } from 'zod';

/**
 * 公共 schema 工具。
 * 所有跨 domain 复用的小积木放这里：
 * - 主键 / 时间
 * - 软删除 mixin
 * - 实体基类
 * - 营养素结构
 * - 分页
 */

// ============================== 主键 / 时间 ==============================

/**
 * 主键统一 cuid2（PRD §5.4）；demo 阶段宽松校验仅查长度，
 * 严格 cuid2 校验留到 M2 与 nanoid/cuid2 库版本一起锁。
 */
export const IdSchema = z.string().min(8).max(64);
export type Id = z.infer<typeof IdSchema>;

/** 时间字段：接受 ISO 字符串或 Date，输出 Date。统一 UTC（PRD §5.4） */
export const DateTimeSchema = z.coerce.date();
export type DateTime = z.infer<typeof DateTimeSchema>;

// ============================== Mixin ==============================

/** 软删除字段 mixin（ARCH §4 通则）。可空、可不传 */
export const DeletableMixin = z.object({
  deletedAt: DateTimeSchema.nullable().optional(),
});

/** 含主键 + 创建/更新时间 + 软删除的实体基类 */
export const EntityBaseSchema = z.object({
  id: IdSchema,
  createdAt: DateTimeSchema,
  updatedAt: DateTimeSchema.optional(),
  deletedAt: DateTimeSchema.nullable().optional(),
});

// ============================== 营养素 ==============================

/** 宏量营养（不含热量；每 100g 或单份均可复用） */
export const MacrosSchema = z.object({
  protein: z.number().nonnegative().max(2000),
  carbs: z.number().nonnegative().max(2000),
  fat: z.number().nonnegative().max(2000),
  fiber: z.number().nonnegative().max(2000).optional(),
  sodium: z.number().nonnegative().max(100_000).optional(),
});
export type Macros = z.infer<typeof MacrosSchema>;

/** 食物库 per100g 营养结构（PRD §5.2、ARCH §4 Food） */
export const Per100gSchema = MacrosSchema.extend({
  kcal: z.number().nonnegative().max(10_000),
});
export type Per100g = z.infer<typeof Per100gSchema>;

// ============================== 分页 ==============================

export const PaginationQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
export type PaginationQuery = z.infer<typeof PaginationQuerySchema>;

/**
 * 分页响应工厂。
 * 用法：`const FoodListSchema = paginatedSchema(FoodSchema);`
 */
export const paginatedSchema = <T extends z.ZodTypeAny>(item: T) =>
  z.object({
    items: z.array(item),
    nextCursor: z.string().nullable(),
  });
