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
export type StoryTopic = { title: string; description: string; protagonist: string };
export type StoryPage = { pageNumber: number; text: string; imagePrompt: string; imageUrl?: string; audioUrl?: string };
export type LifeResult = {
  title: string;
  description: string;
  tags: string[];
  details: string[];
  advice?: string;
  healthyScore?: number;
  nutrition?: Record<string, string>;
  imageUrl?: string;
  securityStatus?: MediaSecurityStatus;
  credits: number;
};
export type ChatMessage = { role: "user" | "assistant"; content: string };

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
  transcribeAudio: (fileKey: string) =>
    request<{ text: string }>("/api/mp/stt/transcribe", { method: "POST", data: { fileKey, language: "zh" } }),
  suggestStoryTopics: (data: { theme: string; childName?: string; age?: number; customProtagonist?: string }) =>
    request<{ topics: StoryTopic[] }>("/api/mp/story/suggest-topics", { method: "POST", data }),
  generateStoryStructure: (data: { theme: string; topic: string; childName?: string; age: number; protagonist?: string }) =>
    request<{ title: string; pages: StoryPage[]; credits: number }>("/api/mp/story/structure", { method: "POST", data }),
  generateStoryPageImage: (data: { imagePrompt: string; pageNumber: number }) =>
    request<{ imageUrl: string; fileKey: string; pageNumber: number; securityStatus: MediaSecurityStatus }>("/api/mp/story/page-image", { method: "POST", data }),
  generateStoryPageSpeech: (data: { pageNumber: number; text: string; voiceType: string; isFirstPage: boolean; title?: string }) =>
    request<{ audioUrl: string; fileKey: string; pageNumber: number; credits?: number }>("/api/mp/story/page-speech", { method: "POST", data }),
  getRecipe: (foodName: string) =>
    request<LifeResult>("/api/mp/life/recipe", { method: "POST", data: { foodName } }),
  identifyPlant: (sourceFileKey: string) =>
    request<LifeResult>("/api/mp/life/identify", { method: "POST", data: { sourceFileKey } }),
  queryHealth: (data: { textHint?: string; sourceFileKey?: string }) =>
    request<LifeResult>("/api/mp/life/health", { method: "POST", data }),
  chat: (message: string, history: ChatMessage[]) =>
    request<{ reply: string; credits: number; guarded: boolean }>("/api/mp/chat", { method: "POST", data: { message, history } }),
};
