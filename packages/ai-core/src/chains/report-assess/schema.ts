import { z } from 'zod';
import {
  DateTimeSchema,
  GenderSchema,
  GoalSchema,
  HealthReportMetricsSchema,
  RiskAssessmentSchema,
} from '@fitness/shared';

export const ReportAssessProfileSchema = z
  .object({
    gender: GenderSchema.optional(),
    birthDate: DateTimeSchema.optional(),
    heightCm: z.number().positive().optional(),
    weightKg: z.number().positive().optional(),
    trainingYears: z.number().nonnegative().optional(),
    goal: GoalSchema.optional(),
  })
  .partial();

export const RunReportAssessInputSchema = z.object({
  metrics: HealthReportMetricsSchema,
  profile: ReportAssessProfileSchema.nullable().optional(),
  criticalHits: z.array(z.string().min(1)).default([]),
});

export type RunReportAssessInput = z.infer<typeof RunReportAssessInputSchema>;

export const ReportAssessOutputSchema = z.object({
  riskAssessment: RiskAssessmentSchema,
  healthContext: z.string().min(1).max(512),
});

export type ReportAssessOutput = z.infer<typeof ReportAssessOutputSchema>;
