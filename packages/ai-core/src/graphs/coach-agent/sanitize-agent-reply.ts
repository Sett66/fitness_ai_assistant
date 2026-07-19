import type { AgentChatMessage } from '../../llm/tool-types';

/** DeepSeek V4 等模型在流式正文里泄漏的内部工具标记 */
export function stripDsmlMarkup(text: string): string {
  const markerIndex = text.indexOf('<｜｜DSML');
  if (markerIndex >= 0) {
    return text.slice(0, markerIndex).trim();
  }
  return text.replace(/<\/?｜｜DSML｜｜[\s\S]*$/g, '').trim();
}

export function replyLooksLikeDsmlLeak(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  if (trimmed.includes('DSML')) return true;
  if (/<｜｜/.test(trimmed) && /tool_calls|invoke|parameter/.test(trimmed)) {
    return true;
  }
  return false;
}

type GymPoi = { name?: string; address?: string; distanceM?: number };

function formatDistance(distanceM?: number): string {
  if (distanceM === undefined || !Number.isFinite(distanceM)) return '';
  if (distanceM < 1000) return `${Math.round(distanceM)}m`;
  return `${(distanceM / 1000).toFixed(1)}km`;
}

function formatGymList(gyms: GymPoi[]): string {
  const lines = gyms.slice(0, 5).map((gym, index) => {
    const distance = formatDistance(gym.distanceM);
    const address = gym.address?.trim();
    const parts = [gym.name ?? '未命名场馆'];
    if (distance) parts.push(`约 ${distance}`);
    if (address) parts.push(address);
    return `${index + 1}. ${parts.join(' · ')}`;
  });
  return ['附近健身房（按距离排序）：', ...lines].join('\n');
}

/** 从 tool 消息 JSON 提取健身房列表，供 DSML 泄漏时的兜底回复 */
export function formatGymsFromToolMessages(messages: AgentChatMessage[]): string | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const toolMessage = messages[index];
    if (toolMessage?.role !== 'tool') continue;

    let parsed: unknown;
    try {
      parsed = JSON.parse(toolMessage.content);
    } catch {
      continue;
    }

    if (!parsed || typeof parsed !== 'object') continue;
    const record = parsed as { gyms?: GymPoi[]; message?: string };
    if (!Array.isArray(record.gyms) || record.gyms.length === 0) {
      if (typeof record.message === 'string' && record.message.trim()) {
        return record.message.trim();
      }
      continue;
    }

    return formatGymList(record.gyms);
  }
  return null;
}

/**
 * 将 ReAct 消息转为仅聊天格式，供最终流式回复使用。
 *
 * 关键点：
 * - 剥离 ReAct 内部的 assistant(tool_calls) 与 tool 消息，保留干净的
 *   [system, ...history, user(最新提问)]，确保「用户最新提问」始终在末尾，
 *   不会被伪造指令挤到中间导致模型答非所问或复读旧话题。
 * - 只有在**本轮真的调用过工具**时，才把工具返回数据以 `system` 指令注入
 *   （而非伪装成 user 消息），使模型能区分「系统提供的工具数据」与「用户输入」。
 * - 本轮未调用任何工具时，不注入任何额外指令，按普通聊天直接回答最新问题。
 */
export function buildMessagesForFinalStream(messages: AgentChatMessage[]): AgentChatMessage[] {
  const toolObservations = messages
    .filter((message) => message.role === 'tool')
    .map((message) => message.content.trim())
    .filter(Boolean);

  const conversational = messages.filter((message) => {
    if (message.role === 'tool') return false;
    if (message.role === 'assistant' && message.tool_calls?.length) return false;
    return true;
  });

  if (toolObservations.length === 0) {
    return conversational;
  }

  const guidance: AgentChatMessage = {
    role: 'system',
    content: [
      '【本轮工具返回数据】',
      toolObservations.join('\n\n'),
      '',
      '请仅依据上述工具数据与对话历史，用简体中文直接回答用户的最新问题。',
      '只输出给用户看的正文，禁止输出 DSML、tool_calls、XML 或任何工具调用标记，也不要再次请求调用工具。',
    ].join('\n'),
  };

  const result = [...conversational];
  const systemIndex = result.findIndex((message) => message.role === 'system');
  if (systemIndex >= 0) {
    result.splice(systemIndex + 1, 0, guidance);
  } else {
    result.unshift(guidance);
  }
  return result;
}

export function finalizeAgentReply(rawReply: string, messages: AgentChatMessage[]): string {
  const stripped = stripDsmlMarkup(rawReply);
  const gymFallback = formatGymsFromToolMessages(messages);

  if (replyLooksLikeDsmlLeak(rawReply) && gymFallback) {
    return gymFallback.slice(0, 8000);
  }

  if (stripped && !replyLooksLikeDsmlLeak(stripped)) {
    return stripped.slice(0, 8000);
  }

  if (gymFallback) {
    return gymFallback.slice(0, 8000);
  }

  return stripped.slice(0, 8000) || '抱歉，我暂时无法整理出完整回复，请稍后再试。';
}
