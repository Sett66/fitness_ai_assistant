import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Image, Pressable, ScrollView, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type {
  HealthMetricCategory,
  HealthMetricItem,
  HealthOtherItem,
  MetricFlag,
  RiskFinding,
} from '@fitness/shared';
import { formatMetricDisplayValue, getMetricByKey, termsZhCN } from '@fitness/shared';
import {
  Button,
  Card,
  ErrorText,
  Input,
  LoadingScreen,
  Screen,
  Subtitle,
  Title,
} from '@fitness/ui';

import {
  useDeleteReport,
  useReportDetail,
  useUpdateReportMetrics,
} from '../../api/endpoints/reports';
import type { RootStackParamList } from '../../app/navigation/RootNavigator';
import { CatalogKeyPickerSheet } from './CatalogKeyPickerSheet';
import {
  formatReportDate,
  healthMetricCategoryLabels,
  metricFlagLabel,
  reportStatusLabel,
  riskSeverityClassName,
  riskSeverityLabel,
} from './report-labels';

type Props = NativeStackScreenProps<RootStackParamList, 'ReportDetail'>;
type EditSection = HealthMetricCategory | 'OTHER';

const FLAG_OPTIONS: MetricFlag[] = ['NORMAL', 'HIGH', 'LOW', 'ABNORMAL'];

export function ReportDetailScreen({ navigation, route }: Props) {
  const { reportId } = route.params;
  const report = useReportDetail(reportId, true);
  const updateMetrics = useUpdateReportMetrics(reportId);
  const deleteReport = useDeleteReport();

  const [editingSection, setEditingSection] = useState<EditSection | null>(null);
  const [draftItems, setDraftItems] = useState<HealthMetricItem[]>([]);
  const [draftOtherItems, setDraftOtherItems] = useState<HealthOtherItem[]>([]);
  const [claimIndex, setClaimIndex] = useState<number | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [assessmentUpdated, setAssessmentUpdated] = useState(false);
  const [showUpdatedBanner, setShowUpdatedBanner] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
  const sawReassessRunning = useRef(false);

  const data = report.data;
  const editing = editingSection != null;

  useEffect(() => {
    if (editing || !data?.metrics) return;
    setDraftItems(data.metrics.items);
    setDraftOtherItems(data.metrics.otherItems);
  }, [data, editing]);

  useEffect(() => {
    if (!assessmentUpdated) {
      sawReassessRunning.current = false;
      setShowUpdatedBanner(false);
      return;
    }
    if (data?.status === 'QUEUED' || data?.status === 'RUNNING') {
      sawReassessRunning.current = true;
      setShowUpdatedBanner(false);
    } else if (data?.status === 'DONE' && sawReassessRunning.current) {
      setShowUpdatedBanner(true);
    }
  }, [assessmentUpdated, data?.status]);

  const grouped = useMemo(
    () => groupMetricsByCategory(editing ? draftItems : (data?.metrics?.items ?? [])),
    [data?.metrics?.items, draftItems, editing],
  );

  if (report.isLoading) return <LoadingScreen />;
  if (report.error) {
    return (
      <Screen>
        <Title>体检报告</Title>
        <ErrorText message={report.error.message} />
      </Screen>
    );
  }

  if (!data) return null;

  const isPending = data.status === 'QUEUED' || data.status === 'RUNNING';
  const isReassessing = isPending && data.metrics != null;
  const canEdit = data.status === 'DONE' && data.metrics != null;
  const dirty =
    JSON.stringify(draftItems) !== JSON.stringify(data.metrics?.items ?? []) ||
    JSON.stringify(draftOtherItems) !== JSON.stringify(data.metrics?.otherItems ?? []);

  const startEditing = (section: EditSection) => {
    if (editingSection && editingSection !== section && dirty) {
      Alert.alert('请先完成当前修正', '保存或取消当前分类的修改后，再编辑其他分类。');
      return;
    }
    setDraftItems(data.metrics?.items ?? []);
    setDraftOtherItems(data.metrics?.otherItems ?? []);
    setSaveError(null);
    setClaimIndex(null);
    setEditingSection(section);
    setAssessmentUpdated(false);
  };

  const cancelEditing = () => {
    setDraftItems(data.metrics?.items ?? []);
    setDraftOtherItems(data.metrics?.otherItems ?? []);
    setSaveError(null);
    setClaimIndex(null);
    setEditingSection(null);
  };

  const handleSave = () => {
    setSaveError(null);
    updateMetrics.mutate(
      { items: draftItems, otherItems: draftOtherItems },
      {
        onSuccess: () => {
          setEditingSection(null);
          setClaimIndex(null);
          setAssessmentUpdated(true);
          sawReassessRunning.current = false;
          scrollRef.current?.scrollTo({ y: 0, animated: true });
        },
        onError: (err) => {
          setSaveError(err instanceof Error ? err.message : '保存失败，请稍后重试');
        },
      },
    );
  };

  const handleDelete = () => {
    Alert.alert('删除报告', '确定删除这份体检报告吗？删除后列表中将不再显示。', [
      { text: '取消', style: 'cancel' },
      {
        text: '删除',
        style: 'destructive',
        onPress: () => {
          deleteReport.mutate(reportId, {
            onSuccess: () => navigation.goBack(),
            onError: (err) => {
              Alert.alert('删除失败', err instanceof Error ? err.message : '请稍后重试');
            },
          });
        },
      },
    ]);
  };

  const updateItem = (key: string, patch: Partial<HealthMetricItem>) => {
    const catalog = getMetricByKey(key);
    const category = catalog?.category ?? 'METABOLIC';
    if (editingSection !== category) return;
    setDraftItems((prev) => prev.map((item) => (item.key === key ? { ...item, ...patch } : item)));
  };

  const claimOtherItem = (catalogKey: string) => {
    if (editingSection !== 'OTHER' || claimIndex == null) return;
    const other = draftOtherItems[claimIndex];
    const catalog = getMetricByKey(catalogKey);
    if (!other || !catalog) return;
    if (draftItems.some((item) => item.key === catalogKey)) {
      Alert.alert('无法认领', '该指标已在列表中。');
      return;
    }
    setDraftItems((prev) => [
      ...prev,
      {
        key: catalog.key,
        nameZh: catalog.nameZh,
        value: other.value,
        unit: other.unit || catalog.unit,
        refLow: other.refLow,
        refHigh: other.refHigh,
        refText: other.refText,
        flag: other.flag,
        edited: true,
      },
    ]);
    setDraftOtherItems((prev) => prev.filter((_, index) => index !== claimIndex));
    setClaimIndex(null);
  };

  const displayedOtherItems = editing ? draftOtherItems : (data.metrics?.otherItems ?? []);

  return (
    <Screen>
      <ScrollView ref={scrollRef} contentContainerClassName="gap-4 pb-8">
        <View>
          <Title>体检报告详情</Title>
          <Subtitle>
            {reportStatusLabel(data.status)} · {formatReportDate(data.reportDate ?? data.createdAt)}
          </Subtitle>
        </View>

        {isPending ? (
          <Card>
            <Title className="text-base">{isReassessing ? '重新评估中' : '分析中'}</Title>
            <Subtitle>
              {isReassessing
                ? '正在根据修正后的指标更新评估，页面会自动刷新。'
                : 'AI 正在抽取指标并生成评估，页面会自动刷新。'}
            </Subtitle>
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
            <Subtitle>请确认上传的是清晰的体检报告图片或 PDF 后重试。</Subtitle>
          </Card>
        ) : null}

        {data.pageTruncated ? (
          <Card>
            <Subtitle>{termsZhCN.HEALTH_REPORT_PDF_PAGE_TRUNCATED}</Subtitle>
          </Card>
        ) : null}

        {data.sourceImageUrls.length > 0 ? (
          <Card className="gap-3">
            <Title className="text-base">页图预览</Title>
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
            {showUpdatedBanner ? (
              <Subtitle className="text-accent">评估已根据你的修正重新生成。</Subtitle>
            ) : null}
            {editing ? <Subtitle>保存后将根据修正后的指标重新评估。</Subtitle> : null}
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

        {Object.entries(grouped).map(([category, items]) => {
          const section = category as HealthMetricCategory;
          const isEditingSection = editingSection === section;
          return (
            <Card key={category} className="gap-2">
              <SectionHeader
                title={healthMetricCategoryLabels[section]}
                showEdit={canEdit && !isPending && editingSection == null}
                onEdit={() => startEditing(section)}
              />
              {items.map((item) => (
                <MetricRow
                  key={`${item.key}-${item.nameZh}`}
                  item={item}
                  editing={isEditingSection}
                  onChange={(patch) => updateItem(item.key, patch)}
                />
              ))}
              {isEditingSection ? (
                <SectionEditActions
                  dirty={dirty}
                  saving={updateMetrics.isPending}
                  error={saveError}
                  onSave={handleSave}
                  onCancel={cancelEditing}
                />
              ) : null}
            </Card>
          );
        })}

        {displayedOtherItems.length || editingSection === 'OTHER' ? (
          <Card className="gap-2">
            <SectionHeader
              title="其他指标"
              showEdit={canEdit && !isPending && editingSection == null}
              onEdit={() => startEditing('OTHER')}
            />
            {displayedOtherItems.length === 0 ? (
              <Subtitle>已全部认领为目录指标，保存后生效。</Subtitle>
            ) : null}
            {displayedOtherItems.map((item, index) => (
              <View
                key={`${item.nameZh}-${String(item.value)}-${index}`}
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
                {editingSection === 'OTHER' ? (
                  <Button
                    title="认领为指标"
                    variant="ghost"
                    className="mt-1 py-2"
                    onPress={() => setClaimIndex(index)}
                  />
                ) : null}
              </View>
            ))}
            {editingSection === 'OTHER' ? (
              <SectionEditActions
                dirty={dirty}
                saving={updateMetrics.isPending}
                error={saveError}
                onSave={handleSave}
                onCancel={cancelEditing}
              />
            ) : null}
          </Card>
        ) : null}

        {canEdit && !editing ? (
          <Button
            title="删除报告"
            variant="destructive"
            loading={deleteReport.isPending}
            onPress={handleDelete}
          />
        ) : null}

        <Card variant="accent">
          <Subtitle>{data.disclaimer}</Subtitle>
        </Card>
      </ScrollView>

      <CatalogKeyPickerSheet
        visible={claimIndex != null}
        excludeKeys={draftItems.map((item) => item.key)}
        onClose={() => setClaimIndex(null)}
        onSelect={claimOtherItem}
      />
    </Screen>
  );
}

function SectionHeader({
  title,
  showEdit,
  onEdit,
}: {
  title: string;
  showEdit: boolean;
  onEdit: () => void;
}) {
  return (
    <View className="flex-row items-center justify-between gap-3">
      <Title className="flex-1 text-base">{title}</Title>
      {showEdit ? (
        <Pressable onPress={onEdit} hitSlop={8}>
          <Text className="text-sm font-medium text-accent">修正</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function SectionEditActions({
  dirty,
  saving,
  error,
  onSave,
  onCancel,
}: {
  dirty: boolean;
  saving: boolean;
  error: string | null;
  onSave: () => void;
  onCancel: () => void;
}) {
  return (
    <View className="mt-2 gap-2">
      {error ? <ErrorText message={error} /> : null}
      <Button title="保存并重新评估" loading={saving} disabled={!dirty} onPress={onSave} />
      <Button title="取消" variant="ghost" onPress={onCancel} disabled={saving} />
    </View>
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

function MetricRow({
  item,
  editing,
  onChange,
}: {
  item: HealthMetricItem;
  editing: boolean;
  onChange: (patch: Partial<HealthMetricItem>) => void;
}) {
  const abnormal = item.flag !== 'NORMAL';
  return (
    <View className="border-b border-border py-2">
      <View className="flex-row justify-between gap-3">
        <Text className="flex-1 text-foreground">{item.nameZh}</Text>
        {editing ? null : (
          <Text className={abnormal ? 'font-semibold text-destructive' : 'text-muted'}>
            {metricFlagLabel(item.flag)}
          </Text>
        )}
      </View>
      {item.edited ? (
        <Text className="mt-1 text-xs text-accent">{termsZhCN.HEALTH_REPORT_EDITED_BADGE}</Text>
      ) : null}
      {editing ? (
        <View className="mt-2 gap-2">
          <View className="flex-row gap-2">
            <Input
              className="flex-1"
              value={String(item.value)}
              onChangeText={(text) => onChange({ value: parseMetricValue(text) })}
              placeholder="数值"
            />
            <Input
              className="w-24"
              value={item.unit}
              onChangeText={(unit) => onChange({ unit })}
              placeholder="单位"
            />
          </View>
          <View className="flex-row flex-wrap gap-2">
            {FLAG_OPTIONS.map((flag) => (
              <Pressable
                key={flag}
                onPress={() => onChange({ flag })}
                className={`rounded-lg border px-2 py-1 ${
                  item.flag === flag ? 'border-accent bg-accent/20' : 'border-border'
                }`}
              >
                <Text className={item.flag === flag ? 'text-accent' : 'text-muted'}>
                  {metricFlagLabel(flag)}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
      ) : (
        <Subtitle>
          {formatMetricDisplayValue(item.value, item.unit)}
          {formatRefRange(item)}
        </Subtitle>
      )}
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

function parseMetricValue(raw: string): number | string {
  const trimmed = raw.trim();
  if (!trimmed) return raw;
  if (/^[+-]?(?:\d+\.?\d*|\.\d+)$/.test(trimmed)) {
    const parsed = Number(trimmed);
    if (Number.isFinite(parsed)) return parsed;
  }
  return trimmed;
}
