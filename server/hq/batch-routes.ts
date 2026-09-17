import { Router } from "express";
import { createCreditCodeService, getCreditCodeService, type BatchInput, validateBatchInput } from "../credits/codes";
import { createHqAuthStore } from "./auth-store";
import { requireHqAdmin, requireHqCsrf, requireHqReady } from "./auth-routes";

type Options = {
  authStore?: ReturnType<typeof createHqAuthStore>;
  service?: ReturnType<typeof createCreditCodeService>;
  expectedOrigin?: string;
};

function parsedBatch(body: Record<string, unknown>): BatchInput {
  if (typeof body.storeId !== "number" || typeof body.amount !== "number" || typeof body.quantity !== "number" ||
      typeof body.expiresAt !== "string" || typeof body.purpose !== "string" || typeof body.receiptRef !== "string") {
    throw new Error("批次参数缺失");
  }
  return validateBatchInput({
    storeId: body.storeId, amount: body.amount, quantity: body.quantity,
    expiresAt: new Date(body.expiresAt), purpose: body.purpose as BatchInput["purpose"], receiptRef: body.receiptRef,
  });
}

export function createHqBatchRouter(options: Options = {}) {
  const router = Router();
  const service = () => options.service ? Promise.resolve(options.service) : getCreditCodeService();
  router.use(requireHqAdmin({ store: options.authStore, expectedOrigin: options.expectedOrigin }), requireHqReady);
  router.get("/stores", async (_req, res) => {
    try { res.setHeader("Cache-Control", "no-store"); res.json({ stores: await (await service()).listStores() }); }
    catch { res.status(503).json({ code: "HQ_UNAVAILABLE", message: "门店列表暂不可用" }); }
  });
  router.post("/stores", requireHqCsrf({ expectedOrigin: options.expectedOrigin }), async (req, res) => {
    try {
      const { code, name } = req.body ?? {};
      if (typeof code !== "string" || typeof name !== "string") { res.status(400).json({ code: "BAD_REQUEST" }); return; }
      res.status(201).json(await (await service()).createStore({ code, name }));
    } catch { res.status(400).json({ code: "BAD_REQUEST", message: "门店编号或名称无效，或编号已存在" }); }
  });
  router.get("/batches", async (_req, res) => {
    try { res.setHeader("Cache-Control", "no-store"); res.json({ batches: await (await service()).listBatches() }); }
    catch { res.status(503).json({ code: "HQ_UNAVAILABLE", message: "批次库存暂不可用" }); }
  });
  router.post("/batches", requireHqCsrf({ expectedOrigin: options.expectedOrigin }), async (req, res) => {
    let input: BatchInput;
    try { input = parsedBatch(req.body ?? {}); }
    catch { res.status(400).json({ code: "BAD_REQUEST", message: "请检查门店、面额、数量、有效期和线下凭证／审批编号" }); return; }
    try { res.status(201).json(await (await service()).createBatch(input, res.locals.hqAdminId)); }
    catch { res.status(409).json({ code: "BATCH_NOT_CREATED", message: "批次未建立，请确认门店状态后重试" }); }
  });
  router.post("/batches/:id/activate", requireHqCsrf({ expectedOrigin: options.expectedOrigin }), async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isSafeInteger(id) || id <= 0) { res.status(400).json({ code: "BAD_REQUEST" }); return; }
    try {
      const result = await (await service()).activateBatch(id, res.locals.hqAdminId);
      res.setHeader("Cache-Control", "no-store");
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.setHeader("Content-Disposition", `attachment; filename="lejoy-codes-${id}.csv"`);
      res.type("text/csv; charset=utf-8").send(result.csv);
    } catch { res.status(409).json({ code: "BATCH_NOT_ACTIVATED", message: "未生成兑换码，请检查批次状态；若已激活但下载中断，请停用后重建批次" }); }
  });
  router.post("/batches/:id/revoke", requireHqCsrf({ expectedOrigin: options.expectedOrigin }), async (req, res) => {
    const id = Number(req.params.id);
    const reason = req.body?.reason;
    if (!Number.isSafeInteger(id) || id <= 0 || typeof reason !== "string" || reason.trim().length < 4) { res.status(400).json({ code: "BAD_REQUEST" }); return; }
    try { res.json(await (await service()).revokeBatch(id, res.locals.hqAdminId, reason)); }
    catch { res.status(409).json({ code: "BATCH_NOT_REVOKED", message: "停用未完成，请刷新批次状态" }); }
  });
  router.get("/events", async (_req, res) => {
    try { res.setHeader("Cache-Control", "no-store"); res.json({ events: await (await service()).listEvents() }); }
    catch { res.status(503).json({ code: "HQ_UNAVAILABLE", message: "操作记录暂不可用" }); }
  });
  return router;
}
