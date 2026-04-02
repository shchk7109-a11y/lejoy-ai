/**
 * AI Service Layer - Unified AI proxy with dynamic model configuration
 * Supports: Google Proxy (Gemini), Kimi (Moonshot), MiniMax
 */
import { invokeLLM, type Message } from "./_core/llm";
import { generateImage as builtinGenerateImage } from "./_core/imageGeneration";
import { storagePut } from "./storage";
import { getModelConfig, getUserApiConfig } from "./db";
import { getDevSystemModelConfig } from "./_core/dev";
import { VOICE_OPTIONS, type VoiceType } from "@shared/appTypes";
import { nanoid } from "nanoid";

// ─── Helper: Get effective config (user override > system default) ───

async function getEffectiveConfig(configKey: string, userId?: number) {
  const systemConfig = (await getModelConfig(configKey)) ?? getDevSystemModelConfig(configKey);
  if (userId) {
    const userConfig = await getUserApiConfig(userId, configKey);
    if (userConfig?.apiKey) {
      return {
        modelName: userConfig.modelName || systemConfig?.modelName || "",
        apiKey: userConfig.apiKey,
        baseUrl: userConfig.baseUrl || systemConfig?.baseUrl || "",
        provider: systemConfig?.provider || "google_proxy",
      };
    }
  }
  return systemConfig ? {
    modelName: systemConfig.modelName,
    apiKey: systemConfig.apiKey || "",
    baseUrl: systemConfig.baseUrl || "",
    provider: systemConfig.provider,
  } : null;
}

// ─── Text Generation (uses built-in LLM or external API) ────

export async function generateText(
  prompt: string,
  options: {
    systemPrompt?: string;
    responseJson?: boolean;
    imageBase64?: string;
    userId?: number;
  } = {}
): Promise<string> {
  const { systemPrompt, responseJson, imageBase64, userId } = options;

  // Try external config first
  const config = await getEffectiveConfig("text_generation", userId);
  if (config?.apiKey) {
    return callExternalLLM(config, prompt, { systemPrompt, responseJson, imageBase64 });
  }

  // Fallback to built-in LLM
  const messages: Message[] = [];
  if (systemPrompt) {
    messages.push({ role: "system", content: systemPrompt });
  }

  if (imageBase64) {
    messages.push({
      role: "user",
      content: [
        { type: "image_url", image_url: { url: imageBase64, detail: "high" } },
        { type: "text", text: prompt },
      ],
    });
  } else {
    messages.push({ role: "user", content: prompt });
  }

  const result = await invokeLLM({
    messages,
    ...(responseJson ? {
      response_format: { type: "json_object" as const },
    } : {}),
  });

  return typeof result.choices[0]?.message?.content === "string"
    ? result.choices[0].message.content
    : JSON.stringify(result.choices[0]?.message?.content);
}

// ─── Vision/Image Processing (Gemini vision) ────────────────

export async function processImage(
  imageBase64: string,
  prompt: string,
  options: { userId?: number; responseJson?: boolean } = {}
): Promise<string> {
  const config = await getEffectiveConfig("image_processing", options.userId);
  if (config?.apiKey) {
    return callExternalLLM(config, prompt, { imageBase64, responseJson: options.responseJson });
  }

  // Fallback to built-in
  const messages: Message[] = [{
    role: "user",
    content: [
      { type: "image_url", image_url: { url: imageBase64, detail: "high" } },
      { type: "text", text: prompt },
    ],
  }];

  const result = await invokeLLM({
    messages,
    ...(options.responseJson ? { response_format: { type: "json_object" as const } } : {}),
  });

  return typeof result.choices[0]?.message?.content === "string"
    ? result.choices[0].message.content
    : JSON.stringify(result.choices[0]?.message?.content);
}

// ─── Image Generation (MiniMax or built-in) ─────────────────

export async function generateImage(
  prompt: string,
  options: {
    referenceBase64?: string;
    aspectRatio?: string;
    userId?: number;
  } = {}
): Promise<string> {
  const config = await getEffectiveConfig("image_generation", options.userId);

  if (config?.apiKey) {
    // Use MiniMax image generation API
    // MiniMax API accepts response_format: "url" or "base64" (NOT "b64_json")
    // Response: data.image_urls[] (for url) or data.image_base64[] (for base64) - both are arrays
    const body: any = {
      model: config.modelName || "image-01",
      prompt,
      aspect_ratio: options.aspectRatio || "1:1",
      response_format: "url",
      n: 1,
      prompt_optimizer: true,
    };

    if (options.referenceBase64) {
      const base64Data = options.referenceBase64.replace(/^data:[^;]+;base64,/, "");
      body.subject_reference = [{ type: "character", image_file: base64Data }];
    }

    const baseUrl = config.baseUrl.replace(/\/$/, "");
    const res = await fetch(`${baseUrl}/image_generation`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      console.warn(`[ImageGen] 外部API返回错误 (${res.status}): ${errText}，尝试Gemini回退`);
      // Try Gemini fallback first
      const geminiResult2 = await generateImageWithGemini(prompt, options);
      if (geminiResult2) return geminiResult2;
      return fallbackToBuiltinImage(prompt, options);
    }
    const json = await res.json();

    // Check base_resp for API-level errors
    if (json.base_resp?.status_code !== 0) {
      const errMsg = json.base_resp?.status_msg || "未知错误";
      console.warn(`[ImageGen] 外部API返回业务错误: ${errMsg}，尝试Gemini回退`);
      // Try Gemini fallback first
      const geminiResult3 = await generateImageWithGemini(prompt, options);
      if (geminiResult3) return geminiResult3;
      return fallbackToBuiltinImage(prompt, options);
    }

    // MiniMax returns data.image_urls[] (array) for url format
    // or data.image_base64[] (array) for base64 format
    const imageUrl = json.data?.image_urls?.[0];
    const imageBase64 = json.data?.image_base64?.[0];

    if (imageUrl) {
      // Use MiniMax URL directly for speed (valid 24h, sufficient for reading + export)
      // Background: re-upload to R2 for persistence
      (async () => {
        try {
          const imgRes = await fetch(imageUrl);
          if (imgRes.ok) {
            const imgBuffer = Buffer.from(await imgRes.arrayBuffer());
            const contentType = imgRes.headers.get("content-type") || "image/jpeg";
            const ext = contentType.includes("png") ? "png" : "jpg";
            await storagePut(`images/${nanoid()}.${ext}`, imgBuffer, contentType);
          }
        } catch (e) {
          console.warn("[ImageGen] Background re-upload failed:", e);
        }
      })();
      return imageUrl; // Return immediately, don't wait for upload
    }

    if (imageBase64) {
      const buffer = Buffer.from(imageBase64, "base64");
      const { url } = await storagePut(`images/${nanoid()}.jpg`, buffer, "image/jpeg");
      return url;
    }

    // External API returned success but no image data - try Gemini then built-in
    console.warn(`[ImageGen] 外部API返回成功但图片数据为空，尝试Gemini回退`);
    const geminiResult1 = await generateImageWithGemini(prompt, options);
    if (geminiResult1) return geminiResult1;
    return fallbackToBuiltinImage(prompt, options);
  }

  // No MiniMax config - try Gemini first, then built-in
  const geminiResult = await generateImageWithGemini(prompt, options);
  if (geminiResult) return geminiResult;
  return fallbackToBuiltinImage(prompt, options);
}

// ─── Gemini Image Generation (via Google proxy) ────────────

async function generateImageWithGemini(
  prompt: string,
  options: { referenceBase64?: string; aspectRatio?: string; userId?: number } = {}
): Promise<string | null> {
  // Reuse text_generation config (same Google proxy base URL and API key)
  const textConfig = await getEffectiveConfig("text_generation", options.userId);
  if (!textConfig?.apiKey || !textConfig?.baseUrl) {
    console.log("[ImageGen-Gemini] 未配置text_generation，跳过Gemini图像生成");
    return null;
  }

  try {
    // Build Gemini native API URL from the proxy base URL
    // The proxy base URL is like: https://api.gdoubolai.com/v1
    // We need: https://api.gdoubolai.com/v1beta/models/gemini-3.1-flash-image-preview:generateContent
    const rawBase = textConfig.baseUrl.replace(/\/$/, "");
    // Remove trailing /v1, /v1beta, etc. to get the root proxy URL
    const proxyRoot = rawBase.replace(/\/v1(beta)?$/, "");
    const geminiUrl = `${proxyRoot}/v1beta/models/gemini-3.1-flash-image-preview:generateContent`;

    // Build request parts - reference image FIRST for better subject consistency
    const parts: any[] = [];

    // Add reference image BEFORE text prompt (Gemini processes images better when they come first)
    if (options.referenceBase64) {
      const base64Data = options.referenceBase64.replace(/^data:[^;]+;base64,/, "");
      parts.push({
        inlineData: {
          mimeType: "image/jpeg",
          data: base64Data,
        },
      });
      // Enhance prompt with strong subject consistency instructions for Gemini
      const consistencyPrefix = "[CRITICAL INSTRUCTION] This is a reference photo. You MUST preserve the EXACT same person in the output: same face, same facial features, same skin tone, same body proportions, same pose. Do NOT change the person's appearance in any way. Only apply the requested modifications to the image style/quality. ";
      parts.push({ text: consistencyPrefix + prompt });
    } else {
      parts.push({ text: prompt });
    }

    const body = {
      contents: [{ parts }],
      generationConfig: {
        responseModalities: ["TEXT", "IMAGE"],
      },
    };

    console.log(`[ImageGen-Gemini] 调用Gemini图像生成: ${geminiUrl}`);
    const res = await fetch(geminiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        // Google API uses x-goog-api-key header, but proxies often accept both
        // Try Bearer token first (OpenAI proxy style), also set x-goog-api-key
        Authorization: `Bearer ${textConfig.apiKey}`,
        "x-goog-api-key": textConfig.apiKey,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      console.warn(`[ImageGen-Gemini] API返回错误 (${res.status}): ${errText.substring(0, 300)}`);
      return null;
    }

    const json = await res.json();

    // Parse Gemini response: candidates[0].content.parts[] -> find inlineData
    const candidates = json.candidates;
    if (!candidates?.length) {
      console.warn("[ImageGen-Gemini] 响应中无candidates");
      return null;
    }

    const responseParts = candidates[0]?.content?.parts || [];
    for (const part of responseParts) {
      if (part.inlineData?.data) {
        // Got base64 image data, upload to S3
        const mimeType = part.inlineData.mimeType || "image/png";
        const ext = mimeType.includes("jpeg") || mimeType.includes("jpg") ? "jpg" : "png";
        const buffer = Buffer.from(part.inlineData.data, "base64");
        const { url } = await storagePut(`images/${nanoid()}.${ext}`, buffer, mimeType);
        console.log(`[ImageGen-Gemini] 图像生成成功，已上传到S3`);
        return url;
      }
    }

    console.warn("[ImageGen-Gemini] 响应中未找到图像数据");
    return null;
  } catch (err: any) {
    console.warn(`[ImageGen-Gemini] 调用失败: ${err.message}`);
    return null;
  }
}

/** Fallback to built-in image generation service */
async function fallbackToBuiltinImage(
  prompt: string,
  options: { referenceBase64?: string; aspectRatio?: string; userId?: number } = {}
): Promise<string> {
  const result = await builtinGenerateImage({
    prompt,
    originalImages: options.referenceBase64 ? [{
      b64Json: options.referenceBase64.replace(/^data:[^;]+;base64,/, ""),
      mimeType: "image/jpeg",
    }] : undefined,
  });

  return result.url || "";
}

// ─── TTS (MiniMax speech-02-hd) ─────────────────────────────

const TTS_REQUEST_TIMEOUT_MS = 30_000;
const TTS_DOWNLOAD_TIMEOUT_MS = 20_000;

type TtsAudioSource = "binary" | "hex" | "base64" | "remote_url";

export type GeneratedSpeechResult = {
  audioUrl: string;
  mimeType: string;
  format: string;
  byteLength: number;
  modelUsed: string;
  provider: "minimax";
  source: TtsAudioSource;
};

type TtsRuntimeConfig = {
  modelName?: string;
  apiKey: string;
  baseUrl: string;
};

export type TtsHealthCheckResult = GeneratedSpeechResult & {
  ok: true;
  latencyMs: number;
  checkedAt: string;
  sampleText: string;
  voiceType: VoiceType;
  warnings: string[];
};

function buildTtsModelFallbacks(modelName?: string): string[] {
  const configuredModel = modelName || "speech-2.8-hd";
  const modelFallbacks = [configuredModel];
  for (const fb of ["speech-2.8-hd", "speech-2.8-turbo", "speech-2.6-hd", "speech-2.6-turbo", "speech-02-hd", "speech-02-turbo"]) {
    if (!modelFallbacks.includes(fb)) modelFallbacks.push(fb);
  }
  return modelFallbacks;
}

async function generateSpeechWithConfig(
  config: TtsRuntimeConfig,
  text: string,
  voiceOption: (typeof VOICE_OPTIONS)[number]
): Promise<GeneratedSpeechResult> {
  const modelFallbacks = buildTtsModelFallbacks(config.modelName);
  let lastError = "";

  for (const model of modelFallbacks) {
    try {
      return await callMiniMaxTTS(config, model, text, voiceOption);
    } catch (e: any) {
      lastError = e.message || "Unknown TTS error";
      const isModelError = lastError.includes("not support model") || lastError.includes("model");
      console.warn(`[TTS] 模型 ${model} 失败: ${lastError}`);
      if (!isModelError) {
        throw e;
      }
    }
  }

  throw new Error(`语音合成失败，所有模型均不可用: ${lastError}`);
}

export async function generateSpeech(
  text: string,
  voiceType: VoiceType = "sweet",
  userId?: number
): Promise<GeneratedSpeechResult> {
  const config = await getEffectiveConfig("tts", userId);
  const voiceOption = VOICE_OPTIONS.find(v => v.id === voiceType) || VOICE_OPTIONS[0];

  if (config?.apiKey && config.baseUrl) {
    return generateSpeechWithConfig(config, text, voiceOption);
  }

  throw new Error("语音合成服务未配置完整，请在管理后台检查 TTS 的 API Key 与 Base URL");
}

export async function testTtsConfigHealth(
  config: TtsRuntimeConfig,
  options: { sampleText?: string; voiceType?: VoiceType } = {}
): Promise<TtsHealthCheckResult> {
  const sampleText = options.sampleText?.trim() || "这是乐享AI的语音服务健康检查。";
  if (!config.apiKey?.trim()) {
    throw new Error("TTS API Key 未配置，无法执行健康检查");
  }
  if (!config.baseUrl?.trim()) {
    throw new Error("TTS Base URL 未配置，无法执行健康检查");
  }
  if (!sampleText) {
    throw new Error("健康检查文本不能为空");
  }

  const voiceType = options.voiceType || "grandma";
  const voiceOption = VOICE_OPTIONS.find(v => v.id === voiceType) || VOICE_OPTIONS[0];
  const startedAt = Date.now();
  const result = await generateSpeechWithConfig({
    ...config,
    apiKey: config.apiKey.trim(),
    baseUrl: config.baseUrl.trim(),
    modelName: config.modelName?.trim() || undefined,
  }, sampleText, voiceOption);

  const warnings: string[] = [];
  const requestedModel = config.modelName?.trim() || "speech-02";
  if (result.modelUsed !== requestedModel) {
    warnings.push(`已自动回退到模型 ${result.modelUsed}`);
  }
  if (result.source === "remote_url") {
    warnings.push("本次检测返回的是远程音频地址，系统已自动下载后再上传存储");
  }
  if (result.byteLength < 8 * 1024) {
    warnings.push("返回音频体积较小，建议人工试听确认音质");
  }

  return {
    ...result,
    ok: true,
    latencyMs: Date.now() - startedAt,
    checkedAt: new Date().toISOString(),
    sampleText,
    voiceType,
    warnings,
  };
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (error: any) {
    if (error?.name === "AbortError") {
      throw new Error(`语音服务请求超时（${Math.round(timeoutMs / 1000)}秒）`);
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

function normalizeAudioMimeType(value?: string | null): string {
  const mimeType = value?.split(";")[0]?.trim().toLowerCase() || "";
  return mimeType.startsWith("audio/") ? mimeType : "";
}

function normalizeBase64(value: string): string {
  const normalized = value.replace(/\s+/g, "");
  const remainder = normalized.length % 4;
  return remainder === 0 ? normalized : normalized.padEnd(normalized.length + (4 - remainder), "=");
}

function isLikelyHex(value: string): boolean {
  const normalized = value.replace(/\s+/g, "");
  return normalized.length >= 32 && normalized.length % 2 === 0 && /^[0-9a-fA-F]+$/.test(normalized);
}

function isLikelyBase64(value: string): boolean {
  const normalized = value.replace(/\s+/g, "");
  return normalized.length >= 32 && /^[A-Za-z0-9+/]+={0,2}$/.test(normalized);
}

function detectAudioMimeType(buffer: Buffer, hintedMimeType?: string | null): string {
  const hint = normalizeAudioMimeType(hintedMimeType);
  if (buffer.subarray(0, 3).toString("ascii") === "ID3") return "audio/mpeg";
  if (buffer.length >= 2 && buffer[0] === 0xff && (buffer[1] & 0xe0) === 0xe0) return "audio/mpeg";
  if (buffer.subarray(0, 4).toString("ascii") === "RIFF") return "audio/wav";
  if (buffer.subarray(0, 4).toString("ascii") === "OggS") return "audio/ogg";
  if (buffer.subarray(0, 4).toString("ascii") === "fLaC") return "audio/flac";
  if (buffer.subarray(4, 8).toString("ascii") === "ftyp") return "audio/mp4";
  return hint;
}

function inferAudioFormat(mimeType: string): string {
  if (mimeType.includes("mpeg") || mimeType.includes("mp3")) return "mp3";
  if (mimeType.includes("wav")) return "wav";
  if (mimeType.includes("ogg")) return "ogg";
  if (mimeType.includes("flac")) return "flac";
  if (mimeType.includes("mp4") || mimeType.includes("aac")) return "m4a";
  return "mp3";
}

function inferAudioExtension(mimeType: string): string {
  const format = inferAudioFormat(mimeType);
  return format === "m4a" ? "m4a" : format;
}

function isLikelyPlayableAudioBuffer(buffer: Buffer, mimeType: string): boolean {
  if (buffer.length < 256) return false;
  const preview = buffer.subarray(0, 32).toString("utf8").trimStart();
  if (preview.startsWith("{") || preview.startsWith("<")) return false;

  if (mimeType === "audio/mpeg") {
    return buffer.subarray(0, 3).toString("ascii") === "ID3" ||
      (buffer.length >= 2 && buffer[0] === 0xff && (buffer[1] & 0xe0) === 0xe0);
  }
  if (mimeType === "audio/wav") return buffer.subarray(0, 4).toString("ascii") === "RIFF";
  if (mimeType === "audio/ogg") return buffer.subarray(0, 4).toString("ascii") === "OggS";
  if (mimeType === "audio/flac") return buffer.subarray(0, 4).toString("ascii") === "fLaC";
  if (mimeType === "audio/mp4") return buffer.subarray(4, 8).toString("ascii") === "ftyp";
  return mimeType.startsWith("audio/");
}

async function downloadRemoteAudio(url: string): Promise<{ buffer: Buffer; mimeType: string }> {
  const response = await fetchWithTimeout(url, { method: "GET" }, TTS_DOWNLOAD_TIMEOUT_MS);
  if (!response.ok) {
    const errText = await response.text().catch(() => "");
    throw new Error(`语音资源下载失败 (${response.status}): ${errText.slice(0, 200)}`);
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  const mimeType = detectAudioMimeType(buffer, response.headers.get("content-type")) || "audio/mpeg";
  return { buffer, mimeType };
}

async function resolveJsonAudioPayload(payload: any): Promise<{ buffer: Buffer; mimeType: string; source: TtsAudioSource }> {
  const hintedMimeType = payload?.data?.mime_type || payload?.data?.content_type || payload?.mime_type || payload?.content_type;
  const directUrl = payload?.data?.audio_url || payload?.audio_url;
  const inlineAudio = payload?.data?.audio || payload?.audio;

  if (typeof directUrl === "string" && /^https?:\/\//i.test(directUrl.trim())) {
    const downloaded = await downloadRemoteAudio(directUrl.trim());
    return { ...downloaded, source: "remote_url" };
  }

  if (typeof inlineAudio !== "string" || !inlineAudio.trim()) {
    throw new Error("语音合成返回无音频数据");
  }

  const trimmed = inlineAudio.trim();
  if (/^https?:\/\//i.test(trimmed)) {
    const downloaded = await downloadRemoteAudio(trimmed);
    return { ...downloaded, source: "remote_url" };
  }

  const dataUrlMatch = trimmed.match(/^data:([^;,]+);base64,(.+)$/i);
  if (dataUrlMatch) {
    return {
      buffer: Buffer.from(normalizeBase64(dataUrlMatch[2]), "base64"),
      mimeType: normalizeAudioMimeType(dataUrlMatch[1]) || "audio/mpeg",
      source: "base64",
    };
  }

  if (isLikelyHex(trimmed)) {
    return {
      buffer: Buffer.from(trimmed.replace(/\s+/g, ""), "hex"),
      mimeType: normalizeAudioMimeType(hintedMimeType) || "audio/mpeg",
      source: "hex",
    };
  }

  if (isLikelyBase64(trimmed)) {
    return {
      buffer: Buffer.from(normalizeBase64(trimmed), "base64"),
      mimeType: normalizeAudioMimeType(hintedMimeType) || "audio/mpeg",
      source: "base64",
    };
  }

  throw new Error("语音合成返回了无法识别的音频编码");
}

// Internal helper: call MiniMax TTS with a specific model
async function callMiniMaxTTS(
  config: { apiKey: string; baseUrl: string },
  model: string,
  text: string,
  voiceOption: (typeof VOICE_OPTIONS)[number]
): Promise<GeneratedSpeechResult> {
  const body = {
    model,
    text,
    voice_setting: {
      voice_id: voiceOption.voiceId,
      speed: 0.9,
      vol: 1.0,
      pitch: 0,
    },
    audio_setting: {
      sample_rate: 32000,
      bitrate: 128000,
      format: "mp3",
    },
  };

  const baseUrl = config.baseUrl.replace(/\/+$/, "");
  const res = await fetchWithTimeout(`${baseUrl}/t2a_v2`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify(body),
  }, TTS_REQUEST_TIMEOUT_MS);

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`语音合成失败 (${res.status}): ${errText.slice(0, 200)}`);
  }

  const contentType = res.headers.get("content-type") || "";
  let buffer: Buffer;
  let mimeType: string;
  let source: TtsAudioSource;

  if (contentType.includes("application/json")) {
    const json = await res.json();
    if (json.base_resp?.status_code !== 0) {
      throw new Error(`语音合成API错误: ${json.base_resp?.status_msg || "未知错误"}`);
    }
    const payload = await resolveJsonAudioPayload(json);
    buffer = payload.buffer;
    mimeType = detectAudioMimeType(payload.buffer, payload.mimeType) || payload.mimeType;
    source = payload.source;
  } else {
    buffer = Buffer.from(await res.arrayBuffer());
    mimeType = detectAudioMimeType(buffer, contentType) || "audio/mpeg";
    source = "binary";
  }

  if (!isLikelyPlayableAudioBuffer(buffer, mimeType)) {
    throw new Error(`语音合成返回了不可播放的音频数据，当前识别格式为 ${mimeType || "unknown"}`);
  }

  const ext = inferAudioExtension(mimeType);
  const { url } = await storagePut(`audio/${nanoid()}.${ext}`, buffer, mimeType);

  return {
    audioUrl: url,
    mimeType,
    format: inferAudioFormat(mimeType),
    byteLength: buffer.length,
    modelUsed: model,
    provider: "minimax",
    source,
  };
}

// ─── External LLM call (OpenAI-compatible API) ──────────────

async function callExternalLLM(
  config: { modelName: string; apiKey: string; baseUrl: string; provider: string },
  prompt: string,
  options: { systemPrompt?: string; responseJson?: boolean; imageBase64?: string } = {}
): Promise<string> {
  const messages: any[] = [];

  if (options.systemPrompt) {
    messages.push({ role: "system", content: options.systemPrompt });
  }

  if (options.imageBase64) {
    messages.push({
      role: "user",
      content: [
        { type: "image_url", image_url: { url: options.imageBase64 } },
        { type: "text", text: prompt },
      ],
    });
  } else {
    messages.push({ role: "user", content: prompt });
  }

  const body: any = {
    model: config.modelName,
    messages,
    max_tokens: 4096,
  };

  if (options.responseJson) {
    body.response_format = { type: "json_object" };
  }

  const baseUrl = config.baseUrl.replace(/\/$/, "");
  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`AI服务调用失败 (${res.status}): ${errText}`);
  }

  const json = await res.json();
  return json.choices?.[0]?.message?.content || "";
}

// ─── Convenience wrappers for each module ────────────────────

/** Clean JSON from AI response */
export function cleanJson(text: string): string {
  if (!text) return "{}";
  const first = text.indexOf("{");
  const last = text.lastIndexOf("}");
  if (first !== -1 && last > first) return text.substring(first, last + 1);
  // Try array
  const firstArr = text.indexOf("[");
  const lastArr = text.lastIndexOf("]");
  if (firstArr !== -1 && lastArr > firstArr) return text.substring(firstArr, lastArr + 1);
  return text.replace(/```json\n?|\n?```/g, "").trim();
}

/** Truncate a wish/copywriting text to max 200 chars at sentence boundary */
export function truncateWish(w: string): string {
  const trimmed = w.trim();
  if (trimmed.length <= 200) return trimmed;
  const sub = trimmed.substring(0, 200);
  const lastPuncIdx = Math.max(
    sub.lastIndexOf('\u3002'),  // 。
    sub.lastIndexOf('\uff01'),  // ！
    sub.lastIndexOf('\uff1f'),  // ？
    sub.lastIndexOf('~')
  );
  if (lastPuncIdx > 30) return sub.substring(0, lastPuncIdx + 1);
  return sub;
}

/** 老摄影大师 — 照片美化/修复 */
export async function restorePhoto(imageBase64: string, userPrompt: string, userId?: number): Promise<string> {
  const subjectLock = "【主体一致性红线】输出图片必须是同一个人，严禁改变人物的脸型、五官、眉毛、眼睛、鼻子、嘴巴、肤色、发型、发色、体型、姿态。只允许修改画面质量和风格，不允许修改人物本身的任何特征。";
  const prompt = userPrompt
    ? `对这张照片进行如下处理：${userPrompt}。${subjectLock}高质量输出。`
    : `提升照片清晰度、光线和色彩平衡，保持自然风格。${subjectLock}`;
  return generateImage(prompt, { referenceBase64: imageBase64, userId });
}

/** 老摄影大师 — 老照片修复 */
export async function restoreOldPhoto(imageBase64: string, userId?: number): Promise<string> {
  return generateImage(
    "修复这张老照片：去除划痕和污渍，如果是黑白照片则智能上色还原真实色彩，提升清晰度。【主体一致性红线】输出图片必须是同一个人，严禁改变人物的脸型、五官、眉毛、眼睛、鼻子、嘴巴、肤色、发型、发色、体型、姿态。只允许修复画质问题，不允许修改人物本身的任何特征。",
    { referenceBase64: imageBase64, userId }
  );
}

/** 老摄影大师 — 艺术风格转换 */
export async function transformPhotoToArt(imageBase64: string, style: string, userId?: number): Promise<string> {
  return generateImage(
    `将这张照片转换为${style}风格的艺术作品。强烈体现${style}艺术风格。【主体一致性红线】输出图片必须是同一个人，严禁改变人物的脸型、五官、眉毛、眼睛、鼻子、嘴巴、肤色、发型、发色、体型、姿态。只允许改变艺术风格和画面质感，不允许修改人物本身的任何特征。`,
    { referenceBase64: imageBase64, userId }
  );
}

/** 暖心文案 — 生成祝福语 */
export async function generateWishes(data: {
  scenario: string; relationship: string; recipientName: string;
  tone: string; specificHoliday: string; customContext: string;
}, userId?: number): Promise<string[]> {
  const context = `场景:${data.scenario || "通用"} 对象:${data.relationship} 收信人:${data.recipientName} 语气:${data.tone} 节日:${data.specificHoliday} 补充:${data.customContext}`;

  const prompt = `请作为情感细腻、文笔优美的中文文案大师，为用户生成3条不同风格的祝福文案。

上下文信息：${context}

创作要求：
1. 每条文案控制在50-150字以内，简短精炼，适合微信发送或发朋友圈
2. 情感真挚自然，避免空洞套话和网络用语
3. 用词考究，可适当使用比喻、排比等修辞手法
4. 符合中老年人的表达习惯和审美偏好
5. 三条文案风格各异，给用户充分选择空间
6. 如果是朋友圈文案，语气更随意自然，可配合表情符号

返回格式：JSON数组，只含3个字符串，不要其他内容。`;

  const result = await generateText(prompt, { responseJson: true, userId });
  const wishes: string[] = JSON.parse(cleanJson(result));
  return wishes.map(truncateWish);
}

/** AI故事会 — 生成故事结构 */
export async function generateStoryStructure(params: {
  childName: string; age: string; topic: string; theme: string; pageCount: number;
}, userId?: number) {
  const prompt = `你是一位专业的儿童故事作家。请为${params.age}岁的${params.childName}创作一个精彩的儿童故事。

故事主题：${params.topic}
故事风格：${params.theme}
页数要求：恰好${params.pageCount}页

创作要求：
1. 故事结构完整，有开头、发展、高潮、结局
2. 语言生动有趣，适合${params.age}岁儿童理解
3. 包含正面的教育意义
4. 每页文字控制在80-120字，适合朗读
5. 主角名字为"${params.childName}"，贯穿全文

【关键要求】为每页提供详细的英文配图描述(imagePrompt)，必须包含主角的完整外观描述（年龄、性别、发型、服装颜色和样式、体型特征），确保每页配图中主角形象完全一致。

返回严格的JSON格式：
{
  "title": "故事标题",
  "characterDescription": "主角的详细外观描述（英文，用于保持配图一致性）",
  "pages": [
    {
      "pageNumber": 1,
      "text": "中文故事内容",
      "imagePrompt": "Children's book illustration, warm and cute style. [主角完整外观描述]. [本页场景描述]"
    }
  ]
}`;

  const result = await generateText(prompt, { responseJson: true, userId });
  return JSON.parse(cleanJson(result));
}

/** 生活助手 — 多模态内容分析 */
export async function analyzeContent(
  mode: "FOOD" | "PLANT" | "HEALTH",
  textHint: string,
  imageBase64: string | null,
  userId?: number
) {
  // 统一健康评分标准说明（FOOD和HEALTH共享）
  const healthScoreGuide = `
【健康评分标准（0-100分）】请严格按照以下标准评分，确保同一道菜在不同模式下评分一致：
- 90-100分：天然健康食材，低油低盐低糖，富含营养（如蒸鱼、沙拉、水果）
- 75-89分：较健康，营养均衡，烹饪方式适中（如炖汤、清炒蔬菜、烤鸡胸）
- 60-74分：一般健康，有一定油盐糖但不过量（如红烧肉、糖醋排骨、炒饭）
- 40-59分：不太健康，高油高盐或高糖（如炸鸡、烧烤、奶油蛋糕）
- 0-39分：不健康，极高油盐糖或含有害成分（如油炸食品、腌制食品）
评分时请综合考虑：食材本身营养价值、烹饪方式（蒸>煮>炖>炒>煎>炸）、调味料用量。
营养数据请基于每100克标准份量计算，使用中文单位如"142千卡/100克"、"17.2克/100克"等格式。`;

  const systemPrompts = {
    FOOD: `你是一位米其林级别的大厨和美食专家。请识别菜品并提供详细食谱。
返回JSON格式：{"title":"菜名","description":"菜品介绍（50字以内）","ingredients":["猪五花肉 500克","生抽 2汤匙","老抽 1汤匙","冰糖 30克"],"details":["步骤1：具体操作","步骤2：具体操作"],"tags":["家常菜","下饭菜"],"advice":"烹饪小贴士"}
【重要】
1. 食材清单必须写清每种原料的具体用量（如“猪五花肉 500克”、“生抽 2汤匙”、“姜 3片”）
2. 烹饪步骤要详细具体，包含火候、时间、技巧
3. 不要包含营养成分分析表和健康评分，这些属于“美食健康指数”功能
4. 所有内容必须使用中文，标签使用中文短语`,

    PLANT: `\u4f60\u662f\u4e00\u4f4d\u4e16\u754c\u7ea7\u690d\u7269\u5206\u7c7b\u5b66\u5bb6\u3002\u8bf7\u4ece\u56fe\u7247\u4e2d\u4ed4\u7ec6\u89c2\u5bdf\u690d\u7269\u7684\u53f6\u7247\u5f62\u72b6\u3001\u82b1\u74e3\u7ed3\u6784\u3001\u82b1\u854a\u3001\u679d\u5e72\u3001\u6811\u76ae\u7b49\u5173\u952e\u7279\u5f81\u8fdb\u884c\u51c6\u786e\u9274\u5b9a\u3002
\u3010\u8bc6\u522b\u8981\u6c42\u3011\u8bf7\u7279\u522b\u6ce8\u610f\u533a\u5206\u5916\u89c2\u76f8\u4f3c\u7684\u690d\u7269\uff1a
- \u5e7f\u7389\u5170\uff08\u8377\u82b1\u7389\u5170\uff09vs \u7389\u5170\uff1a\u5e7f\u7389\u5170\u82b1\u5927\u767d\u8272\u3001\u53f6\u539a\u9769\u8d28\u3001\u5e38\u7eff\u4e54\u6728\uff1b\u7389\u5170\u82b1\u8f83\u5c0f\u3001\u843d\u53f6\u4e54\u6728
- \u541b\u5b50\u5170 vs \u5176\u4ed6\u5170\u79d1\uff1a\u541b\u5b50\u5170\u662f\u8349\u672c\u690d\u7269\u3001\u53f6\u7247\u5e26\u72b6\u5bf9\u751f\u3001\u6a59\u7ea2\u8272\u82b1
- \u6708\u5b63 vs \u73ab\u7470\uff1a\u89c2\u5bdf\u53f6\u7247\u5149\u6cfd\u5ea6\u548c\u82b1\u578b
- \u6a31\u82b1 vs \u6843\u82b1 vs \u674e\u82b1\uff1a\u89c2\u5bdf\u82b1\u74e3\u5f62\u72b6\u548c\u5f00\u82b1\u65b9\u5f0f
\u8fd4\u56deJSON\u683c\u5f0f\uff1a{"title":"\u690d\u7269\u4e2d\u6587\u540d","description":"\u690d\u7269\u4ecb\u7ecd","scientificName":"\u62c9\u4e01\u5b66\u540d","family":"\u79d1\u5c5e","flowerLanguage":"\u82b1\u8bed\u4e0e\u5bd3\u610f","culturalMeaning":"\u6587\u5316\u542b\u4e49\u4e0e\u8c61\u5f81","details":["\u517b\u62a4\u8981\u70b91","\u517b\u62a4\u8981\u70b92"],"tags":["\u6807\u7b7e"],"advice":"\u517b\u62a4\u5efa\u8bae"}
\u3010\u91cd\u8981\u3011\u8bc6\u82b1\u65f6\u5fc5\u987b\u63d0\u4f9b\u8be6\u7ec6\u7684\u82b1\u8bed\u5bd3\u610f\u548c\u6587\u5316\u542b\u4e49\u3002\u5982\u679c\u4e0d\u786e\u5b9a\uff0c\u8bf7\u5217\u51fa\u6700\u53ef\u80fd\u76842-3\u4e2a\u5019\u9009\u5e76\u8bf4\u660e\u5224\u65ad\u4f9d\u636e\u3002\u6240\u6709\u5185\u5bb9\u5fc5\u987b\u4f7f\u7528\u4e2d\u6587\u3002`,

    HEALTH: `你是一位专业营养师和慢病管理专家。请分析食品的营养成分和健康影响。
返回JSON格式：{"title":"食品名称","description":"营养概述（50字以内）","details":["营养分析要点"],"tags":["高蛋白","低碳水"],"healthyScore":75,"nutrition":{"calories":"142千卡/100克","protein":"17.2克/100克","fat":"6.5克/100克","carbs":"3.8克/100克","sodium":"450毫克/100克","sugar":"1.5克/100克"},"chronicDiseaseWarnings":[{"disease":"高血压","level":"适量食用","reason":"含钠量中等，建议烹饪时减少盐的用量"},{"disease":"糖尿病","level":"慎食","reason":"含糖量较高，可能影响血糖"},{"disease":"痛风","level":"可以食用","reason":"嘌呤含量低，对尿酸影响小"}],"advice":"综合健康建议"}
${healthScoreGuide}
【重要】必须包含对高血压、糖尿病、痛风、高血脂等常见老年慢病的风险评估。适宜程度只能使用以下四个等级之一：推荐食用/适量食用/慎食/禁食。所有内容必须使用中文，包括营养数据的单位。`,
  };

  if (imageBase64) {
    return processImage(imageBase64, textHint || "请分析图片内容", {
      userId,
      responseJson: true,
    }).then(result => {
      // Wrap with system prompt context
      return generateText(`基于以下分析结果，请按照要求的JSON格式重新整理输出：\n${result}`, {
        systemPrompt: systemPrompts[mode],
        responseJson: true,
        userId,
      });
    });
  }

  return generateText(textHint || "请提供分析", {
    systemPrompt: systemPrompts[mode],
    responseJson: true,
    userId,
  });
}

/** AI\u4e07\u82b1\u7b52 \u2014 \u591a\u8f6e\u5bf9\u8bdd */
export async function chatWithAI(
  currentMessage: string,
  imageBase64: string | null,
  history: Array<{ role: string; content: string }>,
  userId?: number
): Promise<string> {
  const systemPrompt = "\u4f60\u662f\u201c\u4e50\u4eabAI\u201d\u4e13\u5c5e\u667a\u80fd\u52a9\u624b\uff0c\u4eb2\u5207\u4e13\u4e1a\uff0c\u56de\u7b54\u7b80\u6d01\u6613\u61c2\uff0c\u9002\u5408\u4e2d\u8001\u5e74\u4eba\u9605\u8bfb\u3002\u4f60\u53ef\u4ee5\u56de\u7b54\u5404\u79cd\u95ee\u9898\uff0c\u5305\u62ec\u751f\u6d3b\u5e38\u8bc6\u3001\u5065\u5eb7\u517b\u751f\u3001\u5386\u53f2\u6587\u5316\u3001\u79d1\u6280\u77e5\u8bc6\u7b49\u3002\u5982\u679c\u7528\u6237\u53d1\u9001\u4e86\u56fe\u7247\uff0c\u8bf7\u4ed4\u7ec6\u5206\u6790\u56fe\u7247\u5185\u5bb9\u5e76\u7ed9\u51fa\u8be6\u7ec6\u89e3\u7b54\u3002";

  const messages: any[] = [
    { role: "system", content: systemPrompt },
  ];

  const recentHistory = history.slice(-10);
  for (const msg of recentHistory) {
    messages.push({
      role: msg.role === "user" ? "user" : "assistant",
      content: msg.content,
    });
  }

  if (imageBase64) {
    messages.push({
      role: "user",
      content: [
        { type: "image_url", image_url: { url: imageBase64 } },
        { type: "text", text: currentMessage || "\u8bf7\u5206\u6790\u8fd9\u5f20\u56fe\u7247" },
      ],
    });
  } else {
    messages.push({ role: "user", content: currentMessage });
  }

  // Use external config (same as text generation) instead of built-in Forge LLM
  const config = await getEffectiveConfig("text_generation", userId);
  if (config?.apiKey && config.baseUrl) {
    const baseUrl = config.baseUrl.replace(/\/$/, "");
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.modelName,
        messages,
        max_tokens: 4096,
      }),
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      throw new Error(`AI\u5bf9\u8bdd\u5931\u8d25 (${res.status}): ${errText.slice(0, 200)}`);
    }
    const json = await res.json();
    return typeof json.choices?.[0]?.message?.content === "string"
      ? json.choices[0].message.content
      : JSON.stringify(json.choices?.[0]?.message?.content ?? "");
  }

  throw new Error("\u6587\u672c\u751f\u6210\u6a21\u578b\u672a\u914d\u7f6e\uff0c\u8bf7\u68c0\u67e5 DEV_TEXT_GENERATION \u914d\u7f6e");
}
