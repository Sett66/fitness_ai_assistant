import { useCallback, useEffect, useState } from 'react';
import { Alert, Linking, PermissionsAndroid, Platform } from 'react-native';

import { mmkv } from '../../storage/mmkv';
import { locationLabels } from './location-labels';

const CONSENT_KEY = 'coach.location.consentShown';
const OPT_IN_KEY = 'coachLocationOptIn';

export function useLocationConsent() {
  const [hasPermission, setHasPermission] = useState(false);

  useEffect(() => {
    checkPermission().then(setHasPermission);
  }, []);

  const requestPermission = useCallback(async (): Promise<boolean> => {
    const consentShown = mmkv.getBoolean(CONSENT_KEY);
    const optedIn = mmkv.getBoolean(OPT_IN_KEY);

    if (!consentShown) {
      const approved = await new Promise<boolean>((resolve) => {
        Alert.alert(
          locationLabels.consentTitle,
          locationLabels.consentMessage,
          [
            {
              text: locationLabels.consentCancel,
              style: 'cancel',
              onPress: () => resolve(false),
            },
            {
              text: locationLabels.consentConfirm,
              onPress: () => resolve(true),
            },
          ],
          { cancelable: true },
        );
      });

      mmkv.set(CONSENT_KEY, true);

      if (approved) {
        mmkv.set(OPT_IN_KEY, true);
      }

      if (!approved) {
        setHasPermission(false);
        return false;
      }
    }

    if (!optedIn && consentShown) {
      setHasPermission(false);
      return false;
    }

    if (Platform.OS === 'android') {
      try {
        const granted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
          {
            title: '位置权限',
            message: locationLabels.consentMessage,
            buttonPositive: '同意',
            buttonNegative: '拒绝',
          },
        );
        const ok = granted === PermissionsAndroid.RESULTS.GRANTED;
        setHasPermission(ok);
        return ok;
      } catch {
        setHasPermission(false);
        return false;
      }
    }

    // iOS 权限由 Info.plist 声明；首次调用 getCurrentPosition 时系统弹窗
    // 这里先乐观标记为 true，实际获取时再处理拒绝
    setHasPermission(true);
    return true;
  }, []);

  const openSystemSettings = useCallback(() => {
    void Linking.openSettings();
  }, []);

  return {
    hasPermission,
    requestPermission,
    openSystemSettings,
    isOptedIn: mmkv.getBoolean(OPT_IN_KEY) ?? false,
  } as const;
}

async function checkPermission(): Promise<boolean> {
  if (Platform.OS !== 'android') return false;

  try {
    const granted = await PermissionsAndroid.check(
      PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
    );
    return granted;
  } catch {
    return false;
  }
}
