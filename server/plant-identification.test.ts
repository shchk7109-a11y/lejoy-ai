import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  aiVisionFast: vi.fn(),
  aiChat: vi.fn(),
}));

vi.mock("./ai/gateway", () => ({
  aiVisionFast: mocks.aiVisionFast,
  aiChat: mocks.aiChat,
}));

import { getPlantDetails, identifyPlantFast } from "./plant-identification";

describe("识花草两段式领域服务", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.aiVisionFast.mockResolvedValue({
      content: JSON.stringify({
        name: "月季",
        commonNames: ["月月红"],
        summary: "常见的蔷薇科观赏花卉，花期较长。",
        safetyNotice: "枝条有刺，接触时注意防护。",
      }),
      provider: "dashscope",
      model: "qwen3.7-flash-2026-07-15",
      fallbackUsed: false,
      durationMs: 1_234,
    });
    mocks.aiChat.mockResolvedValue(JSON.stringify({
      carePoints: ["保持充足光照", "见干见湿浇水"],
      floweringAndHabits: ["春末至秋季开花", "喜温暖通风环境"],
      meaningAndStories: ["常寓意幸福与长久"],
    }));
  });

  it("识别段只返回短信息并保留供应商观测字段", async () => {
    await expect(identifyPlantFast("https://cdn.example/flower.jpg")).resolves.toEqual({
      name: "月季",
      commonNames: ["月月红"],
      summary: "常见的蔷薇科观赏花卉，花期较长。",
      safetyNotice: "枝条有刺，接触时注意防护。",
      provider: "dashscope",
      model: "qwen3.7-flash-2026-07-15",
      fallbackUsed: false,
      durationMs: 1_234,
    });

    expect(mocks.aiVisionFast).toHaveBeenCalledWith({
      systemPrompt: expect.stringMatching(/JSON.*植物/u),
      userPrompt: expect.stringContaining("一句话简介"),
      imageUrl: "https://cdn.example/flower.jpg",
      maxTokens: 180,
    });
    const prompt = JSON.stringify(mocks.aiVisionFast.mock.calls[0][0]);
    expect(prompt).not.toContain("养护要点");
    expect(prompt).not.toContain("花期习性");
  });

  it("没有安全风险时接受空提示", async () => {
    mocks.aiVisionFast.mockResolvedValue({
      content: JSON.stringify({
        name: "桂花",
        commonNames: [],
        summary: "常绿灌木或小乔木，开花时香气明显。",
        safetyNotice: "",
      }),
      provider: "dashscope",
      model: "qwen3.7-flash-2026-07-15",
      fallbackUsed: false,
      durationMs: 800,
    });

    const result = await identifyPlantFast("https://cdn.example/osmanthus.jpg");
    expect(result.safetyNotice).toBe("");
    expect(result.commonNames).toEqual([]);
  });

  it("拒绝超长名称、过多俗名和无效对象", async () => {
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => undefined);
    for (const invalid of [
      { name: "花".repeat(31), commonNames: [], summary: "简介", safetyNotice: "" },
      { name: "月季", commonNames: ["一", "二", "三", "四"], summary: "简介", safetyNotice: "" },
      { name: "月季", commonNames: [], summary: 123, safetyNotice: "" },
    ]) {
      mocks.aiVisionFast.mockResolvedValueOnce({
        content: JSON.stringify(invalid),
        provider: "dashscope",
        model: "qwen3.7-flash-2026-07-15",
        fallbackUsed: false,
        durationMs: 100,
      });
      await expect(identifyPlantFast("https://cdn.example/flower.jpg"))
        .rejects.toThrow("植物识别结果解析失败，请重试");
    }
    expect(errorLog).toHaveBeenCalledTimes(3);
    errorLog.mockRestore();
  });

  it("详情段只用植物名称走纯文本快通道", async () => {
    await expect(getPlantDetails(" 月季 ")).resolves.toEqual({
      carePoints: ["保持充足光照", "见干见湿浇水"],
      floweringAndHabits: ["春末至秋季开花", "喜温暖通风环境"],
      meaningAndStories: ["常寓意幸福与长久"],
    });

    expect(mocks.aiChat).toHaveBeenCalledWith({
      systemPrompt: expect.stringContaining("只返回JSON"),
      userPrompt: expect.stringContaining("月季"),
      json: true,
    });
    const request = JSON.stringify(mocks.aiChat.mock.calls[0][0]);
    expect(request).toContain("不得提供医疗、治疗或食用安全结论");
    expect(request).not.toContain("imageUrl");
  });

  it("详情段限制每组最多四项并拒绝无效 JSON", async () => {
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.aiChat.mockResolvedValueOnce(JSON.stringify({
      carePoints: ["1", "2", "3", "4", "5"],
      floweringAndHabits: [],
      meaningAndStories: [],
    }));
    await expect(getPlantDetails("月季")).rejects.toThrow("植物详情解析失败，请重试");

    mocks.aiChat.mockResolvedValueOnce("不是 JSON");
    await expect(getPlantDetails("月季")).rejects.toThrow("植物详情解析失败，请重试");
    expect(errorLog).toHaveBeenCalledTimes(2);
    errorLog.mockRestore();
  });
});
