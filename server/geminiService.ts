/**
 * Gemini AI 服务层
 * 通过谷高API中转，在国内无需科学上网即可调用Gemini模型
 * 支持：文本生成、图像生成/理解、语音合成(TTS)
 */
import axios, { AxiosError } from "axios";
import { ENV } from "./_core/env";

// ─── 工具函数 ─────────────────────────────────────────────────────────────────

/** 将base64图像转换为Gemini inlineData格式 */
export function base64ToInlineData(base64: string, defaultMimeType = "image/jpeg") {
  const match = base64.match(/^data:(.*?);base64,/);
  const mimeType = match ? match[1] : defaultMimeType;
  const data = base64.replace(/^data:.*?;base64,/, "");
  return { inlineData: { data, mimeType } };
}

/** 清理JSON字符串（去除Markdown代码块标记，使用括号深度匹配确保完整性） */
export function cleanJson(text: string): string {
  if (!text) return "{}";
  // 先去掉 markdown 代码块标记
  const stripped = text.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();

  // 使用括号深度匹配算法，正确处理字符串内的括号和转义字符
  function extractBalanced(src: string, open: string, close: string): string | null {
    const start = src.indexOf(open);
    if (start === -1) return null;
    let depth = 0;
    let inString = false;
    let escape = false;
    for (let i = start; i < src.length; i++) {
      const ch = src[i];
      if (escape) { escape = false; continue; }
      if (ch === "\\" && inString) { escape = true; continue; }
      if (ch === '"') { inString = !inString; continue; }
      if (inString) continue;
      if (ch === open) depth++;
      else if (ch === close) {
        depth--;
        if (depth === 0) return src.substring(start, i + 1);
      }
    }
    return null;
  }

  // 优先提取最先出现的括号类型（对象 {} 或数组 []）
  const objStart = stripped.indexOf("{");
  const arrStart = stripped.indexOf("[");

  if (objStart !== -1 && (arrStart === -1 || objStart <= arrStart)) {
    const result = extractBalanced(stripped, "{", "}");
    if (result) return result;
  }
  if (arrStart !== -1) {
    const result = extractBalanced(stripped, "[", "]");
    if (result) return result;
  }
  return stripped;
}

/**
 * 指数退避重试工具函数
 * 遇到429（限流）或5xx（服务器错误）时自动重试
 * @param fn 要执行的异步函数
 * @param maxRetries 最大重试次数（默认3次）
 * @param baseDelayMs 基础延迟毫秒数（默认2000ms，每次翻倍）
 */
async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries = 5,
  baseDelayMs = 3000
): Promise<T> {
  let lastError: unknown;
  let hadRateLimit = false;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      const axiosErr = err as AxiosError;
      const status = axiosErr?.response?.status;
      // 只对限流(429)和服务器错误(5xx)进行重试
      const shouldRetry = status === 429 || (status !== undefined && status >= 500);
      if (status === 429) hadRateLimit = true;
      if (!shouldRetry || attempt === maxRetries) {
        // 将429转为友好错误
        if (status === 429 || hadRateLimit) {
          const friendlyErr = new Error("AI服务繁忙，请稍等1-2分钟后再试");
          (friendlyErr as any).isRateLimit = true;
          throw friendlyErr;
        }
        throw err;
      }
      const delay = baseDelayMs * Math.pow(2, attempt); // 3s, 6s, 12s, 24s, 48s
      console.log(`[Gemini] 请求失败(${status})，${delay}ms后第${attempt + 1}次重试...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  // 如果所有重试都失败，且曾经遇到过429，返回友好错误
  if (hadRateLimit) {
    const friendlyErr = new Error("AI服务繁忙，请稍等1-2分钟后再试");
    (friendlyErr as any).isRateLimit = true;
    throw friendlyErr;
  }
  throw lastError;
}

// ─── 文本生成 ─────────────────────────────────────────────────────────────────

interface TextPart { text: string }
interface ImagePart { inlineData: { data: string; mimeType: string } }
type ContentPart = TextPart | ImagePart;

interface GeminiTextRequest {
  model?: string;
  apiKey?: string;
  systemInstruction?: string;
  contents: Array<{ role?: string; parts: ContentPart[] }> | ContentPart[];
  responseSchema?: object;
  responseMimeType?: string;
}

/** 调用Gemini文本/多模态生成接口（兼容谷高API原生格式） */
export async function callGeminiText(req: GeminiTextRequest): Promise<string> {
  const model = req.model ?? ENV.geminiTextModel;
  const apiKey = req.apiKey ?? ENV.geminiTextApiKey;
  const baseUrl = ENV.geminiBaseUrl;

  // 构建contents：支持单层parts数组或多轮对话格式
  let contents: object[];
  if (req.contents.length > 0 && "role" in req.contents[0]) {
    contents = req.contents as object[];
  } else {
    contents = [{ parts: req.contents }];
  }

  const body: Record<string, unknown> = { contents };
  if (req.systemInstruction) {
    body.system_instruction = { parts: [{ text: req.systemInstruction }] };
  }
  if (req.responseMimeType || req.responseSchema) {
    body.generationConfig = {
      ...(req.responseMimeType ? { responseMimeType: req.responseMimeType } : {}),
      ...(req.responseSchema ? { responseSchema: req.responseSchema } : {}),
    };
  }

  const url = `${baseUrl}/models/${model}:generateContent?key=${apiKey}`;
  return withRetry(async () => {
    const resp = await axios.post(url, body, {
      headers: { "Content-Type": "application/json" },
      timeout: 60000,
    });
    const candidate = resp.data?.candidates?.[0];
    const text = candidate?.content?.parts?.map((p: any) => p.text || "").join("") ?? "";
    return text;
  });
}

// ─── 图像生成/理解 ─────────────────────────────────────────────────────────────

interface GeminiImageRequest {
  model?: string;
  apiKey?: string;
  parts: ContentPart[];
  aspectRatio?: string;
}

/** 调用Gemini图像生成/编辑接口，返回base64图像字符串（含指数退避重试） */
export async function callGeminiImage(req: GeminiImageRequest): Promise<string> {
  const model = req.model ?? ENV.geminiImageModel;
  const apiKey = req.apiKey ?? ENV.geminiImageApiKey;
  const baseUrl = ENV.geminiBaseUrl;

  const body: Record<string, unknown> = {
    contents: [{ parts: req.parts }],
    generationConfig: {
      responseModalities: ["Text", "Image"],
      ...(req.aspectRatio ? { imageConfig: { aspectRatio: req.aspectRatio } } : {}),
    },
  };

  const url = `${baseUrl}/models/${model}:generateContent?key=${apiKey}`;
  return withRetry(async () => {
    const resp = await axios.post(url, body, {
      headers: { "Content-Type": "application/json" },
      timeout: 120000,
    });
    const parts = resp.data?.candidates?.[0]?.content?.parts ?? [];
    for (const part of parts) {
      if (part.inlineData?.data) {
        const mime = part.inlineData.mimeType ?? "image/png";
        return `data:${mime};base64,${part.inlineData.data}`;
      }
    }
    throw new Error("图像生成失败：未返回图像数据");
  }, 3, 3000); // 图片生成限流等待更长：3s, 6s, 12s
}

// ─── 语音合成 TTS ─────────────────────────────────────────────────────────────

const VOICE_MAP: Record<string, string> = {
  sweet: "Zephyr",
  calm: "Fenrir",
  lively: "Puck",
  gentle: "Kore",
  warm: "Aoede",
  bright: "Charon",
  steady: "Orbit",
};

/** 调用Gemini TTS接口，返回base64编码的PCM音频数据及MIME类型（含指数退避重试） */
export async function callGeminiTTS(text: string, voiceType = "lively", timeout = 120000): Promise<{ audioData: string; audioMime: string }> {
  const model = ENV.geminiTtsModel;
  const apiKey = ENV.geminiTtsApiKey;
  const baseUrl = ENV.geminiBaseUrl;
  const voiceName = VOICE_MAP[voiceType] ?? "Puck";

  const body = {
    contents: [{ parts: [{ text }] }],
    generationConfig: {
      responseModalities: ["audio"],
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: { voiceName },
        },
      },
    },
  };

  const url = `${baseUrl}/models/${model}:generateContent?key=${apiKey}`;
  return withRetry(async () => {
    const resp = await axios.post(url, body, {
      headers: { "Content-Type": "application/json" },
      timeout,
    });
    const inlineData = resp.data?.candidates?.[0]?.content?.parts?.[0]?.inlineData;
    const audioData = inlineData?.data;
    const audioMime = inlineData?.mimeType ?? "audio/L16;rate=24000"; // Gemini TTS默认返回PCM L16格式
    if (!audioData) throw new Error("TTS生成失败：未返回音频数据");
    return { audioData, audioMime };
  }, 3, 5000); // TTS限流等待更长：5s, 10s, 20s
}

// ─── 语音转文字 STT（Whisper via 内置服务）────────────────────────────────────

/** 使用内置Forge API的Whisper模型进行语音转文字 */
export async function callWhisperSTT(audioUrl: string, language = "zh"): Promise<string> {
  const resp = await axios.post(
    `${ENV.forgeApiUrl}/v1/audio/transcriptions`,
    { url: audioUrl, language },
    {
      headers: {
        Authorization: `Bearer ${ENV.forgeApiKey}`,
        "Content-Type": "application/json",
      },
      timeout: 30000,
    }
  );
  return resp.data?.text ?? "";
}
