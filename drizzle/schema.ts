import { int, mysqlEnum, mysqlTable, text, timestamp, varchar, boolean, json } from "drizzle-orm/mysql-core";

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
  points: int("points").default(100).notNull(),
  isFrozen: boolean("isFrozen").default(false).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

/**
 * AI model configurations - admin can manage
 */
export const modelConfigs = mysqlTable("model_configs", {
  id: int("id").autoincrement().primaryKey(),
  configKey: varchar("configKey", { length: 64 }).notNull().unique(),
  label: varchar("label", { length: 128 }).notNull(),
  provider: varchar("provider", { length: 64 }).notNull(),
  modelName: varchar("modelName", { length: 128 }).notNull(),
  apiKey: text("apiKey"),
  baseUrl: varchar("baseUrl", { length: 512 }),
  extraParams: json("extraParams"),
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type ModelConfig = typeof modelConfigs.$inferSelect;
export type InsertModelConfig = typeof modelConfigs.$inferInsert;

/**
 * User custom API configurations
 */
export const userApiConfigs = mysqlTable("user_api_configs", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  configKey: varchar("configKey", { length: 64 }).notNull(),
  modelName: varchar("modelName", { length: 128 }),
  apiKey: text("apiKey"),
  baseUrl: varchar("baseUrl", { length: 512 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type UserApiConfig = typeof userApiConfigs.$inferSelect;

/**
 * Points transactions log
 */
export const pointsLog = mysqlTable("points_log", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  amount: int("amount").notNull(),
  type: mysqlEnum("type", ["consume", "recharge", "gift", "register"]).notNull(),
  description: varchar("description", { length: 256 }),
  operatorId: int("operatorId"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type PointsLog = typeof pointsLog.$inferSelect;

/**
 * System settings (points rules, etc.)
 */
export const systemSettings = mysqlTable("system_settings", {
  id: int("id").autoincrement().primaryKey(),
  settingKey: varchar("settingKey", { length: 64 }).notNull().unique(),
  settingValue: text("settingValue").notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type SystemSetting = typeof systemSettings.$inferSelect;

/**
 * Stories created by users
 */
export const stories = mysqlTable("stories", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  title: varchar("title", { length: 256 }).notNull(),
  characterName: varchar("characterName", { length: 64 }).notNull(),
  theme: varchar("theme", { length: 64 }).notNull(),
  pageCount: int("pageCount").default(4).notNull(),
  pages: json("pages").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Story = typeof stories.$inferSelect;

/**
 * Chat conversations for AI Kaleidoscope
 */
export const chatConversations = mysqlTable("chat_conversations", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  title: varchar("title", { length: 256 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type ChatConversation = typeof chatConversations.$inferSelect;

/**
 * Chat messages within conversations
 */
export const chatMessages = mysqlTable("chat_messages", {
  id: int("id").autoincrement().primaryKey(),
  conversationId: int("conversationId").notNull(),
  role: mysqlEnum("role", ["user", "assistant"]).notNull(),
  content: text("content").notNull(),
  imageUrl: text("imageUrl"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type ChatMessage = typeof chatMessages.$inferSelect;

/**
 * API call logs for system monitoring
 */
export const apiCallLogs = mysqlTable("api_call_logs", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  module: varchar("module", { length: 64 }).notNull(),
  modelUsed: varchar("modelUsed", { length: 128 }),
  success: boolean("success").default(true).notNull(),
  errorMessage: text("errorMessage"),
  durationMs: int("durationMs"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type ApiCallLog = typeof apiCallLogs.$inferSelect;
