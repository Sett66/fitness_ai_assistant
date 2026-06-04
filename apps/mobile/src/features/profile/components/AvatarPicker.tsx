import { useState } from 'react';
import { ActivityIndicator, Image, Pressable, View } from 'react-native';
import { launchImageLibrary } from 'react-native-image-picker';

import { Button, Label, Subtitle } from '@fitness/ui';

import { useUploadAvatar } from '../../../api/endpoints/media';

type AvatarPickerProps = {
  avatarUrl?: string | null;
  avatarMediaId?: string | null;
  onChange: (mediaId: string | null, previewUri?: string) => void;
};

export function AvatarPicker({ avatarUrl, onChange }: AvatarPickerProps) {
  const upload = useUploadAvatar();
  const [localUri, setLocalUri] = useState<string | null>(null);

  const displayUri = localUri ?? avatarUrl ?? null;

  const pick = async () => {
    const result = await launchImageLibrary({ mediaType: 'photo', quality: 0.8 });
    const asset = result.assets?.[0];
    if (!asset?.uri) return;

    setLocalUri(asset.uri);
    const mediaId = await upload.mutateAsync({
      fileUri: asset.uri,
      mime: asset.type ?? 'image/jpeg',
      sizeBytes: asset.fileSize ?? 1024,
    });
    onChange(mediaId, asset.uri);
  };

  return (
    <View className="items-center gap-3">
      <Label>头像（可选）</Label>
      <Pressable
        className="h-24 w-24 items-center justify-center overflow-hidden rounded-full border border-border bg-card"
        onPress={pick}
        disabled={upload.isPending}
      >
        {upload.isPending ? (
          <ActivityIndicator />
        ) : displayUri ? (
          <Image source={{ uri: displayUri }} className="h-full w-full" />
        ) : (
          <Subtitle>点击上传</Subtitle>
        )}
      </Pressable>
      {displayUri ? (
        <Button
          title="移除头像"
          variant="ghost"
          onPress={() => {
            setLocalUri(null);
            onChange(null);
          }}
        />
      ) : null}
    </View>
  );
}
