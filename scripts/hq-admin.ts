import "dotenv/config";
import { existsSync, mkdirSync, openSync, closeSync, writeFileSync, appendFileSync, writeSync, statSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { createInterface } from "node:readline/promises";
import { pathToFileURL } from "node:url";
import path from "node:path";
import { createHqAuthStore } from "../server/hq/auth-store";
import { encryptSecret, hashPassword } from "../server/hq/auth-crypto";
import { HQ_TOTP_KEY_FILE, readHqTotpKey } from "../server/hq/key";
import { getDb } from "../server/db";

type Command = { action: "create" | "reset-totp" | "init-key"; username?: string };

export function parseHqAdminCommand(argv: string[]): Command {
  if (argv.length === 1 && argv[0] === "init-key") return { action: "init-key" };
  if (argv.length !== 2 || !["create", "reset-totp"].includes(argv[0]) || !/^[a-zA-Z0-9_-]{3,80}$/.test(argv[1])) {
    throw new Error("用法: hq-admin.ts init-key | create <账号> | reset-totp <账号>；禁止通过命令参数传入秘密");
  }
  return { action: argv[0] as "create" | "reset-totp", username: argv[1] };
}

function base32(buffer: Buffer): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = 0; let value = 0; let out = "";
  for (const byte of buffer) {
    value = (value << 8) | byte; bits += 8;
    while (bits >= 5) { out += alphabet[(value >>> (bits -= 5)) & 31]; }
  }
  if (bits) out += alphabet[(value << (5 - bits)) & 31];
  return out;
}

async function main() {
  const command = parseHqAdminCommand(process.argv.slice(2));
  if (process.getuid?.() !== 0) throw new Error("仅允许服务器 root 在交互终端运行");
  if (!process.stdin.isTTY || !process.stdout.isTTY) throw new Error("必须在交互终端运行");
  const ttyFd = openSync("/dev/tty", "r+");
  // readline 使用已有终端，不与仅供同步输出秘密的 /dev/tty 文件描述符争用。
  const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  try {
    const confirmed = await rl.question(`确认执行总部后台 ${command.action} 操作${command.username ? `（账号 ${command.username}）` : ""}？输入 YES: `);
    if (confirmed !== "YES") throw new Error("操作已取消");
    if (command.action === "init-key") {
      if (existsSync(HQ_TOTP_KEY_FILE)) throw new Error("密钥已存在，拒绝覆盖");
      mkdirSync(path.dirname(HQ_TOTP_KEY_FILE), { recursive: true, mode: 0o700 });
      writeFileSync(HQ_TOTP_KEY_FILE, randomBytes(32), { flag: "wx", mode: 0o600 });
      writeSync(ttyFd, "总部 TOTP 加密密钥已建立；请按服务器备份策略离线保管。\n");
      return;
    }
    const key = readHqTotpKey();
    const db = await getDb();
    if (!db) throw new Error("数据库不可用，未执行开户或恢复");
    const store = createHqAuthStore(db);
    const account = await store.findAccount(command.username!);
    if (command.action === "create" && account) throw new Error("账号已存在");
    if (command.action === "reset-totp" && !account) throw new Error("账号不存在");
    let reason = "initial_account";
    if (command.action === "reset-totp") {
      reason = (await rl.question("请输入恢复原因（不少于 8 字）: ")).trim();
      if (reason.length < 8 || reason.length > 200) throw new Error("恢复原因长度无效");
    }
    const auditPath = process.env.HQ_ADMIN_AUDIT_FILE ?? "/root/.lejoy-ai/hq-admin-audit.jsonl";
    mkdirSync(path.dirname(auditPath), { recursive: true, mode: 0o700 });
    if (existsSync(auditPath) && (statSync(auditPath).mode & 0o077) !== 0) throw new Error("审计文件权限不安全");
    appendFileSync(auditPath, JSON.stringify({ at: new Date().toISOString(), action: command.action, username: command.username, reason, status: "intent" }) + "\n", { mode: 0o600 });
    const secret = randomBytes(20);
    const encrypted = encryptSecret(secret, key);
    let accountId: number;
    let password: string | undefined;
    if (command.action === "create") {
      password = randomBytes(24).toString("base64url");
      accountId = await store.createAccount({ username: command.username!, passwordHash: await hashPassword(password), totpSecretEncrypted: encrypted, mustChangePassword: true });
    } else {
      accountId = account!.id;
      await store.rotateTotp(accountId, encrypted);
    }
    let auditFailed = false;
    try { appendFileSync(auditPath, JSON.stringify({ at: new Date().toISOString(), action: command.action, accountId, username: command.username, reason, status: "completed" }) + "\n", { mode: 0o600 }); }
    catch { auditFailed = true; }
    writeSync(ttyFd, `账号: ${command.username}\n`);
    if (password) writeSync(ttyFd, `一次性初始密码: ${password}\n`);
    writeSync(ttyFd, `TOTP 绑定密钥（仅显示一次）: ${base32(secret)}\n`);
    writeSync(ttyFd, "请立即将绑定信息交给受控人员并妥善保管。\n");
    if (auditFailed) writeSync(ttyFd, "警告：账号操作已生效，但审计完成记录写入失败；请人工核对，切勿重试。\n");
  } finally {
    rl.close();
    closeSync(ttyFd);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  void main().then(() => 0).catch(() => { writeSync(2, "总部账号操作失败；请核对命令、密钥和数据库状态。\n"); return 1; })
    .then(exitCode => process.exit(exitCode));
}
