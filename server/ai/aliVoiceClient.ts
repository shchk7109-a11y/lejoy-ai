/**
 * 阿里云 DashScope 语音客户端
 * - TTS：Qwen3-TTS（含方言）+ CosyVoice（龙妙/龙楠），同步 REST 返回音频 URL
 * - ASR：qwen3-asr-flash（同步 REST，直接传 OSS 音频 URL，≤5分钟音频免轮询）
 * 接口：POST {DASHSCOPE_BASE_URL}/api/v1/services/aigc/multimodal-generation/generation
 */
import axios from "axios";
import { ENV } from "../_core/env";
import { withRetry } from "./retry";

/**
 * 应用内音色键 → qwen3-tts 音色名
 * 普通话音色 + 方言音色（dialect_ 前缀），未匹配时回落 Cherry
 */
export const QWEN_TTS_VOICE_MAP: Record<string, string> = {
  // 与现有前端音色键对齐
  lively: "Cherry", // 活泼女声（故事默认）
  sweet: "Cherry",
  gentle: "Chelsie", // 温柔女声
  warm: "Serena", // 温暖女声
  calm: "Ethan", // 沉稳男声
  deep: "Ethan",
  bright: "Jennifer",
  steady: "Ryan",
  // 方言音色（新能力，前端可增加选项）
  dialect_beijing: "Dylan", // 北京话
  dialect_shanghai: "Jada", // 上海话
  dialect_sichuan: "Sunny", // 四川话
  dialect_cantonese: "Rocky", // 粤语
};

export function mapVoice(voiceType?: string): string {
  return QWEN_TTS_VOICE_MAP[voiceType ?? ""] ?? "Cherry";
}

const GENERATION_PATH = "/api/v1/services/aigc/multimodal-generation/generation";
const COSYVOICE_PATH = "/api/v1/services/audio/tts/SpeechSynthesizer";

const COSYVOICE_TTS_VOICE_MAP: Record<string, string> = {
  gentle: "longmiao_v3",
  steady: "longnan_v3",
};

export type AliTtsProfile = {
  family: "qwen" | "cosyvoice";
  model: string;
  voice: string;
  path: string;
};

/** 应用音色键对应的实际百炼模型、音色及接口。 */
export function resolveAliTtsProfile(voiceType = "lively"): AliTtsProfile {
  const cosyVoice = COSYVOICE_TTS_VOICE_MAP[voiceType];
  if (cosyVoice) {
    return {
      family: "cosyvoice",
      model: ENV.dashscopeCosyvoiceModel,
      voice: cosyVoice,
      path: COSYVOICE_PATH,
    };
  }

  return {
    family: "qwen",
    model: ENV.dashscopeTtsModel,
    voice: mapVoice(voiceType),
    path: GENERATION_PATH,
  };
}

/** 语音合成：返回 base64 音频与 MIME（与现有前端契约一致） */
export async function dashscopeTTS(
  text: string,
  voiceType = "lively"
): Promise<{ audioData: string; audioMime: string }> {
  if (!ENV.dashscopeApiKey) throw new Error("DASHSCOPE_API_KEY 未配置");

  const profile = resolveAliTtsProfile(voiceType);
  const body = {
    model: profile.model,
    input: profile.family === "cosyvoice"
      ? { text, voice: profile.voice, format: "wav", sample_rate: 24000 }
      : { text, voice: profile.voice, language_type: "Chinese" },
  };

  return withRetry(
    async () => {
      const resp = await axios.post(`${ENV.dashscopeBaseUrl}${profile.path}`, body, {
        headers: {
          Authorization: `Bearer ${ENV.dashscopeApiKey}`,
          "Content-Type": "application/json",
        },
        timeout: 90000,
      });
      const audioUrl = resp.data?.output?.audio?.url ?? resp.data?.output?.url;
      if (!audioUrl) throw new Error("TTS 合成失败：未返回音频URL");
      // 下载音频转 base64（URL 24小时过期，必须落地）
      const audioResp = await axios.get(audioUrl, { responseType: "arraybuffer", timeout: 60000 });
      const audioMime = (audioResp.headers["content-type"] as string) || "audio/wav";
      return {
        audioData: Buffer.from(audioResp.data).toString("base64"),
        audioMime,
      };
    },
    { label: profile.family === "cosyvoice" ? "CosyVoiceTTS" : "QwenTTS", baseDelayMs: 3000 }
  );
}

/** 语音识别：传入公网可访问的音频 URL，返回转写文本 */
export async function dashscopeASR(audioUrl: string): Promise<string> {
  if (!ENV.dashscopeApiKey) throw new Error("DASHSCOPE_API_KEY 未配置");

  const body = {
    model: ENV.dashscopeAsrModel,
    input: {
      messages: [
        { role: "system", content: [{ text: "" }] },
        { role: "user", content: [{ audio: audioUrl }] },
      ],
    },
    parameters: { asr_options: { enable_itn: true } },
  };

  return withRetry(
    async () => {
      const resp = await axios.post(`${ENV.dashscopeBaseUrl}${GENERATION_PATH}`, body, {
        headers: {
          Authorization: `Bearer ${ENV.dashscopeApiKey}`,
          "Content-Type": "application/json",
        },
        timeout: 60000,
      });
      const content = resp.data?.output?.choices?.[0]?.message?.content;
      // content 可能是数组 [{text: "..."}] 或字符串
      const text = Array.isArray(content)
        ? content.map((c: any) => c?.text ?? "").join("")
        : typeof content === "string"
          ? content
          : "";
      if (!text) throw new Error("语音识别失败：未返回文本");
      return text;
    },
    { label: "QwenASR" }
  );
}
