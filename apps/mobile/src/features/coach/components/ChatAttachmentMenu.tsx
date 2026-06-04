import type { ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';

import { Camera, FileText, Image } from '@fitness/ui';

type ChatAttachmentMenuProps = {
  visible: boolean;
  disabled?: boolean;
  onPickGallery: () => void;
  onPickCamera: () => void;
  onPickFile: () => void;
  onClose: () => void;
};

type AttachmentOptionProps = {
  label: string;
  disabled?: boolean;
  onPress: () => void;
  children: ReactNode;
};

function AttachmentOption({ label, disabled, onPress, children }: AttachmentOptionProps) {
  return (
    <Pressable disabled={disabled} onPress={onPress} className="items-center gap-1 min-w-[64px]">
      <View className="h-11 w-11 items-center justify-center rounded-full bg-card border border-border">
        {children}
      </View>
      <Text className="text-xs text-muted">{label}</Text>
    </Pressable>
  );
}

export function ChatAttachmentMenu({
  visible,
  disabled,
  onPickGallery,
  onPickCamera,
  onPickFile,
  onClose,
}: ChatAttachmentMenuProps) {
  const wrap = (fn: () => void) => () => {
    onClose();
    fn();
  };

  return (
    <View
      className="px-4 border-t border-border bg-background overflow-hidden"
      style={{ maxHeight: visible ? 88 : 0, opacity: visible ? 1 : 0 }}
      pointerEvents={visible ? 'auto' : 'none'}
      collapsable={false}
    >
      <View className="flex-row justify-around py-2">
        <AttachmentOption label="相册" disabled={disabled} onPress={wrap(onPickGallery)}>
          <Image size={20} color="#FAFAFA" strokeWidth={1.5} />
        </AttachmentOption>
        <AttachmentOption label="拍照" disabled={disabled} onPress={wrap(onPickCamera)}>
          <Camera size={20} color="#FAFAFA" strokeWidth={1.5} />
        </AttachmentOption>
        <AttachmentOption label="文件" disabled={disabled} onPress={wrap(onPickFile)}>
          <FileText size={20} color="#FAFAFA" strokeWidth={1.5} />
        </AttachmentOption>
      </View>
    </View>
  );
}
