/**
 * 模型网关层 —— 所有业务代码只调这里，不直接触碰任何供应商客户端
 *
 * 供应商选择规则（每种能力独立）：
 * - 环境变量显式指定（AI_TEXT_PROVIDER 等）则用指定值
 * - "auto"：按优先级选择已配置密钥的供应商（境内新链路优先，遗留链路兜底）
 *
 * 生产环境（微信小程序）：kimi + volc + ali（境内已备案，可提供类目审核材料）
 * 开发/评测：可将各 provider 指向遗留链路做效果对比
 */
import { ENV } from "../_core/env";
import { callGeminiText, callGeminiImage, callGeminiTTS } from "../geminiService";
import { transcribeAudio } from "../_core/voiceTranscription";
import { kimiChat, KimiMessage } from "./kimiClient";
import { deepseekChat, DeepSeekMessage } from "./deepseekClient";
import { dashscopeVisionChat } from "./dashscopeVisionClient";
import { recordAiRequestMetadata } from "./requestTelemetry";
import {
  volcGenerateImage,
  isUnsupportedAdaptiveSizeError,
  nearestSupportedAspectRatio,
  AspectRatio,
} from "./volcImageClient";
import { readImageDimensions } from "./imageDimensions";
import { dashscopeTTS, dashscopeASR, resolveAliTtsProfile } from "./aliVoiceClient";
import { invokeMiniMaxText, invokeMiniMaxImage, invokeMiniMaxTTS } from "./minimaxClient";

// ─── 供应商选择（纯函数，便于测试）────────────────────────────────────────────

export interface ProviderKeys {
  deepseek?: boolean;
  moonshot: boolean;
  ark: boolean;
  dashscope: boolean;
  minimax: boolean;
  gemini: boolean;
  forge: boolean;
}

export function currentKeys(): ProviderKeys {
  return {
    deepseek: !!ENV.deepseekApiKey,
    moonshot: !!ENV.moonshotApiKey,
    ark: !!ENV.arkApiKey,
    dashscope: !!ENV.dashscopeApiKey,
    minimax: !!process.env.MINIMAX_API_KEY,
    gemini: !!ENV.geminiTextApiKey,
    forge: !!ENV.forgeApiUrl && !!ENV.forgeApiKey,
  };
}

export function pickFastTextProvider(
  setting: string,
  keys: ProviderKeys,
): "deepseek" | "kimi" | "minimax" | "gemini" {
  if (setting !== "auto") return setting as "deepseek" | "kimi" | "minimax" | "gemini";
  if (keys.deepseek) return "deepseek";
  if (keys.moonshot) return "kimi";
  if (keys.minimax) return "minimax";
  return "gemini";
}

export type FastVisionProvider = "dashscope" | "kimi";

export function pickFastVisionProvider(setting: string, keys: ProviderKeys): FastVisionProvider {
  if (setting === "dashscope" || setting === "kimi") return setting;
  return keys.dashscope ? "dashscope" : "kimi";
}

export function pickTextProvider(setting: string, keys: ProviderKeys): "kimi" | "minimax" | "gemini" {
  if (setting !== "auto") return setting as any;
  if (keys.moonshot) return "kimi";
  if (keys.minimax) return "minimax";
  return "gemini";
}

export function pickImageProvider(setting: string, keys: ProviderKeys): "volc" | "minimax" | "gemini" {
  if (setting !== "auto") return setting as any;
  if (keys.ark) return "volc";
  if (keys.minimax) return "minimax";
  return "gemini";
}

export function pickTtsProvider(setting: string, keys: ProviderKeys): "ali" | "minimax" | "gemini" {
  if (setting !== "auto") return setting as any;
  if (keys.dashscope) return "ali";
  if (keys.minimax) return "minimax";
  return "gemini";
}

export function pickAsrProvider(setting: string, keys: ProviderKeys): "ali" | "forge" {
  if (setting !== "auto") return setting as any;
  if (keys.dashscope) return "ali";
  return "forge";
}

// ─── 工具 ─────────────────────────────────────────────────────────────────────

/** 拉取远程图片转为 data URL（供需要 base64 输入的供应商使用） */
async function fetchAsDataUrl(url: string): Promise<{ dataUrl: string; base64: string; mimeType: string }> {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`图片下载失败（${resp.status}）`);
  const base64 = Buffer.from(await resp.arrayBuffer()).toString("base64");
  const mimeType = resp.headers.get("content-type") ?? "image/jpeg";
  return { dataUrl: `data:${mimeType};base64,${base64}`, base64, mimeType };
}

// ─── 文本/视觉理解 ────────────────────────────────────────────────────────────

export type FastVisionResult = {
  content: string;
  provider: FastVisionProvider;
  model: string;
  fallbackUsed: boolean;
  durationMs: number;
};

/** 低时延视觉理解：DashScope 优先，失败后单次回落 Kimi。 */
export async function aiVisionFast(params: {
  systemPrompt: string;
  userPrompt: string;
  imageUrl: string;
  maxTokens?: number;
}): Promise<FastVisionResult> {
  const startedAt = Date.now();
  const provider = pickFastVisionProvider(ENV.aiVisionFastProvider, currentKeys());

  if (provider === "dashscope") {
    recordAiRequestMetadata("dashscope", ENV.dashscopeVlModel);
    try {
      const content = await dashscopeVisionChat({
        imageUrl: params.imageUrl,
        prompt: `${params.systemPrompt}\n\n${params.userPrompt}`,
        maxTokens: params.maxTokens ?? 180,
      });
      return {
        content,
        provider: "dashscope",
        model: ENV.dashscopeVlModel,
        fallbackUsed: false,
        durationMs: Math.max(0, Date.now() - startedAt),
      };
    } catch (error) {
      console.warn("[AI vision-fast fallback]", {
        from: "dashscope",
        to: "kimi",
        reason: error instanceof Error ? error.name : "unknown",
      });
    }
  }

  recordAiRequestMetadata("kimi", ENV.moonshotModel);
  const { dataUrl } = await fetchAsDataUrl(params.imageUrl);
  const content = await kimiChat({
    messages: [
      { role: "system", text: params.systemPrompt },
      { role: "user", text: params.userPrompt, imageDataUrl: dataUrl },
    ],
    json: true,
    maxTokens: params.maxTokens ?? 180,
  });
  return {
    content,
    provider: "kimi",
    model: ENV.moonshotModel,
    fallbackUsed: provider === "dashscope",
    durationMs: Math.max(0, Date.now() - startedAt),
  };
}

/**
 * 单轮生成（系统提示 + 用户提示，可选图片 URL，可选 JSON 模式）
 * 注意：json=true 时提示词内必须出现 "JSON" 字样（Kimi/MiniMax 的 JSON 模式均要求）
 */
export async function aiChat(params: {
  systemPrompt: string;
  userPrompt: string;
  imageUrl?: string;
  json?: boolean;
  heavy?: boolean;
}): Promise<string> {
  const provider = params.imageUrl
    ? "kimi"
    : pickFastTextProvider(ENV.aiTextFastProvider, currentKeys());

  const textModel = provider === "deepseek"
    ? ENV.deepseekModel
    : provider === "kimi"
      ? (params.heavy ? ENV.moonshotModelHeavy : ENV.moonshotModel)
      : provider === "minimax"
        ? "MiniMax-M2.5-highspeed"
        : ENV.geminiTextModel;
  recordAiRequestMetadata(provider, textModel);

  if (provider === "deepseek") {
    const messages: DeepSeekMessage[] = [
      { role: "system", text: params.systemPrompt },
      { role: "user", text: params.userPrompt },
    ];
    return deepseekChat({ messages, json: params.json });
  }

  if (provider === "kimi") {
    const messages: KimiMessage[] = [{ role: "system", text: params.systemPrompt }];
    if (params.imageUrl) {
      const { dataUrl } = await fetchAsDataUrl(params.imageUrl);
      messages.push({ role: "user", text: params.userPrompt, imageDataUrl: dataUrl });
    } else {
      messages.push({ role: "user", text: params.userPrompt });
    }
    return kimiChat({ messages, json: params.json, heavy: params.heavy });
  }

  if (provider === "minimax") {
    return invokeMiniMaxText({
      systemPrompt: params.systemPrompt,
      userPrompt: params.userPrompt,
      imageUrl: params.imageUrl,
      responseFormat: params.json ? "json" : "text",
    });
  }

  // gemini 遗留链路
  const parts: any[] = [];
  if (params.imageUrl) {
    const { base64, mimeType } = await fetchAsDataUrl(params.imageUrl);
    parts.push({ inlineData: { data: base64, mimeType } });
  }
  parts.push({ text: params.userPrompt });
  return callGeminiText({
    systemInstruction: params.systemPrompt,
    contents: parts,
    ...(params.json ? { responseMimeType: "application/json" } : {}),
  });
}

/** 多轮对话（万花筒等场景），history 为纯文本历史，当前消息可带图片 URL */
export async function aiChatMulti(params: {
  systemPrompt: string;
  history: Array<{ role: "user" | "assistant"; content: string }>;
  message: string;
  imageUrl?: string;
  heavy?: boolean;
}): Promise<string> {
  const provider = params.imageUrl
    ? "kimi"
    : pickFastTextProvider(ENV.aiTextFastProvider, currentKeys());

  const textModel = provider === "deepseek"
    ? ENV.deepseekModel
    : provider === "kimi"
      ? (params.heavy ? ENV.moonshotModelHeavy : ENV.moonshotModel)
      : provider === "minimax"
        ? "MiniMax-M2.5-highspeed"
        : ENV.geminiTextModel;
  recordAiRequestMetadata(provider, textModel);

  if (provider === "deepseek") {
    const messages: DeepSeekMessage[] = [{ role: "system", text: params.systemPrompt }];
    for (const message of params.history) messages.push({ role: message.role, text: message.content });
    messages.push({ role: "user", text: params.message });
    return deepseekChat({ messages });
  }

  if (provider === "kimi") {
    const messages: KimiMessage[] = [{ role: "system", text: params.systemPrompt }];
    for (const m of params.history) messages.push({ role: m.role, text: m.content });
    if (params.imageUrl) {
      const { dataUrl } = await fetchAsDataUrl(params.imageUrl);
      messages.push({ role: "user", text: params.message, imageDataUrl: dataUrl });
    } else {
      messages.push({ role: "user", text: params.message });
    }
    return kimiChat({ messages, heavy: params.heavy });
  }

  if (provider === "minimax") {
    // MiniMax 客户端为单轮封装：将历史拼进提示词
    const historyText = params.history
      .map((m) => `${m.role === "user" ? "用户" : "助手"}：${m.content}`)
      .join("\n");
    return invokeMiniMaxText({
      systemPrompt: params.systemPrompt,
      userPrompt: historyText ? `【对话历史】\n${historyText}\n\n【当前提问】\n${params.message}` : params.message,
      imageUrl: params.imageUrl,
    });
  }

  // gemini 遗留链路（多轮 contents 格式）
  const contents: any[] = params.history.map((m) => ({
    role: m.role === "user" ? "user" : "model",
    parts: [{ text: m.content }],
  }));
  const currentParts: any[] = [];
  if (params.imageUrl) {
    const { base64, mimeType } = await fetchAsDataUrl(params.imageUrl);
    currentParts.push({ inlineData: { data: base64, mimeType } });
  }
  currentParts.push({ text: params.message });
  contents.push({ role: "user", parts: currentParts });
  return callGeminiText({ systemInstruction: params.systemPrompt, contents });
}

// ─── 图像生成/编辑 ────────────────────────────────────────────────────────────

/** 文生图，返回 base64（不含 data: 前缀） */
export async function aiGenerateImage(params: {
  prompt: string;
  aspectRatio?: AspectRatio;
  profile?: "story";
  referenceImageUrl?: string;
}): Promise<string> {
  const provider = pickImageProvider(ENV.aiImageProvider, currentKeys());

  if (params.referenceImageUrl && (params.profile !== "story" || provider !== "volc")) {
    throw new Error("当前图片服务暂不支持照片主角");
  }

  if (provider === "volc") {
    if (params.profile === "story") {
      recordAiRequestMetadata("volc", ENV.arkStoryImageModel);
      return volcGenerateImage({
        prompt: params.prompt,
        aspectRatio: params.aspectRatio,
        model: ENV.arkStoryImageModel,
        size: "1K",
        ...(params.referenceImageUrl ? { imageUrls: [params.referenceImageUrl] } : {}),
      });
    }
    recordAiRequestMetadata("volc", ENV.arkImageModel);
    return volcGenerateImage({ prompt: params.prompt, aspectRatio: params.aspectRatio });
  }
  if (provider === "minimax") {
    recordAiRequestMetadata("minimax", "image-01");
    return invokeMiniMaxImage({ prompt: params.prompt, aspectRatio: params.aspectRatio });
  }
  // gemini 遗留链路
  recordAiRequestMetadata("gemini", ENV.geminiImageModel);
  const dataUrl = await callGeminiImage({
    parts: [{ text: params.prompt }],
    aspectRatio: params.aspectRatio,
  });
  return dataUrl.replace(/^data:.*?;base64,/, "");
}

/** 图生图/修图（照片修复、艺术风格化），imageUrl 需公网可访问，返回 base64 */
export async function aiEditImage(params: {
  prompt: string;
  imageUrl: string;
}): Promise<string> {
  const provider = pickImageProvider(ENV.aiImageProvider, currentKeys());

  if (provider === "volc") {
    recordAiRequestMetadata("volc", ENV.arkImageModel);
    try {
      // Seedream 分辨率档依据参考图自适应画布比例；默认 2K，可由部署配置降至 1.5K。
      return await volcGenerateImage({
        prompt: params.prompt,
        imageUrls: [params.imageUrl],
        size: ENV.arkImageEditSize,
      });
    } catch (error) {
      if (!isUnsupportedAdaptiveSizeError(error)) throw error;
      const response = await fetch(params.imageUrl);
      if (!response.ok) throw new Error(`原图尺寸读取失败（${response.status}）`);
      const dimensions = readImageDimensions(Buffer.from(await response.arrayBuffer()));
      if (!dimensions) throw new Error("无法识别原图尺寸，已停止处理以避免裁切构图");
      return volcGenerateImage({
        prompt: params.prompt,
        imageUrls: [params.imageUrl],
        aspectRatio: nearestSupportedAspectRatio(dimensions.width, dimensions.height),
      });
    }
  }
  // minimax image-01 不支持图生图编辑，降级到 gemini
  recordAiRequestMetadata("gemini", ENV.geminiImageModel);
  const { base64, mimeType } = await fetchAsDataUrl(params.imageUrl);
  const dataUrl = await callGeminiImage({
    parts: [{ inlineData: { data: base64, mimeType } }, { text: params.prompt }],
  });
  return dataUrl.replace(/^data:.*?;base64,/, "");
}

// ─── 语音 ─────────────────────────────────────────────────────────────────────

/** 语音合成，返回 base64 音频与 MIME */
export async function aiTTS(
  text: string,
  voiceType = "lively"
): Promise<{ audioData: string; audioMime: string }> {
  const provider = pickTtsProvider(ENV.aiTtsProvider, currentKeys());

  if (provider === "ali") {
    recordAiRequestMetadata("ali", resolveAliTtsProfile(voiceType).model);
    return dashscopeTTS(text, voiceType);
  }
  if (provider === "minimax") {
    recordAiRequestMetadata("minimax", "speech-02-hd");
    return invokeMiniMaxTTS(text, voiceType);
  }
  recordAiRequestMetadata("gemini", ENV.geminiTtsModel);
  return callGeminiTTS(text, voiceType);
}

/** 语音识别：传入音频 URL，返回转写文本 */
export async function aiASR(audioUrl: string, language = "zh"): Promise<{ text: string }> {
  const provider = pickAsrProvider(ENV.aiAsrProvider, currentKeys());

  if (provider === "ali") {
    recordAiRequestMetadata("ali", ENV.dashscopeAsrModel);
    const text = await dashscopeASR(audioUrl);
    return { text };
  }
  // Manus Forge Whisper 遗留链路
  recordAiRequestMetadata("forge", "whisper");
  const result = await transcribeAudio({ audioUrl, language });
  if ("error" in result) throw new Error(result.error);
  return { text: result.text };
}
