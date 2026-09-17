# 乐享 AI 总部后台与积分兑换码 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 建立可独立登录的轻量总部 Web 后台，由总部配发一次性积分兑换码，顾客在小程序安全兑换；本期不接入线上付费充值。

**Architecture:** 同一 Express 服务承载独立的 `/api/hq` 总部认证与批次接口、现有 `/api/mp` 的兑换接口；总部会话与小程序 JWT 完全隔离。MySQL 事务承担码状态、余额和积分流水的原子一致性；React H5 提供 `/hq` 管理页，Taro 增加积分中心。

**Tech Stack:** TypeScript、Express、Drizzle/MySQL、Node `crypto`、Vitest、React/Vite、Taro/微信小程序、现有 PM2/Nginx 部署。

**Source of truth:** `docs/superpowers/specs/2026-09-17-store-credit-redemption-design.md`，提交 `82b974c`。已确认总部登录为账号密码＋TOTP 动态码。本计划不授权生产开户、迁移、实际配码或给现有账号补分；这些动作在自动化和预发验收后另行确认。只改 `/Users/mac/Desktop/lejoy-ai/codex/lejoy-ai` 内文件，保护现有未提交文件，始终按路径定向暂存。

---

## 文件边界

| 文件 | 职责 |
| --- | --- |
| `drizzle/schema.ts`、新生成的 `drizzle/*.sql` | 总部账号/会话、门店、批次、码、事件及 `redeem` 流水结构 |
| `server/hq/auth-crypto.ts`、`server/hq/auth-store.ts`、`server/hq/auth-routes.ts` | 密码/TOTP/会话、登录/登出/首次改密、鉴权与 CSRF |
| `scripts/hq-admin.ts` | 仅服务器交互式首次开户与 TOTP 恢复；不接受命令行明文密码 |
| `server/credits/recharge.ts`、`server/credits/codes.ts` | 人工加分原子化；配码、停用、库存、兑换事务 |
| `server/hq/batch-routes.ts`、`server/mp/credit-routes.ts` | 总部操作 API 与顾客兑换 API；不把业务事务写进大路由文件 |
| `client/src/pages/Hq.tsx`、`client/src/components/hq/*` | 总部登录、门店、批次、库存、审计和一次性 CSV 导出 |
| `miniprogram/src/pages/credits/*`、`miniprogram/src/services/api.ts` | 老人大字积分中心、兑换、余额/流水刷新与错误态 |
| `server/_core/index.ts`、`client/src/App.tsx`、`miniprogram/src/app.config.ts` | 装配新路由/页面；旧 `/admin` 不继承新会话 |

## Task 1：结构与迁移

**Files:** `drizzle/schema.ts`；新生成的 `drizzle/*.sql`；`server/credits/schema.test.ts`。

- [ ] **Step 1: 写失败的结构测试。** 在 `server/credits/schema.test.ts` 导入新表，断言 `hqAdminAccounts`、`hqAdminSessions`、`stores`、`creditCodeBatches`、`creditCodes`、`creditCodeBatchEvents` 都可通过 `getTableName()` 识别；用 `getTableColumns(creditTransactions)` 断言存在 `creditCodeId`。

```ts
expect(getTableName(creditCodes)).toBe("credit_codes");
expect(getTableColumns(creditTransactions)).toHaveProperty("creditCodeId");
```

- [ ] **Step 2: 跑红灯。** `pnpm exec vitest run server/credits/schema.test.ts`；预期因新表未导出/字段不存在而失败。
- [ ] **Step 3: 在 `drizzle/schema.ts` 定义六张专用表及唯一约束。** `hq_admin_accounts.username`、`hq_admin_sessions.tokenHash`、`credit_codes.codeHash`、`credit_transactions.creditCodeId` 必须唯一；批次保存门店、面额、数量、有效期、用途、凭证编号、状态与操作者；码保存状态、兑换用户/时间。`credit_transactions.type` 增加 `redeem`，`creditCodeId` 为可空唯一列。字段名要与后续服务测试一致。

```ts
export const creditCodes = mysqlTable("credit_codes", {
  id: int("id").autoincrement().primaryKey(),
  batchId: int("batchId").notNull(),
  codeHash: varchar("codeHash", { length: 64 }).notNull().unique(),
  status: mysqlEnum("status", ["unused", "redeemed", "revoked"]).default("unused").notNull(),
  redeemedBy: int("redeemedBy"),
  redeemedAt: timestamp("redeemedAt"),
});
```

- [ ] **Step 4: 只在本地开发库生成/验证迁移。** `pnpm db:push` 使用已核实为开发库的 `DATABASE_URL`；查看 SQL，确认不删除或重建 `users`/`credit_transactions` 既有数据；生产迁移留到 Task 8。
- [ ] **Step 5: 跑绿灯和类型检查。** `pnpm exec vitest run server/credits/schema.test.ts`、`pnpm check`；均应退出 0。定向提交结构、迁移与测试：`git add drizzle/schema.ts drizzle/*.sql server/credits/schema.test.ts`，提交 `feat(credits): add redemption data model`。

## Task 2：总部认证核心与开户命令

**Files:** 新建 `server/hq/auth-crypto.ts`、`server/hq/auth-store.ts`、`server/hq/auth-crypto.test.ts`、`server/hq/auth-store.test.ts`、`scripts/hq-admin.ts`；修改 `server/_core/env.ts`。

- [ ] **Step 1: 写密码/TOTP 测试。** 固定时间的 RFC 6238 向量验证 30 秒、6 位 TOTP；密码哈希每次盐不同、错误密码失败；AES-GCM 密文可解且改一位即失败。另测初始管理员命令禁止把密码作为 argv 传入，恢复 TOTP 会撤销原会话。

```ts
expect(verifyPassword("正确密码", await hashPassword("正确密码"))).resolves.toBe(true);
expect(verifyTotp(secret, code, fixedTime)).toBe(true);
expect(() => decryptSecret(tamperedCiphertext, key)).toThrow();
```

- [ ] **Step 2: 跑红灯。** `pnpm exec vitest run server/hq/auth-crypto.test.ts server/hq/auth-store.test.ts`；预期因函数缺失失败。
- [ ] **Step 3: 实现纯密码/TOTP/加密函数。** 使用 `randomBytes`、`scrypt`、`timingSafeEqual`、`createHmac`、`createCipheriv('aes-256-gcm')`；TOTP 只接受相邻一个 30 秒窗口，密钥只从服务器 root 可读文件加载，不打印/记录密码、种子或明文验证码。验证函数接口固定为：

```ts
hashPassword(password: string): Promise<string>;
verifyPassword(password: string, encoded: string): Promise<boolean>;
totp(secret: Buffer, epochMs: number): string;
verifyTotp(secret: Buffer, code: string, epochMs: number): boolean;
encryptSecret(secret: Buffer, key: Buffer): string;
decryptSecret(ciphertext: string, key: Buffer): Buffer;
sha256(value: string): string;
safeEqual(left: string, right: string): boolean;
```

- [ ] **Step 4: 实现数据库账号/会话存储与交互式开户命令。** `auth-store.ts` 暴露 `findActiveSession(tokenHash: string, now: Date)`、`revokeSessions(accountId: number)` 和 `createAccount(input: { username: string; passwordHash: string; totpSecretEncrypted: string; mustChangePassword: true }): Promise<number>`；查会话时同时校验 30 分钟闲置/8 小时绝对期限并延长最近活动时间。`scripts/hq-admin.ts` 必须检测 `/dev/tty` 可用，从交互终端读取操作者确认、随机生成初始密码和 TOTP 种子，只向 `/dev/tty` 展示一次，不向 stdout/stderr 写秘密；保存账号和加密种子。恢复命令需交互确认账号与原因、轮换种子、删除该账号会话，并写不含秘密的结构化审计日志。缺数据库、密钥文件或交互终端时 fail-closed；不把任何秘密写进 `.env.example`。
- [ ] **Step 5: 跑绿灯和提交。** `pnpm exec vitest run server/hq/auth-crypto.test.ts server/hq/auth-store.test.ts`、`pnpm check`；定向暂存，提交 `feat(hq): add protected admin identity and bootstrap`。

## Task 3：总部会话、权限与 CSRF

**Files:** 新建 `server/hq/auth-routes.ts`、`server/hq/auth-routes.test.ts`；修改 `server/_core/index.ts`。

- [ ] **Step 1: 写路由失败测试。** 用临时 Express 实例验证：错用户名/密码/TOTP 返回同样的 401；连续 5 次失败被限速；首次登录只能改密；无 Cookie、过期会话、停用账号及旧 H5 Cookie 均不能访问 `/api/hq/me`；登出后会话作废；无/错 CSRF 的已登录 POST 返回 403。

```ts
expect((await fetch(`${baseUrl}/api/hq/me`)).status).toBe(401);
expect((await postWithOldH5Cookie("/api/hq/batches", {})).status).toBe(401);
expect((await postWithoutCsrf("/api/hq/auth/logout", {})).status).toBe(403);
```

- [ ] **Step 2: 跑红灯。** `pnpm exec vitest run server/hq/auth-routes.test.ts`；预期新路由尚不存在。
- [ ] **Step 3: 实现独立路由和中间件。** `POST /login` 校验 `Origin`、密码/TOTP、IP＋账号限速，创建 8 小时绝对/30 分钟闲置会话；`GET /me` 查服务端会话；`POST /password/change` 首次改密；`POST /logout` 撤销会话。Cookie 使用 `__Host-hq_session`、`Secure; HttpOnly; SameSite=Strict; Path=/`；写操作验 `Origin` 与独立 `__Host-hq_csrf` Cookie/header，一律不要从 tRPC 或小程序 JWT 取得总部身份。为本地测试注入 `expectedOrigin`，生产固定为 `https://api.hxzhineng.xyz`；从 `cookie` 包导入 `parse as parseCookieHeader`。

```ts
export async function requireHqAdmin(req: Request, res: Response, next: NextFunction): Promise<void> {
  const token = parseCookieHeader(req.headers.cookie ?? "")["__Host-hq_session"];
  const session = token ? await findActiveSession(sha256(token), new Date()) : null;
  if (!session || session.account.disabled) {
    res.status(401).json({ code: "UNAUTHORIZED" });
    return;
  }
  res.locals.hqAdminId = session.account.id;
  next();
}
export function requireHqCsrf(req: Request, res: Response, next: NextFunction): void {
  const csrfCookie = parseCookieHeader(req.headers.cookie ?? "")["__Host-hq_csrf"];
  const csrfHeader = req.header("x-csrf-token");
  if (req.header("origin") !== expectedOrigin || !csrfCookie || !csrfHeader ||
      !safeEqual(csrfCookie, csrfHeader)) {
    res.status(403).json({ code: "CSRF_REJECTED" });
    return;
  }
  next();
}
```

- [ ] **Step 4: 在 `server/_core/index.ts` 于静态页面回退之前挂载 `/api/hq` 路由。** 不更改旧 tRPC 管理鉴权；部署脚本不得回显新增的密钥文件。
- [ ] **Step 5: 跑绿灯与提交。** `pnpm exec vitest run server/hq/auth-routes.test.ts`、`pnpm check`；提交 `feat(hq): add independent secure web sessions`。

## Task 4：人工加分原子化与总部配码服务

**Files:** 新建 `server/credits/recharge.ts`、`server/credits/codes.ts`、`server/credits/codes.test.ts`；修改 `server/db.ts`、`scripts/admin-credits.ts`。

- [ ] **Step 1: 写失败测试。** 参照现有 `server/db.credits.test.ts` 注入假事务，断言人工加分写流水失败会抛错、同一事务内使用 SQL 自增；真实并发无丢失留到 Task 8 的独立测试库验证。批次创建为 `pending`、此时码数 0；确认后产生 12 位去歧义码并一次性返回 CSV，数据库仅存哈希；同批数量 1 至 1000、积分面额正整数、到期晚于当前时间；停用不改已兑换码；库存汇总满足已分配＝已兑换＋未兑换＋已过期＋已停用。

```ts
expect(await createBatch({ storeId: 1, amount: 20, quantity: 10, expiresAt, purpose: "purchase", receiptRef: "OFFLINE-1" }, adminId)).toMatchObject({ status: "pending" });
expect(await countCodes(batchId)).toBe(0);
expect(await activateBatch(batchId, adminId)).toMatchObject({ codeCount: 10 });
expect(await listStoredRawCodes(batchId)).toEqual([]);
```

- [ ] **Step 2: 跑红灯。** `pnpm exec vitest run server/credits/codes.test.ts`。
- [ ] **Step 3: 实现 `rechargeCreditsInDatabase`。** 对 `users.credits` 用 SQL 自增、读取新余额、写一条 `type='recharge'`/`feature='admin_recharge'` 流水，整个过程置于 `db.transaction`；`server/db.ts` 对外 `rechargeCredits` 委托它。`scripts/admin-credits.ts` 保持现有 CLI 语义，但新增操作者与原因的本地审计记录；生产命令必须先确认目标账号。

```ts
return db.transaction(async tx => {
  const changed = await tx.update(users).set({ credits: sql`${users.credits} + ${amount}` }).where(eq(users.id, userId));
  if (changed[0].affectedRows !== 1) throw new Error("用户不存在");
  const [user] = await tx.select({ credits: users.credits }).from(users).where(eq(users.id, userId));
  await tx.insert(creditTransactions).values({ userId, amount, type: "recharge", feature: "admin_recharge", description, balanceAfter: user.credits });
  return user.credits;
});
```

- [ ] **Step 4: 实现批次服务。** 随机码使用 32 个去歧义字符、12 位分组展示；存 `SHA-256(normalize(code))`。`activateBatch` 事务内从 `pending` 条件更新为 `active`、生成唯一哈希、写审计，响应一次性 CSV；不持久化明文。下载中断后只能停用未兑换码并重建批次。所有操作记录总部账号 ID，不记录原码、CSV 或结算账户内容。
- [ ] **Step 5: 跑绿灯与提交。** `pnpm exec vitest run server/credits/codes.test.ts server/admin-credits-cli.test.ts`、`pnpm check`；提交 `feat(credits): make admin grants atomic and issue batches`。

## Task 5：顾客兑换事务与接口

**Files:** 新建 `server/credits/redeem.ts`、`server/credits/redeem.test.ts`、`server/credits/redeem.integration.test.ts`、`server/mp/credit-routes.ts`、`server/mp/credit-routes.test.ts`；修改 `server/mp/routes.ts`。

- [ ] **Step 1: 写失败测试和独立数据库并发测试。** 单元测试用假事务验证同一用户重复提交不重复、无效/待确认/过期/停用均不变余额、插入流水失败会抛错；HTTP 测试验证仅已登录小程序用户可用、猜码限速且日志无原码。`redeem.integration.test.ts` 用 `it.skipIf(!process.env.TEST_DATABASE_URL)`，接入独立 MySQL 测试库后让同码两用户同时兑换，恰好一人得分、另一人得到 `CODE_USED`，并检查流水恰好一条；此测试在 Task 8 必须带测试库环境变量实跑，不能以跳过视为通过。

```ts
const outcomes = await Promise.allSettled([redeemCode(db, userA, code), redeemCode(db, userB, code)]);
expect(outcomes.filter(x => x.status === "fulfilled")).toHaveLength(1);
expect(await creditTransactionCountForCode(codeId)).toBe(1);
```

- [ ] **Step 2: 跑红灯。** `pnpm exec vitest run server/credits/redeem.test.ts server/mp/credit-routes.test.ts`；独立库准备好后另跑 `pnpm exec vitest run server/credits/redeem.integration.test.ts`。
- [ ] **Step 3: 实现 `redeemCode` 事务。** 归一化码并哈希查找；校验批次 `active` 与有效期；以 `status='unused'` 条件更新码为已用并绑定用户；原子增加积分、读取余额、写 `type='redeem'`、唯一 `creditCodeId` 流水；任何错误回滚。

```ts
const claimed = await tx.update(creditCodes)
  .set({ status: "redeemed", redeemedBy: userId, redeemedAt: new Date() })
  .where(and(eq(creditCodes.id, codeId), eq(creditCodes.status, "unused")));
if (claimed[0].affectedRows !== 1) throw new RedeemError("CODE_USED");
```

- [ ] **Step 4: 装配 `POST /api/mp/credits/redeem`。** 复用 `createMpAuthMiddleware`，请求 `{code}`；成功返回 `{awardedCredits,balance,transactionId}`；失败映射 `INVALID_CODE/CODE_USED/CODE_EXPIRED/CODE_INACTIVE/RATE_LIMITED`，仅返回安全中文提示。请求按用户 ID/来源限速，不使用生成类自动重试；现有 `/credits/history` 自动返回新流水类型。
- [ ] **Step 5: 跑绿灯与提交。** `pnpm exec vitest run server/credits/redeem.test.ts server/mp/credit-routes.test.ts server/mp/routes.test.ts`、`pnpm check`；提交 `feat(credits): redeem one-time codes atomically`。

## Task 6：总部批次 API 与 Web 页面

**Files:** 新建 `server/hq/batch-routes.ts`、`server/hq/batch-routes.test.ts`、`client/src/pages/Hq.tsx`、`client/src/components/hq/BatchForm.tsx`、`client/src/components/hq/Inventory.tsx`；修改 `server/_core/index.ts`、`client/src/App.tsx`、`client/src/pages/Admin.tsx`、`client/src/pages/Home.tsx`。

- [ ] **Step 1: 写后端失败测试。** 未登录/未改初始密码/缺 CSRF 不能创建、激活、导出或停用；正常创建待确认，激活仅一次、CSV 仅当前响应可下载，随后库存可查但明文码不可查；旧 `/admin` 登录态不能调用 `/api/hq/batches`。

```ts
expect((await postAsHq("/api/hq/batches", validBatch)).status).toBe(201);
expect((await postAsHq(`/api/hq/batches/${batchId}/activate`, {})).headers.get("content-type")).toContain("text/csv");
expect(await (await getAsHq(`/api/hq/batches/${batchId}`)).text()).not.toContain(rawCode);
```

- [ ] **Step 2: 跑红灯。** `pnpm exec vitest run server/hq/batch-routes.test.ts`。
- [ ] **Step 3: 实现 `/api/hq` 的门店、批次、库存与事件路由。** `POST /stores`、`GET /stores`、`POST /batches`、`POST /batches/:id/activate`、`POST /batches/:id/revoke`、`GET /batches`、`GET /events`；全部经 `requireHqAdmin`，写请求加 `requireHqCsrf`。CSV 响应 `Cache-Control: no-store`、`Content-Disposition: attachment`，不可被日志中间件读取正文。
- [ ] **Step 4: 实现 `/hq` React 页面。** 登录页处理密码＋6 位动态码，首次登录仅显示改密；主页面提供门店、批次状态、库存、事件和激活前二次确认。激活成功直接以 Blob 下载 CSV，不把码存 `localStorage` 或页面长期状态；旧 `/admin` 页面显示迁移指引，不让旧登录态直接进入新后台。各 API 调用带 `credentials:'include'` 与 CSRF header。

```ts
const csrfToken = document.cookie.split("; ").find(x => x.startsWith("__Host-hq_csrf="))?.split("=")[1] ?? "";
const response = await fetch(`/api/hq/batches/${id}/activate`, {
  method: "POST", credentials: "include", headers: { "x-csrf-token": csrfToken },
});
if (!response.ok) throw new Error("生成失败，请查看批次状态");
const url = URL.createObjectURL(await response.blob());
const link = document.createElement("a");
link.href = url;
link.download = `lejoy-codes-${id}.csv`;
link.click();
link.remove();
URL.revokeObjectURL(url);
```

- [ ] **Step 5: 跑绿灯/前端构建并提交。** `pnpm exec vitest run server/hq/batch-routes.test.ts`、`pnpm check`、`pnpm build`；提交 `feat(hq): manage store code inventory in web portal`。

## Task 7：小程序积分中心与适老化

**Files:** 新建 `miniprogram/src/pages/credits/index.tsx`、`index.scss`、`index.config.ts`；修改 `miniprogram/src/app.config.ts`、`miniprogram/src/services/api.ts`、`miniprogram/src/pages/profile/index.tsx`、`miniprogram/src/pages/home/index.tsx`、`miniprogram/src/services/request-policy.ts`；新增 `miniprogram/src/pages/credits/credits.test.ts`。

- [ ] **Step 1: 写失败的逻辑/文案测试。** `CreditTransaction.type` 接受 `redeem`；兑换成功后重取 `/user/me` 和 `/credits/history`；提交期间按钮防双击；无效/已用/过期/停用的中文错误文案对应稳定错误码；首页和积分不足提示不再含运营占位文字；页面不出现在线购买或支付按钮。

```ts
expect(redeemErrorMessage("CODE_USED")).toBe("这张兑换码已使用，请向店长领取新码");
expect(readFileSync("miniprogram/src/pages/home/index.tsx", "utf8")).not.toContain("运营配置");
```

- [ ] **Step 2: 跑红灯。** `pnpm exec vitest run miniprogram/src/pages/credits/credits.test.ts`。
- [ ] **Step 3: 在 `services/api.ts` 增加 `redeemCredits(code)`，固定 `POST`、`retry:'never'`，并把流水类型扩为 `redeem`。** 页面成功时重新取余额和历史，不以旧余额本地累加；请求失败保留输入，让用户主动重试。

```ts
redeemCredits: (code: string) => request<{ awardedCredits: number; balance: number; transactionId: number }>(
  "/api/mp/credits/redeem", { method: "POST", data: { code }, retry: "never" },
),
```

- [ ] **Step 4: 实现大字积分中心与入口。** 从首页余额、个人页、积分不足提示进入 `pages/credits/index`；展示余额、可粘贴兑换码、全宽主按钮、流水和“到店向店长免费领取”说明；输入自动去分隔符并显示 `XXXX-XXXX-XXXX`；沿用 `miniprogram/src/styles/tokens.scss`，按钮与错误态满足现有适老化尺寸/对比度。
- [ ] **Step 5: 跑绿灯/生产构建并提交。** `pnpm exec vitest run miniprogram/src/pages/credits/credits.test.ts`、`pnpm check:mp`、`pnpm --dir miniprogram build:weapp:prod`；校验必须命中生产 API 域名且无本地地址；提交 `feat(mp): add accessible credit redemption center`。

## Task 8：全链路验收与上线门槛

**Files:** 新建 `docs/积分兑换码-总部操作与发版清单.md`；测试/发布过程中发现的问题只改本功能相关文件。

- [ ] **Step 1: 运行完整静态和自动化验证。** `pnpm test`、`pnpm check`、`pnpm check:mp`、`pnpm build`、`pnpm --dir miniprogram build:weapp:prod`；记录每项退出码和测试数。现有真实联网测试在无密钥时应按仓库约定跳过，不能把跳过说成真实供应商验收。
- [ ] **Step 2: 在独立测试数据库验证关键事务。** 设置仅指向临时开发库的 `TEST_DATABASE_URL`，运行 `pnpm exec vitest run server/credits/redeem.integration.test.ts`，确认两个用户并发使用同一码成功数 1、正向流水数 1、码已用数 1；故意模拟写流水异常，余额和码状态均回滚；并发人工加分无丢失；新建 `pending` 批次不能兑换；重启服务后总部会话仍受过期和撤销控制。若测试库不可用，明确标记集成验收未完成，不进入生产部署。
- [ ] **Step 3: 写给总部的可打勾操作清单。** 包含首次开户/TOTP 绑定、门店建立、线下结算确认、批次激活一次性 CSV 保存、安全交付、已用/剩余核对、丢失 CSV 停用重发、设备遗失恢复和顾客兑奖说明。不得出现真实密码、密钥、码或私人账号。
- [ ] **Step 4: 单独取得生产迁移和首次开户授权后再发布。** 发布前备份生产数据库，核对迁移只新增本功能表/列，按 `scripts/deploy/02-deploy.sh` 既有流程部署；生产初始密码/TOTP 只在服务器受控终端交接，不在对话中显示。未获授权时停在测试/构建完成状态，不生成生产码、不补任何用户余额。
- [ ] **Step 5: 生产验收分别记录。** `curl -fsS https://api.hxzhineng.xyz/api/mp/health`、PM2 fork 单实例、总部真实双因素登录/登出、门店批次库存、微信真机扫码领取与兑换成功后的余额/流水；验证过期/重复码无赠分。仅静态 `/hq` HTTP 200 不算后台可用。最终定向提交文档和必要修复，汇报提交号、测试、部署与真机结果各自的状态。

## 不在本计划内

微信在线付费充值、店长账号/采购流程、自动给管理员补分、旧 H5 模型配置迁移、无需管理员确认的大批量赠送。任何需要扩大这些范围的需求另立设计与计划。
