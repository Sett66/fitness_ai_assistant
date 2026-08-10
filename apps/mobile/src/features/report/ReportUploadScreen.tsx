import { useState } from 'react';
import { Alert, ScrollView, View } from 'react-native';
import type { Asset } from 'react-native-image-picker';
import { launchImageLibrary } from 'react-native-image-picker';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { Button, Card, ErrorText, Screen, Subtitle, Title } from '@fitness/ui';

import { useCreateReportFromImages } from '../../api/endpoints/reports';
import type { RootStackParamList } from '../../app/navigation/RootNavigator';

type Nav = NativeStackNavigationProp<RootStackParamList>;

export function ReportUploadScreen() {
  const navigation = useNavigation<Nav>();
  const createReport = useCreateReportFromImages();
  const [assets, setAssets] = useState<Asset[]>([]);

  const pickImages = async () => {
    const result = await launchImageLibrary({
      mediaType: 'photo',
      quality: 0.9,
      selectionLimit: 20,
    });
    if (result.didCancel) return;
    if (result.errorMessage) {
      Alert.alert('选择失败', result.errorMessage);
      return;
    }
    setAssets(result.assets?.filter((asset) => asset.uri) ?? []);
  };

  const submit = () => {
    if (assets.length === 0) return;
    createReport.mutate(assets, {
      onSuccess: (data) => navigation.replace('ReportDetail', { reportId: data.reportId }),
    });
  };

  return (
    <Screen>
      <ScrollView contentContainerClassName="gap-4 pb-8">
        <Title>上传体检报告</Title>
        <Subtitle>
          REPORT-01 仅支持图片。可一次选择多张报告截图或照片，PDF 会在后续切片支持。
        </Subtitle>

        <Card className="gap-2">
          <Title className="text-base">已选择 {assets.length} 张</Title>
          {assets.map((asset, index) => (
            <Subtitle key={`${asset.uri}-${index}`}>
              {index + 1}. {asset.fileName ?? asset.uri}
            </Subtitle>
          ))}
          {assets.length === 0 ? <Subtitle>尚未选择图片</Subtitle> : null}
        </Card>

        {createReport.error ? <ErrorText message={createReport.error.message} /> : null}

        <View className="gap-2">
          <Button
            title={assets.length > 0 ? '重新选择图片' : '选择报告图片'}
            variant="secondary"
            disabled={createReport.isPending}
            onPress={() => void pickImages()}
          />
          <Button
            title="开始分析"
            loading={createReport.isPending}
            disabled={assets.length === 0}
            onPress={submit}
          />
        </View>
      </ScrollView>
    </Screen>
  );
}
