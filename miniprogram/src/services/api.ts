import Taro from "@tarojs/taro";
import { clearSession, getToken } from "../store/auth";
import {
  MP_REQUEST_TIMEOUT_MS,
  MP_STORY_IMAGE_TIMEOUT_MS,
  MpApiError,
  normalizeApiError,
  shouldAutoRetry,
} from "./request-policy";

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
export type PhotoEditPreset = "一键去路人" | "清晨阳光" | "日落余晖" | "通透增强" | "人像精修" | "背景虚化";
// 风格清单由服务端 server/silverlens.ts 下发并校验；小程序不再复制维护枚举。
export type ArtStyleName = string;
export type ArtStyleOption = { name: ArtStyleName; emoji: string; description: string };
export type StoryTopic = { title: string; description: string; protagonist: string };
export type StoryPage = {
  pageNumber: number;
  text: string;
  imagePrompt: string;
  imageUrl?: string;
  imageFileKey?: string;
  audioUrl?: string;
  audioFileKey?: string;
};
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

async function request<T>(path: string, options: {
  method?: "GET" | "POST";
  data?: unknown;
  auth?: boolean;
  retry?: "safe" | "never";
  operationId?: string;
  timeoutMs?: number;
} = {}): Promise<T> {
  const token = getToken();
  const method = options.method ?? "GET";
  const retry = options.retry ?? (method === "GET" ? "safe" : "never");

  for (let attempt = 0; ; attempt += 1) {
    try {
      const response = await Taro.request<T & ApiError>({
        url: `${API_BASE_URL}${path}`,
        method,
        data: options.data,
        timeout: options.timeoutMs ?? MP_REQUEST_TIMEOUT_MS,
        header: {
          "content-type": "application/json",
          ...(options.auth !== false && token ? { authorization: `Bearer ${token}` } : {}),
          ...(options.operationId ? { "x-idempotency-key": options.operationId } : {}),
        },
      });
      if (response.statusCode === 401) {
        clearSession();
        await Taro.reLaunch({ url: "/pages/login/index" });
        throw new MpApiError("unknown", "UNAUTHORIZED", "登录已失效", "请重新登录后继续使用。" );
      }
      if (response.statusCode < 200 || response.statusCode >= 300) {
        throw normalizeApiError(response.data);
      }
      return response.data;
    } catch (error) {
      const normalized = normalizeApiError(error);
      if (shouldAutoRetry({ method, retry, attempt, kind: normalized.kind })) continue;
      throw normalized;
    }
  }
}

export const mpApi = {
  login: (code: string) => request<{ token: string; user: MpUser; mock: boolean }>("/api/mp/auth/login", {
    method: "POST",
    data: { code },
    auth: false,
    retry: "never",
  }),
  me: () => request<MpUser>("/api/mp/user/me"),
  modules: () => request<{ modules: MpModule[] }>("/api/mp/modules"),
  generateCopywriter: (data: { scenario: string; relationship: string; tone: string; customContext?: string }, operationId?: string) =>
    request<{ wishes: string[]; credits: number }>("/api/mp/copywriter/generate", { method: "POST", data, retry: "never", operationId }),
  creditHistory: () => request<{ transactions: CreditTransaction[] }>("/api/mp/credits/history"),
  uploadImage: (data: { base64: string; mimeType: "image/jpeg" | "image/png" | "image/webp" }) =>
    request<{ url: string; fileKey: string; securityStatus: MediaSecurityStatus }>("/api/mp/upload/image", { method: "POST", data, retry: "never" }),
  uploadAudio: (data: { base64: string; mimeType: "audio/mpeg" }) =>
    request<{ url: string; fileKey: string }>("/api/mp/upload/audio", { method: "POST", data, retry: "never" }),
  silverLensStyles: () => request<{ styles: ArtStyleOption[] }>("/api/mp/silverlens/styles"),
  restorePhoto: (data: { sourceFileKey: string; preset?: PhotoEditPreset; prompt?: string }, operationId?: string) =>
    request<{ imageUrl: string; fileKey: string; securityStatus: MediaSecurityStatus; credits: number }>("/api/mp/silverlens/restore", { method: "POST", data, retry: "never", operationId }),
  transformPhoto: (data: { sourceFileKey: string; style: ArtStyleName }, operationId?: string) =>
    request<{ imageUrl: string; fileKey: string; securityStatus: MediaSecurityStatus; credits: number }>("/api/mp/silverlens/transform", { method: "POST", data, retry: "never", operationId }),
  transcribeAudio: (fileKey: string) =>
    request<{ text: string }>("/api/mp/stt/transcribe", { method: "POST", data: { fileKey, language: "zh" }, retry: "never" }),
  suggestStoryTopics: (data: { theme: string; childName?: string; age?: number; customProtagonist?: string }, operationId?: string) =>
    request<{ topics: StoryTopic[] }>("/api/mp/story/suggest-topics", { method: "POST", data, retry: "never", operationId }),
  generateStoryStructure: (data: { theme: string; topic: string; childName?: string; age: number; protagonist?: string }, operationId?: string) =>
    request<{ title: string; pages: StoryPage[]; credits: number }>("/api/mp/story/structure", { method: "POST", data, retry: "never", operationId }),
  generateStoryPageImage: (data: { imagePrompt: string; pageNumber: number }, operationId?: string) =>
    request<{ imageUrl: string; fileKey: string; pageNumber: number; securityStatus: MediaSecurityStatus }>("/api/mp/story/page-image", {
      method: "POST",
      data,
      retry: "never",
      operationId,
      timeoutMs: MP_STORY_IMAGE_TIMEOUT_MS,
    }),
  generateStoryPageSpeech: (data: { pageNumber: number; text: string; voiceType: string; isFirstPage: boolean; title?: string }, operationId?: string) =>
    request<{ audioUrl: string; fileKey: string; pageNumber: number; credits?: number }>("/api/mp/story/page-speech", { method: "POST", data, retry: "never", operationId }),
  releaseStoryAssets: (fileKeys: string[]) =>
    request<{ deleted: number; retainedFileKeys?: string[] }>("/api/mp/story/release-assets", { method: "POST", data: { fileKeys }, retry: "never" }),
  getRecipe: (foodName: string, operationId?: string) =>
    request<LifeResult>("/api/mp/life/recipe", { method: "POST", data: { foodName }, retry: "never", operationId }),
  identifyPlant: (sourceFileKey: string, operationId?: string) =>
    request<LifeResult>("/api/mp/life/identify", { method: "POST", data: { sourceFileKey }, retry: "never", operationId }),
  queryHealth: (data: { textHint?: string; sourceFileKey?: string }, operationId?: string) =>
    request<LifeResult>("/api/mp/life/health", { method: "POST", data, retry: "never", operationId }),
  chat: (message: string, history: ChatMessage[], operationId?: string) =>
    request<{ reply: string; credits: number; guarded: boolean }>("/api/mp/chat", { method: "POST", data: { message, history }, retry: "never", operationId }),
};
