import { Router } from "express";
import { createCreditCodeService, getCreditCodeService, type BatchInput, validateBatchInput } from "../credits/codes";
import { fetchStoreCatalog, type StoreCatalogRow } from "../credits/store-source";
import { getLastStoreSync, recordStoreSyncFailure, syncStoreCatalog } from "../credits/store-sync";
import { getDb } from "../db";
import { createHqAuthStore } from "./auth-store";
import { requireHqAdmin, requireHqCsrf, requireHqReady } from "./auth-routes";

type Options = {
  authStore?: ReturnType<typeof createHqAuthStore>;
  service?: ReturnType<typeof createCreditCodeService>;
  expectedOrigin?: string;
  storeSync?: {
    fetchCatalog: () => Promise<StoreCatalogRow[]>;
    sync: (rows: StoreCatalogRow[], adminId: number) => Promise<{ insertedCount: number; updatedCount: number; disabledCount: number; syncedAt: string }>;
    lastSuccess: () => Promise<unknown>;
    recordFailure: (adminId: number, errorCode: string) => Promise<void>;
  };
};

function parsedBatch(body: Record<string, unknown>): BatchInput {
  if (typeof body.storeId !== "number" || typeof body.amount !== "number" || typeof body.quantity !== "number" ||
      typeof body.expiresAt !== "string" || typeof body.purpose !== "string" || typeof body.receiptRef !== "string") {
    throw new Error("批次参数缺失");
  }
  return validateBatchInput({
    storeId: body.storeId, amount: body.amount, quantity: body.quantity,
    expiresAt: new Date(body.expiresAt), purpose: body.purpose as BatchInput["purpose"], receiptRef: body.receiptRef,
    approver: body.approver as string | undefined, approvalReason: body.approvalReason as string | undefined,
  });
}

export function createHqBatchRouter(options: Options = {}) {
  const router = Router();
  const service = () => options.service ? Promise.resolve(options.service) : getCreditCodeService();
  const storeDb = async () => {
    const db = await getDb();
    if (!db) throw new Error("数据库不可用");
    return db;
  };
  const storeSync = options.storeSync ?? {
    fetchCatalog: () => fetchStoreCatalog({ apiKey: process.env.LINGZHI_INTERNAL_API_KEY ?? "" }),
    sync: async (rows: StoreCatalogRow[], adminId: number) => syncStoreCatalog(await storeDb(), rows, adminId),
    lastSuccess: async () => getLastStoreSync(await storeDb()),
    recordFailure: async (adminId: number, errorCode: string) => recordStoreSyncFailure(await storeDb(), adminId, errorCode),
  };
  let syncing = false;
  router.use(requireHqAdmin({ store: options.authStore, expectedOrigin: options.expectedOrigin }), requireHqReady);
  router.get("/stores", async (_req, res) => {
    try {
      const [storeList, lastSync] = await Promise.all([(await service()).listStores(), storeSync.lastSuccess()]);
      res.setHeader("Cache-Control", "no-store"); res.json({ stores: storeList, lastSync });
    }
    catch { res.status(503).json({ code: "HQ_UNAVAILABLE", message: "门店列表暂不可用" }); }
  });
  router.post("/stores", requireHqCsrf({ expectedOrigin: options.expectedOrigin }), (_req, res) => {
    res.status(405).json({ code: "STORE_MANUAL_CREATE_DISABLED", message: "门店只能从内容裂变系统同步" });
  });
  router.post("/stores/sync", requireHqCsrf({ expectedOrigin: options.expectedOrigin }), async (_req, res) => {
    if (syncing) { res.status(409).json({ code: "STORE_SYNC_IN_PROGRESS", message: "门店正在同步，请稍后刷新" }); return; }
    syncing = true;
    try {
      const rows = await storeSync.fetchCatalog();
      const result = await storeSync.sync(rows, res.locals.hqAdminId);
      res.setHeader("Cache-Control", "no-store"); res.json(result);
    } catch {
      const code = !options.storeSync && !process.env.LINGZHI_INTERNAL_API_KEY ? "SOURCE_NOT_CONFIGURED" : "STORE_SYNC_UNAVAILABLE";
      try { await storeSync.recordFailure(res.locals.hqAdminId, code); } catch { /* failure audit may be unavailable with the database */ }
      res.status(503).json({ code, message: code === "SOURCE_NOT_CONFIGURED" ? "门店同步尚未配置，请联系技术人员" : "门店同步未完成，原门店列表未变化" });
    } finally { syncing = false; }
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
  router.post("/batches/:id/confirm-delivery", requireHqCsrf({ expectedOrigin: options.expectedOrigin }), async (req, res) => {
    const id = Number(req.params.id);
    const reason = req.body?.reason;
    if (!Number.isSafeInteger(id) || id <= 0 || typeof reason !== "string" || reason.trim().length < 8 || reason.length > 300) { res.status(400).json({ code: "BAD_REQUEST" }); return; }
    try { res.json(await (await service()).confirmDelivery(id, res.locals.hqAdminId, reason)); }
    catch { res.status(409).json({ code: "DELIVERY_NOT_CONFIRMED", message: "交付确认未完成，请核对批次状态" }); }
  });
  router.get("/events", async (_req, res) => {
    try { res.setHeader("Cache-Control", "no-store"); res.json({ events: await (await service()).listEvents() }); }
    catch { res.status(503).json({ code: "HQ_UNAVAILABLE", message: "操作记录暂不可用" }); }
  });
  return router;
}
