# D1 Production Deployment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deploy the `codex/m4-release-ready` backend to the new ECS host with MySQL, PM2 fork mode, Nginx, automatic HTTPS renewal, an administrator credits CLI, and a production-addressed WeChat trial build.

**Architecture:** Nginx terminates HTTPS and proxies to one PM2 fork process on `127.0.0.1:3000`; the process connects only to local MySQL and external AI/OSS providers from a server-side `.env`. Three idempotent root scripts own initialization, release updates, and TLS configuration. Secrets never enter Git and the generated database password is stored only in `/root/DEPLOY_SECRETS.txt` with mode `600`.

**Tech Stack:** Ubuntu 22.04, Bash, Node.js 22, pnpm, PM2, Nginx, MySQL 8, acme.sh/Let's Encrypt, TypeScript, Vitest, Taro.

---

### Task 1: Administrator credits CLI contract

**Files:**

- Create: `scripts/admin-credits.test.ts`
- Create: `scripts/admin-credits.ts`

- [ ] Write failing tests for `list`, `recharge <userId> <amount> [note]`, and `set-admin <userId>` argument validation; verify `recharge` rejects non-positive/non-integer values and OpenID output contains only the first six characters plus a mask.
- [ ] Run `pnpm vitest run scripts/admin-credits.test.ts` and confirm failure because the CLI module does not exist.
- [ ] Implement `parseAdminCreditsArgs`, `maskOpenId`, injectable `runAdminCredits`, and the executable entrypoint. Production dependencies must call existing `getAllUsers`, `rechargeCredits`, and Drizzle `users` role update logic.
- [ ] Re-run the targeted test and confirm all cases pass.

### Task 2: Idempotent deployment automation

**Files:**

- Create: `server/deploy-d1.test.ts`
- Create: `scripts/deploy/01-init.sh`
- Create: `scripts/deploy/02-deploy.sh`
- Create: `scripts/deploy/03-nginx-ssl.sh`
- Create: `scripts/deploy/ecosystem.config.cjs`

- [ ] Write a static contract test that requires all three scripts to use strict Bash mode, checks database-secret path and mode, verifies production `.env` rewriting/removal of `MP_MOCK_LOGIN`, requires PM2 `fork` with one instance, and checks Nginx upload/timeout values plus acme.sh issuance/install commands.
- [ ] Run `pnpm vitest run server/deploy-d1.test.ts` and confirm it fails because the deployment files are absent.
- [ ] Implement `01-init.sh`: install/update required packages and Node 22, configure timezone/MySQL loopback, create the database/user with a stable generated password, configure 2 GiB swap, and enable services.
- [ ] Implement `02-deploy.sh`: clone/update the exact branch, support `--prepare` for the first secure `.env` transfer, rewrite only deployment-owned environment keys, validate required keys, install/build/migrate, and start/reload the one-process fork-mode PM2 application.
- [ ] Implement `03-nginx-ssl.sh`: install the HTTP challenge vhost, issue/install a Let's Encrypt certificate through acme.sh webroot mode, install the HTTPS proxy vhost, preserve the renewal reload hook, and verify health/auth behavior.
- [ ] Run `bash -n scripts/deploy/*.sh`, the static contract test, `pnpm test`, and `pnpm check`.

### Task 3: Initial documentation and deployable commit

**Files:**

- Create: `docs/部署记录-D1.md`
- Create: `SUMMARY-D1.md`

- [ ] Document the Nginx → PM2 → MySQL/external-provider architecture, repository/service/certificate/log paths, idempotent deployment commands, CLI usage, secret location, and the five WeChat-console actions from D1 section 5 without any secret values.
- [ ] Record local test commands and leave result fields explicitly marked as pending execution rather than claiming success.
- [ ] Scan all intended files against actual `.env` secret values, commit, and push `codex/m4-release-ready` so the server can clone the automation.

### Task 4: Server initialization and application release

**Files:**

- Execute committed scripts over SSH only.

- [ ] Copy `01-init.sh` to `/root`, run it over SSH, and verify Ubuntu timezone, 2 GiB swap, Node 22, pnpm, PM2, Nginx, loopback MySQL, database/user creation, secret-file mode, and service enablement without printing secret contents.
- [ ] Copy `02-deploy.sh` to `/root`, run `--prepare`, then use `scp` to place local `.env` at `/opt/lejoy-ai/.env` and verify mode `600` without reading it.
- [ ] Run `/opt/lejoy-ai/scripts/deploy/02-deploy.sh`; verify branch revision, local health, migrations, and one PM2 process in `fork_mode`.
- [ ] Copy/run `03-nginx-ssl.sh`; verify the public health endpoint is HTTP 200, unauthenticated modules is HTTP 401, certificate hostname/dates are valid, and acme.sh has an automatic cron renewal entry.

### Task 5: WeChat build and end-to-end acceptance

**Files:**

- Generate: `miniprogram/dist/` (ignored build artifact)
- Modify: `docs/部署记录-D1.md`
- Modify: `SUMMARY-D1.md`

- [ ] Run `TARO_APP_API_BASE_URL=https://api.hxzhineng.xyz pnpm build:weapp` and prove the generated bundle contains the production API origin and not `127.0.0.1:3000`.
- [ ] Run the server CLI `list`; rely on targeted unit coverage for recharge validation without seeding a fake production user.
- [ ] Query MySQL table names/count through the local root socket, inspect PM2 startup state/process mode, and run final HTTPS checks.
- [ ] Replace pending documentation fields with timestamps, commit hashes, server paths, certificate/renewal facts, health/auth results, table names/count, PM2 state, CLI output summary, and the remaining user-only WeChat tasks.
- [ ] Run the full local verification suite and secret scan, commit/push the evidence update, and confirm local/origin/server revisions match.
