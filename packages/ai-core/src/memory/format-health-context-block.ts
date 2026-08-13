/** 将体检摘要格式化为 system prompt 块；无内容时返回空字符串 */
export function formatHealthContextBlock(healthContext?: string | null): string {
  const text = healthContext?.trim();
  if (!text) {
    return '';
  }

  return [
    '【体检概况】',
    text,
    '以上为用户近期体检摘要，仅作健身/生活方式参考，非医疗诊断。谈及训练或饮食注意事项时可引用；不要下疾病诊断或给治疗方案。',
  ].join('\n');
}
