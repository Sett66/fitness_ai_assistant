import { AgentMemoryPatchSchema, LLM_MODELS } from '@fitness/shared';
import type { AgentMemoryFact, AgentMemoryPatch } from '@fitness/shared';
import { z } from 'zod';

import { createDeepSeekClient } from '../llm/deepseek';
import type { OpenAiCompatibleJsonClient } from '../llm/openai-compatible';
import type { LlmUsage } from '../llm/types';

const ExtractMemoryOutputSchema = z.object({
  patches: z.array(AgentMemoryPatchSchema).max(3),
});

export type ExtractMemoryFactsInput = {
  latestUserText: string;
  assistantReply: string;
  existingFacts?: AgentMemoryFact[];
};

export type ExtractMemoryFactsResult = {
  patches: AgentMemoryPatch[];
  usage: LlmUsage;
};

const MEMORY_EXTRACT_SYSTEM_PROMPT = `你是健身助手后台记忆抽取模块。根据用户与教练的一轮对话，输出对「长期记忆」的变更（新增、更新或删除）。

## 输出格式
只返回 JSON：
{
  "patches": [
    { "key": "injury_shoulder", "action": "upsert", "value": "左肩有伤，避免推举", "confidence": 0.9 },
    { "key": "injury_knee", "action": "remove", "confidence": 0.85 }
  ]
}

字段说明：
- key：英文 snake_case，最多 64 字符（如 injury_shoulder、travel_city、diet_no_pork）
- action：upsert（新增或更新）| remove（删除过时记忆）
- value：upsert 时必填，中文简短描述，最多 512 字符
- confidence：0-1，仅 ≥0.6 的 patch 才会执行
- 每轮最多 3 条 patch；无变更时返回 { "patches": [] }

## 何时 upsert
- 用户透露新的稳定偏好/限制/习惯（伤病、器械偏好、常出差城市、饮食禁忌等）
- 用户修正或补充已有记忆 → **必须复用已有 key**，用 upsert 覆盖 value
- 用户说伤病「已恢复 / 好了 / 不再影响训练」→ 优先 remove；若仍需保留注意事项（如「刚恢复，循序渐进」）则 upsert 更新 value

## 何时 remove
- 用户明确表示某条旧记忆不再成立（如「膝盖早就好了」）
- 【已有长期记忆】中某条与本轮对话矛盾，且用户已否定旧信息
- remove 不需要 value

## 不要输出
- 闲聊、一次性问答、仅当日安排
- 已在用户档案（身高体重目标等）中的信息
- 对已有记忆无变化的重复 patch

## 更新已有记忆（重要）
若提供了【已有长期记忆】，请对照本轮对话：
1. 用户否定旧事实 → remove 或 upsert 为最新状态（不要无视）
2. 同一主题只保留一个 key，更新时复用原 key，不要另起新 key 造成重复`;

export async function extractMemoryFacts(
  input: ExtractMemoryFactsInput,
  options?: { model?: string; client?: OpenAiCompatibleJsonClient },
): Promise<ExtractMemoryFactsResult> {
  const client = options?.client ?? createDeepSeekClient();
  const model = options?.model ?? LLM_MODELS.DEEPSEEK_V4_PRO;

  const existingBlock =
    input.existingFacts && input.existingFacts.length > 0
      ? `\n\n【已有长期记忆】\n${input.existingFacts.map((f) => `- ${f.key}: ${f.value}`).join('\n')}`
      : '';

  const response = await client.generateJson({
    model,
    messages: [
      { role: 'system', content: MEMORY_EXTRACT_SYSTEM_PROMPT },
      {
        role: 'user',
        content: `【用户消息】\n${input.latestUserText.slice(0, 2000)}\n\n【助手回复】\n${input.assistantReply.slice(0, 4000)}${existingBlock}`,
      },
    ],
    temperature: 0.2,
  });

  try {
    const parsed = ExtractMemoryOutputSchema.parse(JSON.parse(response.text));
    return { patches: parsed.patches, usage: response.usage };
  } catch {
    return { patches: [], usage: response.usage };
  }
}
