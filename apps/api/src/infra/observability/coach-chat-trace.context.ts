import { AsyncLocalStorage } from 'node:async_hooks';

import type { CoachChatTraceSession } from './coach-chat-trace.session';

export const traceSessionStorage = new AsyncLocalStorage<CoachChatTraceSession>();

export function getCoachChatTraceSession(): CoachChatTraceSession | undefined {
  return traceSessionStorage.getStore();
}
