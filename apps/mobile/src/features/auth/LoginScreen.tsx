import { useState } from 'react';
import { Pressable, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { Button, ErrorText, Input, Label, Screen, Subtitle, Title } from '@fitness/ui';

import { useLogin } from '../../api/endpoints/auth';
import type { AuthStackParamList } from '../../app/navigation/RootNavigator';

type Props = NativeStackScreenProps<AuthStackParamList, 'Login'>;

export function LoginScreen({ navigation }: Props) {
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const login = useLogin();

  const handleForgotPassword = () => {
    navigation.navigate('ForgotPassword');
  };

  return (
    <Screen className="justify-center">
      <Title className="text-center text-3xl">健身 AI 助手</Title>
      <Subtitle className="mt-1 mb-8 text-center">登录后开始训练与饮食管理</Subtitle>

      <View className="gap-4">
        <View>
          <Label>手机号</Label>
          <Input
            value={phone}
            onChangeText={setPhone}
            keyboardType="phone-pad"
            placeholder="请输入手机号"
          />
        </View>
        <View>
          <Label>密码</Label>
          <Input
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            placeholder="请输入密码"
          />
        </View>
        <Pressable className="self-end" onPress={handleForgotPassword}>
          <Subtitle className="text-accent">忘记密码？找回</Subtitle>
        </Pressable>
        {login.error ? <ErrorText message={login.error.message} /> : null}
        <Button
          title="登录"
          loading={login.isPending}
          onPress={() => login.mutate({ phone, password })}
        />
        <Button
          title="注册账号"
          variant="secondary"
          onPress={() => navigation.navigate('Register')}
        />
      </View>
    </Screen>
  );
}
