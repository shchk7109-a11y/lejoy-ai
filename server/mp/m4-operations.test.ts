import express, { type RequestHandler } from "express";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createMpRequestLogMiddleware, MP_API_VERSION, type MpRequestLog } from "./operations";

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
});
