const WECHAT_TEXT_SECURITY_LIMIT = 2500;

export function createTextSecurityBatches(
  texts: string[],
  maxLength = WECHAT_TEXT_SECURITY_LIMIT,
): string[] {
  if (!Number.isInteger(maxLength) || maxLength <= 0) {
    throw new Error("文本安全检测批次长度必须为正整数");
  }
  const combined = texts.filter((text) => text.length > 0).join("\n");
  if (!combined) return [];

  const batches: string[] = [];
  for (let start = 0; start < combined.length; start += maxLength) {
    batches.push(combined.slice(start, start + maxLength));
  }
  return batches;
}
