import type { LocationContext } from '@fitness/shared';
import Geolocation from '@react-native-community/geolocation';

/**
 * 单次 GPS 获取，超时 10s，失败返回 null。
 *
 * 注意：@react-native-community/geolocation 在 Android 上依赖
 * play-services-location；模拟器需通过 Extended Controls 设坐标。
 */
export async function getLocationContext(): Promise<LocationContext | null> {
  try {
    const result = await withTimeout(requestGeolocation(), 10_000);
    return {
      lat: roundCoord(result.coords.latitude),
      lng: roundCoord(result.coords.longitude),
      accuracyM: result.coords.accuracy ?? undefined,
      capturedAt: new Date().toISOString(),
    };
  } catch (err) {
    if (__DEV__) {
      console.warn('[getLocationContext] 获取位置失败', err);
    }
    return null;
  }
}

interface GeolocationCoords {
  latitude: number;
  longitude: number;
  accuracy: number;
}

interface GeolocationResult {
  coords: GeolocationCoords;
}

function requestGeolocation(): Promise<GeolocationResult> {
  return new Promise((resolve, reject) => {
    Geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      timeout: 8000,
      maximumAge: 60_000,
    });
  });
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Geolocation timeout')), ms);
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}

/**
 * ADR 0008：日志与存储中坐标四舍五入至 2 位小数以保护隐私。
 */
function roundCoord(value: number): number {
  return Math.round(value * 100) / 100;
}
