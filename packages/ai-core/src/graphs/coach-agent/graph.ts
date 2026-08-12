import { Annotation, END, START, StateGraph } from '@langchain/langgraph';
import { CoachToolNameSchema } from '@fitness/shared';
import type { CoachToolName, CoachToolTraceItem } from '@fitness/shared';
import { LLM_MODELS } from '@fitness/shared';

import { mergeLlmUsage } from '../../chains/meal-vision/advice';
import { createDeepSeekClient } from '../../llm/deepseek';
import type { CoachChatLlmClient } from '../../llm/tracing-client';
import type { AgentChatMessage } from '../../llm/tool-types';
import type { LlmUsage } from '../../llm/types';
import {
  MAX_TOOL_ITERATIONS,
  type CoachAgentGraphState,
  type CoachAgentStreamEvent,
  createInitialCoachAgentState,
  emptyCoachAgentUsage,
} from './state';
import { COACH_AGENT_TOOL_DEFINITIONS, COACH_TOOL_LABELS } from './tools-schema';

export type InvokeToolResult = {
  observation: string;
  summary?: string;
};

export type InvokeToolFn = (name: CoachToolName, input: unknown) => Promise<InvokeToolResult>;

export type CreateCoachAgentGraphOptions = {
  invokeTool: InvokeToolFn;
  model?: string;
  client?: CoachChatLlmClient;
};

const CoachAgentStateAnnotation = Annotation.Root({
  messages: Annotation<AgentChatMessage[]>({
    reducer: (left, right) => left.concat(right),
    default: () => [],
  }),
  toolTrace: Annotation<CoachToolTraceItem[]>({
    reducer: (left, right) => left.concat(right),
    default: () => [],
  }),
  iteration: Annotation<number>({
    reducer: (_, right) => right,
    default: () => 0,
  }),
  finished: Annotation<boolean>({
    reducer: (_, right) => right,
    default: () => false,
  }),
  usage: Annotation<LlmUsage>({
    reducer: (left, right) => mergeLlmUsage(left, right),
    default: () => emptyCoachAgentUsage(),
  }),
  pendingEvents: Annotation<CoachAgentStreamEvent[]>({
    reducer: (left, right) => left.concat(right),
    default: () => [],
  }),
});

const parseToolName = (raw: string): CoachToolName => {
  const parsed = CoachToolNameSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(`未知工具：${raw}`);
  }
  return parsed.data;
};

const summarizeToolInput = (input: unknown): string | undefined => {
  if (!input || typeof input !== 'object') {
    return undefined;
  }
  const record = input as Record<string, unknown>;
  if (typeof record.timezoneOffsetMinutes === 'number') {
    return `tz=${record.timezoneOffsetMinutes}`;
  }
  if (typeof record.days === 'number') {
    return `days=${record.days}`;
  }
  if (typeof record.query === 'string') {
    return `query=${record.query.slice(0, 32)}`;
  }
  if (typeof record.city === 'string') {
    return `city=${record.city.slice(0, 32)}`;
  }
  const lat = record.lat;
  const lng = record.lng;
  if (typeof lat === 'number' && typeof lng === 'number') {
    const round = (n: number) => Math.round(n * 100) / 100;
    return `coords=${round(lat)},${round(lng)}`;
  }
  return undefined;
};

export function createCoachAgentGraph(options: CreateCoachAgentGraphOptions) {
  const client = options.client ?? createDeepSeekClient();
  const model = options.model ?? LLM_MODELS.DEEPSEEK_V4_PRO;

  const agentNode = async (state: CoachAgentGraphState): Promise<Partial<CoachAgentGraphState>> => {
    const response = await client.chatWithTools({
      model,
      messages: state.messages,
      tools: COACH_AGENT_TOOL_DEFINITIONS,
      temperature: 0.3,
      tracingGenerationName: `coach-agent-react-${state.iteration}`,
    });

    const assistantMessage = response.message;
    const hasToolCalls = (assistantMessage.tool_calls?.length ?? 0) > 0;
    const finished = !hasToolCalls || state.iteration >= MAX_TOOL_ITERATIONS;

    return {
      messages: [assistantMessage],
      usage: response.usage,
      finished,
    };
  };

  const toolsNode = async (state: CoachAgentGraphState): Promise<Partial<CoachAgentGraphState>> => {
    const lastMessage = state.messages[state.messages.length - 1];
    if (lastMessage?.role !== 'assistant' || !lastMessage.tool_calls?.length) {
      return { finished: true };
    }

    const toolMessages: AgentChatMessage[] = [];
    const toolTraceItems: CoachToolTraceItem[] = [];
    const pendingEvents: CoachAgentStreamEvent[] = [];

    for (const toolCall of lastMessage.tool_calls) {
      const name = parseToolName(toolCall.function.name);
      const label = COACH_TOOL_LABELS[name];
      pendingEvents.push({ type: 'tool_start', name, label });

      const startedAt = Date.now();
      let parsedInput: unknown = {};
      try {
        parsedInput = toolCall.function.arguments
          ? (JSON.parse(toolCall.function.arguments) as unknown)
          : {};
      } catch {
        parsedInput = {};
      }

      try {
        const result = await options.invokeTool(name, parsedInput);
        const durationMs = Date.now() - startedAt;
        toolTraceItems.push({
          name,
          inputSummary: summarizeToolInput(parsedInput),
          outputSummary: result.summary?.slice(0, 512),
          durationMs,
          ok: true,
        });
        pendingEvents.push({
          type: 'tool_end',
          name,
          ok: true,
          summary: result.summary,
        });
        toolMessages.push({
          role: 'tool',
          content: result.observation,
          tool_call_id: toolCall.id,
        });
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        const durationMs = Date.now() - startedAt;
        const observation = `工具执行失败：${message}`;
        toolTraceItems.push({
          name,
          inputSummary: summarizeToolInput(parsedInput),
          outputSummary: message.slice(0, 512),
          durationMs,
          ok: false,
        });
        pendingEvents.push({
          type: 'tool_end',
          name,
          ok: false,
          summary: message.slice(0, 512),
        });
        toolMessages.push({
          role: 'tool',
          content: observation,
          tool_call_id: toolCall.id,
        });
      }
    }

    const nextIteration = state.iteration + 1;
    const updates: Partial<CoachAgentGraphState> = {
      messages: toolMessages,
      toolTrace: toolTraceItems,
      iteration: nextIteration,
      pendingEvents,
    };

    if (nextIteration >= MAX_TOOL_ITERATIONS) {
      updates.messages = [
        ...toolMessages,
        {
          role: 'user',
          content: '工具调用次数已达上限，请基于已有信息直接回答用户，不要再调用工具。',
        },
      ];
      updates.finished = true;
    }

    return updates;
  };

  const routeAfterAgent = (state: CoachAgentGraphState): 'tools' | typeof END => {
    if (state.finished) {
      return END;
    }
    const lastMessage = state.messages[state.messages.length - 1];
    if (lastMessage?.role === 'assistant' && lastMessage.tool_calls?.length) {
      return 'tools';
    }
    return END;
  };

  const routeAfterTools = (state: CoachAgentGraphState): 'agent' | typeof END =>
    state.finished ? END : 'agent';

  const graph = new StateGraph(CoachAgentStateAnnotation)
    .addNode('agent', agentNode)
    .addNode('tools', toolsNode)
    .addEdge(START, 'agent')
    .addConditionalEdges('agent', routeAfterAgent)
    .addConditionalEdges('tools', routeAfterTools);

  const compiled = graph.compile();

  return {
    compiled,
    runToolLoop: async (initialMessages: AgentChatMessage[]): Promise<CoachAgentGraphState> => {
      const initialState = createInitialCoachAgentState(initialMessages);
      return compiled.invoke(initialState) as Promise<CoachAgentGraphState>;
    },
  };
}

export type CoachAgentGraphRunner = ReturnType<typeof createCoachAgentGraph>;

/** 流式适配：逐步 yield tool 事件，返回 ReAct 结束后的 state */
export async function* runCoachAgentToolLoopStream(
  initialMessages: AgentChatMessage[],
  options: CreateCoachAgentGraphOptions,
): AsyncGenerator<CoachAgentStreamEvent, CoachAgentGraphState> {
  const { compiled } = createCoachAgentGraph(options);
  const initialState = createInitialCoachAgentState(initialMessages);
  let lastPendingCount = 0;
  let finalState = initialState;

  for await (const update of await compiled.stream(initialState, { streamMode: 'values' })) {
    finalState = update as CoachAgentGraphState;
    const pending = finalState.pendingEvents ?? [];
    for (let index = lastPendingCount; index < pending.length; index += 1) {
      yield pending[index]!;
    }
    lastPendingCount = pending.length;
  }

  return finalState;
}
