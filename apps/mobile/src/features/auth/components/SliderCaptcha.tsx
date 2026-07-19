import { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Modal, PanResponder, Pressable, Text, View } from 'react-native';

import { Subtitle, Title, useTheme } from '@fitness/ui';
import type { CaptchaChallengeResponse } from '@fitness/shared';

import { fetchCaptchaChallenge, verifyCaptcha } from '../../../api/endpoints/auth';

type SliderCaptchaProps = {
  visible: boolean;
  onSuccess: (captchaToken: string) => void;
  onClose: () => void;
};

type Phase = 'loading' | 'ready' | 'verifying' | 'success' | 'error';

/** bgIndex -> 画板双色背景，纯 View 绘制无需图片资源 */
const DEFAULT_PALETTE: [string, string] = ['#1e3a8a', '#0ea5e9'];
const BG_PALETTES: Array<[string, string]> = [
  DEFAULT_PALETTE,
  ['#7c2d12', '#f59e0b'],
  ['#14532d', '#22c55e'],
  ['#4c1d95', '#a855f7'],
];

export function SliderCaptcha({ visible, onSuccess, onClose }: SliderCaptchaProps) {
  const { colors } = useTheme();
  const [challenge, setChallenge] = useState<CaptchaChallengeResponse | null>(null);
  const [phase, setPhase] = useState<Phase>('loading');
  const [error, setError] = useState<string | null>(null);

  const handleX = useRef(new Animated.Value(0)).current;
  const currentXRef = useRef(0);
  const startXRef = useRef(0);
  const maxXRef = useRef(0);
  const submitRef = useRef<() => void>(() => {});

  useEffect(() => {
    const id = handleX.addListener(({ value }) => {
      currentXRef.current = value;
    });
    return () => handleX.removeListener(id);
  }, [handleX]);

  const load = useCallback(async () => {
    setPhase('loading');
    setError(null);
    handleX.setValue(0);
    currentXRef.current = 0;
    try {
      const c = await fetchCaptchaChallenge();
      maxXRef.current = c.boardWidth - c.pieceSize;
      setChallenge(c);
      setPhase('ready');
    } catch {
      setPhase('error');
      setError('验证加载失败，请重试');
    }
  }, [handleX]);

  useEffect(() => {
    if (visible) void load();
  }, [visible, load]);

  const resetPosition = useCallback(() => {
    Animated.timing(handleX, {
      toValue: 0,
      duration: 180,
      useNativeDriver: true,
    }).start(() => {
      currentXRef.current = 0;
    });
  }, [handleX]);

  const submit = useCallback(async () => {
    if (!challenge || phase !== 'ready') return;
    const x = Math.round(currentXRef.current);
    if (x < 3) {
      resetPosition();
      return;
    }
    setPhase('verifying');
    try {
      const { captchaToken } = await verifyCaptcha({ captchaId: challenge.captchaId, x });
      setPhase('success');
      setTimeout(() => onSuccess(captchaToken), 250);
    } catch (e) {
      setError(e instanceof Error ? e.message : '验证失败');
      resetPosition();
      // 换新挑战，避免重复利用同一缺口
      void load();
    }
  }, [challenge, phase, resetPosition, load, onSuccess]);

  useEffect(() => {
    submitRef.current = () => void submit();
  }, [submit]);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        startXRef.current = currentXRef.current;
      },
      onPanResponderMove: (_evt, g) => {
        const next = Math.max(0, Math.min(maxXRef.current, startXRef.current + g.dx));
        handleX.setValue(next);
      },
      onPanResponderRelease: () => submitRef.current(),
      onPanResponderTerminate: () => submitRef.current(),
    }),
  ).current;

  const board = challenge ?? {
    boardWidth: 300,
    boardHeight: 180,
    pieceSize: 50,
    gapX: 0,
    gapY: 0,
    bgIndex: 0,
    captchaId: '',
  };
  const palette = BG_PALETTES[board.bgIndex % BG_PALETTES.length] ?? DEFAULT_PALETTE;
  const dragEnabled = phase === 'ready';

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View className="flex-1 items-center justify-center bg-black/70 px-6">
        <View className="w-full rounded-2xl border border-border bg-card p-4">
          <View className="mb-3 flex-row items-center justify-between">
            <Title className="text-lg">安全验证</Title>
            <Pressable onPress={onClose} hitSlop={8}>
              <Text className="text-sm text-muted">关闭</Text>
            </Pressable>
          </View>
          <Subtitle className="mb-3">拖动下方滑块，将拼图块对齐到缺口位置</Subtitle>

          {/* 画板 */}
          <View
            className="self-center overflow-hidden rounded-xl"
            style={{ width: board.boardWidth, height: board.boardHeight }}
          >
            <View style={{ flex: 1, backgroundColor: palette[0] }}>
              <View
                style={{ flex: 1, backgroundColor: palette[1], marginTop: board.boardHeight / 2 }}
              />
            </View>

            {/* 缺口 */}
            <View
              style={{
                position: 'absolute',
                left: board.gapX,
                top: board.gapY,
                width: board.pieceSize,
                height: board.pieceSize,
                borderRadius: 8,
                backgroundColor: 'rgba(0,0,0,0.45)',
                borderWidth: 2,
                borderColor: 'rgba(255,255,255,0.7)',
              }}
            />

            {/* 拼图块 */}
            <Animated.View
              style={{
                position: 'absolute',
                left: 0,
                top: board.gapY,
                width: board.pieceSize,
                height: board.pieceSize,
                borderRadius: 8,
                backgroundColor: colors.accent,
                borderWidth: 2,
                borderColor: '#ffffff',
                alignItems: 'center',
                justifyContent: 'center',
                transform: [{ translateX: handleX }],
              }}
            >
              <Text style={{ color: colors.accentForeground, fontWeight: '700' }}>拼</Text>
            </Animated.View>

            {phase === 'success' ? (
              <View className="absolute inset-0 items-center justify-center bg-black/40">
                <Text style={{ color: colors.accent, fontSize: 16, fontWeight: '700' }}>
                  验证通过
                </Text>
              </View>
            ) : null}
          </View>

          {/* 滑块轨道 */}
          <View
            className="mt-4 self-center justify-center rounded-xl border border-border bg-background"
            style={{ width: board.boardWidth, height: 44 }}
          >
            <Text className="text-center text-xs text-muted">
              {phase === 'verifying' ? '校验中…' : '按住滑块拖动'}
            </Text>
            <Animated.View
              {...(dragEnabled ? panResponder.panHandlers : {})}
              style={{
                position: 'absolute',
                left: 0,
                width: board.pieceSize,
                height: 44,
                borderRadius: 10,
                backgroundColor: colors.accent,
                alignItems: 'center',
                justifyContent: 'center',
                transform: [{ translateX: handleX }],
              }}
            >
              <Text style={{ color: colors.accentForeground, fontWeight: '700' }}>{'≫'}</Text>
            </Animated.View>
          </View>

          {error ? (
            <Text className="mt-3 text-center text-sm text-destructive">{error}</Text>
          ) : null}

          <Pressable className="mt-3 self-center" onPress={() => void load()} hitSlop={8}>
            <Text className="text-sm text-accent">换一张</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}
