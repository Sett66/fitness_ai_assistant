import { useState } from 'react';
import { View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { Button, ErrorText, Input, Label, Screen, Subtitle, Title } from '@fitness/ui';

import { useRegister } from '../../api/endpoints/auth';
import type { AuthStackParamList } from '../../app/navigation/RootNavigator';
import { SmsCodeField } from './components/SmsCodeField';

type Props = NativeStackScreenProps<AuthStackParamList, 'Register'>;

export function RegisterScreen({ navigation }: Props) {
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [smsCode, setSmsCode] = useState('');
  const register = useRegister();

  return (
    <Screen>
      <Title>注册</Title>
      <Subtitle className="mt-1 mb-6">密码需 8 位以上，含字母与数字</Subtitle>

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
        <SmsCodeField phone={phone} scene="REGISTER" code={smsCode} onChangeCode={setSmsCode} />
        {register.error ? <ErrorText message={register.error.message} /> : null}
        <Button
          title="注册并登录"
          loading={register.isPending}
          onPress={() => register.mutate({ phone, password, smsCode })}
        />
        <Button title="返回登录" variant="secondary" onPress={() => navigation.goBack()} />
      </View>
    </Screen>
  );
}
