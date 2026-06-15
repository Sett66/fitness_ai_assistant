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

/** 将 ReAct 消息转为仅聊天格式，避免流式阶段再次输出工具标记 */
export function buildMessagesForFinalStream(messages: AgentChatMessage[]): AgentChatMessage[] {
  const converted: AgentChatMessage[] = messages.map((message) => {
    if (message.role === 'tool') {
      return {
        role: 'user',
        content: `【工具返回数据】\n${message.content}`,
      };
    }
    if (message.role === 'assistant' && message.tool_calls?.length) {
      return {
        role: 'assistant',
        content: message.content?.trim() || '（已调用工具获取数据）',
      };
    }
    return message;
  });

  converted.push({
    role: 'user',
    content:
      '请根据上述工具返回数据，用简体中文直接回答用户。只输出给用户看的正文，禁止输出 DSML、tool_calls、XML 或任何工具调用标记，也不要再次请求调用工具。',
  });

  return converted;
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
