import type { AgentMemoryFact, LocationContext, UserAiContext } from '@fitness/shared';

import { formatHealthContextBlock } from '../../memory/format-health-context-block';
import { formatMemoryBlock } from '../../memory/format-memory-block';
import { formatLocationContextBlock } from '../../memory/format-location-block';
import {
  COACH_AGENT_STREAM_SYSTEM_PROMPT,
  COACH_STREAM_SYSTEM_PROMPT,
  COACH_SYSTEM_PROMPT,
  COACH_TIME_AWARENESS_PROMPT,
} from '../../prompts/coach-system';
import { buildCoachContextBlock } from './context';
import { formatCurrentDatetimeBlock, resolveTimezoneOffsetMinutes } from './format-chat-time';

export type BuildCoachSystemPromptInput = {
  userContext: UserAiContext;
  memoryFacts?: AgentMemoryFact[];
  locationContext?: LocationContext;
  mode?: 'stream' | 'json' | 'agent';
  timezoneOffsetMinutes?: number;
  now?: Date;
};

function appendSharedContextBlocks(
  parts: string[],
  input: BuildCoachSystemPromptInput,
  options?: { includeLocation?: boolean },
): void {
  const now = input.now ?? new Date();
  const timezoneOffsetMinutes = resolveTimezoneOffsetMinutes(input.timezoneOffsetMinutes);
  const memoryBlock = formatMemoryBlock(input.memoryFacts ?? []);
  const healthBlock = formatHealthContextBlock(input.userContext.healthContext);
  const locationBlock = options?.includeLocation
    ? formatLocationContextBlock(input.locationContext)
    : '';
  const contextBlock = buildCoachContextBlock(input.userContext);

  parts.push('', formatCurrentDatetimeBlock(now, timezoneOffsetMinutes));
  parts.push('', COACH_TIME_AWARENESS_PROMPT);

  if (memoryBlock) {
    parts.push('', memoryBlock);
  }
  if (healthBlock) {
    parts.push('', healthBlock);
  }
  if (locationBlock) {
    parts.push('', locationBlock);
  }
  parts.push('', '【用户上下文】', contextBlock);
}

/** 共享 Coach system prompt 拼接（流式 / JSON / Agent Runner 复用） */
export function buildCoachSystemPrompt(input: BuildCoachSystemPromptInput): string {
  if (input.mode === 'agent') {
    const parts = [COACH_AGENT_STREAM_SYSTEM_PROMPT];
    appendSharedContextBlocks(parts, input, { includeLocation: true });
    return parts.join('\n');
  }

  const base = input.mode === 'json' ? COACH_SYSTEM_PROMPT : COACH_STREAM_SYSTEM_PROMPT;
  const parts = [base];
  appendSharedContextBlocks(parts, input);
  return parts.join('\n');
}
