import { z } from 'zod';
import { AiTaskStatusSchema } from '../enums';
import { HEALTH_METRIC_CATEGORY_VALUES } from '../constants/health-metrics';
import { DateTimeSchema, IdSchema } from './_common';

export const MetricFlagSchema = z.enum(['NORMAL', 'HIGH', 'LOW', 'ABNORMAL']);
export type MetricFlag = z.infer<typeof MetricFlagSchema>;

export const HealthMetricCategorySchema = z.enum(HEALTH_METRIC_CATEGORY_VALUES);
export type HealthMetricCategoryValue = z.infer<typeof HealthMetricCategorySchema>;

export const HealthMetricItemSchema = z.object({
  key: z.string().min(1).max(64),
  nameZh: z.string().min(1).max(128),
  value: z.union([z.number(), z.string().min(1).max(128)]),
  unit: z.string().max(32),
  refLow: z.number().optional(),
  refHigh: z.number().optional(),
  refText: z.string().max(128).optional(),
  flag: MetricFlagSchema,
  edited: z.boolean().optional(),
});
export type HealthMetricItem = z.infer<typeof HealthMetricItemSchema>;

export const HealthOtherItemSchema = z.object({
  nameZh: z.string().min(1).max(128),
  value: z.union([z.number(), z.string().min(1).max(128)]),
  unit: z.string().max(32),
  refLow: z.number().optional(),
  refHigh: z.number().optional(),
  refText: z.string().max(128).optional(),
  flag: MetricFlagSchema,
});
export type HealthOtherItem = z.infer<typeof HealthOtherItemSchema>;

export const HealthReportMetricsSchema = z.object({
  reportDate: DateTimeSchema.optional(),
  items: z.array(HealthMetricItemSchema).default([]),
  otherItems: z.array(HealthOtherItemSchema).default([]),
  summaryText: z.string().max(2048).optional(),
});
export type HealthReportMetrics = z.infer<typeof HealthReportMetricsSchema>;

export const CreateHealthReportRequestSchema = z.object({
  sourceMediaIds: z.array(IdSchema).min(1).max(20),
});
export type CreateHealthReportRequest = z.infer<typeof CreateHealthReportRequestSchema>;

export const CreateHealthReportResponseSchema = z.object({
  reportId: IdSchema,
  taskId: IdSchema,
});
export type CreateHealthReportResponse = z.infer<typeof CreateHealthReportResponseSchema>;

export const HealthReportListItemSchema = z.object({
  id: IdSchema,
  reportDate: DateTimeSchema.nullable().optional(),
  status: AiTaskStatusSchema,
  abnormalCount: z.number().int().nonnegative(),
  createdAt: DateTimeSchema,
});
export type HealthReportListItem = z.infer<typeof HealthReportListItemSchema>;

export const HealthReportListResponseSchema = z.object({
  items: z.array(HealthReportListItemSchema),
});
export type HealthReportListResponse = z.infer<typeof HealthReportListResponseSchema>;

export const RiskSeveritySchema = z.enum(['NORMAL', 'ATTENTION', 'URGENT']);
export type RiskSeverity = z.infer<typeof RiskSeveritySchema>;

export const RiskFindingSchema = z.object({
  metricKey: z.string().min(1).max(64).optional(),
  title: z.string().min(1).max(120),
  detail: z.string().min(1).max(1024),
  severity: RiskSeveritySchema,
});
export type RiskFinding = z.infer<typeof RiskFindingSchema>;

export const RiskAssessmentSchema = z.object({
  overallSummary: z.string().min(1).max(2048),
  findings: z.array(RiskFindingSchema).default([]),
  seeDoctorAdvised: z.boolean().default(false),
});
export type RiskAssessment = z.infer<typeof RiskAssessmentSchema>;

export const HealthReportDetailSchema = z.object({
  id: IdSchema,
  status: AiTaskStatusSchema,
  reportDate: DateTimeSchema.nullable().optional(),
  metrics: HealthReportMetricsSchema.nullable(),
  riskAssessment: RiskAssessmentSchema.nullable(),
  sourceImageUrls: z.array(z.string().url()),
  disclaimer: z.string().min(1).max(1024),
  createdAt: DateTimeSchema,
  updatedAt: DateTimeSchema,
});
export type HealthReportDetail = z.infer<typeof HealthReportDetailSchema>;
