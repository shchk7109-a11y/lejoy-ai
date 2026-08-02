/**
 * 阿里云 DashScope 语音客户端
 * - TTS：qwen3-tts-flash（同步 REST，返回音频 URL；含北京话/上海话/四川话/粤语等方言音色）
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

/** 语音合成：返回 base64 音频与 MIME（与现有前端契约一致） */
export async function dashscopeTTS(
  text: string,
  voiceType = "lively"
): Promise<{ audioData: string; audioMime: string }> {
  if (!ENV.dashscopeApiKey) throw new Error("DASHSCOPE_API_KEY 未配置");

  const body = {
    model: ENV.dashscopeTtsModel,
    input: {
      text,
      voice: mapVoice(voiceType),
      language_type: "Chinese",
    },
  };

  return withRetry(
    async () => {
      const resp = await axios.post(`${ENV.dashscopeBaseUrl}${GENERATION_PATH}`, body, {
        headers: {
          Authorization: `Bearer ${ENV.dashscopeApiKey}`,
          "Content-Type": "application/json",
        },
        timeout: 90000,
      });
      const audioUrl = resp.data?.output?.audio?.url;
      if (!audioUrl) throw new Error("TTS 合成失败：未返回音频URL");
      // 下载音频转 base64（URL 24小时过期，必须落地）
      const audioResp = await axios.get(audioUrl, { responseType: "arraybuffer", timeout: 60000 });
      const audioMime = (audioResp.headers["content-type"] as string) || "audio/wav";
      return {
        audioData: Buffer.from(audioResp.data).toString("base64"),
        audioMime,
      };
    },
    { label: "QwenTTS", baseDelayMs: 3000 }
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
