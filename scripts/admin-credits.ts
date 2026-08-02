import "dotenv/config";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { eq } from "drizzle-orm";
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

async function main(): Promise<void> {
  try {
    const command = parseAdminCreditsArgs(process.argv.slice(2));
    await runAdminCredits(command, productionDependencies);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    console.error(USAGE);
    process.exitCode = 1;
  }
}

const entrypoint = process.argv[1] ? resolve(process.argv[1]) : "";
if (entrypoint === fileURLToPath(import.meta.url)) void main();
