import type { CoachToolTraceItem } from '@fitness/shared';

import type { AgentChatMessage } from '../../llm/tool-types';
import type { LlmUsage } from '../../llm/types';

export const MAX_TOOL_ITERATIONS = 5;

export type CoachAgentStreamEvent =
  | { type: 'tool_start'; name: CoachToolTraceItem['name']; label?: string }
  | { type: 'tool_end'; name: CoachToolTraceItem['name']; ok: boolean; summary?: string }
  | { type: 'delta'; text: string };

export type CoachAgentGraphState = {
  messages: AgentChatMessage[];
  toolTrace: CoachToolTraceItem[];
  iteration: number;
  finished: boolean;
  usage: LlmUsage;
  pendingEvents: CoachAgentStreamEvent[];
};

export const emptyCoachAgentUsage = (): LlmUsage => ({
  tokenIn: 0,
  tokenOut: 0,
  costCny: 0,
});

export const createInitialCoachAgentState = (
  messages: AgentChatMessage[],
): CoachAgentGraphState => ({
  messages,
  toolTrace: [],
  iteration: 0,
  finished: false,
  usage: emptyCoachAgentUsage(),
  pendingEvents: [],
});
