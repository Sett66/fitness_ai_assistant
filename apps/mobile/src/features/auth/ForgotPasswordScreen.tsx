import { useState } from 'react';
import { Alert, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { Button, ErrorText, Input, Label, Screen, Subtitle, Title } from '@fitness/ui';

import { useResetPassword } from '../../api/endpoints/auth';
import type { AuthStackParamList } from '../../app/navigation/RootNavigator';
import { SmsCodeField } from './components/SmsCodeField';

type Props = NativeStackScreenProps<AuthStackParamList, 'ForgotPassword'>;

export function ForgotPasswordScreen({ navigation }: Props) {
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [smsCode, setSmsCode] = useState('');
  const reset = useResetPassword();

  const onSubmit = () => {
    reset.mutate(
      { phone, password, smsCode },
      {
        onSuccess: () => {
          Alert.alert('重置成功', '请使用新密码登录', [
            { text: '去登录', onPress: () => navigation.navigate('Login') },
          ]);
        },
      },
    );
  };

  return (
    <Screen>
      <Title>找回密码</Title>
      <Subtitle className="mt-1 mb-6">
        通过手机验证码重置密码，新密码需 8 位以上含字母与数字
      </Subtitle>

      <View className="gap-4">
        <View>
          <Label>手机号</Label>
          <Input
            value={phone}
            onChangeText={setPhone}
            keyboardType="phone-pad"
            placeholder="请输入注册手机号"
          />
        </View>
        <SmsCodeField
          phone={phone}
          scene="RESET_PASSWORD"
          code={smsCode}
          onChangeCode={setSmsCode}
        />
        <View>
          <Label>新密码</Label>
          <Input
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            placeholder="请输入新密码"
          />
        </View>
        {reset.error ? <ErrorText message={reset.error.message} /> : null}
        <Button title="重置密码" loading={reset.isPending} onPress={onSubmit} />
        <Button title="返回登录" variant="secondary" onPress={() => navigation.goBack()} />
      </View>
    </Screen>
  );
}
