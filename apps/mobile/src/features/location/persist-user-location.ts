import type { LocationContext } from '@fitness/shared';

import { apiFetch } from '../../api/client';

/** Coach 获得 GPS 后可选持久化；失败静默，不阻塞 CHAT */
export async function persistUserLocationSnapshot(ctx: LocationContext): Promise<void> {
  try {
    await apiFetch('/users/me/location', {
      method: 'PUT',
      body: {
        lat: ctx.lat,
        lng: ctx.lng,
        ...(ctx.city ? { city: ctx.city } : {}),
        source: 'GPS',
      },
    });
  } catch {
    // AGENT-09：持久化失败不影响当轮对话
  }
}
