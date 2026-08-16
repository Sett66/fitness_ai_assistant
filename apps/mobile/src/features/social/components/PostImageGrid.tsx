import { Image, Pressable, View } from 'react-native';

type PostImageGridProps = {
  urls: string[];
  onPress?: () => void;
};

export function PostImageGrid({ urls, onPress }: PostImageGridProps) {
  if (urls.length === 0) return null;

  const columns = urls.length === 1 ? 1 : urls.length <= 4 ? 2 : 3;
  const gap = 4;

  return (
    <View className="flex-row flex-wrap" style={{ marginHorizontal: -gap / 2 }}>
      {urls.map((url, index) => {
        const isSingle = urls.length === 1;
        const widthPct = `${100 / columns}%` as const;
        return (
          <Pressable
            key={`${url}-${index}`}
            onPress={onPress}
            style={{ width: widthPct, padding: gap / 2 }}
          >
            <Image
              source={{ uri: url }}
              className="w-full rounded-lg bg-muted"
              style={{ aspectRatio: isSingle ? 4 / 3 : 1 }}
              resizeMode="cover"
            />
          </Pressable>
        );
      })}
    </View>
  );
}
