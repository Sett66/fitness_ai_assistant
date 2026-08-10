import { FlatList, Pressable, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { Button, Card, ErrorText, LoadingScreen, Screen, Subtitle, Title } from '@fitness/ui';

import { useReports } from '../../api/endpoints/reports';
import type { RootStackParamList } from '../../app/navigation/RootNavigator';
import { formatReportDate, reportStatusLabel } from './report-labels';

type Nav = NativeStackNavigationProp<RootStackParamList>;

export function ReportListScreen() {
  const navigation = useNavigation<Nav>();
  const reports = useReports();

  if (reports.isLoading) return <LoadingScreen />;

  return (
    <Screen>
      <View className="mb-4 gap-2">
        <Title>体检报告</Title>
        <Subtitle>上传图片后，AI 会抽取结构化指标并标记异常项。</Subtitle>
        <Button title="上传新报告" onPress={() => navigation.navigate('ReportUpload')} />
        {reports.error ? <ErrorText message={reports.error.message} /> : null}
      </View>

      <FlatList
        data={reports.data?.items ?? []}
        keyExtractor={(item) => item.id}
        contentContainerClassName="gap-3 pb-8"
        refreshing={reports.isRefetching}
        onRefresh={() => reports.refetch()}
        renderItem={({ item }) => (
          <Pressable onPress={() => navigation.navigate('ReportDetail', { reportId: item.id })}>
            <Card className="gap-2">
              <View className="flex-row items-center justify-between">
                <Title className="text-base">{formatReportDate(item.reportDate)}</Title>
                <Subtitle>{reportStatusLabel(item.status)}</Subtitle>
              </View>
              <Subtitle>
                异常项 {item.abnormalCount} 个 · 上传于 {formatReportDate(item.createdAt)}
              </Subtitle>
            </Card>
          </Pressable>
        )}
        ListEmptyComponent={<Subtitle>暂无体检报告，先上传一组报告图片。</Subtitle>}
      />
    </Screen>
  );
}
