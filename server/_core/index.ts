import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";
import { registerMpRoutes } from "../mp";
import { startStoryReferenceCleanup } from "../mp/story-reference-cleanup";
import { createHqAuthRouter } from "../hq/auth-routes";
import { createHqBatchRouter } from "../hq/batch-routes";

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

async function startServer() {
  const app = express();
  // 仅信任本机 Nginx 回环代理提供的 X-Forwarded-For，供总部登录按真实来源限速。
  app.set("trust proxy", "loopback");
  const server = createServer(app);
  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  // OAuth callback under /api/oauth/callback
  registerOAuthRoutes(app);
  // 微信小程序 REST API（与现有 tRPC 并行，互不替换）
  registerMpRoutes(app);
  // 总部后台独立认证，不继承小程序 JWT 或旧 H5 OAuth 身份。
  app.use("/api/hq", createHqAuthRouter());
  app.use("/api/hq", createHqBatchRouter());
  startStoryReferenceCleanup();
  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );
  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  // 延长服务器超时，支持TTS和图片生成等长时间操作（3分钟）
  server.timeout = 180000;
  server.keepAliveTimeout = 180000;
  server.headersTimeout = 185000;
  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
  });
}

startServer().catch(console.error);
