/**
 * 通用指数退避重试（供各模型客户端复用）
 * 仅对 429（限流）与 5xx（服务器错误）重试
 */
import { AxiosError } from "axios";

export async function withRetry<T>(
  fn: () => Promise<T>,
  opts: { maxRetries?: number; baseDelayMs?: number; label?: string } = {}
): Promise<T> {
  const { maxRetries = 3, baseDelayMs = 2000, label = "AI" } = opts;
  let lastError: unknown;
  let hadRateLimit = false;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      const status = (err as AxiosError)?.response?.status;
      const shouldRetry = status === 429 || (status !== undefined && status >= 500);
      if (status === 429) hadRateLimit = true;
      if (!shouldRetry || attempt === maxRetries) break;
      const delay = baseDelayMs * Math.pow(2, attempt);
      console.log(`[${label}] 请求失败(${status})，${delay}ms后第${attempt + 1}次重试...`);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  if (hadRateLimit) {
    const friendlyErr = new Error("AI服务繁忙，请稍等1-2分钟后再试");
    (friendlyErr as any).isRateLimit = true;
    throw friendlyErr;
  }
  throw lastError;
}
