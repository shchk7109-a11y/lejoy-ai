import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  deepseekChat: vi.fn(),
  kimiChat: vi.fn(),
  geminiText: vi.fn(),
}));

vi.mock("../_core/env", () => ({
  ENV: {
    aiTextFastProvider: "auto",
    aiTextProvider: "gemini",
    deepseekApiKey: "deepseek-key",
    deepseekModel: "deepseek-v4-flash",
    moonshotApiKey: "moonshot-key",
    moonshotModel: "kimi-k2.6",
    moonshotModelHeavy: "kimi-k3",
    arkApiKey: "",
    dashscopeApiKey: "",
    geminiTextApiKey: "gemini-key",
    forgeApiUrl: "",
    forgeApiKey: "",
  },
}));
vi.mock("./deepseekClient", () => ({ deepseekChat: mocks.deepseekChat }));
vi.mock("./kimiClient", () => ({ kimiChat: mocks.kimiChat }));
vi.mock("../geminiService", () => ({
  callGeminiText: mocks.geminiText,
  callGeminiImage: vi.fn(),
  callGeminiTTS: vi.fn(),
}));
vi.mock("./minimaxClient", () => ({
  invokeMiniMaxText: vi.fn(),
  invokeMiniMaxImage: vi.fn(),
  invokeMiniMaxTTS: vi.fn(),
}));

import * as gateway from "./gateway";

describe("轻文本快速供应商分流", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.deepseekChat.mockResolvedValue("DeepSeek 结果");
    mocks.kimiChat.mockResolvedValue("Kimi 结果");
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: true,
      headers: { get: () => "image/jpeg" },
      arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
    })));
  });

  it("auto 有 DeepSeek 密钥时优先 DeepSeek，无密钥时回落 Kimi", () => {
    const pickFastTextProvider = (gateway as Record<string, unknown>).pickFastTextProvider;
    expect(pickFastTextProvider).toBeTypeOf("function");
    if (typeof pickFastTextProvider !== "function") return;
    const allKeys = { deepseek: true, moonshot: true, minimax: true, gemini: true };
    expect(pickFastTextProvider("auto", allKeys)).toBe("deepseek");
    expect(pickFastTextProvider("auto", { ...allKeys, deepseek: false })).toBe("kimi");
    expect(pickFastTextProvider("kimi", allKeys)).toBe("kimi");
  });

  it("aiChat 纯文本走 DeepSeek 并保留 JSON 模式", async () => {
    await expect(gateway.aiChat({
      systemPrompt: "只返回 JSON",
      userPrompt: "推荐故事题材",
      json: true,
    })).resolves.toBe("DeepSeek 结果");

    expect(mocks.deepseekChat).toHaveBeenCalledWith({
      messages: [
        { role: "system", text: "只返回 JSON" },
        { role: "user", text: "推荐故事题材" },
      ],
      json: true,
    });
    expect(mocks.kimiChat).not.toHaveBeenCalled();
  });

  it("aiChat 带图固定走 Kimi 视觉，不受纯文本供应商配置影响", async () => {
    await expect(gateway.aiChat({
      systemPrompt: "识别图片",
      userPrompt: "这是什么花",
      imageUrl: "https://cdn.example/flower.jpg",
    })).resolves.toBe("Kimi 结果");

    expect(mocks.kimiChat).toHaveBeenCalledOnce();
    expect(mocks.deepseekChat).not.toHaveBeenCalled();
    expect(mocks.geminiText).not.toHaveBeenCalled();
  });

  it("aiChatMulti 纯文本历史走 DeepSeek", async () => {
    await gateway.aiChatMulti({
      systemPrompt: "合规聊天",
      history: [{ role: "user", content: "你好" }],
      message: "讲个笑话",
    });

    expect(mocks.deepseekChat).toHaveBeenCalledWith({
      messages: [
        { role: "system", text: "合规聊天" },
        { role: "user", text: "你好" },
        { role: "user", text: "讲个笑话" },
      ],
    });
  });
});
