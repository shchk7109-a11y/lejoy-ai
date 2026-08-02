import { describe, expect, it, vi } from "vitest";
import { exchangeWechatCode } from "./auth";

describe("微信 code2session", () => {
  it("AppID 与 Secret 同时为空时使用固定 mock 用户且不请求网络", async () => {
    const request = vi.fn<typeof fetch>();

    await expect(exchangeWechatCode("any-code", "", "", request)).resolves.toEqual({
      openId: "mp_mock_user",
      mock: true,
    });
    expect(request).not.toHaveBeenCalled();
  });

  it("真实配置会调用微信 jscode2session 并返回 openid", async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ openid: "real-openid", session_key: "not-stored" }), { status: 200 }),
    );

    await expect(exchangeWechatCode("wx-code", "wx-appid", "app-secret", request)).resolves.toEqual({
      openId: "real-openid",
      mock: false,
    });

    const url = new URL(String(request.mock.calls[0][0]));
    expect(`${url.origin}${url.pathname}`).toBe("https://api.weixin.qq.com/sns/jscode2session");
    expect(url.searchParams.get("appid")).toBe("wx-appid");
    expect(url.searchParams.get("secret")).toBe("app-secret");
    expect(url.searchParams.get("js_code")).toBe("wx-code");
    expect(url.searchParams.get("grant_type")).toBe("authorization_code");
  });

  it("微信返回错误码时拒绝登录且不泄露 session_key", async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ errcode: 40029, errmsg: "invalid code" }), { status: 200 }),
    );

    await expect(exchangeWechatCode("bad-code", "wx-appid", "app-secret", request))
      .rejects.toThrow("invalid code");
  });
});
