import { useState } from 'react';
import { Alert, ScrollView, View } from 'react-native';
import type { Asset } from 'react-native-image-picker';
import { launchImageLibrary } from 'react-native-image-picker';
import { pick, types } from '@react-native-documents/picker';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { MEDIA_MAX_SIZE_BYTES, REPORT_PDF_MAX_PAGES } from '@fitness/shared';

import { Button, Card, ErrorText, Screen, Subtitle, Title } from '@fitness/ui';

import { useCreateReportFromFiles, type ReportSourceFile } from '../../api/endpoints/reports';
import type { RootStackParamList } from '../../app/navigation/RootNavigator';

type Nav = NativeStackNavigationProp<RootStackParamList>;

export function ReportUploadScreen() {
  const navigation = useNavigation<Nav>();
  const createReport = useCreateReportFromFiles();
  const [files, setFiles] = useState<ReportSourceFile[]>([]);

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
    const next = (result.assets ?? [])
      .map(assetToSourceFile)
      .filter((file): file is ReportSourceFile => file != null);
    setFiles((prev) => [...prev, ...next].slice(0, 20));
  };

  const pickPdf = async () => {
    try {
      const picked = await pick({
        type: [types.pdf],
        allowMultiSelection: true,
      });
      const next: ReportSourceFile[] = [];
      for (const file of picked) {
        if (!file.uri) continue;
        const sizeBytes = file.size ?? 0;
        if (sizeBytes > MEDIA_MAX_SIZE_BYTES) {
          Alert.alert('文件过大', `${file.name ?? 'PDF'} 超过 50MB 上限`);
          continue;
        }
        next.push({
          uri: file.uri,
          mime: file.type || 'application/pdf',
          sizeBytes: sizeBytes > 0 ? sizeBytes : 1,
          name: file.name ?? 'report.pdf',
        });
      }
      setFiles((prev) => [...prev, ...next].slice(0, 20));
    } catch (err) {
      const code = (err as { code?: string })?.code;
      if (code === 'DOCUMENT_PICKER_CANCELED' || code === 'OPERATION_CANCELED') {
        return;
      }
      Alert.alert('选择失败', err instanceof Error ? err.message : '请稍后重试');
    }
  };

  const submit = () => {
    if (files.length === 0) return;
    createReport.mutate(files, {
      onSuccess: (data) => navigation.replace('ReportDetail', { reportId: data.reportId }),
    });
  };

  return (
    <Screen>
      <ScrollView contentContainerClassName="gap-4 pb-8">
        <Title>上传体检报告</Title>
        <Subtitle>
          支持图片（JPG/PNG）和 PDF。多页 PDF 会在服务端按页渲染后再抽取指标，最多分析前{' '}
          {REPORT_PDF_MAX_PAGES} 页。
        </Subtitle>

        <Card className="gap-2">
          <Title className="text-base">已选择 {files.length} 个文件</Title>
          {files.map((file, index) => (
            <Subtitle key={`${file.uri}-${index}`}>
              {index + 1}. {file.name ?? file.uri}
            </Subtitle>
          ))}
          {files.length === 0 ? <Subtitle>尚未选择图片或 PDF</Subtitle> : null}
        </Card>

        {createReport.error ? <ErrorText message={createReport.error.message} /> : null}

        <View className="gap-2">
          <Button
            title="选择报告图片"
            variant="secondary"
            disabled={createReport.isPending}
            onPress={() => void pickImages()}
          />
          <Button
            title="选择 PDF"
            variant="secondary"
            disabled={createReport.isPending}
            onPress={() => void pickPdf()}
          />
          {files.length > 0 ? (
            <Button
              title="清空已选"
              variant="secondary"
              disabled={createReport.isPending}
              onPress={() => setFiles([])}
            />
          ) : null}
          <Button
            title="开始分析"
            loading={createReport.isPending}
            disabled={files.length === 0}
            onPress={submit}
          />
        </View>
      </ScrollView>
    </Screen>
  );
}

function assetToSourceFile(asset: Asset): ReportSourceFile | null {
  if (!asset.uri) return null;
  const sizeBytes = asset.fileSize ?? 0;
  if (sizeBytes > MEDIA_MAX_SIZE_BYTES) return null;
  return {
    uri: asset.uri,
    mime: asset.type ?? 'image/jpeg',
    sizeBytes: sizeBytes > 0 ? sizeBytes : 500_000,
    name: asset.fileName ?? undefined,
  };
}
