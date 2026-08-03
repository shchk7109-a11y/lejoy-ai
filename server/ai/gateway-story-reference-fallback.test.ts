import { expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ invokeMiniMaxImage: vi.fn() }));

vi.mock("../_core/env", () => ({
  ENV: {
    aiImageProvider: "minimax",
    minimaxApiKey: "test-key",
    arkApiKey: "",
    geminiApiKey: "",
  },
}));
vi.mock("./minimaxClient", () => ({
  invokeMiniMaxImage: mocks.invokeMiniMaxImage,
  invokeMiniMaxText: vi.fn(),
  invokeMiniMaxTTS: vi.fn(),
}));
vi.mock("./volcImageClient", () => ({ volcGenerateImage: vi.fn() }));
vi.mock("../geminiService", () => ({ callGeminiImage: vi.fn(), callGeminiText: vi.fn(), callGeminiTTS: vi.fn() }));
vi.mock("../_core/voiceTranscription", () => ({ transcribeAudio: vi.fn() }));
vi.mock("./kimiClient", () => ({ kimiChat: vi.fn() }));
vi.mock("./deepseekClient", () => ({ deepseekChat: vi.fn() }));
vi.mock("./aliVoiceClient", () => ({ dashscopeTTS: vi.fn(), dashscopeASR: vi.fn() }));

import { aiGenerateImage } from "./gateway";

it("非 Volc 图片供应商明确拒绝故事参考图", async () => {
  await expect(aiGenerateImage({
    prompt: "儿童绘本",
    profile: "story",
    referenceImageUrl: "https://cdn.example/story-refs/7/child.jpg",
  })).rejects.toThrow("当前图片服务暂不支持照片主角");
  expect(mocks.invokeMiniMaxImage).not.toHaveBeenCalled();
});
