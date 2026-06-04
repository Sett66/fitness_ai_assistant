import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { Alert, View } from 'react-native';

import { pick, types } from '@react-native-documents/picker';

import { launchCamera, launchImageLibrary } from 'react-native-image-picker';

import { useFocusEffect, useNavigation } from '@react-navigation/native';

import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import type { MealType } from '@fitness/shared';

import { ErrorText, LoadingScreen, Screen } from '@fitness/ui';

import { useQueryClient } from '@tanstack/react-query';

import {
  abortCoachChatStream,
  coachPollTimeoutForAction,
  uploadMealPhotoForCoach,
  uploadReportForCoach,
  useCoachConversation,
  useConversationsList,
  fetchConversationsList,
  useCreateConversation,
  useSendCoachChatStream,
  useSendCoachMessage,
} from '../../api/endpoints/coach';
import { queryKeys } from '../../api/queryKeys';
import { useCoachSessionStore } from './coach-session-store';

import { useCoachStreamStore } from './coach-stream-store';

import { mergeStreamMessages } from './merge-stream-messages';

import type { RootStackParamList } from '../../app/navigation/RootNavigator';

import { useKeyboardHeight } from '../../hooks/useKeyboardHeight';

import { GenerateMealPlanSheet } from '../plan/components/GenerateMealPlanSheet';

import { GeneratePlanSheet } from '../plan/components/GeneratePlanSheet';

import type { GenerateMealPlanInput, GenerateWorkoutPlanInput } from '../plan/plan-types';

import {
  ManualMealSheet,
  type ManualMealSubmitInput,
} from '../nutrition/components/ManualMealSheet';

import { ChatComposer, CoachQuickActions } from './components/ChatComposer';

import { ChatMessageList, type ChatMessageListHandle } from './components/ChatMessageList';

import { CoachHeader } from './components/CoachHeader';

import { ConversationDrawer } from './components/ConversationDrawer';

type Nav = NativeStackNavigationProp<RootStackParamList>;

export function CoachScreen() {
  const navigation = useNavigation<Nav>();
  const qc = useQueryClient();

  const activeConversationId = useCoachSessionStore((s) => s.activeConversationId);

  const setActiveConversationId = useCoachSessionStore((s) => s.setActiveConversationId);

  const { mutateAsync: createConversationAsync, isPending: isCreatingConversation } =
    useCreateConversation();

  const [drawerVisible, setDrawerVisible] = useState(false);

  const conversationsList = useConversationsList(true);

  const openDrawer = useCallback(() => {
    setDrawerVisible(true);
    void qc.invalidateQueries({ queryKey: queryKeys.coachConversations });
  }, [qc]);

  const conversation = useCoachConversation(activeConversationId);

  const sendMessage = useSendCoachMessage();

  const sendChatStream = useSendCoachChatStream();

  const streamState = useCoachStreamStore();

  const keyboardHeight = useKeyboardHeight();

  const [text, setText] = useState('');

  const [mealType] = useState<MealType>('LUNCH');

  const [workoutSheetVisible, setWorkoutSheetVisible] = useState(false);

  const [mealSheetVisible, setMealSheetVisible] = useState(false);

  const [manualVisible, setManualVisible] = useState(false);

  const [footerHeight, setFooterHeight] = useState(0);

  const [bootstrapping, setBootstrapping] = useState(true);

  const listRef = useRef<ChatMessageListHandle | null>(null);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;

      const bootstrap = async () => {
        if (activeConversationId) {
          setBootstrapping(false);
          return;
        }

        setBootstrapping(true);
        try {
          const list = await fetchConversationsList();
          if (cancelled) return;

          const recent =
            list.items.find((item) => item.isDefault) ??
            list.items.find((item) => item.preview) ??
            list.items[0];

          if (recent) {
            setActiveConversationId(recent.id);
          } else {
            const created = await createConversationAsync({});
            if (!cancelled) {
              setActiveConversationId(created.id);
            }
          }
        } finally {
          if (!cancelled) {
            setBootstrapping(false);
          }
        }
      };

      void bootstrap();

      return () => {
        cancelled = true;
      };
    }, [activeConversationId, createConversationAsync, setActiveConversationId]),
  );

  const conversationId = activeConversationId ?? undefined;

  const messages = useMemo(
    () => mergeStreamMessages(conversation.data?.messages ?? [], streamState),

    [conversation.data?.messages, streamState],
  );

  const drawerItems = conversationsList.data?.items ?? [];

  const keyboardOpen = keyboardHeight > 0;

  const isStreaming = sendChatStream.isPending || streamState.isStreaming;

  const isBusy = sendMessage.isPending || isStreaming;

  const bottomInset = footerHeight + keyboardHeight;

  useEffect(() => {
    if (keyboardHeight > 0) {
      requestAnimationFrame(() => listRef.current?.scrollToEnd());
    }
  }, [keyboardHeight]);

  useEffect(() => {
    if (isStreaming) return;
    listRef.current?.scrollToEnd();
  }, [messages.length, footerHeight, activeConversationId, isStreaming]);

  const switchConversation = useCallback(
    (id: string) => {
      abortCoachChatStream();
      useCoachStreamStore.getState().reset();
      setText('');
      setActiveConversationId(id);
      setDrawerVisible(false);
      void qc.invalidateQueries({ queryKey: queryKeys.coachConversation(id) });
    },
    [setActiveConversationId, qc],
  );

  const handleSendChat = () => {
    const content = text.trim();

    if (!content || !conversationId || isBusy) return;

    setText('');

    sendChatStream.mutate({ conversationId, content });
  };

  const handleStopStream = () => {
    abortCoachChatStream();
  };

  const handleGenerateWorkout = (input: GenerateWorkoutPlanInput) => {
    if (!conversationId) return;

    sendMessage.mutate(
      {
        conversationId,

        body: {
          action: 'GENERATE_WORKOUT',

          content: input.notes,

          actionParams: {
            mesocycleWeeks: input.mesocycleWeeks,

            notes: input.notes,

            preferences: input.preferences,
          },
        },

        pollTimeoutMs: coachPollTimeoutForAction('GENERATE_WORKOUT'),
      },

      { onSuccess: () => setWorkoutSheetVisible(false) },
    );
  };

  const handleGenerateMeal = (input: GenerateMealPlanInput) => {
    if (!conversationId) return;

    sendMessage.mutate(
      {
        conversationId,

        body: {
          action: 'GENERATE_MEAL',

          content: input.notes,

          actionParams: {
            mesocycleWeeks: input.mesocycleWeeks,

            notes: input.notes,
          },
        },

        pollTimeoutMs: coachPollTimeoutForAction('GENERATE_MEAL'),
      },

      { onSuccess: () => setMealSheetVisible(false) },
    );
  };

  const pickAndAnalyze = async (fromCamera: boolean) => {
    if (!conversationId || isBusy) return;

    const result = fromCamera
      ? await launchCamera({ mediaType: 'photo', quality: 0.8 })
      : await launchImageLibrary({ mediaType: 'photo', quality: 0.8 });

    const asset = result.assets?.[0];

    if (!asset?.uri) return;

    try {
      const objectKey = await uploadMealPhotoForCoach(
        asset.uri,

        asset.type ?? 'image/jpeg',

        asset.fileSize ?? 500_000,
      );

      sendMessage.mutate({
        conversationId,

        body: {
          action: 'MEAL_VISION',

          contentType: 'IMAGE',

          content: fromCamera ? '[餐照·拍照]' : '[餐照·相册]',

          imageObjectKey: objectKey,

          mealType,

          actionParams: { saveMealLog: false },
        },

        pollTimeoutMs: coachPollTimeoutForAction('MEAL_VISION'),
      });
    } catch (err) {
      console.warn(err);
    }
  };

  const pickAndUploadReport = async () => {
    if (!conversationId || isBusy) return;

    try {
      const [file] = await pick({
        type: [types.pdf, types.images],
      });

      if (!file?.uri) return;

      await uploadReportForCoach(
        file.uri,

        file.type ?? 'application/pdf',

        file.size ?? 500_000,
      );

      Alert.alert('已上传', '体检报告识别即将上线，敬请期待。');
    } catch (err) {
      const code = (err as { code?: string })?.code;

      if (code === 'DOCUMENT_PICKER_CANCELED' || code === 'OPERATION_CANCELED') {
        return;
      }

      console.warn(err);

      Alert.alert('上传失败', '请稍后重试或更换文件。');
    }
  };

  const handleManualSubmit = (input: ManualMealSubmitInput) => {
    if (!conversationId) return;

    sendMessage.mutate(
      {
        conversationId,

        body: {
          action: 'MANUAL_MEAL_LOG',

          content: input.dishName,

          actionParams: {
            manualMeal: {
              takenAt: new Date(),

              mealType: input.mealType,

              source: 'MANUAL',

              totalKcal: input.kcal,

              macros: input.macros,

              items: [
                {
                  dishName: input.dishName,

                  grams: input.grams,

                  kcal: input.kcal,

                  macros: input.macros,

                  sourceTag: 'USER',

                  foodId: input.foodId ?? null,
                },
              ],
            },
          },
        },
      },

      { onSuccess: () => setManualVisible(false) },
    );
  };

  const openPlan = (planId: string) => {
    navigation.navigate('PlanDetail', { planId });
  };

  const openMealVision = (result: unknown, mt: string) => {
    navigation.navigate('MealVisionResult', {
      result,

      mealType: mt as MealType,
    });
  };

  const handleSuggestedAction = (action: 'GENERATE_WORKOUT' | 'GENERATE_MEAL' | 'MEAL_VISION') => {
    if (isBusy) return;

    if (action === 'GENERATE_WORKOUT') {
      setWorkoutSheetVisible(true);

      return;
    }

    if (action === 'GENERATE_MEAL') {
      setMealSheetVisible(true);

      return;
    }

    void pickAndAnalyze(true);
  };

  const handleCreateNewConversation = () => {
    if (isCreatingConversation) return;

    abortCoachChatStream();

    useCoachStreamStore.getState().reset();

    setText('');

    void createConversationAsync({}).then((created) => {
      setActiveConversationId(created.id);
      setDrawerVisible(false);
    });
  };

  const showInitialLoading = !activeConversationId && (bootstrapping || isCreatingConversation);

  if (showInitialLoading) return <LoadingScreen />;

  return (
    <View className="flex-1">
      <Screen className="px-0" safeTop>
        <View className="flex-1">
          <View className="flex-1" style={{ paddingBottom: bottomInset }}>
            <CoachHeader
              conversationTitle={conversation.data?.title}
              keyboardOpen={keyboardOpen}
              onOpenDrawer={openDrawer}
            />

            <View className="px-4 pb-2">
              {sendMessage.error ? <ErrorText message={sendMessage.error.message} /> : null}

              {sendChatStream.error ? <ErrorText message={sendChatStream.error.message} /> : null}

              {streamState.error ? <ErrorText message={streamState.error} /> : null}
            </View>

            <View className="flex-1">
              {conversation.isLoading && !conversation.data ? (
                <LoadingScreen />
              ) : (
                <ChatMessageList
                  ref={listRef}
                  messages={messages}
                  isStreaming={isStreaming}
                  streamScrollTick={streamState.streamRevision}
                  onOpenPlan={openPlan}
                  onOpenMealVision={openMealVision}
                  onSuggestedAction={handleSuggestedAction}
                />
              )}
            </View>
          </View>

          <View
            className="absolute left-0 right-0 bg-background"
            style={{ bottom: keyboardHeight }}
            onLayout={(event) => setFooterHeight(event.nativeEvent.layout.height)}
          >
            <View
              style={{ maxHeight: keyboardOpen ? 0 : 120, overflow: 'hidden' }}
              pointerEvents={keyboardOpen ? 'none' : 'auto'}
              collapsable={false}
            >
              <CoachQuickActions
                disabled={isBusy}
                onGenerateWorkout={() => setWorkoutSheetVisible(true)}
                onGenerateMeal={() => setMealSheetVisible(true)}
                onMealPhoto={() => void pickAndAnalyze(true)}
                onManualMeal={() => setManualVisible(true)}
              />
            </View>

            <ChatComposer
              value={text}
              onChangeText={setText}
              onSend={handleSendChat}
              onStop={handleStopStream}
              sending={sendMessage.isPending}
              streaming={isStreaming}
              attachmentsDisabled={isBusy}
              onPickGallery={() => void pickAndAnalyze(false)}
              onPickCamera={() => void pickAndAnalyze(true)}
              onPickFile={() => void pickAndUploadReport()}
            />
          </View>
        </View>

        <GeneratePlanSheet
          visible={workoutSheetVisible}
          loading={sendMessage.isPending}
          error={sendMessage.error?.message ?? null}
          onClose={() => setWorkoutSheetVisible(false)}
          onSubmit={handleGenerateWorkout}
        />

        <GenerateMealPlanSheet
          visible={mealSheetVisible}
          loading={sendMessage.isPending}
          error={sendMessage.error?.message ?? null}
          onClose={() => setMealSheetVisible(false)}
          onSubmit={handleGenerateMeal}
        />

        <ManualMealSheet
          visible={manualVisible}
          defaultMealType={mealType}
          saving={sendMessage.isPending}
          error={sendMessage.error?.message ?? null}
          onClose={() => setManualVisible(false)}
          onSubmit={handleManualSubmit}
        />
      </Screen>

      <ConversationDrawer
        visible={drawerVisible}
        items={drawerItems}
        activeConversationId={activeConversationId}
        loading={conversationsList.isLoading}
        creating={isCreatingConversation}
        onClose={() => setDrawerVisible(false)}
        onSelect={switchConversation}
        onCreateNew={handleCreateNewConversation}
      />
    </View>
  );
}
