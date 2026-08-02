import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { resolveWechatMediaStatus, verifyWechatSignature } from "./wechat-callback";

describe("微信媒体回调协议", () => {
  it("按 token、timestamp、nonce 字典序 SHA1 校验签名", () => {
    const token = "callback-token";
    const timestamp = "1722528000";
    const nonce = "nonce-1";
    const signature = createHash("sha1")
      .update([token, timestamp, nonce].sort().join(""))
      .digest("hex");

    expect(verifyWechatSignature(token, timestamp, nonce, signature)).toBe(true);
    expect(verifyWechatSignature(token, timestamp, nonce, "bad-signature")).toBe(false);
  });

  it("兼容 result.suggest 与 isrisky 两种回调字段", () => {
    expect(resolveWechatMediaStatus({ result: { suggest: "pass" } })).toBe("pass");
    expect(resolveWechatMediaStatus({ result: { suggest: "risky" } })).toBe("risky");
    expect(resolveWechatMediaStatus({ isrisky: 0 })).toBe("pass");
    expect(resolveWechatMediaStatus({ isrisky: 1 })).toBe("risky");
  });
});
