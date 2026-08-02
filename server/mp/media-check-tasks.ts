import { eq } from "drizzle-orm";
import { mediaCheckTasks, type InsertMediaCheckTask, type MediaCheckTask } from "../../drizzle/schema";
import { getDb } from "../db";
import type { MediaCheckStatus } from "./wechat-callback";

export async function createMediaCheckTask(task: InsertMediaCheckTask): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("数据库不可用");
  await db.insert(mediaCheckTasks).values(task);
}

export async function findMediaCheckTask(traceId: string): Promise<MediaCheckTask | undefined> {
  const db = await getDb();
  if (!db) throw new Error("数据库不可用");
  const rows = await db.select().from(mediaCheckTasks).where(eq(mediaCheckTasks.traceId, traceId)).limit(1);
  return rows[0];
}

export async function updateMediaCheckTaskStatus(traceId: string, status: MediaCheckStatus): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("数据库不可用");
  await db.update(mediaCheckTasks).set({ status }).where(eq(mediaCheckTasks.traceId, traceId));
}
