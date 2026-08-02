import Taro from "@tarojs/taro";
import { clearSession, getToken } from "../store/auth";

const API_BASE_URL = __LEJOY_API_BASE_URL__;

export type MpUser = {
  id: number;
  openId: string;
  name: string;
  role: "user" | "admin";
  credits: number;
};

export type MpModule = {
  id: string;
  name: string;
  icon: string;
  description: string;
  creditCost: number;
  enabled: boolean;
  theme?: { bg: string; border: string; title: string };
};

export type CreditTransaction = {
  id: number;
  amount: number;
  type: "consume" | "recharge" | "register";
  feature?: string | null;
  description?: string | null;
  balanceAfter: number;
  createdAt: string;
};

type ApiError = { error?: { code?: string; message?: string } };

async function request<T>(path: string, options: { method?: "GET" | "POST"; data?: unknown; auth?: boolean } = {}): Promise<T> {
  const token = getToken();
  const response = await Taro.request<T & ApiError>({
    url: `${API_BASE_URL}${path}`,
    method: options.method ?? "GET",
    data: options.data,
    header: {
      "content-type": "application/json",
      ...(options.auth !== false && token ? { authorization: `Bearer ${token}` } : {}),
    },
  });
  if (response.statusCode === 401) {
    clearSession();
    await Taro.reLaunch({ url: "/pages/login/index" });
    throw new Error("登录已失效，请重新登录");
  }
  if (response.statusCode < 200 || response.statusCode >= 300) {
    throw new Error(response.data.error?.message || "服务暂时不可用，请稍后重试");
  }
  return response.data;
}

export const mpApi = {
  login: (code: string) => request<{ token: string; user: MpUser; mock: boolean }>("/api/mp/auth/login", {
    method: "POST",
    data: { code },
    auth: false,
  }),
  me: () => request<MpUser>("/api/mp/user/me"),
  modules: () => request<{ modules: MpModule[] }>("/api/mp/modules"),
  generateCopywriter: (data: { scenario: string; relationship: string; tone: string }) =>
    request<{ wishes: string[]; credits: number }>("/api/mp/copywriter/generate", { method: "POST", data }),
  creditHistory: () => request<{ transactions: CreditTransaction[] }>("/api/mp/credits/history"),
};
