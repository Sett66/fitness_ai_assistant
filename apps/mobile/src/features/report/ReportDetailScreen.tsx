import { Image, ScrollView, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { HealthMetricCategory, HealthMetricItem, RiskFinding } from '@fitness/shared';
import { formatMetricDisplayValue, getMetricByKey, termsZhCN } from '@fitness/shared';

import { Card, ErrorText, LoadingScreen, Screen, Subtitle, Title } from '@fitness/ui';

import { useReportDetail } from '../../api/endpoints/reports';
import type { RootStackParamList } from '../../app/navigation/RootNavigator';
import {
  formatReportDate,
  healthMetricCategoryLabels,
  metricFlagLabel,
  reportStatusLabel,
  riskSeverityClassName,
  riskSeverityLabel,
} from './report-labels';

type Props = NativeStackScreenProps<RootStackParamList, 'ReportDetail'>;

export function ReportDetailScreen({ route }: Props) {
  const { reportId } = route.params;
  const report = useReportDetail(reportId, true);

  if (report.isLoading) return <LoadingScreen />;
  if (report.error) {
    return (
      <Screen>
        <Title>体检报告</Title>
        <ErrorText message={report.error.message} />
      </Screen>
    );
  }

  const data = report.data;
  if (!data) return null;

  const grouped = groupMetricsByCategory(data.metrics?.items ?? []);
  const isPending = data.status === 'QUEUED' || data.status === 'RUNNING';

  return (
    <Screen>
      <ScrollView contentContainerClassName="gap-4 pb-8">
        <View>
          <Title>体检报告详情</Title>
          <Subtitle>
            {reportStatusLabel(data.status)} · {formatReportDate(data.reportDate ?? data.createdAt)}
          </Subtitle>
        </View>

        {isPending ? (
          <Card>
            <Title className="text-base">分析中</Title>
            <Subtitle>AI 正在抽取指标并生成评估，页面会自动刷新。</Subtitle>
          </Card>
        ) : null}

        {data.status === 'DONE' && data.riskAssessment?.seeDoctorAdvised ? (
          <Card className="border-destructive">
            <Title className="text-base text-destructive">
              {termsZhCN.HEALTH_REPORT_SEE_DOCTOR}
            </Title>
            <Subtitle>{termsZhCN.HEALTH_REPORT_SEE_DOCTOR_HINT}</Subtitle>
          </Card>
        ) : null}

        {data.status === 'FAILED' ? (
          <Card>
            <Title className="text-base">分析失败</Title>
            <Subtitle>请确认上传的是清晰的体检报告图片后重试。</Subtitle>
          </Card>
        ) : null}

        {data.sourceImageUrls.length > 0 ? (
          <Card className="gap-3">
            <Title className="text-base">原件预览</Title>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerClassName="gap-3"
            >
              {data.sourceImageUrls.map((url) => (
                <Image
                  key={url}
                  source={{ uri: url }}
                  className="h-36 w-28 rounded-xl bg-muted"
                  resizeMode="cover"
                />
              ))}
            </ScrollView>
          </Card>
        ) : null}

        {data.status === 'DONE' && data.riskAssessment ? (
          <Card className="gap-3">
            <Title className="text-base">AI 评估</Title>
            <Subtitle>{data.riskAssessment.overallSummary}</Subtitle>
            {sortFindings(data.riskAssessment.findings).map((finding) => (
              <FindingRow
                key={`${finding.metricKey ?? finding.title}-${finding.severity}`}
                finding={finding}
              />
            ))}
          </Card>
        ) : null}

        {data.metrics?.summaryText ? (
          <Card>
            <Title className="text-base">摘要</Title>
            <Subtitle>{data.metrics.summaryText}</Subtitle>
          </Card>
        ) : null}

        {Object.entries(grouped).map(([category, items]) => (
          <Card key={category} className="gap-2">
            <Title className="text-base">
              {healthMetricCategoryLabels[category as HealthMetricCategory]}
            </Title>
            {items.map((item) => (
              <MetricRow key={`${item.key}-${item.nameZh}`} item={item} />
            ))}
          </Card>
        ))}

        {data.metrics?.otherItems.length ? (
          <Card className="gap-2">
            <Title className="text-base">其他指标</Title>
            {data.metrics.otherItems.map((item) => (
              <View
                key={`${item.nameZh}-${String(item.value)}`}
                className="border-b border-border py-2"
              >
                <View className="flex-row justify-between gap-3">
                  <Text className="flex-1 text-foreground">{item.nameZh}</Text>
                  <Text className={item.flag === 'NORMAL' ? 'text-muted' : 'text-destructive'}>
                    {metricFlagLabel(item.flag)}
                  </Text>
                </View>
                <Subtitle>
                  {formatMetricDisplayValue(item.value, item.unit)}
                  {formatRefRange(item)}
                </Subtitle>
              </View>
            ))}
          </Card>
        ) : null}

        <Card variant="accent">
          <Subtitle>{data.disclaimer}</Subtitle>
        </Card>
      </ScrollView>
    </Screen>
  );
}

function FindingRow({ finding }: { finding: RiskFinding }) {
  return (
    <View className="border-b border-border py-2">
      <View className="flex-row justify-between gap-3">
        <Text className="flex-1 text-foreground">{finding.title}</Text>
        <Text className={riskSeverityClassName(finding.severity)}>
          {riskSeverityLabel(finding.severity)}
        </Text>
      </View>
      <Subtitle>{finding.detail}</Subtitle>
    </View>
  );
}

const SEVERITY_ORDER: Record<string, number> = { URGENT: 0, ATTENTION: 1, NORMAL: 2 };

function sortFindings(findings: RiskFinding[]): RiskFinding[] {
  return [...findings].sort(
    (a, b) => (SEVERITY_ORDER[a.severity] ?? 9) - (SEVERITY_ORDER[b.severity] ?? 9),
  );
}

function MetricRow({ item }: { item: HealthMetricItem }) {
  const abnormal = item.flag !== 'NORMAL';
  return (
    <View className="border-b border-border py-2">
      <View className="flex-row justify-between gap-3">
        <Text className="flex-1 text-foreground">{item.nameZh}</Text>
        <Text className={abnormal ? 'font-semibold text-destructive' : 'text-muted'}>
          {metricFlagLabel(item.flag)}
        </Text>
      </View>
      <Subtitle>
        {formatMetricDisplayValue(item.value, item.unit)}
        {formatRefRange(item)}
      </Subtitle>
    </View>
  );
}

function groupMetricsByCategory(
  items: HealthMetricItem[],
): Partial<Record<HealthMetricCategory, HealthMetricItem[]>> {
  return items.reduce<Partial<Record<HealthMetricCategory, HealthMetricItem[]>>>((acc, item) => {
    const category = getMetricByKey(item.key)?.category ?? 'METABOLIC';
    acc[category] = [...(acc[category] ?? []), item];
    return acc;
  }, {});
}

function formatRefRange(item: Pick<HealthMetricItem, 'refLow' | 'refHigh' | 'refText'>): string {
  if (item.refText) return ` · 参考 ${item.refText}`;
  if (item.refLow == null && item.refHigh == null) return '';
  if (item.refLow != null && item.refHigh != null) return ` · 参考 ${item.refLow}-${item.refHigh}`;
  if (item.refLow != null) return ` · 参考 ≥${item.refLow}`;
  return ` · 参考 ≤${item.refHigh}`;
}
