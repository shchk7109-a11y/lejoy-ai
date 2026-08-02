import { createHash } from "node:crypto";
import express, { type RequestHandler } from "express";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { User } from "../../drizzle/schema";
import { createM2Router, type M2Dependencies } from "./m2-routes";

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

function dependencies(overrides: Partial<M2Dependencies> = {}): M2Dependencies {
  return {
    contentSecurityMode: "wechat",
    callbackToken: "callback-token",
    storagePut: vi.fn(async (key) => ({ key, url: `https://cdn.example/${key}` })),
    storageGet: vi.fn(async (key) => ({ key, url: `https://cdn.example/${key}` })),
    storageDelete: vi.fn(async () => undefined),
    submitMediaCheck: vi.fn(async () => ({ status: "pending", traceId: "trace-1" })),
    createMediaCheckTask: vi.fn(async () => undefined),
    findMediaCheckTask: vi.fn(async () => ({
      id: 1,
      traceId: "trace-1",
      userId: 7,
      fileKey: "uploads/7/a.jpg",
      status: "pending",
      createdAt: new Date(),
    })),
    findMediaCheckTaskByFile: vi.fn(async (userId, fileKey) => ({
      id: 2,
      traceId: "trace-source",
      userId,
      fileKey,
      status: "pending",
      createdAt: new Date(),
    })),
    updateMediaCheckTaskStatus: vi.fn(async () => undefined),
    aiEditImage: vi.fn(async () => Buffer.from("generated-image").toString("base64")),
    aiASR: vi.fn(async () => ({ text: "这是语音转写文字" })),
    withCreditCharge: vi.fn(async (_userId, _cost, _feature, fn) => ({ value: await fn(), credits: 98 })) as M2Dependencies["withCreditCharge"],
    createFileId: vi.fn(() => "fixed-id"),
    ...overrides,
  };
}

const servers: Server[] = [];

async function startApp(deps: M2Dependencies) {
  const app = express();
  app.use(express.json({ limit: "20mb" }));
  const authenticate: RequestHandler = (req, _res, next) => {
    Object.assign(req, { mpUser: testUser });
    next();
  };
  app.use("/api/mp", createM2Router(deps, authenticate));
  const server = await new Promise<Server>((resolve) => {
    const listening = app.listen(0, "127.0.0.1", () => resolve(listening));
  });
  servers.push(server);
  const { port } = server.address() as AddressInfo;
  return `http://127.0.0.1:${port}/api/mp`;
}

function signature(timestamp: string, nonce: string) {
  return createHash("sha1")
    .update(["callback-token", timestamp, nonce].sort().join(""))
    .digest("hex");
}

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  })));
  vi.restoreAllMocks();
});

describe("M2 小程序 REST 接口", () => {
  it("上传白名单图片、落存储并记录 pending 媒体任务", async () => {
    const deps = dependencies();
    const baseUrl = await startApp(deps);
    const base64 = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00]).toString("base64");

    const response = await fetch(`${baseUrl}/upload/image`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ base64, mimeType: "image/jpeg" }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      url: "https://cdn.example/uploads/7/fixed-id.jpg",
      fileKey: "uploads/7/fixed-id.jpg",
      securityStatus: "pending",
    });
    expect(deps.storagePut).toHaveBeenCalledWith("uploads/7/fixed-id.jpg", expect.any(Buffer), "image/jpeg");
    expect(deps.submitMediaCheck).toHaveBeenCalledWith("https://cdn.example/uploads/7/fixed-id.jpg", "mp-openid");
    expect(deps.createMediaCheckTask).toHaveBeenCalledWith({
      traceId: "trace-1",
      userId: 7,
      fileKey: "uploads/7/fixed-id.jpg",
      status: "pending",
    });
  });

  it("拒绝非白名单 MIME 与超过 10MB 的图片", async () => {
    const deps = dependencies();
    const baseUrl = await startApp(deps);

    const badMime = await fetch(`${baseUrl}/upload/image`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ base64: "aGVsbG8=", mimeType: "image/gif" }),
    });
    expect(badMime.status).toBe(400);

    const tooLarge = await fetch(`${baseUrl}/upload/image`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ base64: Buffer.alloc(10 * 1024 * 1024 + 1).toString("base64"), mimeType: "image/png" }),
    });
    expect(tooLarge.status).toBe(400);
    expect(deps.storagePut).not.toHaveBeenCalled();
  });

  it("CONTENT_SECURITY=off 时上传完全旁路微信与任务表", async () => {
    const deps = dependencies({ contentSecurityMode: "off" });
    const baseUrl = await startApp(deps);

    const response = await fetch(`${baseUrl}/upload/image`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ base64: Buffer.from("RIFF\u0000\u0000\u0000\u0000WEBP", "binary").toString("base64"), mimeType: "image/webp" }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ securityStatus: "bypassed" });
    expect(deps.submitMediaCheck).not.toHaveBeenCalled();
    expect(deps.createMediaCheckTask).not.toHaveBeenCalled();
  });

  it("拒绝声明为图片但魔数不匹配的伪造内容", async () => {
    const deps = dependencies();
    const baseUrl = await startApp(deps);

    const response = await fetch(`${baseUrl}/upload/image`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ base64: Buffer.from("not-a-real-image").toString("base64"), mimeType: "image/png" }),
    });

    expect(response.status).toBe(400);
    expect(deps.storagePut).not.toHaveBeenCalled();
  });

  it("媒体任务落库失败时补偿删除已经上传的文件", async () => {
    const deps = dependencies({ createMediaCheckTask: vi.fn(async () => { throw new Error("database unavailable"); }) });
    const baseUrl = await startApp(deps);

    const response = await fetch(`${baseUrl}/upload/image`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ base64: Buffer.from([0xff, 0xd8, 0xff, 0xe0]).toString("base64"), mimeType: "image/jpeg" }),
    });

    expect(response.status).toBe(500);
    expect(deps.storageDelete).toHaveBeenCalledWith("uploads/7/fixed-id.jpg");
  });

  it("照片修复先扣 2 积分、使用共享提示词并送检生成图", async () => {
    const deps = dependencies();
    const baseUrl = await startApp(deps);

    const response = await fetch(`${baseUrl}/silverlens/restore`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sourceFileKey: "uploads/7/source.jpg" }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ credits: 98, securityStatus: "pending" });
    expect(deps.withCreditCharge).toHaveBeenCalledWith(7, 2, "photo_restore", expect.any(Function), "照片修复");
    expect(deps.aiEditImage).toHaveBeenCalledWith(expect.objectContaining({
      imageUrl: "https://cdn.example/uploads/7/source.jpg",
      prompt: expect.stringContaining("人物面部保持原有特征不变"),
    }));
  });

  it("修图拒绝外部 URL、其他账号文件及未登记来源", async () => {
    const deps = dependencies({ findMediaCheckTaskByFile: vi.fn(async () => undefined) });
    const baseUrl = await startApp(deps);

    const external = await fetch(`${baseUrl}/silverlens/restore`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ imageUrl: "https://attacker.example/unreviewed.jpg" }),
    });
    expect(external.status).toBe(400);

    const otherUser = await fetch(`${baseUrl}/silverlens/restore`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sourceFileKey: "uploads/8/source.jpg" }),
    });
    expect(otherUser.status).toBe(400);

    const unregistered = await fetch(`${baseUrl}/silverlens/restore`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sourceFileKey: "uploads/7/not-registered.jpg" }),
    });
    expect(unregistered.status).toBe(400);
    expect(deps.storageGet).not.toHaveBeenCalled();
    expect(deps.withCreditCharge).not.toHaveBeenCalled();
  });

  it("艺术转换只接受五种风格，语音转写不扣积分", async () => {
    const deps = dependencies();
    const baseUrl = await startApp(deps);

    const invalidStyle = await fetch(`${baseUrl}/silverlens/transform`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ imageUrl: "https://cdn.example/source.jpg", style: "像素风" }),
    });
    expect(invalidStyle.status).toBe(400);

    const stt = await fetch(`${baseUrl}/stt/transcribe`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ audioUrl: "https://cdn.example/audio.mp3" }),
    });
    expect(stt.status).toBe(200);
    await expect(stt.json()).resolves.toEqual({ text: "这是语音转写文字" });
    expect(deps.aiASR).toHaveBeenCalledWith("https://cdn.example/audio.mp3", "zh");
    expect(deps.withCreditCharge).not.toHaveBeenCalled();
  });

  it("上传 mp3 录音供免积分 ASR 使用", async () => {
    const deps = dependencies();
    const baseUrl = await startApp(deps);

    const response = await fetch(`${baseUrl}/upload/audio`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ base64: Buffer.from("mp3-audio").toString("base64"), mimeType: "audio/mpeg" }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      url: "https://cdn.example/voice/7/fixed-id.mp3",
      fileKey: "voice/7/fixed-id.mp3",
    });
    expect(deps.storagePut).toHaveBeenCalledWith("voice/7/fixed-id.mp3", expect.any(Buffer), "audio/mpeg");
    expect(deps.submitMediaCheck).not.toHaveBeenCalled();
  });

  it("GET 回调握手校验签名并原样返回 echostr", async () => {
    const baseUrl = await startApp(dependencies());
    const timestamp = "1722528000";
    const nonce = "nonce-1";
    const response = await fetch(`${baseUrl}/security/wechat-callback?timestamp=${timestamp}&nonce=${nonce}&signature=${signature(timestamp, nonce)}&echostr=hello-wechat`);

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("hello-wechat");
  });

  it("risky 回调删除文件并更新状态，pass 回调不删除", async () => {
    const deps = dependencies();
    const baseUrl = await startApp(deps);
    const timestamp = "1722528000";
    const nonce = "nonce-2";
    const url = `${baseUrl}/security/wechat-callback?timestamp=${timestamp}&nonce=${nonce}&signature=${signature(timestamp, nonce)}`;

    const risky = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ trace_id: "trace-1", result: { suggest: "risky" } }),
    });
    expect(risky.status).toBe(200);
    expect(deps.storageDelete).toHaveBeenCalledWith("uploads/7/a.jpg");
    expect(deps.updateMediaCheckTaskStatus).toHaveBeenCalledWith("trace-1", "risky");

    vi.mocked(deps.storageDelete).mockClear();
    const pass = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ trace_id: "trace-1", result: { suggest: "pass" } }),
    });
    expect(pass.status).toBe(200);
    expect(deps.storageDelete).not.toHaveBeenCalled();
    expect(deps.updateMediaCheckTaskStatus).toHaveBeenCalledWith("trace-1", "pass");
  });

  it("回调早于任务落库时返回非 2xx 促使微信重试", async () => {
    const deps = dependencies({ findMediaCheckTask: vi.fn(async () => undefined) });
    const baseUrl = await startApp(deps);
    const timestamp = "1722528000";
    const nonce = "nonce-race";

    const response = await fetch(`${baseUrl}/security/wechat-callback?timestamp=${timestamp}&nonce=${nonce}&signature=${signature(timestamp, nonce)}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ trace_id: "trace-not-ready", result: { suggest: "risky" } }),
    });

    expect(response.status).toBe(503);
    expect(deps.storageDelete).not.toHaveBeenCalled();
    expect(deps.updateMediaCheckTaskStatus).not.toHaveBeenCalled();
  });
});
