import express, { type RequestHandler } from "express";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createMpIdempotencyMiddleware,
  createMpRequestLogMiddleware,
  isMpTimeoutError,
  MP_API_VERSION,
  type MpRequestLog,
} from "./operations";

const servers: Array<{ close: () => void }> = [];
afterEach(() => servers.splice(0).forEach((server) => server.close()));

async function listen(app: express.Express): Promise<string> {
  const server = app.listen(0);
  servers.push(server);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("测试服务器启动失败");
  return `http://127.0.0.1:${address.port}/api/mp`;
}

describe("M4 小程序运维接口", () => {
  it("健康检查无需登录并返回版本", async () => {
    const app = express();
    app.use("/api/mp", createMpRequestLogMiddleware(() => undefined));
    app.get("/api/mp/health", (_req, res) => res.json({ ok: true, version: MP_API_VERSION }));
    const response = await fetch(`${await listen(app)}/health`);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true, version: "1.0.0" });
  });

  it("统一日志只含用户、路径、耗时和错误码，不泄露输入原文", async () => {
    const logs: MpRequestLog[] = [];
    const app = express();
    app.use(express.json());
    app.use("/api/mp", createMpRequestLogMiddleware((entry) => logs.push(entry)));
    app.post("/api/mp/chat", ((req, res) => {
      (req as typeof req & { mpUser: { id: number } }).mpUser = { id: 42 };
      res.status(422).json({ error: { code: "CONTENT_REJECTED", message: "已拦截" } });
    }) as RequestHandler);
    const secretInput = "不要出现在日志里的用户原文-7391";
    const response = await fetch(`${await listen(app)}/chat?message=${encodeURIComponent(secretInput)}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message: secretInput }),
    });
    expect(response.status).toBe(422);
    await vi.waitFor(() => expect(logs).toHaveLength(1));
    expect(logs[0]).toMatchObject({ userId: 42, path: "/api/mp/chat", errorCode: "CONTENT_REJECTED" });
    expect(logs[0].durationMs).toBeGreaterThanOrEqual(0);
    expect(Object.keys(logs[0]).sort()).toEqual(["durationMs", "errorCode", "path", "userId"]);
    expect(JSON.stringify(logs)).not.toContain(secretInput);
  });

  it("识别网关和网络层超时错误", () => {
    expect(isMpTimeoutError(new Error("AI gateway timeout after 90000ms"))).toBe(true);
    expect(isMpTimeoutError(new Error("connect ETIMEDOUT"))).toBe(true);
    expect(isMpTimeoutError(new Error("普通生成失败"))).toBe(false);
  });

  it("相同操作号的并发生成只执行一次并复用成功响应", async () => {
    let executions = 0;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const app = express();
    app.use(express.json());
    app.use("/api/mp", createMpIdempotencyMiddleware());
    app.post("/api/mp/generate", async (_req, res) => {
      executions += 1;
      await gate;
      res.json({ result: "同一次生成", credits: 98 });
    });
    const baseUrl = await listen(app);
    const headers = {
      authorization: "Bearer test-token",
      "content-type": "application/json",
      "x-idempotency-key": "story-1234567890abcdef",
    };
    const first = fetch(`${baseUrl}/generate`, { method: "POST", headers, body: "{}" });
    const second = fetch(`${baseUrl}/generate`, { method: "POST", headers, body: "{}" });
    await vi.waitFor(() => expect(executions).toBe(1));
    release();
    await expect((await first).json()).resolves.toEqual({ result: "同一次生成", credits: 98 });
    await expect((await second).json()).resolves.toEqual({ result: "同一次生成", credits: 98 });
    const cached = await fetch(`${baseUrl}/generate`, { method: "POST", headers, body: "{}" });
    await expect(cached.json()).resolves.toEqual({ result: "同一次生成", credits: 98 });
    expect(executions).toBe(1);
  });

  it("服务端失败不会缓存，允许同一操作号再次尝试", async () => {
    let executions = 0;
    const app = express();
    app.use(express.json());
    app.use("/api/mp", createMpIdempotencyMiddleware());
    app.post("/api/mp/generate", (_req, res) => {
      executions += 1;
      res.status(504).json({ error: { code: "AI_TIMEOUT" } });
    });
    const baseUrl = await listen(app);
    const options = {
      method: "POST",
      headers: { authorization: "Bearer test-token", "x-idempotency-key": "chat-1234567890abcdef" },
    } as const;
    expect((await fetch(`${baseUrl}/generate`, options)).status).toBe(504);
    expect((await fetch(`${baseUrl}/generate`, options)).status).toBe(504);
    expect(executions).toBe(2);
  });

  it("同一操作号不允许更换请求内容", async () => {
    let executions = 0;
    const app = express();
    app.use(express.json());
    app.use("/api/mp", createMpIdempotencyMiddleware());
    app.post("/api/mp/generate", (req, res) => {
      executions += 1;
      res.json({ value: req.body.value });
    });
    const baseUrl = await listen(app);
    const headers = {
      authorization: "Bearer test-token",
      "content-type": "application/json",
      "x-idempotency-key": "copywriter-1234567890abcdef",
    };
    const first = await fetch(`${baseUrl}/generate`, { method: "POST", headers, body: JSON.stringify({ value: "A" }) });
    expect(first.status).toBe(200);
    const conflict = await fetch(`${baseUrl}/generate`, { method: "POST", headers, body: JSON.stringify({ value: "B" }) });
    expect(conflict.status).toBe(409);
    await expect(conflict.json()).resolves.toEqual({ error: { code: "IDEMPOTENCY_CONFLICT", message: "同一操作号的请求内容不一致" } });
    expect(executions).toBe(1);
  });
});
