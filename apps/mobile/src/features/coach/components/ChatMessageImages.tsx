import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Image, Modal, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useUploadReadUrls } from '../../../api/endpoints/media';

type ChatMessageImagesProps = {
  objectKeys?: string[];
  previewUris?: string[];
};

type ResolvedImage = {
  key: string;
  uri: string | null;
};

function ChatImageViewer({ uri, onClose }: { uri: string; onClose: () => void }) {
  const insets = useSafeAreaInsets();

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View className="flex-1 bg-black/95">
        <Pressable
          onPress={onClose}
          className="absolute z-10 rounded-full bg-black/50 px-3 py-1.5"
          style={{ top: insets.top + 8, right: 16 }}
        >
          <Text className="text-white text-base">关闭</Text>
        </Pressable>
        <Pressable className="flex-1" onPress={onClose}>
          <Image source={{ uri }} className="flex-1" resizeMode="contain" />
        </Pressable>
      </View>
    </Modal>
  );
}

export function ChatMessageImages({ objectKeys = [], previewUris = [] }: ChatMessageImagesProps) {
  const localUris = previewUris.filter(Boolean);
  const { data: remoteUrls, refetch, isLoading, isError } = useUploadReadUrls(objectKeys);
  const [viewerUri, setViewerUri] = useState<string | null>(null);

  const remoteByKey = useMemo(() => {
    const map = new Map<string, string>();
    for (const item of remoteUrls?.items ?? []) {
      map.set(item.objectKey, item.url);
    }
    return map;
  }, [remoteUrls]);

  const images = useMemo((): ResolvedImage[] => {
    if (objectKeys.length > 0) {
      return objectKeys.map((key, index) => ({
        key,
        uri: localUris[index] ?? remoteByKey.get(key) ?? null,
      }));
    }
    return localUris.map((uri, index) => ({ key: `local-${index}`, uri }));
  }, [localUris, objectKeys, remoteByKey]);

  const handleImageError = useCallback(() => {
    if (objectKeys.length > 0) {
      void refetch();
    }
  }, [objectKeys.length, refetch]);

  const openViewer = useCallback(
    (item: ResolvedImage) => {
      if (objectKeys.length > 0) {
        void refetch().then((result) => {
          const fresh =
            result.data?.items.find((row) => row.objectKey === item.key)?.url ?? item.uri;
          if (fresh) {
            setViewerUri(fresh);
          }
        });
        return;
      }
      if (item.uri) {
        setViewerUri(item.uri);
      }
    },
    [objectKeys.length, refetch],
  );

  if (images.length === 0) {
    return null;
  }

  return (
    <>
      <View className="flex-row flex-wrap gap-2 mb-2">
        {images.map((item) => (
          <Pressable key={item.key} disabled={!item.uri} onPress={() => openViewer(item)}>
            {item.uri ? (
              <Image
                source={{ uri: item.uri }}
                className="h-24 w-24 rounded-lg bg-muted"
                resizeMode="cover"
                onError={handleImageError}
              />
            ) : (
              <View className="h-24 w-24 rounded-lg bg-muted/80 items-center justify-center">
                {isLoading ? (
                  <ActivityIndicator size="small" color="#888" />
                ) : (
                  <Text className="text-xs text-muted-foreground px-1 text-center">
                    {isError ? '加载失败' : '…'}
                  </Text>
                )}
              </View>
            )}
          </Pressable>
        ))}
      </View>
      {viewerUri ? <ChatImageViewer uri={viewerUri} onClose={() => setViewerUri(null)} /> : null}
    </>
  );
}
