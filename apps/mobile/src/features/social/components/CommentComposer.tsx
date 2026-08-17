import { Pressable, Text, View } from 'react-native';
import { Button, Input, Subtitle } from '@fitness/ui';

type CommentComposerProps = {
  value: string;
  onChangeText: (text: string) => void;
  onSend: () => void;
  sending?: boolean;
  replyToName?: string | null;
  onCancelReply?: () => void;
  bottomInset?: number;
};

const MAX_BODY = 1000;

export function CommentComposer({
  value,
  onChangeText,
  onSend,
  sending,
  replyToName,
  onCancelReply,
  bottomInset = 8,
}: CommentComposerProps) {
  const canSend = value.trim().length > 0 && !sending;

  return (
    <View className="border-t border-border bg-background" style={{ paddingBottom: bottomInset }}>
      {replyToName ? (
        <View className="flex-row items-center justify-between px-4 pt-2">
          <Subtitle>回复 @{replyToName}</Subtitle>
          <Pressable hitSlop={8} onPress={onCancelReply} className="px-2 py-1">
            <Text className="text-base text-muted">×</Text>
          </Pressable>
        </View>
      ) : null}
      <View className="flex-row items-end gap-2 px-4 py-3">
        <Input
          value={value}
          onChangeText={(text) => onChangeText(text.slice(0, MAX_BODY))}
          placeholder={replyToName ? `回复 @${replyToName}` : '写评论…'}
          multiline
          editable={!sending}
          className="min-h-[44px] max-h-[120px] flex-1"
        />
        <Button
          title="发送"
          loading={sending}
          disabled={!canSend}
          onPress={onSend}
          className="px-4"
        />
      </View>
    </View>
  );
}
