import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { ConversationListItem } from '@fitness/shared';
import { Button, Subtitle, Title } from '@fitness/ui';

type ConversationDrawerProps = {
  visible: boolean;
  items: ConversationListItem[];
  activeConversationId: string | null;
  loading?: boolean;
  creating?: boolean;
  onClose: () => void;
  onSelect: (id: string) => void;
  onCreateNew: () => void;
};

function formatUpdatedAt(value: string | Date): string {
  const date = value instanceof Date ? value : new Date(value);
  const now = new Date();
  const isToday =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();
  if (isToday) {
    return date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  }
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function ConversationDrawer({
  visible,
  items,
  activeConversationId,
  loading,
  creating,
  onClose,
  onSelect,
  onCreateNew,
}: ConversationDrawerProps) {
  const insets = useSafeAreaInsets();

  if (!visible) {
    return null;
  }

  return (
    <View style={[StyleSheet.absoluteFillObject, styles.overlay]} pointerEvents="box-none">
      <View style={styles.row}>
        <View
          className="bg-background border-r border-border"
          style={[
            styles.panel,
            {
              paddingTop: insets.top + 8,
              paddingBottom: insets.bottom + 16,
            },
          ]}
        >
          <View className="px-4 pb-3 flex-row items-center justify-between">
            <Title>历史对话</Title>
            <Pressable onPress={onClose} hitSlop={12}>
              <Text className="text-muted text-sm">关闭</Text>
            </Pressable>
          </View>

          {loading ? (
            <View className="flex-1 items-center justify-center">
              <ActivityIndicator />
            </View>
          ) : (
            <FlatList
              data={items}
              keyExtractor={(item) => item.id}
              contentContainerClassName="px-2 pb-4 grow"
              ListEmptyComponent={
                <View className="px-2 py-8">
                  <Subtitle>暂无历史对话</Subtitle>
                </View>
              }
              renderItem={({ item }) => {
                const active = item.id === activeConversationId;
                const label =
                  item.title?.trim() ||
                  (item.isDefault ? '教练 Alex' : null) ||
                  item.preview?.trim() ||
                  '新对话';
                return (
                  <Pressable
                    onPress={() => onSelect(item.id)}
                    className={`mx-2 mb-1 rounded-xl px-3 py-3 border ${
                      active ? 'bg-accent/15 border-accent/40' : 'bg-card border-border'
                    }`}
                  >
                    <Text
                      className={`text-sm font-medium ${active ? 'text-accent' : 'text-foreground'}`}
                      numberOfLines={1}
                    >
                      {label}
                      {item.isDefault ? (
                        <Text className="text-xs text-muted"> · 主会话</Text>
                      ) : null}
                    </Text>
                    {item.preview && item.title ? (
                      <Text className="text-xs text-muted mt-1" numberOfLines={1}>
                        {item.preview}
                      </Text>
                    ) : item.preview && !item.title ? (
                      <Text className="text-xs text-muted mt-1" numberOfLines={2}>
                        {item.preview}
                      </Text>
                    ) : null}
                    <Text className="text-xs text-muted mt-1">
                      {formatUpdatedAt(item.updatedAt)}
                    </Text>
                  </Pressable>
                );
              }}
            />
          )}

          <View className="px-4 pt-2 border-t border-border">
            <Button title="新建对话" loading={creating} onPress={onCreateNew} />
          </View>
        </View>

        <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="关闭会话列表" />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    zIndex: 1000,
    elevation: 1000,
  },
  row: {
    flex: 1,
    flexDirection: 'row',
  },
  panel: {
    width: '82%',
    maxWidth: 320,
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
});
