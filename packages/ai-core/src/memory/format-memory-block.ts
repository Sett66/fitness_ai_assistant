import type { AgentMemoryFact } from '@fitness/shared';

/** 将长期记忆格式化为 system prompt 块；无事实时返回空字符串 */
export function formatMemoryBlock(facts: AgentMemoryFact[]): string {
  if (facts.length === 0) {
    return '';
  }

  const lines = facts.map((fact) => `- ${fact.key}: ${fact.value}`);
  return ['【长期记忆】', ...lines].join('\n');
}

/** Agent mode exposes keys as a durable index and values only for safety-critical facts. */
export function formatAgentMemoryBlocks(facts: AgentMemoryFact[]): string {
  const active = facts.slice();
  if (!active.length) return '';
  const safety = active.filter(
    (fact) => fact.category === 'injury' || fact.category === 'diet_restriction',
  );
  const ordered = [...safety, ...active.filter((fact) => !safety.includes(fact))].slice(0, 60);
  const index = ['【记忆索引】', ...ordered.map((fact) => `- ${fact.key}`)].join('\n');
  const safetyBlock = safety.length
    ? [
        '【安全记忆】',
        ...safety.slice(0, 5).map((fact) => `- ${fact.key}: ${fact.value}`),
        '这些限制在推荐训练和饮食时必须遵守。',
      ].join('\n')
    : '';
  return [index, safetyBlock].filter(Boolean).join('\n\n');
}
