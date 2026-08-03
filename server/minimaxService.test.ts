import { beforeEach, describe, expect, it, vi } from "vitest";

const { aiChatMock } = vi.hoisted(() => ({ aiChatMock: vi.fn() }));

vi.mock("./ai/gateway", () => ({
  aiChat: aiChatMock,
  aiGenerateImage: vi.fn(),
}));

import {
  analyzeFoodNutrition,
  filterFreshStoryTopics,
  generateStoryText,
  identifyPlant,
  normalizeStoryTopicTitle,
  queryHealthInfo,
  suggestStoryTopics,
} from "./minimaxService";

describe("Kimi JSON 对象协议", () => {
  beforeEach(() => {
    aiChatMock.mockReset();
  });

  it("题材标题忽略空格、标点和大小写后比较", () => {
    expect(normalizeStoryTopicTitle(" 森林 探险！ ")).toBe("森林探险");
    expect(normalizeStoryTopicTitle("Moon Trip！")).toBe("moontrip");
  });

  it("排除会话历史题材并去除本批重复", () => {
    const candidates = [
      { title: "森林 探险！", description: "重复历史", protagonist: "小熊" },
      { title: "海底寻宝", description: "第一次", protagonist: "小鱼" },
      { title: "海底寻宝！", description: "本批重复", protagonist: "小鱼" },
      { title: "月球旅行", description: "新题材", protagonist: "小兔" },
      { title: "会飞的书包", description: "新题材", protagonist: "乐乐" },
      { title: "勇敢的小鹿", description: "新题材", protagonist: "小鹿" },
    ];

    expect(filterFreshStoryTopics(candidates, ["森林探险"]).map((item) => item.title)).toEqual([
      "海底寻宝",
      "月球旅行",
      "会飞的书包",
      "勇敢的小鹿",
    ]);
  });

  it("题材推荐一次生成八个候选并排除会话历史", async () => {
    const topics = [
      { title: "森林 探险！", description: "重复历史", protagonist: "小熊" },
      { title: "海底寻宝", description: "第一次", protagonist: "小鱼" },
      { title: "海底寻宝！", description: "本批重复", protagonist: "小鱼" },
      { title: "月球旅行", description: "新题材", protagonist: "小兔" },
      { title: "会飞的书包", description: "新题材", protagonist: "乐乐" },
      { title: "勇敢的小鹿", description: "新题材", protagonist: "小鹿" },
      { title: "星星邮局", description: "候补题材", protagonist: "小猫" },
      { title: "云朵列车", description: "候补题材", protagonist: "朵朵" },
    ];
    aiChatMock.mockResolvedValue(JSON.stringify({ topics }));

    await expect(suggestStoryTopics({
      theme: "温馨治愈",
      character: "一个6岁的小朋友",
      excludeTitles: ["森林探险"],
    })).resolves.toEqual([
      topics[1], topics[3], topics[4], topics[5],
    ]);

    const prompt = aiChatMock.mock.calls[0][0].userPrompt as string;
    expect(prompt).toContain("推荐8个");
    expect(prompt).toContain("森林探险");
    expect(prompt).toContain("严禁重复");
  });

  it("过滤后不足四个全新题材时明确失败", async () => {
    aiChatMock.mockResolvedValue(JSON.stringify({
      topics: [
        { title: "森林探险！", description: "重复历史", protagonist: "小熊" },
        { title: "月球旅行", description: "新题材", protagonist: "小兔" },
        { title: "会飞的书包", description: "新题材", protagonist: "乐乐" },
        { title: "勇敢的小鹿", description: "新题材", protagonist: "小鹿" },
      ],
    }));

    await expect(suggestStoryTopics({
      theme: "科幻探险",
      character: "一个6岁的小朋友",
      excludeTitles: ["森林探险"],
    })).rejects.toThrow("AI 未返回四个全新题材");
    expect(aiChatMock).toHaveBeenCalledTimes(1);
  });

  it("故事题材要求并解析 topics 对象，不能要求裸数组", async () => {
    const topics = [1, 2, 3, 4].map((index) => ({
      title: `题材${index}`,
      description: `简介${index}`,
      protagonist: `主角${index}`,
    }));
    aiChatMock.mockResolvedValue(JSON.stringify({ topics }));

    await expect(suggestStoryTopics({
      theme: "温馨治愈",
      character: "一个6岁的小朋友",
    })).resolves.toEqual(topics);

    const request = aiChatMock.mock.calls[0][0];
    expect(request.json).toBe(true);
    expect(request.userPrompt).toContain("返回JSON对象");
    expect(request.userPrompt).toContain('{"topics":[');
    expect(request.userPrompt).not.toContain("返回JSON数组");
  });

  it("故事正文继续使用 title/pages 对象根", async () => {
    aiChatMock.mockResolvedValue(JSON.stringify({
      title: "分享的快乐",
      pages: [1, 2, 3, 4].map((pageNumber) => ({
        pageNumber,
        text: `第${pageNumber}页`,
        imagePrompt: `page ${pageNumber}`,
      })),
    }));

    await generateStoryText({ age: 6, theme: "睡前故事", topic: "学会分享", character: "乐乐" });

    expect(aiChatMock.mock.calls[0][0].userPrompt).toContain('{"title":"故事标题","pages":[');
  });

  it("超级英雄使用通用风格特征且提示词不含品牌词", async () => {
    const topics = [1, 2, 3, 4].map((index) => ({
      title: `英雄任务${index}`,
      description: `守护家园${index}`,
      protagonist: `小勇士${index}`,
    }));
    aiChatMock.mockResolvedValue(JSON.stringify({ topics }));

    await suggestStoryTopics({ theme: "超级英雄", character: "一个7岁的小朋友" });

    const prompt = aiChatMock.mock.calls[0][0].userPrompt as string;
    expect(prompt).toContain("正义英雄团队、守护家园、勇气与责任");
    expect(prompt).not.toMatch(/漫威|Marvel|DC/i);
  });

  it("生活助手三个 JSON 任务都要求对象根而非裸数组", async () => {
    aiChatMock
      .mockResolvedValueOnce(JSON.stringify({
        name: "番茄炒蛋", healthScore: 80, calories: "100kcal", protein: "5g", fat: "4g",
        carbs: "6g", sodium: "200mg", sugar: "2g", tags: [], summary: "家常菜", ingredients: [], advice: "少油少盐",
      }))
      .mockResolvedValueOnce(JSON.stringify({ title: "月季", description: "花卉", details: [], tags: [] }))
      .mockResolvedValueOnce(JSON.stringify({
        title: "苹果", description: "水果", details: [], tags: [], advice: "适量食用",
      }));

    await analyzeFoodNutrition("番茄炒蛋");
    await identifyPlant({ textHint: "月季" });
    await queryHealthInfo({ textHint: "苹果" });

    for (const [request] of aiChatMock.mock.calls) {
      expect(request.json).toBe(true);
      expect(request.userPrompt).toMatch(/\{[\s\S]*\}/);
      expect(request.userPrompt).not.toContain("返回JSON数组");
    }
  });

  it("生活助手解析失败日志不记录模型原文或用户输入", async () => {
    aiChatMock.mockResolvedValue("苹果的营养信息暂时无法组成JSON");
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => undefined);

    await expect(queryHealthInfo({ textHint: "苹果的营养" })).rejects.toThrow("健康信息解析失败，请重试");
    const logged = JSON.stringify(errorLog.mock.calls);
    errorLog.mockRestore();

    expect(logged).not.toContain("苹果");
    expect(logged).not.toContain("模型原文");
  });
});
