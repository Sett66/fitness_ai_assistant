import type { AgentMemoryFact, LocationContext, UserAiContext } from '@fitness/shared';

import { formatMemoryBlock } from '../../memory/format-memory-block';
import { formatLocationContextBlock } from '../../memory/format-location-block';
import {
  COACH_AGENT_STREAM_SYSTEM_PROMPT,
  COACH_STREAM_SYSTEM_PROMPT,
  COACH_SYSTEM_PROMPT,
} from '../../prompts/coach-system';
import { buildCoachContextBlock } from './context';

export type BuildCoachSystemPromptInput = {
  userContext: UserAiContext;
  memoryFacts?: AgentMemoryFact[];
  locationContext?: LocationContext;
  mode?: 'stream' | 'json' | 'agent';
};

/** 共享 Coach system prompt 拼接（流式 / JSON / Agent Runner 复用） */
export function buildCoachSystemPrompt(input: BuildCoachSystemPromptInput): string {
  if (input.mode === 'agent') {
    const parts = [COACH_AGENT_STREAM_SYSTEM_PROMPT];
    const memoryBlock = formatMemoryBlock(input.memoryFacts ?? []);
    const locationBlock = formatLocationContextBlock(input.locationContext);
    const contextBlock = buildCoachContextBlock(input.userContext);

    if (memoryBlock) {
      parts.push('', memoryBlock);
    }
    if (locationBlock) {
      parts.push('', locationBlock);
    }
    parts.push('', '【用户上下文】', contextBlock);
    return parts.join('\n');
  }

  const base = input.mode === 'json' ? COACH_SYSTEM_PROMPT : COACH_STREAM_SYSTEM_PROMPT;
  const memoryBlock = formatMemoryBlock(input.memoryFacts ?? []);
  const contextBlock = buildCoachContextBlock(input.userContext);

  const parts = [base];
  if (memoryBlock) {
    parts.push('', memoryBlock);
  }
  parts.push('', '【用户上下文】', contextBlock);
  return parts.join('\n');
}
