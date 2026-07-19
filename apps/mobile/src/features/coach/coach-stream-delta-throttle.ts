export const COACH_DELTA_THROTTLE_MS = 32;

export type CoachDeltaThrottle = {
  push: (text: string) => void;
  flush: () => void;
  dispose: () => void;
};
export type CreateCoachDeltaThrottleOptions = {
  intervalMs?: number;
};

/** SSE delta 正文节流：首包立即 flush，后续 trailing throttle。 */
export function createCoachDeltaThrottle(
  onFlush: (text: string) => void,
  options?: CreateCoachDeltaThrottleOptions,
): CoachDeltaThrottle {
  const intervalMs = options?.intervalMs ?? COACH_DELTA_THROTTLE_MS;
  let pending: string | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let hasFlushedOnce = false;
  const clearTimer = () => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  };
  const flushNow = () => {
    clearTimer();
    if (pending === null) {
      return;
    }
    const text = pending;
    pending = null;
    onFlush(text);
  };
  const push = (text: string) => {
    pending = text;
    if (!hasFlushedOnce) {
      hasFlushedOnce = true;
      flushNow();
      return;
    }
    if (timer !== null) {
      return;
    }
    timer = setTimeout(flushNow, intervalMs);
  };
  return {
    push,
    flush: flushNow,
    dispose: () => {
      clearTimer();
      pending = null;
    },
  };
}
