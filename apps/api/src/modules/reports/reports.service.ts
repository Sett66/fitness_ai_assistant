import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import type { Queue } from 'bullmq';
import type {
  CreateHealthReportResponse,
  HealthReportDetail,
  HealthReportListResponse,
  HealthReportMetrics,
  RiskAssessment,
} from '@fitness/shared';
import {
  CreateHealthReportRequestSchema,
  HealthReportMetricsSchema,
  LLM_MODELS,
  RiskAssessmentSchema,
  errorMessagesZhCN,
  getAiTaskDailyLimit,
  termsZhCN,
} from '@fitness/shared';

import type { JwtUserPayload } from '../../common/decorators/current-user.decorator';
import { BizException } from '../../common/exceptions/biz-exception';
import { parseWith } from '../../common/zod/parse-with';
import {
  AI_TASK_JOB_NAME,
  AI_TASK_QUEUE_NAME,
  type AiTaskJobPayload,
} from '../../infra/queue/queue.constants';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { S3StorageService } from '../../infra/storage/s3-storage.service';

const REPORT_READ_URL_TTL_SEC = 60 * 60;
const HEALTH_REPORT_DISCLAIMER =
  termsZhCN.HEALTH_REPORT_DISCLAIMER ??
  '本分析仅从健身和生活方式角度提供参考，不构成医疗诊断、治疗建议或用药指导。';

@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: S3StorageService,
    @InjectQueue(AI_TASK_QUEUE_NAME) private readonly queue: Queue<AiTaskJobPayload>,
  ) {}

  async create(user: JwtUserPayload, body: unknown): Promise<CreateHealthReportResponse> {
    const input = parseWith(CreateHealthReportRequestSchema, body);
    await this.assertDailyLimit(user.userId, 'REPORT_ANALYZE');

    const media = await this.prisma.client.media.findMany({
      where: {
        id: { in: input.sourceMediaIds },
        ownerUserId: user.userId,
        status: 'READY',
      },
    });
    if (media.length !== input.sourceMediaIds.length) {
      throw new BizException('MEDIA_NOT_FOUND', errorMessagesZhCN.MEDIA_NOT_FOUND, 404);
    }

    const { report, aiRun } = await this.prisma.client.$transaction(async (tx) => {
      const createdReport = await tx.healthReport.create({
        data: {
          userId: user.userId,
          status: 'QUEUED',
          sourceMediaIds: input.sourceMediaIds,
          pageMediaIds: [],
        },
      });
      const createdRun = await tx.aiRun.create({
        data: {
          userId: user.userId,
          taskType: 'REPORT_ANALYZE',
          model: LLM_MODELS.QWEN_VL_MAX,
          status: 'QUEUED',
          inputJson: { reportId: createdReport.id },
        },
      });
      const linkedReport = await tx.healthReport.update({
        where: { id: createdReport.id },
        data: { aiRunId: createdRun.id },
      });
      return { report: linkedReport, aiRun: createdRun };
    });

    await this.queue.add(
      AI_TASK_JOB_NAME,
      { aiRunId: aiRun.id },
      {
        attempts: 3,
        backoff: { type: 'exponential', delay: 1000 },
        removeOnComplete: true,
        removeOnFail: false,
      },
    );

    return { reportId: report.id, taskId: aiRun.id };
  }

  async list(user: JwtUserPayload): Promise<HealthReportListResponse> {
    const reports = await this.prisma.client.healthReport.findMany({
      where: { userId: user.userId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    return {
      items: reports.map((report) => {
        const metrics = parseMetrics(report.metrics);
        return {
          id: report.id,
          reportDate: report.reportDate,
          status: report.status,
          abnormalCount: countAbnormal(metrics),
          createdAt: report.createdAt,
        };
      }),
    };
  }

  async detail(user: JwtUserPayload, id: string): Promise<HealthReportDetail> {
    const report = await this.prisma.client.healthReport.findFirst({
      where: { id, userId: user.userId, deletedAt: null },
    });
    if (!report) {
      throw new BizException(
        'HEALTH_REPORT_NOT_FOUND',
        errorMessagesZhCN.HEALTH_REPORT_NOT_FOUND,
        404,
      );
    }

    const media = await this.prisma.client.media.findMany({
      where: {
        id: { in: report.sourceMediaIds },
        ownerUserId: user.userId,
        status: 'READY',
      },
    });
    const sourceImageUrls = await Promise.all(
      media
        .filter((item) => item.mime.toLowerCase().startsWith('image/'))
        .map((item) => this.storage.presignGet(item.objectKey, REPORT_READ_URL_TTL_SEC)),
    );

    return {
      id: report.id,
      status: report.status,
      reportDate: report.reportDate,
      metrics: parseMetrics(report.metrics),
      riskAssessment: parseRiskAssessment(report.riskAssessment),
      sourceImageUrls,
      disclaimer: HEALTH_REPORT_DISCLAIMER,
      createdAt: report.createdAt,
      updatedAt: report.updatedAt,
    };
  }

  private async assertDailyLimit(userId: string, taskType: string): Promise<void> {
    // 本地开发调试：不限制体检报告分析次数
    if (process.env.NODE_ENV === 'development') {
      return;
    }

    const now = new Date();
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const count = await this.prisma.client.aiRun.count({
      where: { userId, taskType: taskType as never, createdAt: { gte: start } },
    });
    if (count >= getAiTaskDailyLimit(taskType)) {
      throw new BizException(
        'AI_TASK_LIMIT_EXCEEDED',
        errorMessagesZhCN.AI_TASK_LIMIT_EXCEEDED,
        429,
      );
    }
  }
}

function parseMetrics(value: unknown): HealthReportMetrics | null {
  if (value == null) return null;
  const parsed = HealthReportMetricsSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

function parseRiskAssessment(value: unknown): RiskAssessment | null {
  if (value == null) return null;
  const parsed = RiskAssessmentSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

function countAbnormal(metrics: HealthReportMetrics | null): number {
  if (!metrics) return 0;
  return metrics.items.filter((item) => item.flag !== 'NORMAL').length;
}
