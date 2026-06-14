import { useCallback, useEffect, useState } from 'react';

import {
  checkLocationPermission,
  isLocationOptedIn,
  openLocationSystemSettings,
  requestLocationPermission,
} from './location-permission';

export function useLocationConsent() {
  const [hasPermission, setHasPermission] = useState(false);

  useEffect(() => {
    checkLocationPermission().then(setHasPermission);
  }, []);

  const requestPermission = useCallback(async (): Promise<boolean> => {
    const ok = await requestLocationPermission();
    setHasPermission(ok);
    return ok;
  }, []);

  const openSystemSettings = useCallback(() => {
    openLocationSystemSettings();
  }, []);

  return {
    hasPermission,
    requestPermission,
    openSystemSettings,
    isOptedIn: isLocationOptedIn(),
  } as const;
}
