import { existsSync, readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { beforeEach, describe, expect, it, vi } from "vitest";

const axiosMocks = vi.hoisted(() => ({ post: vi.fn() }));

vi.mock("axios", () => ({ default: axiosMocks }));
vi.mock("../_core/env", () => ({
  ENV: {
    deepseekApiKey: "test-deepseek-key",
    deepseekBaseUrl: "https://deepseek.example",
    deepseekModel: "deepseek-v4-flash",
  },
}));

const clientPath = new URL("./deepseekClient.ts", import.meta.url);

describe("DeepSeek 轻文本客户端", () => {
  beforeEach(() => axiosMocks.post.mockReset());

  it("使用当前 V4 Flash 模型并显式关闭思考模式", async () => {
    expect(existsSync(clientPath)).toBe(true);
    if (!existsSync(clientPath)) return;
    const { deepseekChat } = await import(pathToFileURL(clientPath.pathname).href);
    axiosMocks.post.mockResolvedValue({ data: { choices: [{ message: { content: "轻文本响应" } }] } });

    await deepseekChat({ messages: [{ role: "user", text: "生成四个故事题材" }] });

    expect(axiosMocks.post).toHaveBeenCalledWith(
      "https://deepseek.example/chat/completions",
      expect.objectContaining({
        model: "deepseek-v4-flash",
        thinking: { type: "disabled" },
        messages: [{ role: "user", content: "生成四个故事题材" }],
      }),
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer test-deepseek-key" }),
      }),
    );
    expect(axiosMocks.post.mock.calls[0][1]).not.toHaveProperty("temperature");
  });

  it("JSON 任务发送 json_object 并返回内容", async () => {
    expect(existsSync(clientPath)).toBe(true);
    if (!existsSync(clientPath)) return;
    const { deepseekChat } = await import(pathToFileURL(clientPath.pathname).href);
    axiosMocks.post.mockResolvedValue({ data: { choices: [{ message: { content: '{"topics":[]}' } }] } });

    await expect(deepseekChat({
      messages: [{ role: "system", text: "只返回 JSON" }, { role: "user", text: "推荐题材" }],
      json: true,
    })).resolves.toBe('{"topics":[]}');

    expect(axiosMocks.post.mock.calls[0][1]).toMatchObject({ response_format: { type: "json_object" } });
  });

  it("环境默认模型不使用已停用的 deepseek-chat", () => {
    const source = readFileSync(new URL("../_core/env.ts", import.meta.url), "utf8");
    expect(source).toContain('process.env.DEEPSEEK_MODEL ?? "deepseek-v4-flash"');
    expect(source).not.toContain('process.env.DEEPSEEK_MODEL ?? "deepseek-chat"');
  });

  it("环境示例登记 DeepSeek 快速文本配置且不包含真实密钥", () => {
    const example = readFileSync(new URL("../../.env.example", import.meta.url), "utf8");
    expect(example).toContain("DEEPSEEK_API_KEY=");
    expect(example).toContain("DEEPSEEK_MODEL=deepseek-v4-flash");
    expect(example).toContain("AI_TEXT_FAST_PROVIDER=auto");
    expect(example).not.toContain("DEEPSEEK_API_KEY=sk-");
  });
});
