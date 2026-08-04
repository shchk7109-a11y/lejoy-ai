import axios from "axios";
import { ENV } from "../_core/env";
import { withRetry } from "./retry";

export async function dashscopeVisionChat(params: {
  imageUrl: string;
  prompt: string;
  model?: string;
  maxTokens?: number;
  timeout?: number;
}): Promise<string> {
  if (!ENV.dashscopeApiKey) throw new Error("DASHSCOPE_API_KEY 未配置");

  const body = {
    model: params.model ?? ENV.dashscopeVlModel,
    messages: [{
      role: "user",
      content: [
        { type: "image_url", image_url: { url: params.imageUrl } },
        { type: "text", text: params.prompt },
      ],
    }],
    max_tokens: params.maxTokens ?? 180,
    enable_thinking: false,
    response_format: { type: "json_object" },
  };

  return withRetry(async () => {
    const baseUrl = ENV.dashscopeCompatibleBaseUrl.replace(/\/$/, "");
    const response = await axios.post(`${baseUrl}/chat/completions`, body, {
      headers: {
        Authorization: `Bearer ${ENV.dashscopeApiKey}`,
        "Content-Type": "application/json",
      },
      timeout: params.timeout ?? 18_000,
    });
    const content = response.data?.choices?.[0]?.message?.content;
    if (!content) throw new Error("DashScope 视觉返回内容为空");
    return String(content);
  }, { maxRetries: 0, label: "DashScope Vision" });
}
