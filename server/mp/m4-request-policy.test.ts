import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  MP_REQUEST_TIMEOUT_MS,
  normalizeApiError,
  shouldAutoRetry,
} from "../../miniprogram/src/services/request-policy";

describe("M4 小程序请求策略", () => {
  it("前端请求超时固定为 90 秒", () => {
    expect(MP_REQUEST_TIMEOUT_MS).toBe(90_000);
  });

  it("识别四类需要大字说明的错误", () => {
    expect(normalizeApiError({ errMsg: "request:fail network error" }).kind).toBe("network");
    expect(normalizeApiError({ errMsg: "request:fail timeout" }).kind).toBe("timeout");
    expect(normalizeApiError({ code: "INSUFFICIENT_CREDITS" })).toMatchObject({
      kind: "insufficient_credits",
      helpText: "如何获取积分：TODO（运营配置积分获取方式）",
    });
    expect(normalizeApiError({ code: "CONTENT_REJECTED" }).kind).toBe("content_rejected");
  });

  it("只允许 GET 或显式幂等 POST 的网络错误自动重试一次", () => {
    expect(shouldAutoRetry({ method: "GET", retry: "safe", attempt: 0, kind: "network" })).toBe(true);
    expect(shouldAutoRetry({ method: "POST", retry: "safe", attempt: 0, kind: "network" })).toBe(true);
    expect(shouldAutoRetry({ method: "GET", retry: "safe", attempt: 1, kind: "network" })).toBe(false);
    expect(shouldAutoRetry({ method: "POST", retry: "never", attempt: 0, kind: "network" })).toBe(false);
    expect(shouldAutoRetry({ method: "GET", retry: "safe", attempt: 0, kind: "content_rejected" })).toBe(false);
  });

  it("所有生成和上传 POST 均显式禁止自动重试", () => {
    const api = readFileSync(new URL("../../miniprogram/src/services/api.ts", import.meta.url), "utf8");
    const postCount = (api.match(/method:\s*"POST"/g) ?? []).length;
    const noRetryCount = (api.match(/retry:\s*"never"/g) ?? []).length;
    expect(postCount).toBeGreaterThanOrEqual(15);
    expect(noRetryCount).toBe(postCount);
  });
});
