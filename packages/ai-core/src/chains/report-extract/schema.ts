import { z } from 'zod';

export const ReportExtractCatalogItemSchema = z.object({
  key: z.string().min(1),
  nameZh: z.string().min(1),
  aliases: z.array(z.string()).default([]),
  unit: z.string().default(''),
});

export const RunReportExtractInputSchema = z.object({
  imageUrls: z.array(z.string().min(1)).min(1).max(20),
  catalog: z.array(ReportExtractCatalogItemSchema).min(1),
});

export type RunReportExtractInput = z.infer<typeof RunReportExtractInputSchema>;
