import { z } from 'zod';

import { DateTimeSchema } from './_common';

/** 位置快照来源，与 Prisma LocationSource 一致 */
export const LocationSourceSchema = z.enum(['GPS', 'MANUAL', 'GEOCODE']);
export type LocationSource = z.infer<typeof LocationSourceSchema>;

/** PUT /v1/users/me/location */
export const UpsertUserLocationSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  city: z.string().max(64).optional(),
  source: LocationSourceSchema,
});
export type UpsertUserLocationInput = z.infer<typeof UpsertUserLocationSchema>;

/** GET/PUT 响应：updatedAt 为最新 snapshot 的 createdAt */
export const UserLocationResponseSchema = UpsertUserLocationSchema.extend({
  updatedAt: DateTimeSchema,
});
export type UserLocationResponse = z.infer<typeof UserLocationResponseSchema>;

/** GET 无快照时返回 null（HTTP 200） */
export const UserLocationNullableResponseSchema = UserLocationResponseSchema.nullable();
export type UserLocationNullableResponse = z.infer<typeof UserLocationNullableResponseSchema>;
