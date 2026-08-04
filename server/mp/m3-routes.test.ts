import express, { type RequestHandler } from "express";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { User } from "../../drizzle/schema";
import { withCreditCharge } from "../credits-charge";
import { DISH_ANALYSIS_DISCLAIMER, type DishNutritionAnalysis } from "../dish-analysis";
import { CHAT_DISCLAIMER, CHAT_MEDICAL_GUIDANCE } from "./chat-persona";
import { createM3Router, type M3Dependencies } from "./m3-routes";

const testUser: User = {
  id: 7,
  openId: "mp-openid",
  name: "乐享用户",
  email: null,
  loginMethod: "wechat_mp",
  role: "user",
  credits: 100,
  createdAt: new Date(),
  updatedAt: new Date(),
  lastSignedIn: new Date(),
};

const storyPages = [1, 2, 3, 4].map((pageNumber) => ({
  pageNumber,
  text: `第${pageNumber}页故事`,
  imagePrompt: `page ${pageNumber} illustration`,
}));

function dependencies(overrides: Partial<M3Dependencies> = {}): M3Dependencies {
  return {
    contentSecurityMode: "wechat",
    storagePut: vi.fn(async (key) => ({ key, url: `https://cdn.example/${key}` })),
    storageGet: vi.fn(async (key) => ({ key, url: `https://cdn.example/${key}` })),
    storageDelete: vi.fn(async () => undefined),
    submitMediaCheck: vi.fn(async () => ({ status: "pending", traceId: "trace-m3" })),
    createMediaCheckTask: vi.fn(async () => undefined),
    findMediaCheckTaskByFile: vi.fn(async () => undefined),
    withCreditCharge: vi.fn(async (_userId, cost, _feature, fn) => ({
      value: await fn(),
      credits: 100 - cost,
    })) as M3Dependencies["withCreditCharge"],
    suggestStoryTopics: vi.fn(async () => [1, 2, 3, 4].map((index) => ({
      title: `题材${index}`,
      description: `有趣的故事${index}`,
      protagonist: `主角${index}`,
    }))),
    generateStoryText: vi.fn(async () => ({ title: "勇敢的小树", pages: storyPages })),
    aiGenerateImage: vi.fn(async () => Buffer.from("generated-image").toString("base64")),
    aiTTS: vi.fn(async () => ({ audioData: Buffer.from("speech").toString("base64"), audioMime: "audio/mpeg" })),
    analyzeFoodNutrition: vi.fn(),
    generateFoodImage: vi.fn(),
    extractDishName: vi.fn(),
    fetchDouyinPublicMetadata: vi.fn(),
    inspectDishImage: vi.fn(),
    analyzeDishNutrition: vi.fn(),
    identifyPlantFast: vi.fn(),
    getPlantDetails: vi.fn(),
    queryHealthInfo: vi.fn(),
    aiChatMulti: vi.fn(),
    checkTextSecurity: vi.fn(async () => ({ safe: true })),
    getCredits: vi.fn(async () => 100),
    createFileId: vi.fn(() => "fixed-id"),
    ...overrides,
  };
}

const servers: Server[] = [];

async function startApp(deps: M3Dependencies) {
  const app = express();
  app.use(express.json({ limit: "20mb" }));
  const authenticate: RequestHandler = (req, _res, next) => {
    Object.assign(req, { mpUser: testUser });
    next();
  };
  app.use("/api/mp", createM3Router(deps, authenticate));
  const server = await new Promise<Server>((resolve) => {
    const listening = app.listen(0, "127.0.0.1", () => resolve(listening));
  });
  servers.push(server);
  const { port } = server.address() as AddressInfo;
  return `http://127.0.0.1:${port}/api/mp`;
}

async function post(baseUrl: string, path: string, body: unknown) {
  return fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  })));
  vi.restoreAllMocks();
});

describe("M3 故事会 REST 接口", () => {
  it("只释放当前用户自己的故事图片和音频", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const deps = dependencies();
    const baseUrl = await startApp(deps);

    const response = await post(baseUrl, "/story/release-assets", {
      fileKeys: ["stories/7/page-1.png", "stories-audio/7/page-1.mp3", "stories/7/page-1.png"],
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ deleted: 2 });
    expect(deps.storageDelete).toHaveBeenCalledTimes(2);
    expect(deps.storageDelete).toHaveBeenCalledWith("stories/7/page-1.png");
    expect(deps.storageDelete).toHaveBeenCalledWith("stories-audio/7/page-1.mp3");
    expect(info).toHaveBeenCalledWith("[story.release-assets]", expect.objectContaining({
      userId: 7,
      fileCount: 2,
      durationMs: expect.any(Number),
    }));
  });

  it("内容安全审核中的故事图片会保留而音频仍可释放", async () => {
    const deps = dependencies({
      findMediaCheckTaskByFile: vi.fn(async (_userId, fileKey) => fileKey.startsWith("stories/7/") ? ({ status: "pending" } as never) : undefined),
    });
    const baseUrl = await startApp(deps);

    const response = await post(baseUrl, "/story/release-assets", {
      fileKeys: ["stories/7/page-1.png", "stories-audio/7/page-1.mp3"],
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      deleted: 1,
      retainedFileKeys: ["stories/7/page-1.png"],
    });
    expect(deps.storageDelete).toHaveBeenCalledTimes(1);
    expect(deps.storageDelete).toHaveBeenCalledWith("stories-audio/7/page-1.mp3");
  });

  it("拒绝释放其他用户或非故事目录的文件", async () => {
    const deps = dependencies();
    const baseUrl = await startApp(deps);

    const otherUser = await post(baseUrl, "/story/release-assets", { fileKeys: ["stories/8/page-1.png"] });
    const unrelated = await post(baseUrl, "/story/release-assets", { fileKeys: ["uploads/7/page-1.png"] });

    expect(otherUser.status).toBe(400);
    expect(unrelated.status).toBe(400);
    expect(deps.storageDelete).not.toHaveBeenCalled();
  });

  it("推荐四个题材且不扣积分", async () => {
    const deps = dependencies();
    const baseUrl = await startApp(deps);
    const response = await post(baseUrl, "/story/suggest-topics", {
      theme: "勇气成长",
      childName: "乐乐",
      age: 6,
      excludeTitles: ["森林探险", "月球旅行"],
    });

    expect(response.status).toBe(200);
    const body = await response.json() as { topics: unknown[] };
    expect(body.topics).toHaveLength(4);
    expect(deps.suggestStoryTopics).toHaveBeenCalledWith({
      theme: "勇气成长",
      character: "名叫乐乐的6岁孩子",
      customProtagonist: undefined,
      excludeTitles: ["森林探险", "月球旅行"],
    });
    expect(deps.withCreditCharge).not.toHaveBeenCalled();
  });

  it("拒绝无效的历史题材排除列表", async () => {
    const deps = dependencies();
    const baseUrl = await startApp(deps);
    const invalidLists = [
      Array.from({ length: 41 }, (_, index) => `题材${index}`),
      ["森林探险", 123],
      ["题".repeat(21)],
    ];

    for (const excludeTitles of invalidLists) {
      const response = await post(baseUrl, "/story/suggest-topics", {
        theme: "勇气成长",
        childName: "乐乐",
        age: 6,
        excludeTitles,
      });
      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toMatchObject({
        error: { code: "BAD_REQUEST", message: "历史题材列表无效" },
      });
    }
    expect(deps.suggestStoryTopics).not.toHaveBeenCalled();
  });

  it("生成严格四页故事结构并扣 1 积分", async () => {
    const deps = dependencies();
    const baseUrl = await startApp(deps);
    const response = await post(baseUrl, "/story/structure", {
      childName: "乐乐",
      age: 6,
      theme: "勇气成长",
      topic: "森林探险",
      protagonist: "小松鼠",
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ title: "勇敢的小树", pages: storyPages, credits: 99 });
    expect(deps.withCreditCharge).toHaveBeenCalledWith(7, 1, "story_structure", expect.any(Function), "AI故事构思");
    expect(deps.generateStoryText).toHaveBeenCalledWith({ age: 6, theme: "勇气成长", topic: "森林探险", character: "乐乐" });
  });

  it("单页配图落 OSS 并提交媒体安全任务", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const deps = dependencies();
    const baseUrl = await startApp(deps);
    const response = await post(baseUrl, "/story/page-image", {
      imagePrompt: "a little squirrel in a warm forest",
      pageNumber: 2,
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      imageUrl: "https://cdn.example/stories/7/fixed-id-p2.png",
      fileKey: "stories/7/fixed-id-p2.png",
      pageNumber: 2,
      securityStatus: "pending",
    });
    expect(deps.aiGenerateImage).toHaveBeenCalledWith(expect.objectContaining({ aspectRatio: "1:1", profile: "story" }));
    expect(deps.storagePut).toHaveBeenCalledWith("stories/7/fixed-id-p2.png", expect.any(Buffer), "image/png");
    expect(deps.createMediaCheckTask).toHaveBeenCalledWith({
      traceId: "trace-m3",
      userId: 7,
      fileKey: "stories/7/fixed-id-p2.png",
      status: "pending",
    });
    expect(info).toHaveBeenCalledWith("[story.page-image]", expect.objectContaining({
      pageNumber: 2,
      hasReferenceImage: false,
      success: true,
      durationMs: expect.any(Number),
    }));
  });

  it("上传故事参考图到当前用户临时目录并登记媒体安全", async () => {
    const deps = dependencies();
    const baseUrl = await startApp(deps);
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0x01]);
    const response = await post(baseUrl, "/story/reference-image", {
      base64: jpeg.toString("base64"),
      mimeType: "image/jpeg",
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      fileKey: "story-refs/7/fixed-id.jpg",
      securityStatus: "pending",
    });
    expect(deps.storagePut).toHaveBeenCalledWith(
      "story-refs/7/fixed-id.jpg",
      jpeg,
      "image/jpeg",
    );
    expect(deps.createMediaCheckTask).toHaveBeenCalledWith({
      traceId: "trace-m3",
      userId: 7,
      fileKey: "story-refs/7/fixed-id.jpg",
      status: "pending",
    });
  });

  it("单页配图只接受当前用户的故事参考图", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const deps = dependencies({
      findMediaCheckTaskByFile: vi.fn(async (_userId, fileKey) => ({
        fileKey,
        status: "pass",
      } as never)),
    });
    const baseUrl = await startApp(deps);
    const accepted = await post(baseUrl, "/story/page-image", {
      imagePrompt: "孩子走进森林",
      pageNumber: 1,
      referenceFileKey: "story-refs/7/child.jpg",
    });

    expect(accepted.status).toBe(200);
    expect(deps.aiGenerateImage).toHaveBeenCalledWith(expect.objectContaining({
      referenceImageUrl: "https://cdn.example/story-refs/7/child.jpg",
    }));
    expect(info).toHaveBeenCalledWith("[story.page-image]", expect.objectContaining({
      hasReferenceImage: true,
    }));

    for (const referenceFileKey of [
      "story-refs/8/child.jpg",
      "uploads/7/child.jpg",
      "https://attacker.example/child.jpg",
    ]) {
      const rejected = await post(baseUrl, "/story/page-image", {
        imagePrompt: "孩子走进森林",
        pageNumber: 1,
        referenceFileKey,
      });
      expect(rejected.status).toBe(400);
    }
  });

  it("参考图释放接口幂等删除且拒绝其他用户文件", async () => {
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    const deps = dependencies();
    const baseUrl = await startApp(deps);
    const accepted = await post(baseUrl, "/story/reference-image/release", {
      fileKey: "story-refs/7/child.jpg",
    });

    expect(accepted.status).toBe(200);
    await expect(accepted.json()).resolves.toEqual({ deleted: true });
    expect(deps.storageDelete).toHaveBeenCalledWith("story-refs/7/child.jpg");

    const rejected = await post(baseUrl, "/story/reference-image/release", {
      fileKey: "story-refs/8/child.jpg",
    });
    expect(rejected.status).toBe(400);
  });

  it("朗读音频落 OSS，只有第一页扣 2 积分", async () => {
    const deps = dependencies();
    const baseUrl = await startApp(deps);
    const first = await post(baseUrl, "/story/page-speech", {
      pageNumber: 1,
      text: "第一页故事",
      title: "勇敢的小树",
      voiceType: "lively",
      isFirstPage: true,
    });
    const second = await post(baseUrl, "/story/page-speech", {
      pageNumber: 2,
      text: "第二页故事",
      voiceType: "sichuan",
      isFirstPage: false,
    });

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    await expect(first.json()).resolves.toMatchObject({ audioUrl: "https://cdn.example/stories-audio/7/fixed-id-p1.mp3", pageNumber: 1, credits: 98 });
    await expect(second.json()).resolves.toMatchObject({ audioUrl: "https://cdn.example/stories-audio/7/fixed-id-p2.mp3", pageNumber: 2 });
    expect(deps.withCreditCharge).toHaveBeenCalledTimes(1);
    expect(deps.withCreditCharge).toHaveBeenCalledWith(7, 2, "story_speech", expect.any(Function), "AI故事语音生成");
    expect(deps.aiTTS).toHaveBeenNthCalledWith(1, "勇敢的小树。第一页故事", "lively");
    expect(deps.aiTTS).toHaveBeenNthCalledWith(2, "第二页故事", "sichuan");
  });
});

describe("M3 生活助手 REST 接口", () => {
  const nutrition = {
    name: "番茄炒蛋",
    healthScore: 82,
    calories: "120kcal/100g",
    protein: "6g/100g",
    fat: "7g/100g",
    carbs: "8g/100g",
    sodium: "300mg/100g",
    sugar: "3g/100g",
    tags: ["家常菜", "蛋白质"],
    summary: "营养均衡的家常菜。",
    ingredients: ["番茄富含维生素", "鸡蛋提供蛋白质"],
    advice: "少油少盐更适合日常食用。",
  };

  const dishAnalysis: DishNutritionAnalysis = {
    title: "番茄炒蛋",
    healthScore: 82,
    scoreLabel: "较健康",
    portionBasis: "每100克估算",
    nutrition: {
      calories: "120kcal",
      protein: "6g",
      fat: "7g",
      carbs: "8g",
      sodium: "300mg",
      sugar: "3g",
    },
    ingredients: {
      primary: ["番茄", "鸡蛋"],
      secondary: [],
      seasonings: ["盐", "食用油"],
    },
    overview: "蛋白质和蔬菜搭配较均衡。",
    attentionPoints: [
      { kind: "positive", title: "蛋白质来源", detail: "鸡蛋提供蛋白质。" },
      { kind: "caution", title: "留意用油", detail: "用油量会影响脂肪。" },
    ],
    cookingTips: ["少油炒制。"],
    pairingTips: ["搭配一份绿叶菜。"],
    tags: ["家常菜"],
    disclaimer: DISH_ANALYSIS_DISCLAIMER,
  };

  it("菜名识别后并行启动营养分析与配图，只扣 1 分", async () => {
    let resolveNutrition!: (value: DishNutritionAnalysis) => void;
    let resolveImage!: (value: string) => void;
    const nutritionPromise = new Promise<DishNutritionAnalysis>((resolve) => { resolveNutrition = resolve; });
    const imagePromise = new Promise<string>((resolve) => { resolveImage = resolve; });
    const deps = dependencies({
      extractDishName: vi.fn(async () => "番茄炒蛋"),
      fetchDouyinPublicMetadata: vi.fn(),
      analyzeDishNutrition: vi.fn(() => nutritionPromise),
      generateFoodImage: vi.fn(() => imagePromise),
    });
    const baseUrl = await startApp(deps);

    const pendingResponse = post(baseUrl, "/life/dish-analyze", { dishText: "番茄炒蛋" });
    await vi.waitFor(() => {
      expect(deps.analyzeDishNutrition).toHaveBeenCalledOnce();
      expect(deps.generateFoodImage).toHaveBeenCalledOnce();
    });
    expect(deps.fetchDouyinPublicMetadata).not.toHaveBeenCalled();

    resolveNutrition(dishAnalysis);
    resolveImage(`data:image/jpeg;base64,${Buffer.from("dish-image").toString("base64")}`);
    const response = await pendingResponse;

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      code: "OK",
      title: "番茄炒蛋",
      imageSource: "generated",
      imageUrl: "https://cdn.example/life-food/7/fixed-id.jpg",
      healthScore: 82,
      credits: 99,
    });
    expect(deps.withCreditCharge).toHaveBeenCalledWith(
      7,
      1,
      "life_dish_analyze",
      expect.any(Function),
      "生活助手：菜品健康分析",
    );
  });

  it("分享文案直取失败后抓公开标题再识别", async () => {
    const extractDishName = vi.fn()
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce("糖醋排骨");
    const deps = dependencies({
      extractDishName,
      fetchDouyinPublicMetadata: vi.fn(async () => "糖醋排骨的家常做法"),
      analyzeDishNutrition: vi.fn(async () => ({ ...dishAnalysis, title: "糖醋排骨" })),
      generateFoodImage: vi.fn(async () => { throw new Error("image unavailable"); }),
    });
    const baseUrl = await startApp(deps);

    const response = await post(baseUrl, "/life/dish-analyze", {
      dishText: "复制 https://v.douyin.com/abc/ 打开抖音",
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      code: "OK",
      title: "糖醋排骨",
      imageSource: "none",
      credits: 99,
    });
    expect(extractDishName).toHaveBeenNthCalledWith(1, "复制 https://v.douyin.com/abc/ 打开抖音");
    expect(extractDishName).toHaveBeenNthCalledWith(2, "糖醋排骨的家常做法");
  });

  it("文字与公开标题均未识别时返回友好结果且不扣分", async () => {
    const deps = dependencies({
      extractDishName: vi.fn(async () => undefined),
      fetchDouyinPublicMetadata: vi.fn(async () => undefined),
      getCredits: vi.fn(async () => 37),
    });
    const baseUrl = await startApp(deps);

    const response = await post(baseUrl, "/life/dish-analyze", { dishText: "今天吃点好的" });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      code: "DISH_NOT_FOUND",
      message: "没认出这道菜，请说一下菜名，或拍张照片",
      credits: 37,
    });
    expect(deps.withCreditCharge).not.toHaveBeenCalled();
    expect(deps.analyzeDishNutrition).not.toHaveBeenCalled();
    expect(deps.generateFoodImage).not.toHaveBeenCalled();
  });

  it("本人上传菜图经视觉拆解后返回原图并扣 1 分", async () => {
    const ingredients = dishAnalysis.ingredients;
    const deps = dependencies({
      findMediaCheckTaskByFile: vi.fn(async (_userId, fileKey) => ({
        id: 8,
        traceId: "trace-dish",
        userId: 7,
        fileKey,
        status: "pass",
        createdAt: new Date(),
      })),
      inspectDishImage: vi.fn(async () => ({ dishName: "番茄炒蛋", ingredients })),
      analyzeDishNutrition: vi.fn(async () => dishAnalysis),
    });
    const baseUrl = await startApp(deps);

    const response = await post(baseUrl, "/life/dish-analyze", { fileKey: "uploads/7/dish.jpg" });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      code: "OK",
      imageUrl: "https://cdn.example/uploads/7/dish.jpg",
      imageSource: "upload",
      ingredients,
      credits: 99,
    });
    expect(deps.inspectDishImage).toHaveBeenCalledWith("https://cdn.example/uploads/7/dish.jpg");
    expect(deps.analyzeDishNutrition).toHaveBeenCalledWith({ dishName: "番茄炒蛋", ingredients });
    expect(deps.generateFoodImage).not.toHaveBeenCalled();
  });

  it("菜图未识别不扣分，非本人图片直接拒绝", async () => {
    const deps = dependencies({
      findMediaCheckTaskByFile: vi.fn(async (_userId, fileKey) => fileKey.includes("dish.jpg") ? ({
        id: 9,
        traceId: "trace-dish-miss",
        userId: 7,
        fileKey,
        status: "pass",
        createdAt: new Date(),
      }) : undefined),
      inspectDishImage: vi.fn(async () => ({
        dishName: undefined,
        ingredients: { primary: [], secondary: [], seasonings: [] },
      })),
    });
    const baseUrl = await startApp(deps);

    const miss = await post(baseUrl, "/life/dish-analyze", { fileKey: "uploads/7/dish.jpg" });
    const foreign = await post(baseUrl, "/life/dish-analyze", { fileKey: "uploads/8/dish.jpg" });

    expect(miss.status).toBe(200);
    await expect(miss.json()).resolves.toMatchObject({ code: "DISH_NOT_FOUND", credits: 100 });
    expect(foreign.status).toBe(400);
    expect(deps.withCreditCharge).not.toHaveBeenCalled();
  });

  it("菜品文字未通过安全检查时不调用模型也不扣分", async () => {
    const deps = dependencies({
      checkTextSecurity: vi.fn(async () => ({ safe: false, reason: "内容不合适" })),
    });
    const baseUrl = await startApp(deps);

    const response = await post(baseUrl, "/life/dish-analyze", { dishText: "不合适内容" });

    expect(response.status).toBe(422);
    expect(deps.extractDishName).not.toHaveBeenCalled();
    expect(deps.withCreditCharge).not.toHaveBeenCalled();
  });

  it("查菜谱同时生成营养卡和菜图，扣 1 分并送检生成图", async () => {
    const deps = dependencies({
      analyzeFoodNutrition: vi.fn(async () => nutrition),
      generateFoodImage: vi.fn(async () => `data:image/jpeg;base64,${Buffer.from("food-image").toString("base64")}`),
    });
    const baseUrl = await startApp(deps);
    const response = await post(baseUrl, "/life/recipe", { foodName: "番茄炒蛋" });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      title: "番茄炒蛋",
      description: "营养均衡的家常菜。",
      tags: ["家常菜", "蛋白质"],
      imageUrl: "https://cdn.example/life-food/7/fixed-id.jpg",
      securityStatus: "pending",
      credits: 99,
    });
    expect(deps.withCreditCharge).toHaveBeenCalledWith(7, 1, "life_recipe", expect.any(Function), "生活助手：查菜谱");
    expect(deps.analyzeFoodNutrition).toHaveBeenCalledWith("番茄炒蛋");
    expect(deps.generateFoodImage).toHaveBeenCalledWith("番茄炒蛋");
    expect(deps.storagePut).toHaveBeenCalledWith("life-food/7/fixed-id.jpg", expect.any(Buffer), "image/jpeg");
    expect(deps.submitMediaCheck).toHaveBeenCalledWith("https://cdn.example/life-food/7/fixed-id.jpg", "mp-openid");
  });

  it("识花草只接受当前用户已登记的上传图并扣 1 分", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const identifyPlantFast = vi.fn(async () => ({
      name: "月季",
      commonNames: ["月月红"],
      summary: "常见观赏花卉。",
      safetyNotice: "枝条有刺。",
      provider: "dashscope",
      model: "qwen3.7-flash-2026-07-15",
      fallbackUsed: false,
      durationMs: 820,
    }));
    const deps = dependencies({
      findMediaCheckTaskByFile: vi.fn(async (_userId, fileKey) => ({
        id: 3,
        traceId: "trace-source",
        userId: 7,
        fileKey,
        status: "pass",
        createdAt: new Date(),
      })),
      identifyPlantFast,
    });
    const baseUrl = await startApp(deps);
    const response = await post(baseUrl, "/life/identify", { sourceFileKey: "uploads/7/flower.jpg" });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      name: "月季",
      commonNames: ["月月红"],
      summary: "常见观赏花卉。",
      safetyNotice: "枝条有刺。",
      title: "月季",
      description: "常见观赏花卉。",
      tags: [],
      details: [],
      provider: "dashscope",
      model: "qwen3.7-flash-2026-07-15",
      fallbackUsed: false,
      credits: 99,
    });
    expect(deps.storageGet).toHaveBeenCalledWith("uploads/7/flower.jpg");
    expect(identifyPlantFast).toHaveBeenCalledWith("https://cdn.example/uploads/7/flower.jpg");
    expect(deps.withCreditCharge).toHaveBeenCalledWith(7, 1, "life_identify", expect.any(Function), "生活助手：识花草");
    expect(info).toHaveBeenCalledWith("[life.plant-identify]", expect.objectContaining({
      userId: 7,
      provider: "dashscope",
      model: "qwen3.7-flash-2026-07-15",
      fallbackUsed: false,
      durationMs: expect.any(Number),
      success: true,
    }));

    const external = await post(baseUrl, "/life/identify", { imageUrl: "https://attacker.example/flower.jpg" });
    expect(external.status).toBe(400);
    expect(identifyPlantFast).toHaveBeenCalledTimes(1);
    info.mockRestore();
  });

  it("植物详情只接受短名称且不看图、不扣积分", async () => {
    const getPlantDetails = vi.fn(async () => ({
      carePoints: ["保持充足光照"],
      floweringAndHabits: ["春末至秋季开花"],
      meaningAndStories: ["寓意幸福长久"],
    }));
    const deps = dependencies({ getPlantDetails });
    const baseUrl = await startApp(deps);

    const response = await post(baseUrl, "/life/plant-details", { plantName: " 月季 " });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      carePoints: ["保持充足光照"],
      floweringAndHabits: ["春末至秋季开花"],
      meaningAndStories: ["寓意幸福长久"],
    });
    expect(getPlantDetails).toHaveBeenCalledWith("月季");
    expect(deps.withCreditCharge).not.toHaveBeenCalled();

    expect((await post(baseUrl, "/life/plant-details", { plantName: "" })).status).toBe(400);
    expect((await post(baseUrl, "/life/plant-details", { plantName: "花".repeat(81) })).status).toBe(400);
    expect((await post(baseUrl, "/life/plant-details", { sourceFileKey: "uploads/7/flower.jpg" })).status).toBe(400);
    expect(getPlantDetails).toHaveBeenCalledTimes(1);
  });

  it("健康百科支持文字或本人上传图并扣 1 分", async () => {
    const queryHealthInfo = vi.fn(async (params: { imageUrl?: string; textHint?: string }) => ({
      title: params.textHint || "苹果",
      description: "日常食物百科。",
      details: ["适量食用", "注意饮食均衡"],
      tags: ["生活百科"],
      advice: "如有疾病或用药问题请咨询医生。",
    }));
    const deps = dependencies({
      findMediaCheckTaskByFile: vi.fn(async (_userId, fileKey) => ({
        id: 4,
        traceId: "trace-health",
        userId: 7,
        fileKey,
        status: "pending",
        createdAt: new Date(),
      })),
      queryHealthInfo,
    });
    const baseUrl = await startApp(deps);
    const textResponse = await post(baseUrl, "/life/health", { textHint: "苹果的营养" });
    const imageResponse = await post(baseUrl, "/life/health", { sourceFileKey: "uploads/7/apple.png" });

    expect(textResponse.status).toBe(200);
    expect(imageResponse.status).toBe(200);
    expect(queryHealthInfo).toHaveBeenNthCalledWith(1, { textHint: "苹果的营养", imageUrl: undefined });
    expect(queryHealthInfo).toHaveBeenNthCalledWith(2, { textHint: undefined, imageUrl: "https://cdn.example/uploads/7/apple.png" });
    expect(deps.withCreditCharge).toHaveBeenCalledTimes(2);
  });
});

describe("M3 万花筒合规聊天 REST 接口", () => {
  it("输入红线直接返回就医引导，不调模型也不扣分", async () => {
    const deps = dependencies();
    const baseUrl = await startApp(deps);
    const response = await post(baseUrl, "/chat", {
      message: "血压高吃什么药",
      history: [],
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      reply: `${CHAT_MEDICAL_GUIDANCE}\n\n${CHAT_DISCLAIMER}`,
      credits: 100,
      guarded: true,
    });
    expect(deps.checkTextSecurity).toHaveBeenCalledTimes(2);
    expect(deps.aiChatMulti).not.toHaveBeenCalled();
    expect(deps.withCreditCharge).not.toHaveBeenCalled();
  });

  it("历史消息中的医疗红线同样不调模型不扣分", async () => {
    const deps = dependencies();
    const baseUrl = await startApp(deps);
    const response = await post(baseUrl, "/chat", {
      message: "请接着回答",
      history: [
        { role: "user", content: "血压高吃什么药" },
        { role: "assistant", content: "我来继续说明。" },
      ],
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      reply: `${CHAT_MEDICAL_GUIDANCE}\n\n${CHAT_DISCLAIMER}`,
      credits: 100,
      guarded: true,
    });
    expect(deps.aiChatMulti).not.toHaveBeenCalled();
    expect(deps.withCreditCharge).not.toHaveBeenCalled();
  });

  it("历史消息作为不可信输入接受内容安全检查", async () => {
    const checkTextSecurity = vi.fn(async (text: string) => ({
      safe: !text.includes("历史违规内容"),
      reason: text.includes("历史违规内容") ? "历史内容未通过安全检查" : undefined,
    }));
    const deps = dependencies({ checkTextSecurity });
    const baseUrl = await startApp(deps);
    const response = await post(baseUrl, "/chat", {
      message: "接着聊",
      history: [{ role: "user", content: "历史违规内容" }],
    });

    expect(response.status).toBe(422);
    expect(deps.aiChatMulti).not.toHaveBeenCalled();
    expect(deps.withCreditCharge).not.toHaveBeenCalled();
    expect(checkTextSecurity).toHaveBeenCalledWith(expect.stringContaining("历史违规内容"), "mp-openid");
  });

  it("长历史和超长模型回复按微信 2500 字限制分批送检", async () => {
    const checkTextSecurity = vi.fn(async () => ({ safe: true }));
    const longReply = "日常常识".repeat(700);
    const deps = dependencies({
      checkTextSecurity,
      aiChatMulti: vi.fn(async () => longReply),
    });
    const baseUrl = await startApp(deps);
    const history = Array.from({ length: 12 }, (_, index) => ({
      role: index % 2 === 0 ? "user" as const : "assistant" as const,
      content: `${index}`.padEnd(500, "天气常识"),
    }));
    const response = await post(baseUrl, "/chat", { message: "继续聊节气常识", history });

    expect(response.status).toBe(200);
    const checkedTexts = checkTextSecurity.mock.calls.map(([text]) => text);
    expect(checkedTexts.length).toBeGreaterThanOrEqual(6);
    expect(checkedTexts.every((text) => text.length <= 2500)).toBe(true);
  });

  it("模型输出包含药名或剂量时过滤为就医引导并退分", async () => {
    const consume = vi.fn(async () => 99);
    const refund = vi.fn(async () => 100);
    const charged = vi.fn(async (userId, cost, feature, fn, description) => withCreditCharge(
      userId,
      cost,
      feature,
      fn,
      description,
      { consume, refund },
    )) as M3Dependencies["withCreditCharge"];
    const deps = dependencies({
      withCreditCharge: charged,
      aiChatMulti: vi.fn(async () => "建议服用阿司匹林，每次20mg。"),
      getCredits: vi.fn(async () => 100),
    });
    const baseUrl = await startApp(deps);
    const response = await post(baseUrl, "/chat", {
      message: "平时怎样照顾身体",
      history: [{ role: "assistant", content: "我们聊聊日常习惯。" }],
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      reply: `${CHAT_MEDICAL_GUIDANCE}\n\n${CHAT_DISCLAIMER}`,
      credits: 100,
      guarded: true,
    });
    expect(consume).toHaveBeenCalledWith(7, 1, "life_chat", "AI万花筒");
    expect(refund).toHaveBeenCalledWith(7, 1, "life_chat", "AI万花筒生成失败退还");
  });

  it("正常生活常识问题走多轮模型、扣 1 分、内容双向送检并带免责声明", async () => {
    const aiChatMulti = vi.fn(async () => "可以从固定起床时间、白天适量活动和睡前放松开始。");
    const deps = dependencies({ aiChatMulti });
    const baseUrl = await startApp(deps);
    const history = [
      { role: "user", content: "最近想调整作息" },
      { role: "assistant", content: "可以逐步调整。" },
    ];
    const response = await post(baseUrl, "/chat", {
      message: "睡前有哪些放松活动",
      history,
    });

    expect(response.status).toBe(200);
    const body = await response.json() as { reply: string; credits: number; guarded: boolean };
    expect(body.reply).toBe(`可以从固定起床时间、白天适量活动和睡前放松开始。\n\n${CHAT_DISCLAIMER}`);
    expect(body).toMatchObject({ credits: 99, guarded: false });
    expect(aiChatMulti).toHaveBeenCalledWith(expect.objectContaining({ history, message: "睡前有哪些放松活动" }));
    expect(deps.checkTextSecurity).toHaveBeenCalledTimes(3);
    expect(deps.checkTextSecurity).toHaveBeenNthCalledWith(1, "睡前有哪些放松活动", "mp-openid");
    expect(deps.checkTextSecurity).toHaveBeenNthCalledWith(2, expect.stringContaining("最近想调整作息"), "mp-openid");
    expect(deps.checkTextSecurity).toHaveBeenNthCalledWith(3, body.reply, "mp-openid");
    expect(deps.withCreditCharge).toHaveBeenCalledWith(7, 1, "life_chat", expect.any(Function), "AI万花筒");
  });
});
