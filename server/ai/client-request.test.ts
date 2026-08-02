import { beforeEach, describe, expect, it, vi } from "vitest";

const axiosMocks = vi.hoisted(() => ({
  post: vi.fn(),
  get: vi.fn(),
}));

vi.mock("axios", () => ({
  default: axiosMocks,
}));

vi.mock("../_core/env", () => ({
  ENV: {
    moonshotApiKey: "test-moonshot-key",
    moonshotBaseUrl: "https://moonshot.example/v1",
    moonshotModel: "kimi-k2.6",
    moonshotModelHeavy: "kimi-k3",
    arkApiKey: "test-ark-key",
    arkBaseUrl: "https://ark.example/api/v3",
    arkImageModel: "seedream-test-model",
    arkImageWatermark: true,
  },
}));

import { kimiChat } from "./kimiClient";
import { volcGenerateImage } from "./volcImageClient";

describe("Kimi 请求体", () => {
  beforeEach(() => {
    axiosMocks.post.mockReset();
    axiosMocks.get.mockReset();
  });

  it("调用方未指定 temperature 时不发送该参数", async () => {
    axiosMocks.post.mockResolvedValue({
      data: { choices: [{ message: { content: "模型响应" } }] },
    });

    await kimiChat({ messages: [{ role: "user", text: "你好" }] });

    expect(axiosMocks.post.mock.calls[0][1]).not.toHaveProperty("temperature");
  });

  it("调用方显式指定 temperature 时原样发送", async () => {
    axiosMocks.post.mockResolvedValue({
      data: { choices: [{ message: { content: "模型响应" } }] },
    });

    await kimiChat({
      messages: [{ role: "user", text: "你好" }],
      temperature: 1,
    });

    expect(axiosMocks.post.mock.calls[0][1]).toHaveProperty("temperature", 1);
  });
});

describe("Seedream 请求体", () => {
  beforeEach(() => {
    axiosMocks.post.mockReset();
    axiosMocks.get.mockReset();
  });

  it("不发送当前模型不支持的组图参数并保留基础参数", async () => {
    axiosMocks.post.mockResolvedValue({
      data: { data: [{ b64_json: Buffer.from("image").toString("base64") }] },
    });

    await volcGenerateImage({ prompt: "一张温暖的照片", aspectRatio: "1:1" });

    const body = axiosMocks.post.mock.calls[0][1];
    expect(body).not.toHaveProperty("sequential_image_generation");
    expect(body).not.toHaveProperty("sequential_image_generation_options");
    expect(body).toMatchObject({
      response_format: "b64_json",
      size: "2048x2048",
      watermark: true,
    });
  });
});
