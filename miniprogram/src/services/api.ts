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

type ApiError = { code?: string; message?: string; error?: { code?: string; message?: string } };
export type MediaSecurityStatus = "bypassed" | "pending";

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
    throw new Error(response.data.error?.message || response.data.message || "服务暂时不可用，请稍后重试");
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
  generateCopywriter: (data: { scenario: string; relationship: string; tone: string; customContext?: string }) =>
    request<{ wishes: string[]; credits: number }>("/api/mp/copywriter/generate", { method: "POST", data }),
  creditHistory: () => request<{ transactions: CreditTransaction[] }>("/api/mp/credits/history"),
  uploadImage: (data: { base64: string; mimeType: "image/jpeg" | "image/png" | "image/webp" }) =>
    request<{ url: string; fileKey: string; securityStatus: MediaSecurityStatus }>("/api/mp/upload/image", { method: "POST", data }),
  uploadAudio: (data: { base64: string; mimeType: "audio/mpeg" }) =>
    request<{ url: string; fileKey: string }>("/api/mp/upload/audio", { method: "POST", data }),
  restorePhoto: (data: { sourceFileKey: string; prompt?: string }) =>
    request<{ imageUrl: string; fileKey: string; securityStatus: MediaSecurityStatus; credits: number }>("/api/mp/silverlens/restore", { method: "POST", data }),
  transformPhoto: (data: { sourceFileKey: string; style: "油画" | "水彩" | "素描" | "水墨画" | "印象派" }) =>
    request<{ imageUrl: string; fileKey: string; securityStatus: MediaSecurityStatus; credits: number }>("/api/mp/silverlens/transform", { method: "POST", data }),
  transcribeAudio: (audioUrl: string) =>
    request<{ text: string }>("/api/mp/stt/transcribe", { method: "POST", data: { audioUrl, language: "zh" } }),
};
