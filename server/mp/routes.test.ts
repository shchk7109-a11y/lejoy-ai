import express, { type Express } from "express";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { User } from "../../drizzle/schema";
import { createMpRouter, type MpDependencies } from "./routes";

const testUser: User = {
  id: 7,
  openId: "mp_mock_user",
  name: "乐享用户",
  email: null,
  loginMethod: "wechat_mp_mock",
  role: "user",
  credits: 100,
  createdAt: new Date("2026-08-02T00:00:00.000Z"),
  updatedAt: new Date("2026-08-02T00:00:00.000Z"),
  lastSignedIn: new Date("2026-08-02T00:00:00.000Z"),
};

function createDependencies(overrides: Partial<MpDependencies> = {}): MpDependencies {
  return {
    jwtSecret: "test-secret-at-least-32-characters-long",
    wechatAppId: "",
    wechatSecret: "",
    isProduction: false,
    allowMockLogin: false,
    warn: vi.fn(),
    exchangeWechatCode: vi.fn(async () => ({ openId: "mp_mock_user", mock: true })),
    upsertUser: vi.fn(async () => undefined),
    recordRegisterBonus: vi.fn(async () => undefined),
    getUserByOpenId: vi.fn(async () => testUser),
    getUserById: vi.fn(async () => testUser),
    getUserTransactions: vi.fn(async () => [
      {
        id: 1,
        userId: 7,
        amount: -1,
        type: "consume" as const,
        feature: "wish_generate",
        description: "暖心文案",
        balanceAfter: 99,
        createdAt: new Date("2026-08-02T01:00:00.000Z"),
      },
    ]),
    consumeCredits: vi.fn(async () => 99),
    generateWishes: vi.fn(async () => ["愿您平安喜乐。", "愿温暖常伴左右。", "祝福日日常新。"]),
    checkTextSecurity: vi.fn(async () => ({ safe: true })),
    ...overrides,
  };
}

const servers: Server[] = [];

async function startApp(deps: MpDependencies): Promise<{ app: Express; baseUrl: string }> {
  const app = express();
  app.use(express.json());
  app.use("/api/mp", createMpRouter(deps));
  const server = await new Promise<Server>((resolve) => {
    const listening = app.listen(0, "127.0.0.1", () => resolve(listening));
  });
  servers.push(server);
  const { port } = server.address() as AddressInfo;
  return { app, baseUrl: `http://127.0.0.1:${port}/api/mp` };
}

async function login(baseUrl: string): Promise<string> {
  const response = await fetch(`${baseUrl}/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ code: "wx-test-code" }),
  });
  expect(response.status).toBe(200);
  const body = await response.json() as { token: string };
  return body.token;
}

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  })));
  vi.restoreAllMocks();
});

describe("小程序 REST 适配层", () => {
  it("生产环境缺少微信配置且未显式开启 mock 时返回 503", async () => {
    const deps = createDependencies();
    Object.assign(deps, { isProduction: true, allowMockLogin: false, warn: vi.fn() });
    const { baseUrl } = await startApp(deps);

    const response = await fetch(`${baseUrl}/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code: "wx-code" }),
    });

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({ code: "NOT_CONFIGURED" });
    expect(deps.exchangeWechatCode).not.toHaveBeenCalled();
  });

  it("生产环境显式开启 mock 登录时允许登录并输出安全告警", async () => {
    const warn = vi.fn();
    const deps = createDependencies();
    Object.assign(deps, { isProduction: true, allowMockLogin: true, warn });
    const { baseUrl } = await startApp(deps);

    const response = await fetch(`${baseUrl}/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code: "wx-code" }),
    });

    expect(response.status).toBe(200);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("MP_MOCK_LOGIN=true"));
  });

  it("mock 登录会 upsert 测试用户并签发 JWT", async () => {
    const deps = createDependencies();
    const { baseUrl } = await startApp(deps);

    const response = await fetch(`${baseUrl}/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code: "any-code" }),
    });

    expect(response.status).toBe(200);
    const body = await response.json() as { token: string; user: { id: number; credits: number } };
    expect(body.token.split(".")).toHaveLength(3);
    expect(body.user).toMatchObject({ id: 7, credits: 100 });
    expect(deps.exchangeWechatCode).toHaveBeenCalledWith("any-code", "", "");
    expect(deps.upsertUser).toHaveBeenCalledWith(expect.objectContaining({
      openId: "mp_mock_user",
      loginMethod: "wechat_mp_mock",
    }));
  });

  it("真实配置会把 code 交给 code2session 交换函数", async () => {
    const exchangeWechatCode = vi.fn(async () => ({ openId: "real-openid", mock: false }));
    const deps = createDependencies({
      wechatAppId: "wx-real-appid",
      wechatSecret: "real-secret",
      exchangeWechatCode,
      getUserByOpenId: vi.fn(async () => ({ ...testUser, openId: "real-openid", loginMethod: "wechat_mp" })),
    });
    const { baseUrl } = await startApp(deps);

    const response = await fetch(`${baseUrl}/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code: "wx-real-code" }),
    });

    expect(response.status).toBe(200);
    expect(exchangeWechatCode).toHaveBeenCalledWith("wx-real-code", "wx-real-appid", "real-secret");
  });

  it("缺少 Bearer token 时受保护接口返回 401", async () => {
    const { baseUrl } = await startApp(createDependencies());

    const response = await fetch(`${baseUrl}/user/me`);

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({ error: { code: "UNAUTHORIZED" } });
  });

  it("GET /user/me 返回当前用户与积分", async () => {
    const deps = createDependencies();
    const { baseUrl } = await startApp(deps);
    const token = await login(baseUrl);

    const response = await fetch(`${baseUrl}/user/me`, {
      headers: { authorization: `Bearer ${token}` },
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ id: 7, name: "乐享用户", credits: 100 });
    expect(deps.getUserById).toHaveBeenCalledWith(7);
  });

  it("GET /modules 返回可扩展模块列表并标记未上线模块", async () => {
    const deps = createDependencies();
    const { baseUrl } = await startApp(deps);
    const token = await login(baseUrl);

    const response = await fetch(`${baseUrl}/modules`, {
      headers: { authorization: `Bearer ${token}` },
    });

    expect(response.status).toBe(200);
    const body = await response.json() as { modules: Array<{ id: string; enabled: boolean; creditCost: number }> };
    expect(body.modules.find((module) => module.id === "copy-writer")).toMatchObject({ enabled: true, creditCost: 1 });
    expect(body.modules.some((module) => !module.enabled)).toBe(true);
  });

  it("POST /copywriter/generate 检查输入输出、生成三条文案并扣积分", async () => {
    const deps = createDependencies();
    const { baseUrl } = await startApp(deps);
    const token = await login(baseUrl);

    const response = await fetch(`${baseUrl}/copywriter/generate`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ scenario: "生日寿辰", relationship: "长辈", tone: "温暖亲切" }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      wishes: ["愿您平安喜乐。", "愿温暖常伴左右。", "祝福日日常新。"],
      credits: 99,
    });
    expect(deps.generateWishes).toHaveBeenCalledWith({
      scenario: "生日寿辰",
      relationship: "长辈",
      tone: "温暖亲切",
    });
    expect(deps.checkTextSecurity).toHaveBeenCalledTimes(4);
    expect(deps.checkTextSecurity).toHaveBeenNthCalledWith(1, expect.stringContaining("生日寿辰"), "mp_mock_user");
    expect(deps.checkTextSecurity).toHaveBeenNthCalledWith(2, "愿您平安喜乐。", "mp_mock_user");
    expect(deps.consumeCredits).toHaveBeenCalledWith(7, 1, "wish_generate", "暖心文案");
  });

  it("积分不足时不调用 AI 并返回 402", async () => {
    const deps = createDependencies({ getUserById: vi.fn(async () => ({ ...testUser, credits: 0 })) });
    const { baseUrl } = await startApp(deps);
    const token = await login(baseUrl);

    const response = await fetch(`${baseUrl}/copywriter/generate`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ scenario: "生日寿辰", relationship: "长辈", tone: "温暖亲切" }),
    });

    expect(response.status).toBe(402);
    expect(deps.generateWishes).not.toHaveBeenCalled();
    expect(deps.consumeCredits).not.toHaveBeenCalled();
  });

  it("输入内容安全拒绝时不生成也不扣积分", async () => {
    const checkTextSecurity = vi.fn(async () => ({ safe: false, reason: "内容不合规" }));
    const deps = createDependencies({ checkTextSecurity });
    const { baseUrl } = await startApp(deps);
    const token = await login(baseUrl);

    const response = await fetch(`${baseUrl}/copywriter/generate`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ scenario: "违规输入", relationship: "朋友", tone: "温暖亲切" }),
    });

    expect(response.status).toBe(422);
    expect(deps.generateWishes).not.toHaveBeenCalled();
    expect(deps.consumeCredits).not.toHaveBeenCalled();
  });

  it("任一输出内容安全拒绝时不扣积分", async () => {
    const checkTextSecurity = vi.fn(async (text: string) => ({
      safe: text !== "愿温暖常伴左右。",
      ...(text === "愿温暖常伴左右。" ? { reason: "输出不合规" } : {}),
    }));
    const deps = createDependencies({ checkTextSecurity });
    const { baseUrl } = await startApp(deps);
    const token = await login(baseUrl);

    const response = await fetch(`${baseUrl}/copywriter/generate`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ scenario: "生日寿辰", relationship: "长辈", tone: "温暖亲切" }),
    });

    expect(response.status).toBe(422);
    expect(deps.consumeCredits).not.toHaveBeenCalled();
  });

  it("GET /credits/history 返回当前用户积分明细", async () => {
    const deps = createDependencies();
    const { baseUrl } = await startApp(deps);
    const token = await login(baseUrl);

    const response = await fetch(`${baseUrl}/credits/history`, {
      headers: { authorization: `Bearer ${token}` },
    });

    expect(response.status).toBe(200);
    const body = await response.json() as { transactions: Array<{ amount: number; balanceAfter: number }> };
    expect(body.transactions).toHaveLength(1);
    expect(body.transactions[0]).toMatchObject({ amount: -1, balanceAfter: 99 });
    expect(deps.getUserTransactions).toHaveBeenCalledWith(7);
  });
});
