/**
 * 同步拦截词表。demo 用途，仅收录少量示例词；
 * 真实项目应接入词库服务，这里只验证链路。
 *
 * 可扩展：把词表换成远程下发 / 运营后台维护即可，匹配函数保持纯函数。
 */
export const BANNED_KEYWORDS: readonly string[] = [
  'bannedword',
  'adpromo',
  'spamlink',
  'abuseword',
  '加微信号',
  '免费加群',
  '辱骂示例',
  '引流广告',
];

const SEPARATOR_RE = /[\s\u00a0\u200b-\u200d\ufeff_\-.*·•、，,\\/|]+/g;

function normalizeForMatch(text: string): string {
  return text.toLowerCase().replace(SEPARATOR_RE, '');
}

/** 命中返回第一个匹配词，未命中返回 null。大小写不敏感，去除空白后匹配 */
export function findBannedKeyword(text: string): string | null {
  const normalized = normalizeForMatch(text);
  if (!normalized) return null;

  for (const keyword of BANNED_KEYWORDS) {
    const needle = normalizeForMatch(keyword);
    if (needle && normalized.includes(needle)) {
      return keyword;
    }
  }
  return null;
}
