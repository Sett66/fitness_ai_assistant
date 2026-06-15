import { Linking, PermissionsAndroid, Platform } from 'react-native';

export async function hasCameraPermission(): Promise<boolean> {
  if (Platform.OS !== 'android') {
    return true;
  }
  try {
    return PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.CAMERA);
  } catch {
    return false;
  }
}

/** Android Manifest 声明 CAMERA 后，须在 launchCamera 前主动请求 */
export async function ensureCameraPermission(): Promise<boolean> {
  if (Platform.OS !== 'android') {
    return true;
  }

  if (await hasCameraPermission()) {
    return true;
  }

  try {
    const granted = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.CAMERA, {
      title: '相机权限',
      message: '拍摄餐食照片需要使用相机',
      buttonPositive: '允许',
      buttonNegative: '拒绝',
    });
    return granted === PermissionsAndroid.RESULTS.GRANTED;
  } catch {
    return false;
  }
}

export function openAppSettings(): void {
  void Linking.openSettings();
}
