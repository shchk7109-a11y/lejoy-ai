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
import { volcGenerateImage, AspectRatio } from "./volcImageClient";
import { dashscopeTTS, dashscopeASR } from "./aliVoiceClient";
import { invokeMiniMaxText, invokeMiniMaxImage, invokeMiniMaxTTS } from "./minimaxClient";

// ─── 供应商选择（纯函数，便于测试）────────────────────────────────────────────

export interface ProviderKeys {
  moonshot: boolean;
  ark: boolean;
  dashscope: boolean;
  minimax: boolean;
  gemini: boolean;
  forge: boolean;
}

export function currentKeys(): ProviderKeys {
  return {
    moonshot: !!ENV.moonshotApiKey,
    ark: !!ENV.arkApiKey,
    dashscope: !!ENV.dashscopeApiKey,
    minimax: !!process.env.MINIMAX_API_KEY,
    gemini: !!ENV.geminiTextApiKey,
    forge: !!ENV.forgeApiUrl && !!ENV.forgeApiKey,
  };
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
  const base64 = Buffer.from(await resp.arrayBuffer()).toString("base64");
  const mimeType = resp.headers.get("content-type") ?? "image/jpeg";
  return { dataUrl: `data:${mimeType};base64,${base64}`, base64, mimeType };
}

// ─── 文本/视觉理解 ────────────────────────────────────────────────────────────

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
  const provider = pickTextProvider(ENV.aiTextProvider, currentKeys());

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
  const provider = pickTextProvider(ENV.aiTextProvider, currentKeys());

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
}): Promise<string> {
  const provider = pickImageProvider(ENV.aiImageProvider, currentKeys());

  if (provider === "volc") {
    return volcGenerateImage({ prompt: params.prompt, aspectRatio: params.aspectRatio });
  }
  if (provider === "minimax") {
    return invokeMiniMaxImage({ prompt: params.prompt, aspectRatio: params.aspectRatio });
  }
  // gemini 遗留链路
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
    return volcGenerateImage({ prompt: params.prompt, imageUrls: [params.imageUrl], aspectRatio: "1:1" });
  }
  // minimax image-01 不支持图生图编辑，降级到 gemini
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

  if (provider === "ali") return dashscopeTTS(text, voiceType);
  if (provider === "minimax") return invokeMiniMaxTTS(text, voiceType);
  return callGeminiTTS(text, voiceType);
}

/** 语音识别：传入音频 URL，返回转写文本 */
export async function aiASR(audioUrl: string, language = "zh"): Promise<{ text: string }> {
  const provider = pickAsrProvider(ENV.aiAsrProvider, currentKeys());

  if (provider === "ali") {
    const text = await dashscopeASR(audioUrl);
    return { text };
  }
  // Manus Forge Whisper 遗留链路
  const result = await transcribeAudio({ audioUrl, language });
  if ("error" in result) throw new Error(result.error);
  return { text: result.text };
}
