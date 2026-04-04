import { describe, expect, it, vi, beforeEach } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

// Mock db functions
vi.mock("./db", () => ({
  getUserById: vi.fn().mockResolvedValue({ id: 1, credits: 100, openId: "test-user", name: "Test User", email: "test@example.com", loginMethod: "manus", role: "user", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() }),
  getUserTransactions: vi.fn().mockResolvedValue([
    { id: 1, userId: 1, amount: 100, type: "register", feature: null, description: "新用户注册赠送", balanceAfter: 100, createdAt: new Date() },
  ]),
  consumeCredits: vi.fn().mockResolvedValue(99),
  rechargeCredits: vi.fn().mockResolvedValue(200),
  getAllUsers: vi.fn().mockResolvedValue([]),
  getAllCustomerInfo: vi.fn().mockResolvedValue([]),
  getAllAiModels: vi.fn().mockResolvedValue([]),
  upsertAiModel: vi.fn().mockResolvedValue(undefined),
  updateAiModel: vi.fn().mockResolvedValue(undefined),
  upsertCustomerInfo: vi.fn().mockResolvedValue(undefined),
  upsertUser: vi.fn().mockResolvedValue(undefined),
  getUserByOpenId: vi.fn().mockResolvedValue(undefined),
}));

function createUserContext(role: "user" | "admin" = "user"): TrpcContext {
  return {
    user: {
      id: 1,
      openId: "test-user",
      email: "test@example.com",
      name: "Test User",
      loginMethod: "manus",
      role,
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: vi.fn() } as unknown as TrpcContext["res"],
  };
}

describe("credits.balance", () => {
  it("returns user credits balance", async () => {
    const ctx = createUserContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.credits.balance();
    expect(result).toHaveProperty("credits");
    expect(typeof result.credits).toBe("number");
  });
});

describe("credits.history", () => {
  it("returns transaction history array", async () => {
    const ctx = createUserContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.credits.history();
    expect(Array.isArray(result)).toBe(true);
  });
});

describe("admin.users", () => {
  it("admin can list users", async () => {
    const ctx = createUserContext("admin");
    const caller = appRouter.createCaller(ctx);
    const result = await caller.admin.users();
    expect(Array.isArray(result)).toBe(true);
  });

  it("non-admin cannot list users", async () => {
    const ctx = createUserContext("user");
    const caller = appRouter.createCaller(ctx);
    await expect(caller.admin.users()).rejects.toThrow();
  });
});

describe("admin.rechargeCredits", () => {
  it("admin can recharge user credits", async () => {
    const ctx = createUserContext("admin");
    const caller = appRouter.createCaller(ctx);
    const result = await caller.admin.rechargeCredits({ userId: 1, amount: 100 });
    expect(result).toHaveProperty("success", true);
    expect(result).toHaveProperty("newBalance");
  });

  it("non-admin cannot recharge credits", async () => {
    const ctx = createUserContext("user");
    const caller = appRouter.createCaller(ctx);
    await expect(caller.admin.rechargeCredits({ userId: 1, amount: 100 })).rejects.toThrow();
  });
});

describe("admin.getModels", () => {
  it("admin can get model list", async () => {
    const ctx = createUserContext("admin");
    const caller = appRouter.createCaller(ctx);
    const result = await caller.admin.getModels();
    expect(Array.isArray(result)).toBe(true);
  });
});
