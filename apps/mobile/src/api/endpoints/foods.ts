import { FoodResponseSchema, paginatedSchema } from '@fitness/shared';
import { useQuery } from '@tanstack/react-query';

import { apiFetch } from '../client';
import { queryKeys } from '../queryKeys';

const FoodListSchema = paginatedSchema(FoodResponseSchema);

export function useFoods(limit = 100) {
  return useQuery({
    queryKey: queryKeys.foods(limit),
    queryFn: async () => {
      const json = await apiFetch<unknown>(`/foods?limit=${limit}`);
      return FoodListSchema.parse(json);
    },
    staleTime: 60_000,
  });
}
