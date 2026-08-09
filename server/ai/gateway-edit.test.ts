import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  volcGenerateImage: vi.fn(),
}));

vi.mock("../_core/env", () => ({
  ENV: {
    aiImageProvider: "volc",
    arkApiKey: "test-key",
    arkImageModel: "default-image-model",
    arkImageEditSize: "1.5K",
    arkStoryImageModel: "story-image-model",
  },
}));

vi.mock("./volcImageClient", async (importOriginal) => {
  const original = await importOriginal<typeof import("./volcImageClient")>();
  return { ...original, volcGenerateImage: mocks.volcGenerateImage };
});

vi.mock("../geminiService", () => ({ callGeminiText: vi.fn(), callGeminiImage: vi.fn(), callGeminiTTS: vi.fn() }));
vi.mock("../_core/voiceTranscription", () => ({ transcribeAudio: vi.fn() }));
vi.mock("./kimiClient", () => ({ kimiChat: vi.fn() }));
vi.mock("./aliVoiceClient", () => ({ dashscopeTTS: vi.fn(), dashscopeASR: vi.fn() }));
vi.mock("./minimaxClient", () => ({ invokeMiniMaxText: vi.fn(), invokeMiniMaxImage: vi.fn(), invokeMiniMaxTTS: vi.fn() }));

import { aiEditImage, aiGenerateImage } from "./gateway";

describe("Seedream 原图比例编辑", () => {
  beforeEach(() => {
    mocks.volcGenerateImage.mockReset();
    vi.unstubAllGlobals();
  });

  it("优先使用配置的修图尺寸，不携带 1:1", async () => {
    mocks.volcGenerateImage.mockResolvedValue("image-base64");
    await expect(aiEditImage({ imageUrl: "https://cdn.example/photo.jpg", prompt: "保持构图" })).resolves.toBe("image-base64");
    expect(mocks.volcGenerateImage).toHaveBeenCalledWith({
      prompt: "保持构图",
      imageUrls: ["https://cdn.example/photo.jpg"],
      size: "1.5K",
    });
    expect(mocks.volcGenerateImage.mock.calls[0][0]).not.toHaveProperty("aspectRatio");
  });

  it("仅在自适应 size 不受支持时读取原图并映射最近比例", async () => {
    mocks.volcGenerateImage
      .mockRejectedValueOnce({ response: { status: 400, data: { message: "unsupported size parameter" } } })
      .mockResolvedValueOnce("fallback-base64");
    const png = Buffer.alloc(24);
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(png);
    png.writeUInt32BE(4032, 16);
    png.writeUInt32BE(3024, 20);
    vi.stubGlobal("fetch", vi.fn(async () => new Response(png, { status: 200, headers: { "content-type": "image/png" } })));

    await expect(aiEditImage({ imageUrl: "https://cdn.example/photo.png", prompt: "保持构图" })).resolves.toBe("fallback-base64");
    expect(mocks.volcGenerateImage).toHaveBeenNthCalledWith(2, {
      prompt: "保持构图",
      imageUrls: ["https://cdn.example/photo.png"],
      aspectRatio: "4:3",
    });
  });

  it("其他错误直接抛出，不触发可能重复扣费的降级生成", async () => {
    const error = { response: { status: 503, data: { message: "service unavailable" } } };
    mocks.volcGenerateImage.mockRejectedValue(error);
    await expect(aiEditImage({ imageUrl: "https://cdn.example/photo.jpg", prompt: "保持构图" })).rejects.toBe(error);
    expect(mocks.volcGenerateImage).toHaveBeenCalledTimes(1);
  });
});

describe("Seedream 故事配图参数", () => {
  beforeEach(() => {
    mocks.volcGenerateImage.mockReset();
  });

  it("故事页使用专用模型与 1K，普通生图不受影响", async () => {
    mocks.volcGenerateImage.mockResolvedValue("image-base64");

    await aiGenerateImage({ prompt: "儿童绘本第1页", aspectRatio: "1:1", profile: "story" });
    await aiGenerateImage({ prompt: "普通图片", aspectRatio: "1:1" });

    expect(mocks.volcGenerateImage).toHaveBeenNthCalledWith(1, {
      prompt: "儿童绘本第1页",
      aspectRatio: "1:1",
      model: "story-image-model",
      size: "1K",
    });
    expect(mocks.volcGenerateImage).toHaveBeenNthCalledWith(2, {
      prompt: "普通图片",
      aspectRatio: "1:1",
    });
  });

  it("故事页把一张儿童参考图传给专用 Seedream 模型", async () => {
    mocks.volcGenerateImage.mockResolvedValue("image-base64");

    await aiGenerateImage({
      prompt: "儿童绘本第一页",
      aspectRatio: "1:1",
      profile: "story",
      referenceImageUrl: "https://cdn.example/story-refs/7/child.jpg",
    });

    expect(mocks.volcGenerateImage).toHaveBeenCalledWith({
      prompt: "儿童绘本第一页",
      aspectRatio: "1:1",
      model: "story-image-model",
      size: "1K",
      imageUrls: ["https://cdn.example/story-refs/7/child.jpg"],
    });
  });
});
