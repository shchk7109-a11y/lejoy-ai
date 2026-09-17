export function normalizeCreditCode(value: string): string {
  return value.toUpperCase().replace(/[\s-]/g, "").replace(/[^A-Z2-9]/g, "").slice(0, 12);
}

export function formatCreditCode(value: string): string {
  const normalized = normalizeCreditCode(value);
  return normalized.match(/.{1,4}/g)?.join("-") ?? "";
}

const messages: Record<string, string> = {
  INVALID_CODE: "兑换码不正确，请核对后重试",
  CODE_USED: "这张兑换码已使用，请向店长领取新码",
  CODE_EXPIRED: "这张兑换码已过期，请向店长领取新码",
  CODE_INACTIVE: "这张兑换码暂未生效或已停用，请联系店长",
  RATE_LIMITED: "尝试次数较多，请稍后再试，或请店长帮您核对",
};
export function redeemErrorMessage(code: string): string {
  return messages[code] ?? "兑换暂时未完成，请检查网络后主动重试；不会重复加分";
}
