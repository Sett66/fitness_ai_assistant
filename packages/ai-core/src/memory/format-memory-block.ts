import type { AgentMemoryFact } from '@fitness/shared';

/** 将长期记忆格式化为 system prompt 块；无事实时返回空字符串 */
export function formatMemoryBlock(facts: AgentMemoryFact[]): string {
  if (facts.length === 0) {
    return '';
  }

  const lines = facts.map((fact) => `- ${fact.key}: ${fact.value}`);
  return ['【长期记忆】', ...lines].join('\n');
}
