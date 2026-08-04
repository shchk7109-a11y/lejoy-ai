import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  post: vi.fn(),
  withRetry: vi.fn(async (fn: () => Promise<unknown>, options: unknown) => {
    void options;
    return fn();
  }),
}));

vi.mock("axios", () => ({ default: { post: mocks.post } }));
vi.mock("../_core/env", () => ({
  ENV: {
    dashscopeApiKey: "dashscope-key",
    dashscopeCompatibleBaseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    dashscopeVlModel: "qwen3.7-flash-2026-07-15",
  },
}));
vi.mock("./retry", () => ({ withRetry: mocks.withRetry }));

import { dashscopeVisionChat } from "./dashscopeVisionClient";

describe("DashScope 视觉快通道客户端", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.post.mockResolvedValue({ data: { choices: [{ message: { content: "{\"name\":\"月季\"}" } }] } });
  });

  it("使用固定快照、非思考 JSON 模式与 180 token 上限", async () => {
    await expect(dashscopeVisionChat({
      imageUrl: "https://cdn.example/flower.jpg",
      prompt: "请用 JSON 返回植物名称",
    })).resolves.toBe("{\"name\":\"月季\"}");

    expect(mocks.post).toHaveBeenCalledWith(
      "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions",
      {
        model: "qwen3.7-flash-2026-07-15",
        messages: [{
          role: "user",
          content: [
            { type: "image_url", image_url: { url: "https://cdn.example/flower.jpg" } },
            { type: "text", text: "请用 JSON 返回植物名称" },
          ],
        }],
        max_tokens: 180,
        enable_thinking: false,
        response_format: { type: "json_object" },
      },
      {
        headers: {
          Authorization: "Bearer dashscope-key",
          "Content-Type": "application/json",
        },
        timeout: 18_000,
      },
    );
    expect(mocks.withRetry).toHaveBeenCalledWith(expect.any(Function), {
      maxRetries: 0,
      label: "DashScope Vision",
    });
  });

  it("允许调用方覆盖模型、输出上限和超时", async () => {
    await dashscopeVisionChat({
      imageUrl: "https://cdn.example/leaf.jpg",
      prompt: "返回 JSON",
      model: "qwen3.7-flash",
      maxTokens: 120,
      timeout: 9_000,
    });

    expect(mocks.post).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ model: "qwen3.7-flash", max_tokens: 120 }),
      expect.objectContaining({ timeout: 9_000 }),
    );
  });

  it("响应没有正文时拒绝继续", async () => {
    mocks.post.mockResolvedValue({ data: { choices: [{ message: {} }] } });
    await expect(dashscopeVisionChat({
      imageUrl: "https://cdn.example/flower.jpg",
      prompt: "返回 JSON",
    })).rejects.toThrow("DashScope 视觉返回内容为空");
  });
});
