import { Alert, ScrollView, View } from 'react-native';
import { useState } from 'react';
import { Button, Input, Screen, Subtitle, Title } from '@fitness/ui';
import {
  useCreateMemory,
  useDeleteMemory,
  useMemories,
  useUpdateMemory,
} from '../../api/endpoints/users';
import { ProfileEditSheet } from './components/ProfileEditSheet';

const labels: Record<string, string> = {
  injury: '伤病',
  diet_restriction: '饮食限制',
  diet_pref: '饮食偏好',
  equipment: '器械',
  schedule: '时间',
  location: '地点',
  goal_note: '目标',
  other: '其他',
};

export function CoachMemoriesScreen() {
  const memories = useMemories();
  const remove = useDeleteMemory();
  const create = useCreateMemory();
  const update = useUpdateMemory();
  const [editing, setEditing] = useState<{
    id?: string;
    value: string;
    category: string;
    slug: string;
  } | null>(null);
  if (memories.isLoading)
    return (
      <Screen>
        <Title>加载记忆…</Title>
      </Screen>
    );
  const groups = new Map<string, typeof memories.data>();
  for (const item of memories.data ?? [])
    groups.set(item.category, [...(groups.get(item.category) ?? []), item]);
  return (
    <Screen>
      <ScrollView contentContainerClassName="pb-8 gap-4">
        <Title>教练记得什么</Title>
        <Button
          title="新增记忆"
          onPress={() => setEditing({ value: '', category: 'other', slug: 'note' })}
        />
        {groups.size === 0 ? (
          <Subtitle>教练还没有记下稳定偏好。</Subtitle>
        ) : (
          [...groups].map(([category, items]) => (
            <View key={category} className="gap-2">
              <Subtitle>{labels[category] ?? '其他'}</Subtitle>
              {(items ?? []).map((item) => (
                <View key={item.id} className="rounded-xl bg-surface p-4 gap-2">
                  <Subtitle>{item.value}</Subtitle>
                  <Button
                    title="编辑"
                    variant="secondary"
                    onPress={() =>
                      setEditing({
                        id: item.id,
                        value: item.value,
                        category: item.category,
                        slug: item.key.split(':')[1] ?? 'note',
                      })
                    }
                  />
                  <Button
                    title="删除"
                    variant="destructive"
                    loading={remove.isPending}
                    onPress={() =>
                      Alert.alert('删除这条记忆？', '删除后教练不会自动重新记住它。', [
                        { text: '取消', style: 'cancel' },
                        {
                          text: '删除',
                          style: 'destructive',
                          onPress: () => remove.mutate(item.id),
                        },
                      ])
                    }
                  />
                </View>
              ))}
            </View>
          ))
        )}
      </ScrollView>
      <ProfileEditSheet
        visible={editing != null}
        title={editing?.id ? '编辑记忆' : '新增记忆'}
        onClose={() => setEditing(null)}
        saving={create.isPending || update.isPending}
        onSave={() => {
          if (!editing?.value.trim()) return;
          if (editing.id)
            update.mutate(
              { id: editing.id, value: editing.value },
              { onSuccess: () => setEditing(null) },
            );
          else
            create.mutate(
              { category: editing.category, slug: editing.slug, value: editing.value },
              { onSuccess: () => setEditing(null) },
            );
        }}
      >
        <Subtitle>
          类别（injury、diet_restriction、diet_pref、equipment、schedule、location、goal_note、other）
        </Subtitle>
        <Input
          value={editing?.category ?? ''}
          onChangeText={(category) =>
            setEditing((current) => (current ? { ...current, category } : current))
          }
        />
        {!editing?.id ? (
          <>
            <Subtitle>标识（英文 snake_case）</Subtitle>
            <Input
              value={editing?.slug ?? ''}
              onChangeText={(slug) =>
                setEditing((current) => (current ? { ...current, slug } : current))
              }
            />
          </>
        ) : null}
        <Subtitle>记忆内容</Subtitle>
        <Input
          value={editing?.value ?? ''}
          multiline
          onChangeText={(value) =>
            setEditing((current) => (current ? { ...current, value } : current))
          }
        />
      </ProfileEditSheet>
    </Screen>
  );
}
