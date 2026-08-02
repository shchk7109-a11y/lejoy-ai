import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSecurityHooks } from "./security";

describe("微信内容安全钩子", () => {
  beforeEach(() => vi.useRealTimers());

  it("CONTENT_SECURITY=off 时文本和媒体直接放行且不请求微信", async () => {
    const request = vi.fn<typeof fetch>();
    const hooks = createSecurityHooks({ mode: "off", appId: "", secret: "", request });

    await expect(hooks.checkTextSecurity("测试文本")).resolves.toEqual({ safe: true });
    await expect(hooks.checkMediaSecurity("https://example.com/a.jpg")).resolves.toEqual({ safe: true });
    expect(request).not.toHaveBeenCalled();
  });

  it("wechat 模式获取并缓存 access_token 后执行 msgSecCheck", async () => {
    const request = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: "access-1", expires_in: 7200 }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ errcode: 0, errmsg: "ok", result: { suggest: "pass" } }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ errcode: 0, errmsg: "ok", result: { suggest: "risky" } }), { status: 200 }));
    const hooks = createSecurityHooks({ mode: "wechat", appId: "wx-appid", secret: "secret", request });

    await expect(hooks.checkTextSecurity("安全内容")).resolves.toEqual({ safe: true });
    await expect(hooks.checkTextSecurity("风险内容")).resolves.toEqual({ safe: false, reason: "微信内容安全检查未通过" });

    expect(request).toHaveBeenCalledTimes(3);
    expect(String(request.mock.calls[1][0])).toContain("msg_sec_check?access_token=access-1");
    expect(String(request.mock.calls[2][0])).toContain("msg_sec_check?access_token=access-1");
  });

  it("wechat 模式通过 media_check_async 提交媒体 URL", async () => {
    const request = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: "access-2", expires_in: 7200 }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ errcode: 0, errmsg: "ok", trace_id: "trace-1" }), { status: 200 }));
    const hooks = createSecurityHooks({ mode: "wechat", appId: "wx-appid", secret: "secret", request });

    await expect(hooks.checkMediaSecurity("https://example.com/a.jpg")).resolves.toEqual({ safe: true });

    expect(String(request.mock.calls[1][0])).toContain("media_check_async?access_token=access-2");
    expect(JSON.parse(String(request.mock.calls[1][1]?.body))).toMatchObject({ media_url: "https://example.com/a.jpg", media_type: 2 });
  });
});
