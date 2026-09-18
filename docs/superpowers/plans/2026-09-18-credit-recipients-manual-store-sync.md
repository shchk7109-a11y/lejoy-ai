# 非门店发码与按需同步门店 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. The user already requested direct continuation on `codex/m4-release-ready`; execute inline in this checkout and preserve unrelated dirty files.

**Goal:** Remove manual store creation, synchronize the Lingzhi content-system store directory only on HQ button click, and let approved non-store recipients redeem one-time credit codes.

**Architecture:** A server-only catalog adapter fetches and validates the existing protected `/api/products` response. A transactional sync service maintains a local store mirror and audit runs; batch validation branches between active synced stores and named non-store recipients, while generation/redemption remain unchanged. The HQ page calls a protected manual sync route and renders the two recipient paths.

**Tech Stack:** TypeScript, Express, Drizzle/MySQL, React, Vitest, pnpm, PM2 deployment scripts.

---

## File map

- `server/credits/store-source.ts` and `.test.ts`: fixed-origin internal API adapter, catalog projection and validation.
- `server/credits/store-sync.ts` and `.test.ts`: transactional upsert/disable and sync-run audit.
- `drizzle/schema.ts`, generated SQL and metadata: source identity, sync runs, non-store batch target fields.
- `server/credits/codes.ts` and `.test.ts`: category-aware batch validation and persistence.
- `server/hq/batch-routes.ts` and `.test.ts`: protected sync route, retired create route, non-store parsing.
- `client/src/pages/Hq.tsx` and `server/hq/hq-page.test.ts`: sync button, source status and recipient-aware form/table.
- `server/credits/redeem.integration.test.ts`: isolated-MySQL non-store redemption and unchanged concurrency behavior.
- `docs/提审准备清单.md`: HQ operator instructions for source key, manual sync and non-store delivery, if an existing appropriate section is present; otherwise add a short HQ operations doc under `docs/`.

## Task 1: Catalog adapter (RED → GREEN → refactor → commit)

- [ ] Add `server/credits/store-source.test.ts` with a fake `fetch` response containing two formats and three stores. Assert projection to `{formatId,formatName,storeId,storeName}`; reject missing key, HTTP 401, redirects, empty directory, duplicate composite keys and malformed names. Assert the secret is only in `X-Internal-API-Key` and no product data in returned rows.
- [ ] Run `pnpm exec vitest run server/credits/store-source.test.ts`; expect failure because `fetchStoreCatalog` does not exist.
- [ ] Add `fetchStoreCatalog(options: { apiKey: string; fetchImpl?: typeof fetch; timeoutMs?: number }): Promise<StoreCatalogRow[]>` using fixed URL `https://ai.lingzhi-ip.com/api/products`, `redirect: "manual"`, `cache: "no-store"`, an abort timeout, a bounded response body and strict projection. Return a nonempty array only after all rows validate.
- [ ] Rerun the focused test and `pnpm check`; both must pass. Commit only the adapter and its test.

## Task 2: Database shape and transactional sync (RED → GREEN → commit)

- [ ] Add schema assertions for nullable, uniquely paired `stores.sourceFormatId/sourceStoreId`, `sourceFormatName`, `lastSyncedAt`, `store_sync_runs`, nullable `credit_code_batches.storeId`, `targetKind` defaulting to `store`, and nullable `recipientLabel`. Verify existing data remains representable.
- [ ] Run `pnpm exec vitest run server/credits/schema.test.ts`; expect failure for missing columns/table.
- [ ] Update `drizzle/schema.ts`, generate a forward-only migration with a dummy `DATABASE_URL` for `drizzle-kit generate`, and inspect SQL for no data deletion. Use a unique index on the source ID pair. Do not alter the six existing credit/HQ tables beyond required additive fields and `storeId` nullability.
- [ ] Add `server/credits/store-sync.test.ts` with an injectable DB fake: first sync inserts, repeated sync changes zero rows, rename updates, removed source keys and unsourced legacy rows disable, returning keys reactivate, invalid catalog causes no writes, and a failed transaction has no partial change. Watch the focused test fail for missing `syncStoreCatalog`.
- [ ] Implement `syncStoreCatalog(db, rows, adminId)` as one DB transaction. Match stores by source ID pair, derive stable `code` from SHA-256 of both IDs, update names and enabled status, disable missing/legacy rows, write a non-sensitive sync-run summary. Expose `getLastStoreSync` for the HQ list route. Rerun focused tests and `pnpm check`, then commit schema, migration and service/tests.

## Task 3: Protected manual sync HTTP boundary (RED → GREEN → commit)

- [ ] Extend `server/hq/batch-routes.test.ts`: unauthorized or first-password sessions cannot sync, CSRF is required, `POST /stores` returns 405, `GET /stores` never calls the source, `POST /stores/sync` calls the injected sync service exactly once, concurrent click returns 409, and source failure leaves prior list intact.
- [ ] Run `pnpm exec vitest run server/hq/batch-routes.test.ts`; expect the new cases to fail.
- [ ] Replace store-create route with 405; add `POST /stores/sync` guarded by existing HQ auth/CSRF/ready middleware. Resolve the source key only on the server, invoke adapter and transactional sync, avoid parallel activation using one process-local in-flight guard, return change counts/time or stable sanitized error codes. Keep `GET /stores` local-only with last-sync metadata.
- [ ] Rerun focused tests and `pnpm check`; commit route and tests.

## Task 4: Named non-store batches (RED → GREEN → commit)

- [ ] Add `codes.test.ts` cases for `targetKind` of `hq_staff`, `company_test`, `trial`: require recipient label, approver, reason and approval reference; require `quantity=1`, `purpose=promotion`, `storeId=null`. Reject fake store purchase; keep old `{storeId,...}` purchase request valid. Verify created event includes recipient category/label without raw code.
- [ ] Run `pnpm exec vitest run server/credits/codes.test.ts`; expect validation failures.
- [ ] Extend `BatchInput` and `validateBatchInput` with a discriminated store/non-store branch. In `createBatch`, only query `stores` for store targets and require enabled *synced* store for new requests; for non-store set nullable `storeId`, persist category/label, and write approval event. Do not touch `activateBatch`, `redeemCodeInDatabase`, inventory math or raw-code retention behavior.
- [ ] Extend route tests for new payloads and bad combinations, update `parsedBatch`, rerun both focused suites plus `pnpm check`, then commit.

## Task 5: HQ user interface (RED → GREEN → commit)

- [ ] Extend `server/hq/hq-page.test.ts` with contract assertions that the page contains “同步门店信息”, last sync status, recipient kind options and named-recipient field; contains no “建立门店” or active `/api/hq/stores` POST; identifies non-store batches and uses recipient-aware delivery text.
- [ ] Run the focused suite and confirm it fails on the current page.
- [ ] Update `client/src/pages/Hq.tsx`: load local catalog/status, show manual sync with busy/error/success counts, group stores by format, switch form between store and non-store, force promotion and quantity 1 for non-store, display recipient in list and confirmation CSV/hand-off text. Preserve existing mobile-readable sizes and one-time CSV semantics.
- [ ] Rerun focused tests, `pnpm check` and `pnpm build`; commit UI and tests.

## Task 6: Isolated integration and release readiness

- [ ] Add isolated MySQL test coverage: migrated schema accepts non-store batch with null store ID; one issued code redeems once and ledger balances; old store batches still work; sync idempotency and transaction rollback under a real DB. Never point `TEST_DATABASE_URL` to production.
- [ ] Run `pnpm test`, `pnpm check`, `pnpm build`, and `pnpm --dir miniprogram build:weapp:prod`; inspect full exit status, including the production-URL guard. Run `TEST_DATABASE_URL` suite with `scripts/deploy/04-credit-release-check.sh --test` on the independent server test DB.
- [ ] Before any production migration, back up the production DB using existing controlled deploy scripts, inspect migration SQL and provision the content-system key to the Lejoy server `.env` without echoing it. If the source key is absent or invalid, deploy the safe code but report sync as unavailable; never invent a store.
- [ ] Push `codex/m4-release-ready`, deploy with `scripts/deploy/02-deploy.sh`, confirm HTTPS health 200, HQ 401 without session, one PM2 fork instance, and preserved `CONTENT_SECURITY=wechat` and `ARK_IMAGE_EDIT_MAX_EDGE=1536`. Do not auto-click sync or issue real codes; let an authorized HQ operator perform first sync and compare names/counts with the source.
