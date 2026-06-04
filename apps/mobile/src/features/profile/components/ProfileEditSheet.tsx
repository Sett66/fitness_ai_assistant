import type { ReactNode } from 'react';
import { Modal, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, Title } from '@fitness/ui';

type ProfileEditSheetProps = {
  visible: boolean;
  title: string;
  onClose: () => void;
  onSave: () => void;
  saving?: boolean;
  saveLabel?: string;
  children: ReactNode;
};

export function ProfileEditSheet({
  visible,
  title,
  onClose,
  onSave,
  saving,
  saveLabel = '保存',
  children,
}: ProfileEditSheetProps) {
  const insets = useSafeAreaInsets();

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View
        className="flex-1 bg-background px-4"
        style={{ paddingTop: insets.top + 8, paddingBottom: insets.bottom + 16 }}
      >
        <Title className="mb-4">{title}</Title>
        <ScrollView className="flex-1" contentContainerClassName="gap-4 pb-4">
          {children}
        </ScrollView>
        <View className="gap-2 pt-2">
          <Button title={saveLabel} loading={saving} onPress={onSave} />
          <Button title="取消" variant="ghost" onPress={onClose} disabled={saving} />
        </View>
      </View>
    </Modal>
  );
}
