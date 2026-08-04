import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  dashscopeVisionChat: vi.fn(),
  kimiChat: vi.fn(),
  deepseekChat: vi.fn(),
  recordAiRequestMetadata: vi.fn(),
}));

vi.mock("../_core/env", () => ({
  ENV: {
    aiVisionFastProvider: "auto",
    aiTextFastProvider: "auto",
    dashscopeApiKey: "dashscope-key",
    dashscopeVlModel: "qwen3.7-flash-2026-07-15",
    moonshotApiKey: "moonshot-key",
    moonshotModel: "kimi-k2.6",
    moonshotModelHeavy: "kimi-k3",
    deepseekApiKey: "deepseek-key",
    deepseekModel: "deepseek-v4-flash",
    arkApiKey: "",
    geminiTextApiKey: "",
    forgeApiUrl: "",
    forgeApiKey: "",
  },
}));
vi.mock("./dashscopeVisionClient", () => ({ dashscopeVisionChat: mocks.dashscopeVisionChat }));
vi.mock("./kimiClient", () => ({ kimiChat: mocks.kimiChat }));
vi.mock("./deepseekClient", () => ({ deepseekChat: mocks.deepseekChat }));
vi.mock("./requestTelemetry", () => ({ recordAiRequestMetadata: mocks.recordAiRequestMetadata }));
vi.mock("../geminiService", () => ({
  callGeminiText: vi.fn(),
  callGeminiImage: vi.fn(),
  callGeminiTTS: vi.fn(),
}));
vi.mock("./minimaxClient", () => ({
  invokeMiniMaxText: vi.fn(),
  invokeMiniMaxImage: vi.fn(),
  invokeMiniMaxTTS: vi.fn(),
}));

import { aiChat, aiVisionFast, pickFastVisionProvider } from "./gateway";

describe("识花视觉快通道网关", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.dashscopeVisionChat.mockResolvedValue("{\"name\":\"月季\"}");
    mocks.kimiChat.mockResolvedValue("{\"name\":\"月季\"}");
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: true,
      headers: { get: () => "image/jpeg" },
      arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
    })));
  });

  it("auto 优先 DashScope，无密钥或显式 kimi 时使用 Kimi", () => {
    const keys = {
      deepseek: true,
      moonshot: true,
      ark: false,
      dashscope: true,
      minimax: false,
      gemini: false,
      forge: false,
    };
    expect(pickFastVisionProvider("auto", keys)).toBe("dashscope");
    expect(pickFastVisionProvider("auto", { ...keys, dashscope: false })).toBe("kimi");
    expect(pickFastVisionProvider("kimi", keys)).toBe("kimi");
  });

  it("DashScope 成功时返回实际供应商、模型和耗时", async () => {
    const result = await aiVisionFast({
      systemPrompt: "植物学家，只返回 JSON",
      userPrompt: "识别这株植物",
      imageUrl: "https://cdn.example/flower.jpg",
      maxTokens: 180,
    });

    expect(result).toEqual({
      content: "{\"name\":\"月季\"}",
      provider: "dashscope",
      model: "qwen3.7-flash-2026-07-15",
      fallbackUsed: false,
      durationMs: expect.any(Number),
    });
    expect(mocks.dashscopeVisionChat).toHaveBeenCalledWith({
      imageUrl: "https://cdn.example/flower.jpg",
      prompt: "植物学家，只返回 JSON\n\n识别这株植物",
      maxTokens: 180,
    });
    expect(mocks.kimiChat).not.toHaveBeenCalled();
    expect(mocks.recordAiRequestMetadata).toHaveBeenCalledWith("dashscope", "qwen3.7-flash-2026-07-15");
  });

  it("DashScope 失败时立即回落 Kimi 并标记回落", async () => {
    const warning = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    mocks.dashscopeVisionChat.mockRejectedValue(new Error("timeout"));

    const result = await aiVisionFast({
      systemPrompt: "植物学家，只返回 JSON",
      userPrompt: "识别这株植物",
      imageUrl: "https://cdn.example/flower.jpg",
      maxTokens: 180,
    });

    expect(result).toMatchObject({
      content: "{\"name\":\"月季\"}",
      provider: "kimi",
      model: "kimi-k2.6",
      fallbackUsed: true,
    });
    expect(mocks.kimiChat).toHaveBeenCalledWith({
      messages: [
        { role: "system", text: "植物学家，只返回 JSON" },
        { role: "user", text: "识别这株植物", imageDataUrl: "data:image/jpeg;base64,AQID" },
      ],
      json: true,
      maxTokens: 180,
    });
    expect(mocks.recordAiRequestMetadata).toHaveBeenLastCalledWith("kimi", "kimi-k2.6");
    expect(warning).toHaveBeenCalledWith("[AI vision-fast fallback]", {
      from: "dashscope",
      to: "kimi",
      reason: "Error",
    });
    warning.mockRestore();
  });

  it("既有 aiChat 带图仍直接走 Kimi，不接入快通道", async () => {
    await aiChat({
      systemPrompt: "分析菜品，只返回 JSON",
      userPrompt: "拆解食材",
      imageUrl: "https://cdn.example/dish.jpg",
      json: true,
    });

    expect(mocks.kimiChat).toHaveBeenCalledOnce();
    expect(mocks.dashscopeVisionChat).not.toHaveBeenCalled();
  });
});
