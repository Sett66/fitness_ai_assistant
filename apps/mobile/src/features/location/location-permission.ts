import { Alert, Linking, PermissionsAndroid, Platform, ToastAndroid } from 'react-native';

import { mmkv } from '../../storage/mmkv';

import { getLocationContext } from './getLocationContext';
import { locationLabels } from './location-labels';
import { shouldAttachLocation } from './shouldAttachLocation';

const CONSENT_KEY = 'coach.location.consentShown';
const OPT_IN_KEY = 'coachLocationOptIn';

function showConsentAlert(): Promise<boolean> {
  return new Promise((resolve) => {
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
      { cancelable: true, onDismiss: () => resolve(false) },
    );
  });
}

export async function checkLocationPermission(): Promise<boolean> {
  if (Platform.OS !== 'android') return false;

  try {
    return PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION);
  } catch {
    return false;
  }
}

/**
 * 展示用途说明（若尚未 opt-in）并请求系统定位权限。
 * Profile「开启位置权限」与 Coach 懒加载定位共用。
 */
export async function requestLocationPermission(): Promise<boolean> {
  if (Platform.OS === 'android') {
    const alreadyGranted = await checkLocationPermission();
    if (alreadyGranted) return true;
  }

  const consentShown = mmkv.getBoolean(CONSENT_KEY);
  const optedIn = mmkv.getBoolean(OPT_IN_KEY);

  if (!consentShown || !optedIn) {
    const approved = await showConsentAlert();
    mmkv.set(CONSENT_KEY, true);
    if (!approved) {
      return false;
    }
    mmkv.set(OPT_IN_KEY, true);
  }

  if (Platform.OS === 'android') {
    try {
      const granted = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
        {
          title: locationLabels.settingsTitle,
          message: locationLabels.consentMessage,
          buttonPositive: '同意',
          buttonNegative: '拒绝',
        },
      );
      return granted === PermissionsAndroid.RESULTS.GRANTED;
    } catch {
      return false;
    }
  }

  // iOS：Info.plist 已声明；首次 getCurrentPosition 时系统弹窗
  return true;
}

export function showLocationToast(message: string): void {
  if (Platform.OS === 'android') {
    ToastAndroid.show(message, ToastAndroid.SHORT);
  }
}

export async function resolveLocationContextForChat(content: string) {
  if (!shouldAttachLocation(content)) {
    return undefined;
  }

  const permitted = await requestLocationPermission();
  if (!permitted) {
    showLocationToast(locationLabels.permissionDeniedToast);
    return undefined;
  }

  const ctx = await getLocationContext();
  if (!ctx) {
    showLocationToast(locationLabels.locationFailedToast);
  }
  return ctx ?? undefined;
}

export function openLocationSystemSettings(): void {
  void Linking.openSettings();
}

export function isLocationOptedIn(): boolean {
  return mmkv.getBoolean(OPT_IN_KEY) ?? false;
}
