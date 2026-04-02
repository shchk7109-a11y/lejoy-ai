import { toast } from "sonner";

export { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";

const LOGIN_UNAVAILABLE_TOAST_ID = "oauth-login-unavailable";
const DEV_LOGIN_ENABLED = import.meta.env.DEV && import.meta.env.VITE_DEV_LOGIN_ENABLED !== "false";

export const canUseDevLogin = () => DEV_LOGIN_ENABLED;

// Generate login URL at runtime so redirect URI reflects the current origin.
export const getLoginUrl = () => {
  if (typeof window === "undefined") return null;

  const oauthPortalUrl = import.meta.env.VITE_OAUTH_PORTAL_URL?.trim();
  const appId = import.meta.env.VITE_APP_ID?.trim();
  const redirectUri = `${window.location.origin}/api/oauth/callback`;
  const state = btoa(redirectUri);

  if (!oauthPortalUrl) {
    console.warn("[OAuth] Missing VITE_OAUTH_PORTAL_URL, login redirect is disabled in current environment.");
    return null;
  }

  try {
    const url = new URL("/app-auth", oauthPortalUrl);
    if (appId) {
      url.searchParams.set("appId", appId);
    }
    url.searchParams.set("redirectUri", redirectUri);
    url.searchParams.set("state", state);
    url.searchParams.set("type", "signIn");

    return url.toString();
  } catch (error) {
    console.error("[OAuth] Invalid VITE_OAUTH_PORTAL_URL:", oauthPortalUrl, error);
    return null;
  }
};

export async function loginInDevMode() {
  if (!DEV_LOGIN_ENABLED) {
    toast.warning("当前环境未开启开发登录。", { id: LOGIN_UNAVAILABLE_TOAST_ID });
    return false;
  }

  try {
    const response = await fetch("/api/dev/login", {
      method: "POST",
      credentials: "include",
    });

    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      throw new Error(payload?.error || "开发登录失败");
    }

    toast.success("已进入开发调试登录态");
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : "开发登录失败";
    toast.error(message);
    return false;
  }
}

export function redirectToLogin(options?: { silent?: boolean }) {
  if (typeof window === "undefined") return false;

  const loginUrl = getLoginUrl();
  if (!loginUrl) {
    if (!options?.silent) {
      toast.warning(
        canUseDevLogin()
          ? "当前未配置 OAuth，可先使用“开发登录”进入真实调试模式。"
          : "当前开发环境未配置 OAuth 登录，已取消跳转。可先继续预览页面，但受保护接口暂不可用。",
        {
          id: LOGIN_UNAVAILABLE_TOAST_ID,
        }
      );
    }
    return false;
  }

  if (window.location.href === loginUrl) {
    return false;
  }

  window.location.href = loginUrl;
  return true;
}
