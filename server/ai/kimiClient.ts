/**
 * 月之暗面 Kimi 客户端（OpenAI 兼容接口）
 * 文档：https://platform.kimi.com/docs（API 域名 api.moonshot.cn 不变）
 * 能力：中文文本生成、多轮对话、视觉理解（kimi-k2.5/k2.6/k3 均支持图片输入）、JSON 输出模式
 */
import axios from "axios";
import { ENV } from "../_core/env";
import { withRetry } from "./retry";

export interface KimiMessage {
  role: "system" | "user" | "assistant";
  text?: string;
  /** data URL（data:image/jpeg;base64,...）或 ms://file_id */
  imageDataUrl?: string;
}

/** 将内部消息格式转换为 OpenAI 兼容的 messages（纯函数，便于测试） */
export function buildKimiMessages(messages: KimiMessage[]): object[] {
  return messages.map((m) => {
    if (m.imageDataUrl) {
      const parts: object[] = [{ type: "image_url", image_url: { url: m.imageDataUrl } }];
      if (m.text) parts.push({ type: "text", text: m.text });
      return { role: m.role, content: parts };
    }
    return { role: m.role, content: m.text ?? "" };
  });
}

export async function kimiChat(params: {
  messages: KimiMessage[];
  json?: boolean;
  /** true 时使用 heavy 模型（kimi-k3），用于长上下文/深度任务 */
  heavy?: boolean;
  model?: string;
  maxTokens?: number;
  temperature?: number;
  timeout?: number;
}): Promise<string> {
  if (!ENV.moonshotApiKey) throw new Error("MOONSHOT_API_KEY 未配置");
  const model = params.model ?? (params.heavy ? ENV.moonshotModelHeavy : ENV.moonshotModel);

  const body: Record<string, unknown> = {
    model,
    messages: buildKimiMessages(params.messages),
    max_tokens: params.maxTokens ?? 4096,
    temperature: params.temperature ?? 0.6,
  };
  // 注意：Kimi 的 JSON 模式要求提示词中出现 "json" 字样，调用方的提示词需自带
  if (params.json) body.response_format = { type: "json_object" };

  return withRetry(
    async () => {
      const resp = await axios.post(`${ENV.moonshotBaseUrl}/chat/completions`, body, {
        headers: {
          Authorization: `Bearer ${ENV.moonshotApiKey}`,
          "Content-Type": "application/json",
        },
        timeout: params.timeout ?? 90000,
      });
      const content = resp.data?.choices?.[0]?.message?.content;
      if (!content) throw new Error("Kimi 返回内容为空");
      return content as string;
    },
    { label: "Kimi" }
  );
}
