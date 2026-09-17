import express from "express";
import { createServer } from "node:http";
import { AddressInfo } from "node:net";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RedeemError } from "../credits/redeem";
import { createCreditRedeemRouter } from "./credit-routes";

let server: ReturnType<typeof createServer>;
let base: string;
let redeem: ReturnType<typeof vi.fn>;
beforeEach(async () => {
  redeem = vi.fn(async () => ({ awardedCredits: 20, balance: 120, transactionId: 5 }));
  const app = express(); app.use(express.json());
  app.use("/api/mp", createCreditRedeemRouter({
    redeem,
    requireAuth: (req, res, next) => {
      if (req.header("authorization") !== "Bearer valid") { res.status(401).json({ error: { code: "UNAUTHORIZED" } }); return; }
      (req as unknown as { mpUser: { id: number } }).mpUser = { id: 7 };
      next();
    },
  }));
  server = createServer(app); await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterEach(async () => { await new Promise<void>(resolve => server.close(() => resolve())); });
const post = (code: string, auth = true) => fetch(base + "/api/mp/credits/redeem", { method: "POST", headers: { "content-type": "application/json", ...(auth ? { authorization: "Bearer valid" } : {}) }, body: JSON.stringify({ code }) });

describe("mini-program code redemption route", () => {
  it("requires mini-program authentication and returns safe success payload", async () => {
    expect((await post("ABCD-EFGH-JKLM", false)).status).toBe(401);
    const response = await post("ABCD-EFGH-JKLM");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ awardedCredits: 20, balance: 120, transactionId: 5 });
    expect(redeem).toHaveBeenCalledWith(7, "ABCD-EFGH-JKLM");
  });
  it("maps known code failures without revealing code or redeemer", async () => {
    redeem.mockRejectedValue(new RedeemError("CODE_USED"));
    const response = await post("ABCD-EFGH-JKLM");
    expect(response.status).toBe(409);
    const body = await response.text();
    expect(body).toContain("CODE_USED");
    expect(body).not.toContain("ABCD-EFGH-JKLM");
  });
  it("rate-limits guessing and does not write on the sixth request", async () => {
    redeem.mockRejectedValue(new RedeemError("INVALID_CODE"));
    for (let i = 0; i < 5; i++) expect((await post("ABCD-EFGH-JKLM")).status).toBe(400);
    expect((await post("ABCD-EFGH-JKLM")).status).toBe(429);
    expect(redeem).toHaveBeenCalledTimes(5);
  });
});
