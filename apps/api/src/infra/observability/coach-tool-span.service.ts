import { Injectable } from '@nestjs/common';
import type { CoachToolName } from '@fitness/shared';

import { getCoachChatTraceSession } from './coach-chat-trace.context';

export type CoachToolSpanInput = {
  name: CoachToolName;
  input: unknown;
  output?: unknown;
  ok: boolean;
  durationMs: number;
};

@Injectable()
export class CoachToolSpanService {
  recordToolExecution(params: CoachToolSpanInput): void {
    const session = getCoachChatTraceSession();
    if (!session) {
      return;
    }

    session.recordToolSpan(params);
  }
}
