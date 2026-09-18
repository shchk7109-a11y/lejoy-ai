import { desc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { storeSyncRuns, stores } from "../../drizzle/schema";
import { sha256 } from "../hq/auth-crypto";
import type { StoreCatalogRow } from "./store-source";

type ExistingStore = { id: number; code: string; name: string; sourceFormatId: string | null; sourceStoreId: string | null; sourceFormatName: string | null; enabled: number };
type SyncPlan = { add: StoreCatalogRow[]; update: Array<{ id: number; row: StoreCatalogRow }>; disableIds: number[] };
export type ChangedStore = { name: string; change: "added" | "renamed" | "disabled" | "reactivated" | "updated"; previousName?: string };

function catalogKey(formatId: string, storeId: string): string { return JSON.stringify([formatId, storeId]); }

export function planStoreSync(existing: ExistingStore[], catalog: StoreCatalogRow[]): SyncPlan {
  if (!Array.isArray(catalog) || catalog.length === 0 || catalog.length > 3000) throw new Error("门店目录为空或数量异常");
  const incoming = new Map<string, StoreCatalogRow>();
  for (const row of catalog) {
    if (!row || !row.formatId || !row.formatName || !row.storeId || !row.storeName) throw new Error("门店目录字段无效");
    const key = catalogKey(row.formatId, row.storeId);
    if (incoming.has(key)) throw new Error("门店目录来源键重复");
    incoming.set(key, row);
  }
  const known = new Set<string>();
  const update: SyncPlan["update"] = [];
  const disableIds: number[] = [];
  for (const item of existing) {
    const key = item.sourceFormatId && item.sourceStoreId ? catalogKey(item.sourceFormatId, item.sourceStoreId) : "";
    const row = incoming.get(key);
    if (row) {
      known.add(key);
      if (item.name !== row.storeName || item.sourceFormatName !== row.formatName || item.enabled !== 1) update.push({ id: item.id, row });
    } else if (item.enabled === 1) disableIds.push(item.id);
  }
  return { add: catalog.filter(row => !known.has(catalogKey(row.formatId, row.storeId))), update, disableIds };
}

export async function syncStoreCatalog(db: ReturnType<typeof drizzle>, catalog: StoreCatalogRow[], adminId: number, now = new Date()) {
  if (!Number.isSafeInteger(adminId) || adminId <= 0) throw new Error("同步操作者无效");
  planStoreSync([], catalog);
  return db.transaction(async tx => {
    const existing = await tx.select().from(stores);
    const plan = planStoreSync(existing, catalog);
    const byId = new Map(existing.map(store => [store.id, store]));
    const changedStores: ChangedStore[] = [
      ...plan.add.map(row => ({ name: row.storeName, change: "added" as const })),
      ...plan.update.map(({ id, row }): ChangedStore => {
        const before = byId.get(id)!;
        if (before.enabled !== 1) return { name: row.storeName, change: "reactivated" };
        if (before.name !== row.storeName) return { name: row.storeName, change: "renamed", previousName: before.name };
        return { name: row.storeName, change: "updated" };
      }),
      ...plan.disableIds.map(id => ({ name: byId.get(id)!.name, change: "disabled" as const })),
    ];
    for (const row of plan.add) {
      const sourceKey = catalogKey(row.formatId, row.storeId);
      await tx.insert(stores).values({
        code: `LZ_${sha256(sourceKey).slice(0, 24).toUpperCase()}`,
        name: row.storeName,
        sourceFormatId: row.formatId,
        sourceStoreId: row.storeId,
        sourceFormatName: row.formatName,
        lastSyncedAt: now,
        enabled: 1,
      });
    }
    for (const change of plan.update) {
      await tx.update(stores).set({ name: change.row.storeName, sourceFormatName: change.row.formatName, lastSyncedAt: now, enabled: 1 })
        .where(eq(stores.id, change.id));
    }
    for (const id of plan.disableIds) {
      await tx.update(stores).set({ enabled: 0, lastSyncedAt: now }).where(eq(stores.id, id));
    }
    const result = { insertedCount: plan.add.length, updatedCount: plan.update.length, disabledCount: plan.disableIds.length, syncedAt: now.toISOString(), changedStores };
    await tx.insert(storeSyncRuns).values({ adminId, status: "success", insertedCount: result.insertedCount, updatedCount: result.updatedCount, disabledCount: result.disabledCount, createdAt: now });
    return result;
  });
}

export async function recordStoreSyncFailure(db: ReturnType<typeof drizzle>, adminId: number, errorCode: string, now = new Date()) {
  if (!Number.isSafeInteger(adminId) || adminId <= 0 || !/^[A-Z_]{2,64}$/.test(errorCode)) throw new Error("同步失败记录参数无效");
  await db.insert(storeSyncRuns).values({ adminId, status: "failure", errorCode, createdAt: now });
}

export async function getLastStoreSync(db: ReturnType<typeof drizzle>) {
  const [last] = await db.select().from(storeSyncRuns).where(eq(storeSyncRuns.status, "success"))
    .orderBy(desc(storeSyncRuns.createdAt)).limit(1);
  return last ?? null;
}
