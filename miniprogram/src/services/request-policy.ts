export const MP_REQUEST_TIMEOUT_MS = 90_000;

export type MpErrorKind =
  | "network"
  | "timeout"
  | "insufficient_credits"
  | "content_rejected"
  | "unknown";

export class MpApiError extends Error {
  constructor(
    public readonly kind: MpErrorKind,
    public readonly code: string,
    public readonly title: string,
    message: string,
    public readonly helpText?: string,
  ) {
    super(message);
    this.name = "MpApiError";
  }
}

type ErrorLike = {
  code?: string;
  message?: string;
  errMsg?: string;
  error?: { code?: string; message?: string };
};

const ERROR_COPY: Record<MpErrorKind, Omit<MpApiError, "name" | "kind" | "code">> = {
  network: {
    title: "网络连接不太顺",
    message: "请检查手机网络，确认连接后再点一次重试。",
  },
  timeout: {
    title: "等待时间有点长",
    message: "本次请求已停止，没有自动重新生成。请稍后手动重试。",
  },
  insufficient_credits: {
    title: "积分不足",
    message: "当前积分不够，暂时无法使用这项功能。",
    helpText: "如何获取积分：TODO（运营配置积分获取方式）",
  },
  content_rejected: {
    title: "内容未通过安全检查",
    message: "请换一张图片或调整说法后，再手动尝试。",
  },
  unknown: {
    title: "服务暂时忙不过来",
    message: "请稍后再试；如果仍然失败，请联系工作人员。",
  },
};

export function normalizeApiError(input: unknown): MpApiError {
  if (input instanceof MpApiError) return input;

  const error = (input && typeof input === "object" ? input : {}) as ErrorLike;
  const code = error.error?.code || error.code || "UNKNOWN_ERROR";
  const originalMessage = error.error?.message || error.message || error.errMsg || "";
  const lowerMessage = originalMessage.toLowerCase();
  let kind: MpErrorKind = "unknown";

  if (code === "INSUFFICIENT_CREDITS") kind = "insufficient_credits";
  else if (code === "CONTENT_REJECTED") kind = "content_rejected";
  else if (lowerMessage.includes("timeout") || lowerMessage.includes("超时")) kind = "timeout";
  else if (
    lowerMessage.includes("network")
    || lowerMessage.includes("request:fail")
    || lowerMessage.includes("网络")
  ) kind = "network";

  const copy = ERROR_COPY[kind];
  return new MpApiError(kind, code, copy.title, copy.message, copy.helpText);
}

export function shouldAutoRetry(input: {
  method: "GET" | "POST";
  retry: "safe" | "never";
  attempt: number;
  kind: MpErrorKind;
}): boolean {
  return input.retry === "safe"
    && input.attempt === 0
    && (input.kind === "network" || input.kind === "timeout");
}
