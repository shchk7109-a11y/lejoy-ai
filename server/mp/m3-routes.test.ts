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
