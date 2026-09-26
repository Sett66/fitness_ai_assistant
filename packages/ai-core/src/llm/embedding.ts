import { AiCoreError } from '../errors.js';

const DIMENSIONS = 1024;

/** DashScope OpenAI-compatible embedding endpoint; no content is logged here. */
export async function createMemoryEmbedding(input: string): Promise<number[]> {
  const apiKey = process.env.DASHSCOPE_API_KEY;
  if (!apiKey) throw new AiCoreError('AI_CORE_MISSING_API_KEY', 'DASHSCOPE_API_KEY 未配置');
  const baseUrl =
    process.env.DASHSCOPE_BASE_URL ?? 'https://dashscope.aliyuncs.com/compatible-mode/v1';
  const response = await fetch(`${baseUrl.replace(/\/$/, '')}/embeddings`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'text-embedding-v3', input, dimensions: DIMENSIONS }),
  });
  if (!response.ok)
    throw new AiCoreError('AI_CORE_PROVIDER_ERROR', `embedding 请求失败：${response.status}`);
  const payload = (await response.json()) as { data?: Array<{ embedding?: unknown }> };
  const embedding = payload.data?.[0]?.embedding;
  if (
    !Array.isArray(embedding) ||
    embedding.length !== DIMENSIONS ||
    !embedding.every((n) => typeof n === 'number')
  )
    throw new AiCoreError('AI_CORE_PROVIDER_ERROR', 'embedding 返回维度无效');
  return embedding as number[];
}
