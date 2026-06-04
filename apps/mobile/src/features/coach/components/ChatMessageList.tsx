import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef } from 'react';
import { FlatList, View, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import type { CoachAction, Message } from '@fitness/shared';

import { ChatBubble } from './ChatBubble';

export type ChatMessageListHandle = {
  scrollToEnd: () => void;
};

type ChatMessageListProps = {
  messages: Message[];
  onOpenPlan?: (planId: string) => void;
  onOpenMealVision?: (result: unknown, mealType: string) => void;
  onSuggestedAction?: (action: Exclude<CoachAction, 'CHAT' | 'MANUAL_MEAL_LOG'>) => void;
  streamScrollTick?: number;
  isStreaming?: boolean;
};

/** Inverted list: offset 0 = visual bottom (newest). */
const NEAR_BOTTOM_THRESHOLD = 120;
const PROGRAMMATIC_SCROLL_MS = 120;

export const ChatMessageList = forwardRef<ChatMessageListHandle, ChatMessageListProps>(
  function ChatMessageList(
    {
      messages,
      onOpenPlan,
      onOpenMealVision,
      onSuggestedAction,
      streamScrollTick = 0,
      isStreaming = false,
    },
    ref,
  ) {
    const flatListRef = useRef<FlatList<Message>>(null);
    const autoFollowRef = useRef(true);
    const userDraggingRef = useRef(false);
    const isProgrammaticScrollRef = useRef(false);
    const programmaticClearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const followRafRef = useRef<number | null>(null);
    const isStreamingRef = useRef(isStreaming);
    const wasStreamingRef = useRef(false);

    isStreamingRef.current = isStreaming;

    const displayMessages = useMemo(() => [...messages].reverse(), [messages]);

    const shouldFollow = useCallback(() => autoFollowRef.current && !userDraggingRef.current, []);

    const markProgrammaticScroll = useCallback(() => {
      isProgrammaticScrollRef.current = true;
      if (programmaticClearTimerRef.current) {
        clearTimeout(programmaticClearTimerRef.current);
      }
      programmaticClearTimerRef.current = setTimeout(() => {
        programmaticClearTimerRef.current = null;
        isProgrammaticScrollRef.current = false;
      }, PROGRAMMATIC_SCROLL_MS);
    }, []);

    const scrollToBottom = useCallback(
      (animated = false) => {
        if (displayMessages.length === 0) return;
        markProgrammaticScroll();
        flatListRef.current?.scrollToOffset({ offset: 0, animated });
        requestAnimationFrame(() => {
          flatListRef.current?.scrollToOffset({ offset: 0, animated: false });
        });
      },
      [displayMessages.length, markProgrammaticScroll],
    );

    /** Batch follow to one scroll per frame — does not throttle visible text. */
    const scheduleFollow = useCallback(() => {
      if (!shouldFollow()) return;
      if (followRafRef.current != null) return;
      followRafRef.current = requestAnimationFrame(() => {
        followRafRef.current = null;
        scrollToBottom(false);
      });
    }, [scrollToBottom, shouldFollow]);

    const followNow = useCallback(() => {
      if (!shouldFollow()) return;
      if (followRafRef.current != null) {
        cancelAnimationFrame(followRafRef.current);
        followRafRef.current = null;
      }
      scrollToBottom(false);
    }, [scrollToBottom, shouldFollow]);

    useImperativeHandle(ref, () => ({
      scrollToEnd: () => scrollToBottom(true),
    }));

    useEffect(() => {
      return () => {
        if (programmaticClearTimerRef.current) clearTimeout(programmaticClearTimerRef.current);
        if (followRafRef.current != null) cancelAnimationFrame(followRafRef.current);
      };
    }, []);

    useEffect(() => {
      if (isStreaming && !wasStreamingRef.current) {
        autoFollowRef.current = true;
        followNow();
      }
      if (!isStreaming && wasStreamingRef.current) {
        autoFollowRef.current = true;
        followNow();
        setTimeout(() => followNow(), 320);
      }
      wasStreamingRef.current = isStreaming;
    }, [isStreaming, followNow]);

    useEffect(() => {
      if (displayMessages.length === 0 || streamScrollTick === 0) return;
      scheduleFollow();
    }, [displayMessages.length, streamScrollTick, scheduleFollow]);

    const updateAutoFollow = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      if (isProgrammaticScrollRef.current) return;
      const { contentOffset } = event.nativeEvent;
      autoFollowRef.current = contentOffset.y <= NEAR_BOTTOM_THRESHOLD;
    };

    const handleContentSizeChange = () => {
      scheduleFollow();
    };

    const handleNewestAssistantLayout = useCallback(() => {
      scheduleFollow();
    }, [scheduleFollow]);

    return (
      <FlatList
        ref={flatListRef}
        inverted
        data={displayMessages}
        extraData={streamScrollTick}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ flexGrow: 1 }}
        contentContainerClassName="px-4 py-2"
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        scrollEventThrottle={16}
        onContentSizeChange={handleContentSizeChange}
        onScroll={updateAutoFollow}
        onScrollBeginDrag={() => {
          userDraggingRef.current = true;
          autoFollowRef.current = false;
        }}
        onScrollEndDrag={(event) => {
          userDraggingRef.current = false;
          updateAutoFollow(event);
        }}
        onMomentumScrollEnd={updateAutoFollow}
        renderItem={({ item, index }) => {
          const isNewestAssistant = index === 0 && item.role === 'ASSISTANT';
          return (
            <ChatBubble
              message={item}
              onOpenPlan={onOpenPlan}
              onOpenMealVision={onOpenMealVision}
              onSuggestedAction={onSuggestedAction}
              onLayout={isNewestAssistant ? handleNewestAssistantLayout : undefined}
              onLayoutStable={
                isNewestAssistant && !isStreaming ? handleNewestAssistantLayout : undefined
              }
            />
          );
        }}
        ListHeaderComponent={<View className="h-2" />}
        ListFooterComponent={<View className="h-1" />}
      />
    );
  },
);
