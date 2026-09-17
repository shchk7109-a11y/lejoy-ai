import "dotenv/config";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { eq } from "drizzle-orm";
import { appendFileSync, createReadStream, createWriteStream, mkdirSync, openSync, closeSync, existsSync, statSync } from "node:fs";
import { createInterface } from "node:readline/promises";
import { dirname } from "node:path";
import { users } from "../drizzle/schema";
import { getAllUsers, getDb, getUserById, rechargeCredits } from "../server/db";

export type AdminCreditsCommand =
  | { kind: "list" }
  | { kind: "recharge"; userId: number; amount: number; note: string }
  | { kind: "set-admin"; userId: number };

interface AdminUserRow {
  id: number;
  name: string | null;
  openId: string;
  credits: number;
  createdAt: Date;
}

export interface AdminCreditsDependencies {
  getAllUsers: () => Promise<AdminUserRow[]>;
  rechargeCredits: (
    userId: number,
    amount: number,
    description: string,
  ) => Promise<number>;
  setAdmin: (userId: number) => Promise<void>;
}

const USAGE = [
  "用法：",
  "  pnpm tsx scripts/admin-credits.ts list",
  "  pnpm tsx scripts/admin-credits.ts recharge <userId> <数量> [备注]",
  "  pnpm tsx scripts/admin-credits.ts set-admin <userId>",
].join("\n");

function positiveInteger(value: string | undefined, label: string): number {
  if (!value || !/^\d+$/.test(value)) throw new Error(`${label} 必须为正整数`);
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`${label} 必须为正整数`);
  }
  return parsed;
}

export function parseAdminCreditsArgs(args: string[]): AdminCreditsCommand {
  const [command, ...rest] = args;
  if (command === "list" && rest.length === 0) return { kind: "list" };

  if (command === "recharge" && rest.length >= 2) {
    const userId = positiveInteger(rest[0], "userId");
    const amount = positiveInteger(rest[1], "数量");
    const note = rest.slice(2).join(" ").trim() || "管理员充值";
    return { kind: "recharge", userId, amount, note };
  }

  if (command === "set-admin" && rest.length === 1) {
    return { kind: "set-admin", userId: positiveInteger(rest[0], "userId") };
  }

  throw new Error("命令参数无效");
}

export function maskOpenId(openId: string): string {
  return `${openId.slice(0, 6)}***`;
}

export function validateAdminCreditsOperator(value: string | undefined): string {
  if (!value || !/^[a-zA-Z0-9_-]{3,80}$/.test(value)) throw new Error("请先设置 ADMIN_CREDITS_OPERATOR 操作者标识");
  return value;
}
export function auditedRechargeDescription(operator: string, note: string): string {
  return `人工补分[操作者:${validateAdminCreditsOperator(operator)}] ${note.trim()}`.slice(0, 500);
}

async function confirmRechargeTarget(command: Extract<AdminCreditsCommand, { kind: "recharge" }>): Promise<void> {
  if (process.getuid?.() !== 0) throw new Error("人工补分仅允许服务器 root 交互操作");
  const user = await getUserById(command.userId);
  if (!user) throw new Error("用户不存在");
  const ttyFd = openSync("/dev/tty", "r+");
  const rl = createInterface({ input: createReadStream("/dev/tty", { fd: ttyFd, autoClose: false }), output: createWriteStream("/dev/tty", { fd: ttyFd, autoClose: false }), terminal: true });
  try {
    const answer = await rl.question(`目标用户 ${user.id} / ${maskOpenId(user.openId)}，当前 ${user.credits} 积分；增加 ${command.amount}。输入用户 ID 确认: `);
    if (answer.trim() !== String(user.id)) throw new Error("目标用户确认失败");
  } finally { rl.close(); closeSync(ttyFd); }
}

function appendRechargeAudit(record: Record<string, unknown>): void {
  const auditPath = process.env.ADMIN_CREDITS_AUDIT_FILE ?? "/root/.lejoy-ai/admin-credits-audit.jsonl";
  mkdirSync(dirname(auditPath), { recursive: true, mode: 0o700 });
  if (existsSync(auditPath) && (statSync(auditPath).mode & 0o077) !== 0) throw new Error("人工补分审计文件权限不安全");
  appendFileSync(auditPath, JSON.stringify({ at: new Date().toISOString(), ...record }) + "\n", { mode: 0o600 });
}

export async function requireDatabase<T>(
  loadDatabase: () => Promise<T | null>,
): Promise<T> {
  const database = await loadDatabase();
  if (!database) throw new Error("数据库不可用");
  return database;
}

export async function runAdminCredits(
  command: AdminCreditsCommand,
  dependencies: AdminCreditsDependencies,
  write: (message: string) => void = console.log,
): Promise<void> {
  if (command.kind === "list") {
    const allUsers = await dependencies.getAllUsers();
    if (allUsers.length === 0) {
      write("暂无用户");
      return;
    }
    const lines = ["id\t昵称\topenId\t积分\t注册时间"];
    for (const user of allUsers) {
      lines.push(
        [
          user.id,
          user.name?.trim() || "未设置",
          maskOpenId(user.openId),
          user.credits,
          user.createdAt.toISOString(),
        ].join("\t"),
      );
    }
    write(lines.join("\n"));
    return;
  }

  if (command.kind === "recharge") {
    const balance = await dependencies.rechargeCredits(
      command.userId,
      command.amount,
      command.note,
    );
    write(
      `充值成功：用户 ${command.userId}，新增 ${command.amount}，当前余额 ${balance}`,
    );
    return;
  }

  await dependencies.setAdmin(command.userId);
  write(`设置成功：用户 ${command.userId} 已设为管理员`);
}

async function setAdmin(userId: number): Promise<void> {
  const db = await requireDatabase(getDb);
  const user = await getUserById(userId);
  if (!user) throw new Error("用户不存在");
  await db.update(users).set({ role: "admin" }).where(eq(users.id, userId));
}

const productionDependencies: AdminCreditsDependencies = {
  getAllUsers: async () => {
    await requireDatabase(getDb);
    return getAllUsers();
  },
  rechargeCredits,
  setAdmin,
};

async function main(): Promise<number> {
  try {
    const command = parseAdminCreditsArgs(process.argv.slice(2));
    if (command.kind === "recharge") {
      const operator = validateAdminCreditsOperator(process.env.ADMIN_CREDITS_OPERATOR);
      await confirmRechargeTarget(command);
      appendRechargeAudit({ status: "intent", operator, userId: command.userId, amount: command.amount, reason: command.note });
      await runAdminCredits({ ...command, note: auditedRechargeDescription(operator, command.note) }, productionDependencies);
      try { appendRechargeAudit({ status: "completed", operator, userId: command.userId, amount: command.amount, reason: command.note }); }
      catch {
        console.error("补分已执行，但审计文件写入失败；先核对积分流水，禁止重试本笔补分。");
        return 1;
      }
      return 0;
    }
    await runAdminCredits(command, productionDependencies);
    return 0;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    console.error(USAGE);
    return 1;
  }
}

const entrypoint = process.argv[1] ? resolve(process.argv[1]) : "";
if (entrypoint === fileURLToPath(import.meta.url)) {
  void main().then((exitCode) => process.exit(exitCode));
}
