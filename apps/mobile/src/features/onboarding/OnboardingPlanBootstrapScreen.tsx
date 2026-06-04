import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { Button, ErrorText, LoadingScreen, Screen, Subtitle, Title } from '@fitness/ui';

import { useGenerateMealPlan, useGenerateWorkoutPlan } from '../../api/endpoints/fitness';
import { useOnboardingStore } from '../../store/onboarding-store';
import type { OnboardingStackParamList } from './OnboardingNavigator';

type Props = NativeStackScreenProps<OnboardingStackParamList, 'OnboardingPlanBootstrap'>;

type BootstrapPhase = 'idle' | 'generating' | 'done' | 'error';

export function OnboardingPlanBootstrapScreen(_props: Props) {
  const setPlanBootstrapPending = useOnboardingStore((s) => s.setPlanBootstrapPending);
  const generateWorkout = useGenerateWorkoutPlan();
  const generateMeal = useGenerateMealPlan();

  const [phase, setPhase] = useState<BootstrapPhase>('idle');
  const [statusText, setStatusText] = useState('准备生成你的专属计划…');
  const [errors, setErrors] = useState<string[]>([]);
  const started = useRef(false);

  const finish = () => {
    setPlanBootstrapPending(false);
  };

  const runBootstrap = async () => {
    setPhase('generating');
    setErrors([]);
    const errs: string[] = [];

    setStatusText('正在生成训练计划…');
    try {
      await generateWorkout.mutateAsync({
        mesocycleWeeks: 4,
        preferences: { splitType: 'PPL', daysPerWeek: 4, includeCardio: false },
      });
    } catch (e) {
      errs.push(`训练计划：${e instanceof Error ? e.message : '生成失败'}`);
    }

    setStatusText('正在生成饮食计划…');
    try {
      await generateMeal.mutateAsync({ mesocycleWeeks: 4 });
    } catch (e) {
      errs.push(`饮食计划：${e instanceof Error ? e.message : '生成失败'}`);
    }

    if (errs.length === 2) {
      setErrors(errs);
      setPhase('error');
      setStatusText('计划生成失败，可稍后重试或跳过');
    } else if (errs.length === 1) {
      setErrors(errs);
      setPhase('done');
      setStatusText('部分计划已生成，可进入主页后手动补全');
    } else {
      setPhase('done');
      setStatusText('训练与饮食计划已就绪');
    }
  };

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void runBootstrap();
  }, []);

  if (phase === 'generating' || phase === 'idle') {
    return (
      <Screen className="items-center justify-center">
        <LoadingScreen />
        <Title className="mt-4 text-center">AI 正在定制计划</Title>
        <Subtitle className="mt-2 text-center px-6">{statusText}</Subtitle>
        <Subtitle className="mt-4 text-center px-6 text-xs opacity-60">
          通常需要 1–3 分钟，请保持网络连接
        </Subtitle>
      </Screen>
    );
  }

  return (
    <Screen>
      <View className="flex-1 justify-center gap-4 px-2">
        <Title className="text-center">{phase === 'done' ? '计划已生成' : '生成遇到问题'}</Title>
        <Subtitle className="text-center">{statusText}</Subtitle>

        {errors.map((msg) => (
          <ErrorText key={msg} message={msg} />
        ))}

        {phase === 'error' ? (
          <>
            <Button title="重试" onPress={() => void runBootstrap()} />
            <Button title="跳过，稍后生成" variant="ghost" onPress={finish} />
          </>
        ) : (
          <Button title="进入主页" onPress={finish} />
        )}
      </View>
    </Screen>
  );
}
