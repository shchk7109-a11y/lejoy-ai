import { eq, desc, and, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  InsertUser, users, modelConfigs, userApiConfigs, pointsLog,
  systemSettings, stories, chatConversations, chatMessages, apiCallLogs,
  type ModelConfig, type Story, type ChatConversation, type ChatMessage, type ApiCallLog
} from "../drizzle/schema";
import { ENV } from './_core/env';
import { encrypt, decrypt, maskApiKey } from './crypto';

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

// ─── User helpers ────────────────────────────────────────────

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) return;

  try {
    const values: InsertUser = { openId: user.openId };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];
    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };
    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = 'admin';
      updateSet.role = 'admin';
    }
    if (!values.lastSignedIn) values.lastSignedIn = new Date();
    if (Object.keys(updateSet).length === 0) updateSet.lastSignedIn = new Date();

    await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function getUserById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function getAllUsers() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(users).orderBy(desc(users.createdAt));
}

export async function updateUserPoints(userId: number, delta: number) {
  const db = await getDb();
  if (!db) return;
  await db.update(users).set({ points: sql`points + ${delta}` }).where(eq(users.id, userId));
}

export async function setUserFrozen(userId: number, frozen: boolean) {
  const db = await getDb();
  if (!db) return;
  await db.update(users).set({ isFrozen: frozen }).where(eq(users.id, userId));
}

// ─── Points helpers ──────────────────────────────────────────

export async function addPointsLog(userId: number, amount: number, type: "consume" | "recharge" | "gift" | "register", description?: string, operatorId?: number) {
  const db = await getDb();
  if (!db) return;
  await db.insert(pointsLog).values({ userId, amount, type, description, operatorId });
}

export async function getPointsHistory(userId: number, limit = 50) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(pointsLog).where(eq(pointsLog.userId, userId)).orderBy(desc(pointsLog.createdAt)).limit(limit);
}

// ─── Model config helpers ────────────────────────────────────

export async function getAllModelConfigs(): Promise<ModelConfig[]> {
  const db = await getDb();
  if (!db) return [];
  const configs = await db.select().from(modelConfigs).orderBy(modelConfigs.id);
  return configs.map(c => ({ ...c, apiKey: c.apiKey ? maskApiKey(c.apiKey) : c.apiKey }));
}

export async function getModelConfig(configKey: string): Promise<ModelConfig | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(modelConfigs).where(eq(modelConfigs.configKey, configKey)).limit(1);
  if (result[0] && result[0].apiKey) {
    result[0] = { ...result[0], apiKey: decrypt(result[0].apiKey) };
  }
  return result[0];
}

export async function upsertModelConfig(config: { configKey: string; label: string; provider: string; modelName: string; apiKey?: string; baseUrl?: string }) {
  const db = await getDb();
  if (!db) return;
  const encryptedApiKey = config.apiKey ? encrypt(config.apiKey) : undefined;
  await db.insert(modelConfigs).values({
    ...config,
    ...(encryptedApiKey !== undefined ? { apiKey: encryptedApiKey } : {}),
  }).onDuplicateKeyUpdate({
    set: {
      label: config.label,
      provider: config.provider,
      modelName: config.modelName,
      baseUrl: config.baseUrl,
      ...(encryptedApiKey !== undefined ? { apiKey: encryptedApiKey } : {}),
    }
  });
}

export async function deleteModelConfig(id: number) {
  const db = await getDb();
  if (!db) return;
  await db.delete(modelConfigs).where(eq(modelConfigs.id, id));
}

// ─── User API config helpers ─────────────────────────────────

export async function getUserApiConfig(userId: number, configKey: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(userApiConfigs).where(and(eq(userApiConfigs.userId, userId), eq(userApiConfigs.configKey, configKey))).limit(1);
  if (result[0] && result[0].apiKey) {
    result[0] = { ...result[0], apiKey: decrypt(result[0].apiKey) };
  }
  return result[0];
}

export async function getUserApiConfigs(userId: number) {
  const db = await getDb();
  if (!db) return [];
  const configs = await db.select().from(userApiConfigs).where(eq(userApiConfigs.userId, userId));
  return configs.map(c => ({ ...c, apiKey: c.apiKey ? maskApiKey(c.apiKey) : c.apiKey }));
}

export async function upsertUserApiConfig(userId: number, configKey: string, data: { modelName?: string; apiKey?: string; baseUrl?: string }) {
  const db = await getDb();
  if (!db) return;
  const encryptedApiKey = data.apiKey ? encrypt(data.apiKey) : undefined;
  const updateData = {
    ...(data.modelName !== undefined ? { modelName: data.modelName } : {}),
    ...(data.baseUrl !== undefined ? { baseUrl: data.baseUrl } : {}),
    ...(encryptedApiKey !== undefined ? { apiKey: encryptedApiKey } : {}),
  };
  const existing = await getUserApiConfig(userId, configKey);
  if (existing) {
    await db.update(userApiConfigs).set(updateData).where(eq(userApiConfigs.id, existing.id));
  } else {
    await db.insert(userApiConfigs).values({ userId, configKey, ...updateData });
  }
}

// ─── System settings helpers ─────────────────────────────────

export async function getSetting(key: string): Promise<string | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(systemSettings).where(eq(systemSettings.settingKey, key)).limit(1);
  return result[0]?.settingValue;
}

export async function setSetting(key: string, value: string) {
  const db = await getDb();
  if (!db) return;
  await db.insert(systemSettings).values({ settingKey: key, settingValue: value }).onDuplicateKeyUpdate({ set: { settingValue: value } });
}

// ─── Story helpers ───────────────────────────────────────────

export async function createStory(userId: number, data: { title: string; characterName: string; theme: string; pageCount: number; pages: any }) {
  const db = await getDb();
  if (!db) return;
  const result = await db.insert(stories).values({ userId, ...data });
  return result[0].insertId;
}

export async function getUserStories(userId: number): Promise<Story[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(stories).where(eq(stories.userId, userId)).orderBy(desc(stories.createdAt));
}

export async function deleteStory(id: number, userId: number) {
  const db = await getDb();
  if (!db) return;
  await db.delete(stories).where(and(eq(stories.id, id), eq(stories.userId, userId)));
}

// ─── Chat helpers ────────────────────────────────────────────

export async function createConversation(userId: number, title?: string) {
  const db = await getDb();
  if (!db) return;
  const result = await db.insert(chatConversations).values({ userId, title });
  return result[0].insertId;
}

export async function getUserConversations(userId: number): Promise<ChatConversation[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(chatConversations).where(eq(chatConversations.userId, userId)).orderBy(desc(chatConversations.updatedAt));
}

export async function addChatMessage(conversationId: number, role: "user" | "assistant", content: string, imageUrl?: string) {
  const db = await getDb();
  if (!db) return;
  await db.insert(chatMessages).values({ conversationId, role, content, imageUrl });
  await db.update(chatConversations).set({ updatedAt: new Date() }).where(eq(chatConversations.id, conversationId));
}

export async function getConversationMessages(conversationId: number): Promise<ChatMessage[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(chatMessages).where(eq(chatMessages.conversationId, conversationId)).orderBy(chatMessages.createdAt);
}

export async function deleteConversation(id: number, userId: number) {
  const db = await getDb();
  if (!db) return;
  await db.delete(chatMessages).where(eq(chatMessages.conversationId, id));
  await db.delete(chatConversations).where(and(eq(chatConversations.id, id), eq(chatConversations.userId, userId)));
}

// ─── API Call Log helpers ────────────────────────────────────

export async function logApiCall(userId: number, module: string, modelUsed: string | null, success: boolean, errorMessage?: string, durationMs?: number) {
  const db = await getDb();
  if (!db) return;
  await db.insert(apiCallLogs).values({ userId, module, modelUsed, success, errorMessage, durationMs });
}

export async function getApiCallStats(days: number = 7) {
  const db = await getDb();
  if (!db) return { totalCalls: 0, successCalls: 0, failedCalls: 0, byModule: [], byDay: [] };
  
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const allLogs = await db.select().from(apiCallLogs).where(sql`${apiCallLogs.createdAt} >= ${since}`).orderBy(desc(apiCallLogs.createdAt));
  
  const totalCalls = allLogs.length;
  const successCalls = allLogs.filter(l => l.success).length;
  const failedCalls = totalCalls - successCalls;
  
  // Group by module
  const moduleMap = new Map<string, { total: number; success: number; failed: number; avgDuration: number }>(); 
  for (const log of allLogs) {
    const m = moduleMap.get(log.module) || { total: 0, success: 0, failed: 0, avgDuration: 0 };
    m.total++;
    if (log.success) m.success++; else m.failed++;
    if (log.durationMs) m.avgDuration = (m.avgDuration * (m.total - 1) + log.durationMs) / m.total;
    moduleMap.set(log.module, m);
  }
  const byModule = Array.from(moduleMap.entries()).map(([name, stats]) => ({ name, ...stats }));
  
  // Group by day
  const dayMap = new Map<string, number>();
  for (const log of allLogs) {
    const day = log.createdAt.toISOString().slice(0, 10);
    dayMap.set(day, (dayMap.get(day) || 0) + 1);
  }
  const byDay = Array.from(dayMap.entries()).map(([date, count]) => ({ date, count })).sort((a, b) => a.date.localeCompare(b.date));
  
  // Recent errors
  const recentErrors = allLogs.filter(l => !l.success).slice(0, 20).map(l => ({
    module: l.module, model: l.modelUsed, error: l.errorMessage, time: l.createdAt
  }));
  
  return { totalCalls, successCalls, failedCalls, byModule, byDay, recentErrors };
}
