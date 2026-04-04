import { eq, desc, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { InsertUser, users, aiModels, creditTransactions, customerInfo, InsertAiModel, InsertCreditTransaction, InsertCustomerInfo } from "../drizzle/schema";
import { ENV } from './_core/env';

let _db: ReturnType<typeof drizzle> | null = null;

// Lazily create the drizzle instance so local tooling can run without a DB.
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

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
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

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet,
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

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

// ─── 积分系统 ─────────────────────────────────────────────────────────────────

/** 积分消耗：原子操作，返回新余额；余额不足时抛出错误 */
export async function consumeCredits(userId: number, amount: number, feature: string, description: string): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("数据库不可用");
  const user = await getUserById(userId);
  if (!user) throw new Error("用户不存在");
  if (user.credits < amount) throw new Error(`积分不足，当前余额 ${user.credits}，需要 ${amount} 积分`);
  const newBalance = user.credits - amount;
  await db.update(users).set({ credits: newBalance }).where(eq(users.id, userId));
  await db.insert(creditTransactions).values({
    userId, amount: -amount, type: 'consume', feature, description, balanceAfter: newBalance,
  });
  return newBalance;
}

/** 积分充值：管理员给用户增加积分 */
export async function rechargeCredits(userId: number, amount: number, description: string): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("数据库不可用");
  const user = await getUserById(userId);
  if (!user) throw new Error("用户不存在");
  const newBalance = user.credits + amount;
  await db.update(users).set({ credits: newBalance }).where(eq(users.id, userId));
  await db.insert(creditTransactions).values({
    userId, amount, type: 'recharge', feature: 'admin_recharge',
    description: description || '管理员充值', balanceAfter: newBalance,
  });
  return newBalance;
}

/** 获取用户积分交易记录 */
export async function getUserTransactions(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(creditTransactions)
    .where(eq(creditTransactions.userId, userId))
    .orderBy(desc(creditTransactions.createdAt)).limit(50);
}

// ─── AI模型配置 ───────────────────────────────────────────────────────────────

export async function getAllAiModels() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(aiModels).orderBy(aiModels.name);
}

export async function updateAiModel(id: number, data: Partial<InsertAiModel>) {
  const db = await getDb();
  if (!db) throw new Error("数据库不可用");
  await db.update(aiModels).set(data).where(eq(aiModels.id, id));
}

export async function upsertAiModel(model: InsertAiModel) {
  const db = await getDb();
  if (!db) throw new Error("数据库不可用");
  await db.insert(aiModels).values(model).onDuplicateKeyUpdate({
    set: { displayName: model.displayName, apiKey: model.apiKey, baseUrl: model.baseUrl, modelName: model.modelName, enabled: model.enabled }
  });
}

// ─── 客户信息管理 ─────────────────────────────────────────────────────────────

export async function getCustomerInfo(userId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(customerInfo).where(eq(customerInfo.userId, userId)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function upsertCustomerInfo(info: InsertCustomerInfo) {
  const db = await getDb();
  if (!db) throw new Error("数据库不可用");
  await db.insert(customerInfo).values(info).onDuplicateKeyUpdate({
    set: { wechatId: info.wechatId, phone: info.phone, notes: info.notes, tags: info.tags }
  });
}

export async function getAllCustomerInfo() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(customerInfo).orderBy(desc(customerInfo.createdAt));
}

/** 新用户注册赠送积分记录 */
export async function recordRegisterBonus(userId: number, credits: number) {
  const db = await getDb();
  if (!db) return;
  const count = await db.select({ c: sql<number>`count(*)` }).from(creditTransactions).where(eq(creditTransactions.userId, userId));
  if ((count[0]?.c ?? 0) === 0) {
    await db.insert(creditTransactions).values({
      userId, amount: credits, type: 'register', feature: 'register',
      description: '新用户注册赠送积分', balanceAfter: credits,
    });
  }
}
