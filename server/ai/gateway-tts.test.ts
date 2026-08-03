import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  dashscopeTTS: vi.fn(async () => ({
    audioData: "c3BlZWNo",
    audioMime: "audio/wav",
  })),
  recordAiRequestMetadata: vi.fn(),
}));

vi.mock("../_core/env", () => ({
  ENV: {
    aiTtsProvider: "auto",
    dashscopeApiKey: "test-key",
    dashscopeTtsModel: "qwen3-tts-flash",
    dashscopeCosyvoiceModel: "cosyvoice-v3-flash",
    moonshotApiKey: "",
    arkApiKey: "",
    minimaxApiKey: "",
    geminiTextApiKey: "",
    forgeApiUrl: "",
    forgeApiKey: "",
    deepseekApiKey: "",
  },
}));

vi.mock("./aliVoiceClient", () => ({
  dashscopeTTS: mocks.dashscopeTTS,
  dashscopeASR: vi.fn(),
  resolveAliTtsProfile: vi.fn((voiceType: string) =>
    voiceType === "gentle" || voiceType === "steady"
      ? { model: "cosyvoice-v3-flash" }
      : { model: "qwen3-tts-flash" },
  ),
}));
vi.mock("./requestTelemetry", () => ({
  recordAiRequestMetadata: mocks.recordAiRequestMetadata,
}));
vi.mock("../geminiService", () => ({
  callGeminiText: vi.fn(),
  callGeminiImage: vi.fn(),
  callGeminiTTS: vi.fn(),
}));
vi.mock("../_core/voiceTranscription", () => ({ transcribeAudio: vi.fn() }));
vi.mock("./kimiClient", () => ({ kimiChat: vi.fn() }));
vi.mock("./deepseekClient", () => ({ deepseekChat: vi.fn() }));
vi.mock("./volcImageClient", () => ({
  volcGenerateImage: vi.fn(),
  isUnsupportedAdaptiveSizeError: vi.fn(),
  nearestSupportedAspectRatio: vi.fn(),
}));
vi.mock("./imageDimensions", () => ({ readImageDimensions: vi.fn() }));
vi.mock("./minimaxClient", () => ({
  invokeMiniMaxText: vi.fn(),
  invokeMiniMaxImage: vi.fn(),
  invokeMiniMaxTTS: vi.fn(),
}));

import { aiTTS } from "./gateway";

describe("TTS 实际模型遥测", () => {
  beforeEach(() => {
    mocks.dashscopeTTS.mockClear();
    mocks.recordAiRequestMetadata.mockClear();
  });

  it("龙妙请求记录 CosyVoice 模型", async () => {
    await aiTTS("第一页故事", "gentle");

    expect(mocks.recordAiRequestMetadata).toHaveBeenCalledWith(
      "ali",
      "cosyvoice-v3-flash",
    );
    expect(mocks.dashscopeTTS).toHaveBeenCalledWith("第一页故事", "gentle");
  });

  it("上海话请求仍记录 Qwen TTS 模型", async () => {
    await aiTTS("上海闲话", "dialect_shanghai");

    expect(mocks.recordAiRequestMetadata).toHaveBeenCalledWith(
      "ali",
      "qwen3-tts-flash",
    );
    expect(mocks.dashscopeTTS).toHaveBeenCalledWith(
      "上海闲话",
      "dialect_shanghai",
    );
  });
});
