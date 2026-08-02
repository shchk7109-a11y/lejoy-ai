import express, { type RequestHandler } from "express";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { User } from "../../drizzle/schema";
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
    identifyPlant: vi.fn(),
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
  it("推荐四个题材且不扣积分", async () => {
    const deps = dependencies();
    const baseUrl = await startApp(deps);
    const response = await post(baseUrl, "/story/suggest-topics", {
      theme: "勇气成长",
      childName: "乐乐",
      age: 6,
    });

    expect(response.status).toBe(200);
    const body = await response.json() as { topics: unknown[] };
    expect(body.topics).toHaveLength(4);
    expect(deps.suggestStoryTopics).toHaveBeenCalledWith({
      theme: "勇气成长",
      character: "名叫乐乐的6岁孩子",
      customProtagonist: undefined,
    });
    expect(deps.withCreditCharge).not.toHaveBeenCalled();
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
    expect(deps.aiGenerateImage).toHaveBeenCalledWith(expect.objectContaining({ aspectRatio: "1:1" }));
    expect(deps.storagePut).toHaveBeenCalledWith("stories/7/fixed-id-p2.png", expect.any(Buffer), "image/png");
    expect(deps.createMediaCheckTask).toHaveBeenCalledWith({
      traceId: "trace-m3",
      userId: 7,
      fileKey: "stories/7/fixed-id-p2.png",
      status: "pending",
    });
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
    const identifyPlant = vi.fn(async () => ({
      title: "月季 Rosa chinensis",
      description: "常见观赏花卉。",
      details: ["保持充足光照", "见干见湿浇水"],
      tags: ["蔷薇科", "观赏花卉"],
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
      identifyPlant,
    });
    const baseUrl = await startApp(deps);
    const response = await post(baseUrl, "/life/identify", { sourceFileKey: "uploads/7/flower.jpg" });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ title: "月季 Rosa chinensis", credits: 99 });
    expect(deps.storageGet).toHaveBeenCalledWith("uploads/7/flower.jpg");
    expect(identifyPlant).toHaveBeenCalledWith({ imageUrl: "https://cdn.example/uploads/7/flower.jpg" });
    expect(deps.withCreditCharge).toHaveBeenCalledWith(7, 1, "life_identify", expect.any(Function), "生活助手：识花草");

    const external = await post(baseUrl, "/life/identify", { imageUrl: "https://attacker.example/flower.jpg" });
    expect(external.status).toBe(400);
    expect(identifyPlant).toHaveBeenCalledTimes(1);
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
