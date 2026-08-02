import type { Express } from "express";
import { createMpRouter } from "./routes";

export function registerMpRoutes(app: Express): void {
  app.use("/api/mp", createMpRouter());
}
