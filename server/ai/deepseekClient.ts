/**
 * DeepSeek 纯文本客户端（OpenAI 兼容接口）。
 * 轻任务固定关闭思考模式，避免将题材推荐等短 JSON 请求变成长推理。
 */
import axios from "axios";
import { ENV } from "../_core/env";
import { withRetry } from "./retry";

export interface DeepSeekMessage {
  role: "system" | "user" | "assistant";
  text: string;
}

export function buildDeepSeekMessages(messages: DeepSeekMessage[]): object[] {
  return messages.map((message) => ({ role: message.role, content: message.text }));
}

export async function deepseekChat(params: {
  messages: DeepSeekMessage[];
  json?: boolean;
  model?: string;
  maxTokens?: number;
  timeout?: number;
}): Promise<string> {
  if (!ENV.deepseekApiKey) throw new Error("DEEPSEEK_API_KEY 未配置");

  const body: Record<string, unknown> = {
    model: params.model ?? ENV.deepseekModel,
    messages: buildDeepSeekMessages(params.messages),
    max_tokens: params.maxTokens ?? 4096,
    thinking: { type: "disabled" },
  };
  if (params.json) body.response_format = { type: "json_object" };

  return withRetry(async () => {
    const baseUrl = ENV.deepseekBaseUrl.replace(/\/$/, "");
    const response = await axios.post(`${baseUrl}/chat/completions`, body, {
      headers: {
        Authorization: `Bearer ${ENV.deepseekApiKey}`,
        "Content-Type": "application/json",
      },
      timeout: params.timeout ?? 60000,
    });
    const content = response.data?.choices?.[0]?.message?.content;
    if (!content) throw new Error("DeepSeek 返回内容为空");
    return content as string;
  }, { label: "DeepSeek" });
}
