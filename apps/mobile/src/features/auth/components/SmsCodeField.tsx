import { useCallback, useEffect, useRef, useState } from 'react';
import { View } from 'react-native';

import { Button, Input, Label } from '@fitness/ui';
import type { SmsScene } from '@fitness/shared';

import { sendSmsCode } from '../../../api/endpoints/auth';
import { SliderCaptcha } from './SliderCaptcha';

type SmsCodeFieldProps = {
  phone: string;
  scene: SmsScene;
  code: string;
  onChangeCode: (code: string) => void;
};

const PHONE_RE = /^1[3-9]\d{9}$/;

export function SmsCodeField({ phone, scene, code, onChangeCode }: SmsCodeFieldProps) {
  const [captchaVisible, setCaptchaVisible] = useState(false);
  const [sending, setSending] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const startCooldown = useCallback((seconds: number) => {
    setCooldown(seconds);
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setCooldown((prev) => {
        if (prev <= 1) {
          if (timerRef.current) clearInterval(timerRef.current);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, []);

  const onPressSend = () => {
    setError(null);
    setMessage(null);
    if (!PHONE_RE.test(phone)) {
      setError('请输入有效的 11 位手机号');
      return;
    }
    setCaptchaVisible(true);
  };

  const onCaptchaSuccess = useCallback(
    async (captchaToken: string) => {
      setCaptchaVisible(false);
      setSending(true);
      setError(null);
      try {
        const res = await sendSmsCode({ phone, scene, captchaToken });
        startCooldown(res.cooldownSec);
        if (res.devCode) {
          onChangeCode(res.devCode);
          setMessage(`开发模式验证码：${res.devCode}`);
        } else {
          setMessage('验证码已发送');
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : '发送失败');
      } finally {
        setSending(false);
      }
    },
    [phone, scene, startCooldown, onChangeCode],
  );

  return (
    <View>
      <Label>短信验证码</Label>
      <View className="flex-row gap-2">
        <View className="flex-1">
          <Input
            value={code}
            onChangeText={onChangeCode}
            keyboardType="number-pad"
            maxLength={6}
            placeholder="请输入 6 位验证码"
          />
        </View>
        <Button
          title={cooldown > 0 ? `${cooldown}s` : '发送验证码'}
          variant="secondary"
          loading={sending}
          disabled={cooldown > 0 || sending}
          onPress={onPressSend}
          className="justify-center px-3"
        />
      </View>
      {message ? <Label className="mt-1 text-accent">{message}</Label> : null}
      {error ? <Label className="mt-1 text-destructive">{error}</Label> : null}

      <SliderCaptcha
        visible={captchaVisible}
        onSuccess={(token) => void onCaptchaSuccess(token)}
        onClose={() => setCaptchaVisible(false)}
      />
    </View>
  );
}
