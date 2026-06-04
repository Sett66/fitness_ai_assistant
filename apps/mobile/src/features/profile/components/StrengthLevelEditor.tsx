import { useMemo, useState } from 'react';
import { FlatList, Modal, Pressable, View } from 'react-native';

import { Button, Card, ErrorText, Input, Label, Subtitle, Title } from '@fitness/ui';
import type { ExerciseEquipment, StrengthLevelResponse } from '@fitness/shared';
import {
  formatStrengthLevelSummary,
  fromLoadAdjustmentKg,
  isBodyweightEquipment,
  termsZhCN,
  toLoadAdjustmentKg,
} from '@fitness/shared';

import {
  useDeleteStrengthLevel,
  useExercises,
  useStrengthLevels,
  useUpsertStrengthLevel,
} from '../../../api/endpoints/users';

type DraftRow = {
  key: string;
  id?: string;
  exerciseId: string;
  exerciseName: string;
  exerciseEquipment?: ExerciseEquipment;
  oneRm: string;
  workingWeightKg: string;
  maxReps: string;
  assistKg: string;
  addedKg: string;
};

function toDraft(row: StrengthLevelResponse): DraftRow {
  const { assistKg, addedKg } = fromLoadAdjustmentKg(row.loadAdjustmentKg);
  return {
    key: row.id,
    id: row.id,
    exerciseId: row.exerciseId,
    exerciseName: row.exerciseName ?? row.exerciseId,
    exerciseEquipment: row.exerciseEquipment,
    oneRm: row.oneRm != null ? String(row.oneRm) : '',
    workingWeightKg: row.workingWeightKg != null ? String(row.workingWeightKg) : '',
    maxReps: row.maxReps != null ? String(row.maxReps) : '',
    assistKg: assistKg != null ? String(assistKg) : '',
    addedKg: addedKg != null ? String(addedKg) : '',
  };
}

function emptyDraft(key: string): DraftRow {
  return {
    key,
    exerciseId: '',
    exerciseName: '',
    oneRm: '',
    workingWeightKg: '',
    maxReps: '',
    assistKg: '',
    addedKg: '',
  };
}

type StrengthLevelEditorProps = {
  mode?: 'batch' | 'instant';
  onBatchSaved?: () => void;
};

export function StrengthLevelEditor({ mode = 'instant', onBatchSaved }: StrengthLevelEditorProps) {
  const strengths = useStrengthLevels();
  const exercises = useExercises(100);
  const upsert = useUpsertStrengthLevel();
  const remove = useDeleteStrengthLevel();

  const [drafts, setDrafts] = useState<DraftRow[]>([]);
  const [pendingRows, setPendingRows] = useState<DraftRow[]>([]);
  const [edits, setEdits] = useState<Record<string, Partial<DraftRow>>>({});
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerTargetKey, setPickerTargetKey] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [error, setError] = useState<string | null>(null);

  const exerciseById = useMemo(() => {
    const map = new Map<string, { nameZh: string; equipment: ExerciseEquipment }>();
    for (const ex of exercises.data?.items ?? []) {
      map.set(ex.id, { nameZh: ex.nameZh, equipment: ex.equipment });
    }
    return map;
  }, [exercises.data?.items]);

  const serverRows = useMemo(() => strengths.data?.map(toDraft) ?? [], [strengths.data]);
  const baseRows = mode === 'batch' ? drafts : [...pendingRows, ...serverRows];
  const rows = baseRows.map((row) => ({ ...row, ...edits[row.key] }));

  const usedExerciseIds = new Set(rows.map((r) => r.exerciseId).filter(Boolean));

  const filteredExercises =
    exercises.data?.items.filter(
      (ex) =>
        ex.nameZh.includes(search) &&
        (!usedExerciseIds.has(ex.id) ||
          ex.id === rows.find((r) => r.key === pickerTargetKey)?.exerciseId),
    ) ?? [];

  const resolveEquipment = (row: DraftRow): ExerciseEquipment | undefined =>
    row.exerciseEquipment ?? exerciseById.get(row.exerciseId)?.equipment;

  const isRowExpanded = (row: DraftRow) => {
    if (mode === 'batch') return true;
    if (!row.id) return true;
    return expandedKey === row.key;
  };

  const buildPayload = (row: DraftRow) => {
    const equipment = resolveEquipment(row);
    if (isBodyweightEquipment(equipment)) {
      const maxReps = row.maxReps.trim() ? Number(row.maxReps) : null;
      const assist = row.assistKg.trim() ? Number(row.assistKg) : null;
      const added = row.addedKg.trim() ? Number(row.addedKg) : null;
      if (assist != null && assist > 0 && added != null && added > 0) {
        throw new Error('辅助与额外负重请只填一项');
      }
      const loadAdjustmentKg = toLoadAdjustmentKg(
        assist != null && assist > 0 ? assist : null,
        added != null && added > 0 ? added : null,
      );
      const hasBodyweight =
        (maxReps != null && maxReps > 0) || (loadAdjustmentKg != null && loadAdjustmentKg !== 0);
      if (!hasBodyweight) {
        throw new Error('请填写最大次数或辅助/负重信息');
      }
      return {
        exerciseId: row.exerciseId,
        maxReps,
        loadAdjustmentKg,
        oneRm: null,
        workingWeightKg: null,
      };
    }

    const oneRm = row.oneRm.trim() ? Number(row.oneRm) : null;
    const workingWeightKg = row.workingWeightKg.trim() ? Number(row.workingWeightKg) : null;
    if ((oneRm == null || oneRm <= 0) && (workingWeightKg == null || workingWeightKg <= 0)) {
      throw new Error('请至少填写极限重量或做组重量');
    }
    return {
      exerciseId: row.exerciseId,
      oneRm,
      workingWeightKg,
      maxReps: null,
      loadAdjustmentKg: null,
    };
  };

  const addRow = () => {
    const key = `new-${Date.now()}`;
    const empty = emptyDraft(key);
    if (mode === 'batch') {
      setDrafts((prev) => [empty, ...prev]);
    } else {
      setPendingRows((prev) => [empty, ...prev]);
      setExpandedKey(key);
    }
    setPickerTargetKey(key);
    setPickerOpen(true);
  };

  const openPicker = (key: string) => {
    setPickerTargetKey(key);
    setPickerOpen(true);
  };

  const expandRow = (key: string) => {
    if (mode === 'instant') setExpandedKey(key);
  };

  const collapseRow = (key: string) => {
    setExpandedKey((current) => (current === key ? null : current));
    setEdits((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  const selectExercise = (
    exerciseId: string,
    exerciseName: string,
    equipment: ExerciseEquipment,
  ) => {
    if (!pickerTargetKey) return;
    const patch = { exerciseId, exerciseName, exerciseEquipment: equipment };
    if (mode === 'batch') {
      setDrafts((prev) => prev.map((r) => (r.key === pickerTargetKey ? { ...r, ...patch } : r)));
    } else if (pendingRows.some((r) => r.key === pickerTargetKey)) {
      setPendingRows((prev) =>
        prev.map((r) => (r.key === pickerTargetKey ? { ...r, ...patch } : r)),
      );
    } else {
      setEdits((prev) => ({
        ...prev,
        [pickerTargetKey]: { ...prev[pickerTargetKey], ...patch },
      }));
    }
    setPickerOpen(false);
    setSearch('');
  };

  const updateRow = (key: string, patch: Partial<DraftRow>) => {
    if (mode === 'batch') {
      setDrafts((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));
    } else if (pendingRows.some((r) => r.key === key)) {
      setPendingRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));
    } else {
      setEdits((prev) => ({ ...prev, [key]: { ...prev[key], ...patch } }));
    }
  };

  const saveRow = async (row: DraftRow) => {
    setError(null);
    if (!row.exerciseId) {
      setError('请选择训练项目');
      return;
    }
    try {
      const payload = buildPayload(row);
      await upsert.mutateAsync(payload);
      setPendingRows((prev) => prev.filter((r) => r.key !== row.key));
      setEdits((prev) => {
        const next = { ...prev };
        delete next[row.key];
        return next;
      });
      setExpandedKey(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : '保存失败');
    }
  };

  const saveBatch = async () => {
    setError(null);
    try {
      for (const row of drafts) {
        if (!row.exerciseId) continue;
        const payload = buildPayload(row);
        await upsert.mutateAsync(payload);
      }
      onBatchSaved?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : '保存失败');
    }
  };

  const deleteRow = async (row: DraftRow) => {
    if (mode === 'batch') {
      setDrafts((prev) => prev.filter((r) => r.key !== row.key));
      return;
    }
    if (!row.id) {
      setPendingRows((prev) => prev.filter((r) => r.key !== row.key));
      setExpandedKey((current) => (current === row.key ? null : current));
      return;
    }
    await remove.mutateAsync(row.id);
    setExpandedKey((current) => (current === row.key ? null : current));
    setEdits((prev) => {
      const next = { ...prev };
      delete next[row.key];
      return next;
    });
  };

  const summaryForRow = (row: DraftRow) => {
    const equipment = resolveEquipment(row);
    const loadAdjustmentKg = toLoadAdjustmentKg(
      row.assistKg.trim() ? Number(row.assistKg) : null,
      row.addedKg.trim() ? Number(row.addedKg) : null,
    );
    return formatStrengthLevelSummary({
      exerciseEquipment: equipment,
      oneRm: row.oneRm.trim() ? Number(row.oneRm) : null,
      workingWeightKg: row.workingWeightKg.trim() ? Number(row.workingWeightKg) : null,
      maxReps: row.maxReps.trim() ? Number(row.maxReps) : null,
      loadAdjustmentKg,
    });
  };

  if (mode === 'instant' && strengths.isLoading) {
    return <Subtitle>加载运动表现…</Subtitle>;
  }

  return (
    <View className="gap-3">
      <Button title="新增一项" variant="secondary" onPress={addRow} />

      {rows.length === 0 ? (
        <Subtitle className="opacity-70">尚未记录运动表现，可点击上方新增</Subtitle>
      ) : null}

      {rows.map((row) => {
        const expanded = isRowExpanded(row);
        const bodyweight = isBodyweightEquipment(resolveEquipment(row));

        if (mode === 'instant' && !expanded) {
          return (
            <Pressable
              key={row.key}
              onPress={() => expandRow(row.key)}
              className="rounded-2xl border border-border bg-card px-4 py-3"
            >
              <Subtitle className="font-medium text-foreground">
                {row.exerciseName || '未命名项目'}
              </Subtitle>
              <Subtitle className="mt-0.5 text-xs opacity-80">{summaryForRow(row)}</Subtitle>
            </Pressable>
          );
        }

        return (
          <Card key={row.key} className="gap-2">
            <Pressable onPress={() => openPicker(row.key)}>
              <Label>训练项目</Label>
              <Subtitle className="py-2">{row.exerciseName || '点击选择动作'}</Subtitle>
            </Pressable>

            {bodyweight ? (
              <>
                <Subtitle className="text-xs opacity-70">
                  {termsZhCN.STRENGTH_BODYWEIGHT_HINT}
                </Subtitle>
                <Label>{termsZhCN.STRENGTH_MAX_REPS}</Label>
                <Input
                  value={row.maxReps}
                  onChangeText={(v) => updateRow(row.key, { maxReps: v })}
                  keyboardType="number-pad"
                  placeholder="例如 8"
                />
                <Label>{termsZhCN.STRENGTH_ASSIST_WEIGHT}</Label>
                <Input
                  value={row.assistKg}
                  onChangeText={(v) => updateRow(row.key, { assistKg: v, addedKg: '' })}
                  keyboardType="decimal-pad"
                  placeholder="例如 10（弹力带/器械辅助）"
                />
                <Label>{termsZhCN.STRENGTH_ADDED_WEIGHT}</Label>
                <Input
                  value={row.addedKg}
                  onChangeText={(v) => updateRow(row.key, { addedKg: v, assistKg: '' })}
                  keyboardType="decimal-pad"
                  placeholder="例如 10（负重背心/杠铃片）"
                />
              </>
            ) : (
              <>
                <Label>{termsZhCN.STRENGTH_ONE_RM}</Label>
                <Input
                  value={row.oneRm}
                  onChangeText={(v) => updateRow(row.key, { oneRm: v })}
                  keyboardType="decimal-pad"
                  placeholder="例如 100 或 12.5"
                />
                <Label>{termsZhCN.STRENGTH_WORKING_WEIGHT}</Label>
                <Input
                  value={row.workingWeightKg}
                  onChangeText={(v) => updateRow(row.key, { workingWeightKg: v })}
                  keyboardType="decimal-pad"
                  placeholder="例如 80 或 12.5"
                />
              </>
            )}

            <View className="flex-row gap-2">
              {mode === 'instant' ? (
                <Button
                  title="保存"
                  className="flex-1"
                  loading={upsert.isPending}
                  onPress={() => saveRow(row)}
                />
              ) : null}
              {mode === 'instant' && row.id ? (
                <Button
                  title="收起"
                  variant="ghost"
                  className="flex-1"
                  onPress={() => collapseRow(row.key)}
                />
              ) : null}
              <Button
                title="删除"
                variant="secondary"
                className="flex-1"
                onPress={() => deleteRow(row)}
              />
            </View>
          </Card>
        );
      })}

      {error ? <ErrorText message={error} /> : null}

      {mode === 'batch' && drafts.length > 0 ? (
        <Button title="保存运动表现" loading={upsert.isPending} onPress={saveBatch} />
      ) : null}

      <Modal visible={pickerOpen} animationType="slide" onRequestClose={() => setPickerOpen(false)}>
        <View className="flex-1 bg-background px-4 pt-12">
          <Title className="mb-4">选择动作</Title>
          <Input
            value={search}
            onChangeText={setSearch}
            placeholder="搜索动作名称"
            className="mb-3"
          />
          <FlatList
            data={filteredExercises}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <Pressable
                className="border-b border-border py-3"
                onPress={() => selectExercise(item.id, item.nameZh, item.equipment)}
              >
                <Subtitle>{item.nameZh}</Subtitle>
              </Pressable>
            )}
            ListEmptyComponent={<Subtitle>暂无动作</Subtitle>}
          />
          <Button title="关闭" variant="secondary" onPress={() => setPickerOpen(false)} />
        </View>
      </Modal>
    </View>
  );
}
