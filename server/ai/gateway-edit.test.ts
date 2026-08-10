import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  volcGenerateImage: vi.fn(),
}));

vi.mock("../_core/env", () => ({
  ENV: {
    aiImageProvider: "volc",
    arkApiKey: "test-key",
    arkImageModel: "default-image-model",
    arkImageEditMaxEdge: "1536",
    arkImageEditSize: "1152x1536",
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

function stubPng(width: number, height: number) {
  const png = Buffer.alloc(24);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(png);
  png.writeUInt32BE(width, 16);
  png.writeUInt32BE(height, 20);
  vi.stubGlobal("fetch", vi.fn(async () => new Response(png, { status: 200, headers: { "content-type": "image/png" } })));
}

describe("Seedream 原图比例编辑", () => {
  beforeEach(() => {
    mocks.volcGenerateImage.mockReset();
    vi.unstubAllGlobals();
  });

  it("竖图按原比例使用 1152x1536，不携带 1:1", async () => {
    mocks.volcGenerateImage.mockResolvedValue("image-base64");
    stubPng(1200, 1600);
    await expect(aiEditImage({ imageUrl: "https://cdn.example/photo.jpg", prompt: "保持构图" })).resolves.toBe("image-base64");
    expect(mocks.volcGenerateImage).toHaveBeenCalledWith({
      prompt: "保持构图",
      imageUrls: ["https://cdn.example/photo.jpg"],
      size: "1152x1536",
    });
    expect(mocks.volcGenerateImage.mock.calls[0][0]).not.toHaveProperty("aspectRatio");
  });

  it("横图按原比例交换为 1536x1152", async () => {
    mocks.volcGenerateImage.mockResolvedValue("image-base64");
    stubPng(1600, 1200);

    await expect(aiEditImage({ imageUrl: "https://cdn.example/landscape.png", prompt: "保持构图" })).resolves.toBe("image-base64");
    expect(mocks.volcGenerateImage).toHaveBeenCalledWith({
      prompt: "保持构图",
      imageUrls: ["https://cdn.example/landscape.png"],
      size: "1536x1152",
    });
  });

  it("仅在自适应 size 不受支持时映射最近比例", async () => {
    mocks.volcGenerateImage
      .mockRejectedValueOnce({ response: { status: 400, data: { message: "unsupported size parameter" } } })
      .mockResolvedValueOnce("fallback-base64");
    stubPng(4032, 3024);

    await expect(aiEditImage({ imageUrl: "https://cdn.example/photo.png", prompt: "保持构图" })).resolves.toBe("fallback-base64");
    expect(mocks.volcGenerateImage).toHaveBeenNthCalledWith(1, {
      prompt: "保持构图",
      imageUrls: ["https://cdn.example/photo.png"],
      size: "1536x1152",
    });
    expect(mocks.volcGenerateImage).toHaveBeenNthCalledWith(2, {
      prompt: "保持构图",
      imageUrls: ["https://cdn.example/photo.png"],
      aspectRatio: "4:3",
    });
  });

  it("其他错误直接抛出，不触发可能重复扣费的降级生成", async () => {
    const error = { response: { status: 503, data: { message: "service unavailable" } } };
    mocks.volcGenerateImage.mockRejectedValue(error);
    stubPng(1600, 1200);
    await expect(aiEditImage({ imageUrl: "https://cdn.example/photo.jpg", prompt: "保持构图" })).rejects.toBe(error);
    expect(mocks.volcGenerateImage).toHaveBeenCalledTimes(1);
  });

  it("无法识别原图尺寸时停止处理且不调用模型", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(Buffer.from("not-an-image"), { status: 200 })));

    await expect(aiEditImage({ imageUrl: "https://cdn.example/broken.bin", prompt: "保持构图" })).rejects.toThrow(
      "无法识别原图尺寸，已停止处理以避免裁切构图",
    );
    expect(mocks.volcGenerateImage).not.toHaveBeenCalled();
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
