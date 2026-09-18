import { int, mysqlEnum, mysqlTable, text, timestamp, varchar, decimal, uniqueIndex } from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 */
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  credits: int("credits").default(100).notNull(), // 用户积分余额，新用户默认100积分
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

/**
 * AI模型配置表 - 管理员可配置的模型参数
 */
export const aiModels = mysqlTable("ai_models", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 100 }).notNull().unique(), // 模型标识名称，如 "gemini-text", "gemini-image"
  displayName: varchar("displayName", { length: 200 }).notNull(), // 显示名称
  apiKey: text("apiKey").notNull(), // API密钥
  baseUrl: varchar("baseUrl", { length: 500 }).notNull(), // API基础URL
  modelName: varchar("modelName", { length: 200 }).notNull(), // 实际模型名称，如 "gemini-2.5-flash"
  enabled: int("enabled").default(1).notNull(), // 是否启用：1启用，0禁用
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type AiModel = typeof aiModels.$inferSelect;
export type InsertAiModel = typeof aiModels.$inferInsert;

/**
 * 积分消费记录表
 */
export const creditTransactions = mysqlTable("credit_transactions", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(), // 关联用户ID
  amount: int("amount").notNull(), // 积分变动数量（正数为增加，负数为消耗）
  type: mysqlEnum("type", ["consume", "recharge", "register", "redeem"]).notNull(), // 交易类型
  feature: varchar("feature", { length: 100 }), // 功能模块名称，如 "photo_restore", "story_generation"
  creditCodeId: int("creditCodeId").unique(), // 兑换码流水一一对应，其他类型为 NULL
  description: text("description"), // 交易描述
  balanceAfter: int("balanceAfter").notNull(), // 交易后余额
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type CreditTransaction = typeof creditTransactions.$inferSelect;
export type InsertCreditTransaction = typeof creditTransactions.$inferInsert;

/** 总部后台身份与小程序用户身份完全独立。 */
export const hqAdminAccounts = mysqlTable("hq_admin_accounts", {
  id: int("id").autoincrement().primaryKey(),
  username: varchar("username", { length: 80 }).notNull().unique(),
  passwordHash: varchar("passwordHash", { length: 255 }).notNull(),
  totpSecretEncrypted: text("totpSecretEncrypted").notNull(),
  mustChangePassword: int("mustChangePassword").default(1).notNull(),
  disabled: int("disabled").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const hqAdminSessions = mysqlTable("hq_admin_sessions", {
  id: int("id").autoincrement().primaryKey(),
  adminId: int("adminId").notNull(),
  tokenHash: varchar("tokenHash", { length: 64 }).notNull().unique(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  lastUsedAt: timestamp("lastUsedAt").defaultNow().notNull(),
  expiresAt: timestamp("expiresAt").notNull(),
  revokedAt: timestamp("revokedAt"),
});

export const stores = mysqlTable("stores", {
  id: int("id").autoincrement().primaryKey(),
  code: varchar("code", { length: 50 }).notNull().unique(),
  name: varchar("name", { length: 160 }).notNull(),
  sourceFormatId: varchar("sourceFormatId", { length: 100 }),
  sourceStoreId: varchar("sourceStoreId", { length: 100 }),
  sourceFormatName: varchar("sourceFormatName", { length: 160 }),
  lastSyncedAt: timestamp("lastSyncedAt"),
  enabled: int("enabled").default(1).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [uniqueIndex("stores_source_pair_unique").on(table.sourceFormatId, table.sourceStoreId)]);

export const storeSyncRuns = mysqlTable("store_sync_runs", {
  id: int("id").autoincrement().primaryKey(),
  adminId: int("adminId").notNull(),
  status: mysqlEnum("status", ["success", "failure"]).notNull(),
  insertedCount: int("insertedCount").default(0).notNull(),
  updatedCount: int("updatedCount").default(0).notNull(),
  disabledCount: int("disabledCount").default(0).notNull(),
  errorCode: varchar("errorCode", { length: 64 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const creditCodeBatches = mysqlTable("credit_code_batches", {
  id: int("id").autoincrement().primaryKey(),
  storeId: int("storeId"),
  targetKind: mysqlEnum("targetKind", ["store", "hq_staff", "company_test", "trial"]).default("store").notNull(),
  recipientLabel: varchar("recipientLabel", { length: 160 }),
  amount: int("amount").notNull(),
  quantity: int("quantity").notNull(),
  expiresAt: timestamp("expiresAt").notNull(),
  purpose: mysqlEnum("purpose", ["purchase", "promotion"]).notNull(),
  receiptRef: varchar("receiptRef", { length: 160 }),
  status: mysqlEnum("status", ["pending", "active", "revoked"]).default("pending").notNull(),
  createdBy: int("createdBy").notNull(),
  activatedBy: int("activatedBy"),
  revokedBy: int("revokedBy"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  activatedAt: timestamp("activatedAt"),
  revokedAt: timestamp("revokedAt"),
});

export const creditCodes = mysqlTable("credit_codes", {
  id: int("id").autoincrement().primaryKey(),
  batchId: int("batchId").notNull(),
  codeHash: varchar("codeHash", { length: 64 }).notNull().unique(),
  status: mysqlEnum("status", ["unused", "redeemed", "revoked"]).default("unused").notNull(),
  redeemedBy: int("redeemedBy"),
  redeemedAt: timestamp("redeemedAt"),
});

export const creditCodeBatchEvents = mysqlTable("credit_code_batch_events", {
  id: int("id").autoincrement().primaryKey(),
  batchId: int("batchId").notNull(),
  adminId: int("adminId").notNull(),
  action: mysqlEnum("action", ["created", "activated", "delivery_confirmed", "revoked"]).notNull(),
  quantity: int("quantity").notNull(),
  reason: varchar("reason", { length: 500 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

/**
 * 微信异步媒体内容安全任务
 */
export const mediaCheckTasks = mysqlTable("media_check_tasks", {
  id: int("id").autoincrement().primaryKey(),
  traceId: varchar("trace_id", { length: 128 }).notNull().unique(),
  userId: int("userId").notNull(),
  fileKey: varchar("fileKey", { length: 512 }).notNull(),
  status: mysqlEnum("status", ["pending", "pass", "risky"]).default("pending").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type MediaCheckTask = typeof mediaCheckTasks.$inferSelect;
export type InsertMediaCheckTask = typeof mediaCheckTasks.$inferInsert;

/**
 * 客户信息表 - 用于管理员记录客户详细信息
 */
export const customerInfo = mysqlTable("customer_info", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().unique(), // 关联用户ID
  wechatId: varchar("wechatId", { length: 100 }), // 微信号
  phone: varchar("phone", { length: 20 }), // 手机号
  notes: text("notes"), // 备注信息
  tags: text("tags"), // 标签（JSON数组字符串）
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type CustomerInfo = typeof customerInfo.$inferSelect;
export type InsertCustomerInfo = typeof customerInfo.$inferInsert;
