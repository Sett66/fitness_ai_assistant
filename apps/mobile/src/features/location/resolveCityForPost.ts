import { UserLocationNullableResponseSchema, UserLocationResponseSchema } from '@fitness/shared';

import { apiFetch } from '../../api/client';
import { getLocationContext } from './getLocationContext';
import { locationLabels } from './location-labels';
import { requestLocationPermission, showLocationToast } from './location-permission';

/**
 * 发帖「显示所在城市」：先 GPS + 逆地理，失败再回落到本人最近快照里的城市。
 * 只返回城市名；坐标不会进发帖请求。
 */
export async function resolveCityForPost(): Promise<string | null> {
  const permitted = await requestLocationPermission();
  if (!permitted) {
    showLocationToast(locationLabels.postCityPermissionDenied);
    return readLatestSnapshotCity();
  }

  const ctx = await getLocationContext();
  if (ctx) {
    try {
      const json = await apiFetch<unknown>('/users/me/location', {
        method: 'PUT',
        body: { lat: ctx.lat, lng: ctx.lng, source: 'GPS' },
      });
      const city = UserLocationResponseSchema.parse(json).city?.trim();
      if (city) return city;
    } catch {
      // 持久化失败不阻塞，尝试读已有快照
    }
  }

  const fallback = await readLatestSnapshotCity();
  if (!fallback) {
    showLocationToast(locationLabels.postCityFailed);
  }
  return fallback;
}

async function readLatestSnapshotCity(): Promise<string | null> {
  try {
    const json = await apiFetch<unknown>('/users/me/location');
    const city = UserLocationNullableResponseSchema.parse(json)?.city?.trim();
    return city && city.length > 0 ? city : null;
  } catch {
    return null;
  }
}
