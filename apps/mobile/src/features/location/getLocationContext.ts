import type { LocationContext } from '@fitness/shared';
import Geolocation from '@react-native-community/geolocation';

/**
 * 单次定位，失败返回 null。
 *
 * 采用两段式降级策略：先尝试高精度（GPS），若超时/失败则降级到
 * 低精度（基于网络/WiFi/基站，速度快很多）。这样可显著降低
 * 室内、信号弱或模拟器场景下的 TIMEOUT（code 3）失败率。
 *
 * 注意：@react-native-community/geolocation 在 Android 上依赖
 * play-services-location；模拟器需通过 Extended Controls 设坐标。
 */
export async function getLocationContext(): Promise<LocationContext | null> {
  try {
    const result = await requestGeolocation({
      enableHighAccuracy: true,
      timeout: 8000,
      maximumAge: 60_000,
    });
    return toLocationContext(result);
  } catch (highAccuracyErr) {
    if (__DEV__) {
      console.warn('[getLocationContext] 高精度定位失败，降级到低精度', highAccuracyErr);
    }
    try {
      const result = await requestGeolocation({
        enableHighAccuracy: false,
        timeout: 12_000,
        maximumAge: 300_000,
      });
      return toLocationContext(result);
    } catch (fallbackErr) {
      if (__DEV__) {
        console.warn('[getLocationContext] 获取位置失败', fallbackErr);
      }
      return null;
    }
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

interface GeolocationOptions {
  enableHighAccuracy: boolean;
  timeout: number;
  maximumAge: number;
}

function toLocationContext(result: GeolocationResult): LocationContext {
  return {
    lat: roundCoord(result.coords.latitude),
    lng: roundCoord(result.coords.longitude),
    accuracyM: result.coords.accuracy ?? undefined,
    capturedAt: new Date().toISOString(),
  };
}

function requestGeolocation(options: GeolocationOptions): Promise<GeolocationResult> {
  return new Promise((resolve, reject) => {
    Geolocation.getCurrentPosition(resolve, reject, options);
  });
}

/**
 * ADR 0008：日志与存储中坐标四舍五入至 2 位小数以保护隐私。
 */
function roundCoord(value: number): number {
  return Math.round(value * 100) / 100;
}
