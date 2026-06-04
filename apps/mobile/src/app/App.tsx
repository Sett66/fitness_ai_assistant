import { StatusBar } from 'react-native';

import { Providers } from './providers';
import { AppGate } from './AppGate';
import { useAuthStore } from '../store/auth-store';

export default function App() {
  const accessToken = useAuthStore((s) => s.accessToken);

  return (
    <Providers>
      <StatusBar barStyle="light-content" backgroundColor="#000000" />
      <AppGate isAuthenticated={Boolean(accessToken)} />
    </Providers>
  );
}
