import { int, mysqlEnum, mysqlTable, text, timestamp, varchar, decimal } from "drizzle-orm/mysql-core";

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
  type: mysqlEnum("type", ["consume", "recharge", "register"]).notNull(), // 交易类型
  feature: varchar("feature", { length: 100 }), // 功能模块名称，如 "photo_restore", "story_generation"
  description: text("description"), // 交易描述
  balanceAfter: int("balanceAfter").notNull(), // 交易后余额
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type CreditTransaction = typeof creditTransactions.$inferSelect;
export type InsertCreditTransaction = typeof creditTransactions.$inferInsert;

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
