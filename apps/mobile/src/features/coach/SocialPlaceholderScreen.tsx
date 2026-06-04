import { View } from 'react-native';

import { Card, MessageCircle, Subtitle, Title } from '@fitness/ui';

export function SocialPlaceholderScreen() {
  return (
    <View className="flex-1 bg-background px-6 justify-center">
      <Card className="items-center py-10 gap-4">
        <View className="h-16 w-16 items-center justify-center rounded-full bg-accent/20">
          <MessageCircle size={32} color="#C6FF00" strokeWidth={1.5} />
        </View>
        <Title className="text-center">社区即将推出</Title>
        <Subtitle className="text-center px-4">
          分享打卡、食谱与训练动态，寻找训练伙伴。M6 阶段开放。
        </Subtitle>
      </Card>
    </View>
  );
}
