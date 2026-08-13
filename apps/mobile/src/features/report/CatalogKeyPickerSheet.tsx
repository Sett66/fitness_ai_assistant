import { useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { HEALTH_METRIC_CATALOG, type HealthMetricCatalogItem } from '@fitness/shared';
import { Button, Input, Subtitle, Title } from '@fitness/ui';

import { healthMetricCategoryLabels } from './report-labels';

type Props = {
  visible: boolean;
  excludeKeys: string[];
  onClose: () => void;
  onSelect: (key: string) => void;
};

export function CatalogKeyPickerSheet({ visible, excludeKeys, onClose, onSelect }: Props) {
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState('');
  const excluded = useMemo(() => new Set(excludeKeys), [excludeKeys]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return HEALTH_METRIC_CATALOG.filter((item) => {
      if (excluded.has(item.key)) return false;
      if (!q) return true;
      return (
        item.key.toLowerCase().includes(q) ||
        item.nameZh.toLowerCase().includes(q) ||
        item.aliases.some((alias) => alias.toLowerCase().includes(q))
      );
    });
  }, [excluded, query]);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View
        className="flex-1 bg-background px-4"
        style={{ paddingTop: insets.top + 8, paddingBottom: insets.bottom + 16 }}
      >
        <Title className="mb-2">认领为指标</Title>
        <Subtitle className="mb-3">从目录中选择该长尾项对应的标准指标。</Subtitle>
        <Input
          value={query}
          onChangeText={setQuery}
          placeholder="搜索名称或 key"
          autoCapitalize="none"
        />
        <ScrollView className="mt-3 flex-1" contentContainerClassName="gap-1 pb-4">
          {filtered.map((item) => (
            <CatalogRow key={item.key} item={item} onPress={() => onSelect(item.key)} />
          ))}
          {filtered.length === 0 ? <Subtitle>没有可认领的目录项。</Subtitle> : null}
        </ScrollView>
        <Button title="取消" variant="ghost" onPress={onClose} />
      </View>
    </Modal>
  );
}

function CatalogRow({ item, onPress }: { item: HealthMetricCatalogItem; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} className="rounded-xl border border-border bg-card px-3 py-3">
      <View className="flex-row justify-between gap-3">
        <Text className="flex-1 text-foreground">{item.nameZh}</Text>
        <Text className="text-muted">{item.unit || '—'}</Text>
      </View>
      <Subtitle>
        {item.key} · {healthMetricCategoryLabels[item.category]}
      </Subtitle>
    </Pressable>
  );
}
