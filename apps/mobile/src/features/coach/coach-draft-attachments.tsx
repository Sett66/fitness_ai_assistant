import { Image, Pressable, ScrollView, Text, View } from 'react-native';

export type CoachDraftAttachment = {
  id: string;
  uri: string;
  mime: string;
  sizeBytes: number;
};

type CoachDraftAttachmentsProps = {
  attachments: CoachDraftAttachment[];
  onRemove: (id: string) => void;
};

export function CoachDraftAttachments({ attachments, onRemove }: CoachDraftAttachmentsProps) {
  if (attachments.length === 0) {
    return null;
  }

  return (
    <View className="px-4 pt-2 border-t border-border">
      <ScrollView horizontal showsHorizontalScrollIndicator={false} className="gap-2">
        {attachments.map((item) => (
          <View key={item.id} className="relative mr-2">
            <Image source={{ uri: item.uri }} className="h-16 w-16 rounded-lg bg-muted" />
            <Pressable
              accessibilityLabel="移除图片"
              onPress={() => onRemove(item.id)}
              className="absolute -top-1 -right-1 h-5 w-5 items-center justify-center rounded-full bg-foreground"
            >
              <Text className="text-xs text-background leading-none">×</Text>
            </Pressable>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

export const MAX_COACH_DRAFT_ATTACHMENTS = 5;
