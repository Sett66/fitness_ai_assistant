/** displayName 为空时的对外昵称；绝不能回落到手机号（ADR 0011 §9） */
export function fallbackDisplayName(
  userId: string,
  displayName: string | null | undefined,
): string {
  const trimmed = displayName?.trim();
  if (trimmed) return trimmed;
  return `健身用户${userId.slice(-4)}`;
}
