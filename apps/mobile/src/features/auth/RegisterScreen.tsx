import { useState } from 'react';
import { View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { Button, ErrorText, Input, Label, Screen, Subtitle, Title } from '@fitness/ui';

import { useRegister } from '../../api/endpoints/auth';
import type { AuthStackParamList } from '../../app/navigation/RootNavigator';

type Props = NativeStackScreenProps<AuthStackParamList, 'Register'>;

export function RegisterScreen({ navigation }: Props) {
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const register = useRegister();

  return (
    <Screen>
      <Title>注册</Title>
      <Subtitle className="mt-1 mb-6">密码需 8 位以上，含字母与数字</Subtitle>

      <View className="gap-4">
        <View>
          <Label>手机号</Label>
          <Input value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
        </View>
        <View>
          <Label>密码</Label>
          <Input value={password} onChangeText={setPassword} secureTextEntry />
        </View>
        {register.error ? <ErrorText message={register.error.message} /> : null}
        <Button
          title="注册并登录"
          loading={register.isPending}
          onPress={() => register.mutate({ phone, password })}
        />
        <Button title="返回登录" variant="secondary" onPress={() => navigation.goBack()} />
      </View>
    </Screen>
  );
}
