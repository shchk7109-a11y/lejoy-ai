export type SecurityCheckResult = { safe: boolean; reason?: string };

export type SecurityHooksOptions = {
  mode: string;
  appId: string;
  secret: string;
  request?: typeof fetch;
};

type AccessTokenResponse = { access_token?: string; expires_in?: number; errcode?: number; errmsg?: string };
type SecurityResponse = { errcode?: number; errmsg?: string; trace_id?: string; result?: { suggest?: string } };
export type MediaSecuritySubmission = { status: "bypassed" } | { status: "pending"; traceId: string };

export function createSecurityHooks(options: SecurityHooksOptions) {
  const request = options.request ?? fetch;
  let cachedToken: { value: string; expiresAt: number } | undefined;

  async function getAccessToken(): Promise<string> {
    if (cachedToken && cachedToken.expiresAt > Date.now()) return cachedToken.value;
    if (!options.appId || !options.secret) throw new Error("微信内容安全开启时必须配置小程序 AppID 和 Secret");
    const url = new URL("https://api.weixin.qq.com/cgi-bin/token");
    url.searchParams.set("grant_type", "client_credential");
    url.searchParams.set("appid", options.appId);
    url.searchParams.set("secret", options.secret);
    const response = await request(url);
    if (!response.ok) throw new Error(`微信 access_token 请求失败：HTTP ${response.status}`);
    const data = await response.json() as AccessTokenResponse;
    if (!data.access_token) throw new Error(`微信 access_token 获取失败：${data.errmsg ?? data.errcode ?? "未知错误"}`);
    const ttlMs = Math.max(60, (data.expires_in ?? 7200) - 300) * 1000;
    cachedToken = { value: data.access_token, expiresAt: Date.now() + ttlMs };
    return cachedToken.value;
  }

  async function checkTextSecurity(text: string, openId?: string): Promise<SecurityCheckResult> {
    if (options.mode !== "wechat") return { safe: true };
    if (!openId) throw new Error("微信文本安全检查需要用户 openid");
    const token = await getAccessToken();
    const response = await request(`https://api.weixin.qq.com/wxa/msg_sec_check?access_token=${encodeURIComponent(token)}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ content: text, version: 2, scene: 2, openid: openId }),
    });
    if (!response.ok) throw new Error(`微信文本安全请求失败：HTTP ${response.status}`);
    const data = await response.json() as SecurityResponse;
    if (data.errcode && data.errcode !== 0) throw new Error(`微信文本安全检查失败：${data.errmsg ?? data.errcode}`);
    return data.result?.suggest && data.result.suggest !== "pass"
      ? { safe: false, reason: "微信内容安全检查未通过" }
      : { safe: true };
  }

  async function checkMediaSecurity(url: string, openId?: string): Promise<MediaSecuritySubmission> {
    if (options.mode !== "wechat") return { status: "bypassed" };
    if (!openId) throw new Error("微信媒体安全检查需要用户 openid");
    const token = await getAccessToken();
    const response = await request(`https://api.weixin.qq.com/wxa/media_check_async?access_token=${encodeURIComponent(token)}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ media_url: url, media_type: 2, version: 2, scene: 2, openid: openId }),
    });
    if (!response.ok) throw new Error(`微信媒体安全请求失败：HTTP ${response.status}`);
    const data = await response.json() as SecurityResponse;
    if (data.errcode && data.errcode !== 0) throw new Error(`微信媒体安全检查提交失败：${data.errmsg ?? data.errcode}`);
    if (!data.trace_id) throw new Error("微信媒体安全检查提交失败：缺少 trace_id");
    return { status: "pending", traceId: data.trace_id };
  }

  return { checkTextSecurity, checkMediaSecurity };
}

const defaultHooks = createSecurityHooks({
  mode: process.env.CONTENT_SECURITY ?? "off",
  appId: process.env.WECHAT_MINI_APPID ?? "",
  secret: process.env.WECHAT_MINI_SECRET ?? "",
});

export const checkTextSecurity = defaultHooks.checkTextSecurity;
export const checkMediaSecurity = defaultHooks.checkMediaSecurity;
