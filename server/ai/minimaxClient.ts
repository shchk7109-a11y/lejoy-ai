/**
 * MiniMax 低层客户端（从 minimaxService 抽出，作为网关的备用供应商）
 */
import axios from "axios";

const MINIMAX_API_BASE = "https://api.minimaxi.com/v1";
const MINIMAX_TEXT_MODEL = "MiniMax-M2.5-highspeed";

function getApiKey(): string {
  const key = process.env.MINIMAX_API_KEY;
  if (!key) throw new Error("MINIMAX_API_KEY is not configured");
  return key;
}

/** MiniMax 文本生成（支持可选图片 URL 输入 Vision） */
export async function invokeMiniMaxText(params: {
  systemPrompt: string;
  userPrompt: string;
  imageUrl?: string;
  responseFormat?: "json" | "text";
}): Promise<string> {
  const apiKey = getApiKey();

  let userContent: any;
  if (params.imageUrl) {
    userContent = [
      { type: "image_url", image_url: { url: params.imageUrl } },
      { type: "text", text: params.userPrompt },
    ];
  } else {
    userContent = params.userPrompt;
  }

  const body: Record<string, unknown> = {
    model: MINIMAX_TEXT_MODEL,
    messages: [
      { role: "system", content: params.systemPrompt },
      { role: "user", content: userContent },
    ],
    max_tokens: 4096,
  };
  if (params.responseFormat === "json") {
    body.response_format = { type: "json_object" };
  }

  const resp = await axios.post(`${MINIMAX_API_BASE}/chat/completions`, body, {
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    timeout: 60000,
  });

  const content = resp.data?.choices?.[0]?.message?.content;
  if (!content) throw new Error("MiniMax 返回内容为空");
  return content as string;
}

/** MiniMax 图片生成，返回 base64（不含 data: 前缀） */
export async function invokeMiniMaxImage(params: {
  prompt: string;
  aspectRatio?: "1:1" | "16:9" | "4:3" | "3:4" | "9:16";
}): Promise<string> {
  const apiKey = getApiKey();

  const resp = await axios.post(
    `${MINIMAX_API_BASE}/image_generation`,
    {
      model: "image-01",
      prompt: params.prompt,
      aspect_ratio: params.aspectRatio ?? "4:3",
      response_format: "base64",
    },
    {
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      timeout: 120000,
    }
  );

  const images: string[] = resp.data?.data?.image_base64;
  if (!images || images.length === 0) throw new Error("MiniMax 图片生成返回为空");
  return images[0];
}

/** MiniMax TTS，返回 base64 MP3 */
export async function invokeMiniMaxTTS(
  text: string,
  voiceType = "lively"
): Promise<{ audioData: string; audioMime: string }> {
  const apiKey = getApiKey();
  const voiceMap: Record<string, string> = {
    lively: "lovely_girl",
    gentle: "female-chengshu",
    deep: "male-qn-qingse",
    warm: "female-shaonv",
  };
  const voiceId = voiceMap[voiceType] ?? "lovely_girl";
  const resp = await axios.post(
    `${MINIMAX_API_BASE}/t2a_v2`,
    {
      model: "speech-02-hd",
      text,
      stream: false,
      voice_setting: { voice_id: voiceId, speed: 0.9, vol: 1.0, pitch: 0 },
      audio_setting: { sample_rate: 24000, bitrate: 128000, format: "mp3", channel: 1 },
    },
    {
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      timeout: 90000,
    }
  );
  const hexData: string = resp.data?.data?.audio;
  if (!hexData) throw new Error("MiniMax TTS 返回音频数据为空");
  const buf = Buffer.from(hexData, "hex");
  return { audioData: buf.toString("base64"), audioMime: "audio/mp3" };
}
