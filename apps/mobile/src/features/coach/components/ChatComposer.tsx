import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { Button, Input, Plus } from '@fitness/ui';

import type { CoachDraftAttachment } from '../coach-draft-attachments';
import { CoachDraftAttachments } from '../coach-draft-attachments';
import { ChatAttachmentMenu } from './ChatAttachmentMenu';
type CoachQuickActionsProps = {
  onGenerateWorkout: () => void;
  onGenerateMeal: () => void;
  onMealPhoto: () => void;
  onManualMeal: () => void;
  disabled?: boolean;
  /** 识餐任务进行中时禁用；与 Alex 流式回复无关 */
  mealPhotoDisabled?: boolean;
  mealPhotoLoading?: boolean;
};

export function CoachQuickActions({
  onGenerateWorkout,
  onGenerateMeal,
  onMealPhoto,
  onManualMeal,
  disabled,
  mealPhotoDisabled,
  mealPhotoLoading,
}: CoachQuickActionsProps) {
  const chips = [
    { label: '训练计划', onPress: onGenerateWorkout, disabled: disabled ?? false },
    { label: '饮食计划', onPress: onGenerateMeal, disabled: disabled ?? false },
    {
      label: mealPhotoLoading ? '识别中…' : '拍餐识别',
      onPress: onMealPhoto,
      disabled: mealPhotoDisabled ?? disabled ?? false,
    },
    { label: '手动记餐', onPress: onManualMeal, disabled: disabled ?? false },
  ];

  return (
    <View className="px-4 py-2 gap-2 border-t border-border">
      <View className="flex-row flex-wrap gap-2">
        {chips.map((chip) => (
          <Pressable
            key={chip.label}
            disabled={chip.disabled}
            onPress={chip.onPress}
            className={`rounded-full border border-border bg-card px-3 py-1.5 ${
              chip.disabled ? 'opacity-40' : ''
            }`}
          >
            <Text className="text-sm text-foreground">{chip.label}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

type ChatComposerProps = {
  value: string;
  onChangeText: (text: string) => void;
  onSend: () => void;
  onStop?: () => void;
  onPickGallery?: () => void;
  onPickCamera?: () => void;
  onPickFile?: () => void;
  /** 非流式任务（计划/识餐）提交中 */
  sending?: boolean;
  /** Coach CHAT 流式生成中 */
  streaming?: boolean;
  attachmentsDisabled?: boolean;
  draftAttachments?: CoachDraftAttachment[];
  onRemoveDraftAttachment?: (id: string) => void;
};

export function ChatComposer({
  value,
  onChangeText,
  onSend,
  onStop,
  onPickGallery,
  onPickCamera,
  onPickFile,
  sending,
  streaming,
  attachmentsDisabled,
  draftAttachments = [],
  onRemoveDraftAttachment,
}: ChatComposerProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const disabled = attachmentsDisabled || sending || streaming;
  const inputDisabled = sending || streaming;
  const hasAttachments = Boolean(onPickGallery || onPickCamera || onPickFile);
  const canSend = Boolean(value.trim()) || draftAttachments.length > 0;

  const toggleMenu = () => {
    if (disabled) return;
    setMenuOpen((open) => !open);
  };

  useEffect(() => {
    if (disabled) {
      setMenuOpen(false);
    }
  }, [disabled]);

  return (
    <View className="border-t border-border bg-background">
      {hasAttachments ? (
        <ChatAttachmentMenu
          visible={menuOpen}
          disabled={disabled}
          onClose={() => setMenuOpen(false)}
          onPickGallery={() => onPickGallery?.()}
          onPickCamera={() => onPickCamera?.()}
          onPickFile={() => onPickFile?.()}
        />
      ) : null}

      {draftAttachments.length > 0 && onRemoveDraftAttachment ? (
        <CoachDraftAttachments attachments={draftAttachments} onRemove={onRemoveDraftAttachment} />
      ) : null}

      <View className="flex-row items-end gap-2 px-4 py-3">
        <Input
          value={value}
          onChangeText={onChangeText}
          placeholder={streaming ? 'Alex 正在回复…' : '和 Alex 聊聊…'}
          multiline
          editable={!inputDisabled}
          className="flex-1 min-h-[44px] max-h-[120px]"
        />

        {hasAttachments ? (
          <Pressable
            accessibilityLabel="添加附件"
            disabled={disabled}
            onPress={toggleMenu}
            className={`h-10 w-10 items-center justify-center rounded-full border mb-0.5 ${
              menuOpen ? 'bg-accent/20 border-accent/50' : 'bg-card border-border'
            }`}
          >
            <View style={{ transform: [{ rotate: menuOpen ? '45deg' : '0deg' }] }}>
              <Plus size={22} color={menuOpen ? '#D0FD3E' : '#FAFAFA'} strokeWidth={1.5} />
            </View>
          </Pressable>
        ) : null}

        <Button
          title={streaming ? '停止' : '发送'}
          variant={streaming ? 'secondary' : 'primary'}
          loading={!streaming && sending}
          disabled={!streaming && !canSend}
          onPress={streaming ? onStop : onSend}
          className="px-4"
        />
      </View>
    </View>
  );
}
