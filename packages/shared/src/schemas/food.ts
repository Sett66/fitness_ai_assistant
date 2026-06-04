import { z } from 'zod';
import { FoodSourceSchema } from '../enums';
import { EntityBaseSchema, IdSchema, Per100gSchema } from './_common';

// ============================== Food ==============================

export const FoodSchema = EntityBaseSchema.extend({
  nameZh: z.string().min(1).max(64),
  nameEn: z.string().max(64).nullable().optional(),
  per100g: Per100gSchema,
  source: FoodSourceSchema,
  ownerUserId: IdSchema.nullable().optional(),
});
export type Food = z.infer<typeof FoodSchema>;

export const CreateFoodSchema = FoodSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  deletedAt: true,
  ownerUserId: true,
});
export type CreateFoodInput = z.infer<typeof CreateFoodSchema>;

export const UpdateFoodSchema = CreateFoodSchema.partial();
export type UpdateFoodInput = z.infer<typeof UpdateFoodSchema>;

export const FoodResponseSchema = FoodSchema;
export type FoodResponse = z.infer<typeof FoodResponseSchema>;
