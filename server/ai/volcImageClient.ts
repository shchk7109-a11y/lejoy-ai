/**
 * 火山引擎方舟 即梦 Seedream 图像客户端
 * 接口：POST {ARK_BASE_URL}/images/generations（Bearer 认证）
 * 能力：文生图、图生图/参考图编辑（SeedEdit 融合能力，image 参数传公网可访问的 URL）
 * 注意：模型 ID（如 doubao-seedream-4-0-250828）请在方舟控制台"模型广场"核实并按需更新 ARK_IMAGE_MODEL
 */
import axios from "axios";
import { ENV } from "../_core/env";
import { withRetry } from "./retry";

export type AspectRatio = "1:1" | "16:9" | "4:3" | "3:4" | "9:16";

/** 宽高比 → Seedream size 参数（纯函数，便于测试） */
export function mapAspectToSize(aspectRatio?: AspectRatio): string {
  const map: Record<AspectRatio, string> = {
    "1:1": "2048x2048",
    "4:3": "2304x1728",
    "3:4": "1728x2304",
    "16:9": "2560x1440",
    "9:16": "1440x2560",
  };
  return aspectRatio ? map[aspectRatio] : "2048x2048";
}

/** 将任意原图宽高比映射到最接近的 Seedream 固定尺寸档。 */
export function nearestSupportedAspectRatio(width: number, height: number): AspectRatio {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return "1:1";
  const source = width / height;
  const candidates: Array<[AspectRatio, number]> = [
    ["1:1", 1],
    ["16:9", 16 / 9],
    ["4:3", 4 / 3],
    ["3:4", 3 / 4],
    ["9:16", 9 / 16],
  ];
  return candidates.reduce((best, candidate) =>
    Math.abs(Math.log(source / candidate[1])) < Math.abs(Math.log(source / best[1])) ? candidate : best,
  )[0];
}

/** 仅识别服务端明确指出 size 参数不受支持的 400 响应，避免对其他失败二次生成。 */
export function isUnsupportedAdaptiveSizeError(error: unknown): boolean {
  const candidate = error as { response?: { status?: number; data?: unknown }; message?: string };
  if (candidate.response?.status !== 400) return false;
  const detail = `${candidate.message ?? ""} ${JSON.stringify(candidate.response.data ?? "")}`;
  return /size|尺寸/i.test(detail) && /invalid|unsupported|not support|不支持|无效/i.test(detail);
}

/**
 * 生成/编辑图像，返回 base64 字符串（不含 data: 前缀）
 * - 纯文生图：只传 prompt
 * - 修图/风格化：additionalImageUrls 传参考图 URL（必须公网可访问，最多约14张）
 */
export async function volcGenerateImage(params: {
  prompt: string;
  imageUrls?: string[];
  aspectRatio?: AspectRatio;
  size?: string;
  model?: string;
}): Promise<string> {
  if (!ENV.arkApiKey) throw new Error("ARK_API_KEY 未配置");

  const body: Record<string, unknown> = {
    model: params.model ?? ENV.arkImageModel,
    prompt: params.prompt,
    response_format: "b64_json",
    size: params.size ?? mapAspectToSize(params.aspectRatio),
    watermark: ENV.arkImageWatermark,
    stream: false,
  };
  if (params.imageUrls && params.imageUrls.length > 0) {
    body.image = params.imageUrls.length === 1 ? params.imageUrls[0] : params.imageUrls;
  }

  return withRetry(
    async () => {
      const resp = await axios.post(`${ENV.arkBaseUrl}/images/generations`, body, {
        headers: {
          Authorization: `Bearer ${ENV.arkApiKey}`,
          "Content-Type": "application/json",
        },
        timeout: 120000,
      });
      const item = resp.data?.data?.[0];
      const b64 = item?.b64_json;
      if (!b64) {
        // 兜底：部分场景可能只回 url
        const url = item?.url;
        if (url) {
          const imgResp = await axios.get(url, { responseType: "arraybuffer", timeout: 60000 });
          return Buffer.from(imgResp.data).toString("base64");
        }
        throw new Error("即梦图像生成失败：未返回图像数据");
      }
      return b64 as string;
    },
    { label: "Seedream", baseDelayMs: 3000 }
  );
}
