import { useState } from 'react';
import { Alert, Image, Pressable, ScrollView, Text, View } from 'react-native';
import type { Asset } from 'react-native-image-picker';
import { launchCamera, launchImageLibrary } from 'react-native-image-picker';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { MEDIA_MAX_SIZE_BYTES } from '@fitness/shared';
import { Button, ErrorText, Input, Screen, Subtitle, Title } from '@fitness/ui';

import type { PostImageFile } from '../../api/endpoints/social';
import { useCreatePostFromComposer } from '../../api/endpoints/social';
import type { RootStackParamList } from '../../app/navigation/RootNavigator';
import { resolveCityForPost } from '../location';
import { ensureCameraPermission, openAppSettings } from '../media/camera-permission';

type Nav = NativeStackNavigationProp<RootStackParamList, 'PostComposer'>;

const MAX_IMAGES = 9;
const MAX_BODY = 2000;
const MAX_CITY = 64;

export function PostComposerScreen() {
  const navigation = useNavigation<Nav>();
  const createPost = useCreatePostFromComposer();
  const [body, setBody] = useState('');
  const [images, setImages] = useState<PostImageFile[]>([]);
  const [cityEnabled, setCityEnabled] = useState(false);
  const [city, setCity] = useState('');
  const [cityLoading, setCityLoading] = useState(false);

  const remaining = MAX_BODY - body.length;
  const canSubmit = body.trim().length > 0 && !createPost.isPending && !cityLoading;

  const fillCityFromLocation = async () => {
    setCityLoading(true);
    try {
      const resolved = await resolveCityForPost();
      if (resolved) setCity(resolved);
    } finally {
      setCityLoading(false);
    }
  };

  const toggleCity = () => {
    if (cityEnabled) {
      setCityEnabled(false);
      setCity('');
      return;
    }
    setCityEnabled(true);
    if (!city.trim()) {
      void fillCityFromLocation();
    }
  };

  const appendAssets = (assets: Asset[] | undefined) => {
    const next = (assets ?? [])
      .map(assetToImageFile)
      .filter((file): file is PostImageFile => file != null);
    setImages((prev) => [...prev, ...next].slice(0, MAX_IMAGES));
  };

  const pickFromLibrary = async () => {
    const result = await launchImageLibrary({
      mediaType: 'photo',
      quality: 0.8,
      selectionLimit: MAX_IMAGES - images.length,
    });
    if (result.didCancel) return;
    if (result.errorMessage) {
      Alert.alert('选择失败', result.errorMessage);
      return;
    }
    appendAssets(result.assets);
  };

  const pickFromCamera = async () => {
    const permitted = await ensureCameraPermission();
    if (!permitted) {
      Alert.alert('需要相机权限', '拍照发帖需要使用相机', [
        { text: '取消', style: 'cancel' },
        { text: '去设置', onPress: openAppSettings },
      ]);
      return;
    }
    const result = await launchCamera({ mediaType: 'photo', quality: 0.8 });
    if (result.didCancel) return;
    if (result.errorMessage) {
      Alert.alert('拍照失败', result.errorMessage);
      return;
    }
    appendAssets(result.assets);
  };

  const submit = () => {
    const trimmed = body.trim();
    if (!trimmed) return;
    const trimmedCity = cityEnabled ? city.trim() : '';
    createPost.mutate(
      { body: trimmed, images, ...(trimmedCity ? { city: trimmedCity } : {}) },
      {
        onSuccess: () => navigation.goBack(),
      },
    );
  };

  return (
    <Screen>
      <ScrollView contentContainerClassName="gap-4 pb-8">
        <Title>发动态</Title>
        <Subtitle>
          文字最多 {MAX_BODY} 字，图片最多 {MAX_IMAGES} 张。
        </Subtitle>

        <Input
          multiline
          value={body}
          onChangeText={(text) => setBody(text.slice(0, MAX_BODY))}
          placeholder="今天练了什么？"
          className="min-h-[140px] py-3"
          textAlignVertical="top"
        />
        <Subtitle className={remaining < 50 ? 'text-destructive' : undefined}>
          还可输入 {remaining} 字
        </Subtitle>

        {images.length > 0 ? (
          <View className="flex-row flex-wrap gap-2">
            {images.map((file, index) => (
              <View key={`${file.uri}-${index}`} className="relative">
                <Image source={{ uri: file.uri }} className="h-24 w-24 rounded-lg bg-muted" />
                <Pressable
                  onPress={() => setImages((prev) => prev.filter((_, i) => i !== index))}
                  className="absolute right-1 top-1 rounded-full bg-black/70 px-2 py-0.5"
                >
                  <Text className="text-xs text-white">×</Text>
                </Pressable>
              </View>
            ))}
          </View>
        ) : null}

        <Pressable
          onPress={toggleCity}
          disabled={createPost.isPending || cityLoading}
          className="flex-row items-center justify-between rounded-xl border border-border bg-card px-3 py-3"
        >
          <View className="flex-1 pr-3">
            <Text className="text-base font-medium text-foreground">显示所在城市</Text>
            <Subtitle className="mt-1">可选。仅展示城市名，不公开精确坐标。</Subtitle>
          </View>
          <Text className="text-base font-semibold text-accent">{cityEnabled ? '开' : '关'}</Text>
        </Pressable>

        {cityEnabled ? (
          <View className="gap-2">
            <Input
              value={city}
              onChangeText={(text) => setCity(text.slice(0, MAX_CITY))}
              placeholder="城市，如 上海"
              editable={!createPost.isPending}
            />
            <Button
              title="使用当前位置"
              variant="secondary"
              loading={cityLoading}
              disabled={createPost.isPending}
              onPress={() => void fillCityFromLocation()}
            />
          </View>
        ) : null}

        {createPost.error ? <ErrorText message={createPost.error.message} /> : null}

        <View className="gap-2">
          <Button
            title="从相册选择"
            variant="secondary"
            disabled={createPost.isPending || images.length >= MAX_IMAGES}
            onPress={() => void pickFromLibrary()}
          />
          <Button
            title="拍照"
            variant="secondary"
            disabled={createPost.isPending || images.length >= MAX_IMAGES}
            onPress={() => void pickFromCamera()}
          />
          <Button
            title="发布"
            loading={createPost.isPending}
            disabled={!canSubmit}
            onPress={submit}
          />
        </View>
      </ScrollView>
    </Screen>
  );
}

function assetToImageFile(asset: Asset): PostImageFile | null {
  if (!asset.uri) return null;
  const sizeBytes = asset.fileSize ?? 0;
  if (sizeBytes > MEDIA_MAX_SIZE_BYTES) return null;
  return {
    uri: asset.uri,
    mime: normalizeImageMime(asset.type),
    sizeBytes: sizeBytes > 0 ? sizeBytes : 500_000,
  };
}

function normalizeImageMime(mime: string | undefined): string {
  if (!mime) return 'image/jpeg';
  const lower = mime.toLowerCase();
  if (lower === 'image/jpg' || lower === 'image/pjpeg') return 'image/jpeg';
  return lower;
}
