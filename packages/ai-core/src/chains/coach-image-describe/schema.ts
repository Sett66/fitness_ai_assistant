import { z } from 'zod';

export const DescribeCoachImagesInputSchema = z.object({
  imageUrls: z.array(z.string().min(1)).min(1).max(5),
  userText: z.string().max(4000).optional(),
});
export type DescribeCoachImagesInput = z.infer<typeof DescribeCoachImagesInputSchema>;

export const DescribeCoachImagesOutputSchema = z.object({
  descriptions: z.array(z.string().min(1).max(2000)).min(1),
});
export type DescribeCoachImagesOutput = z.infer<typeof DescribeCoachImagesOutputSchema>;
