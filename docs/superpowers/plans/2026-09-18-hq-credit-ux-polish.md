# 总部积分后台体验修整 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. The user has confirmed the spec and repeatedly requested direct continuation on `codex/m4-release-ready`; execute inline in this checkout, preserving unrelated dirty files.

**Goal:** Put batch errors beside the form, show only the current manual sync's changed store names, compact the HQ layout, and explain the one-time CSV download.

**Architecture:** The transactional sync service returns an ephemeral, non-sensitive `changedStores` array in its POST result; no schema or persistent browser state changes. A small pure form validator handles actionable client-side errors, while the HQ page displays both local and API failures next to the submit button.

**Tech Stack:** TypeScript, React, Express, Drizzle/MySQL, Vitest, Vite, pnpm.

---

## File map

- `server/credits/store-sync.ts` and `.test.ts`: derive changed store names and kinds from the existing transaction plan; no database change.
- `server/hq/batch-routes.ts` and `.test.ts`: type and pass the sync response through the protected endpoint.
- `client/src/pages/hq-credit-form.ts` and `server/hq/hq-credit-form.test.ts`: pure HQ batch-form validation with focused tests.
- `client/src/pages/Hq.tsx` and `server/hq/hq-page.test.ts`: inline errors/success, ephemeral changes list, compact classes, CSV help.

## Task 1: Current-sync change list

- [ ] Add a failing `store-sync.test.ts` case with an existing renamed store, an inactive returning store, a removed store and an incoming new store. Assert the returned `changedStores` contains `{ name, change, previousName? }` for each and that a repeated sync returns `[]`. Run `pnpm exec vitest run server/credits/store-sync.test.ts` and observe the expected failure.
  ```ts
  expect(result.changedStores).toEqual([
    { name: "新店", change: "added" },
    { name: "南京新名", change: "renamed", previousName: "南京旧名" },
    { name: "回归店", change: "reactivated" },
    { name: "已移除门店", change: "disabled" },
  ]);
  ```
- [ ] In `syncStoreCatalog`, derive `changedStores` inside the existing transaction from `plan.add`, `plan.update` and `plan.disableIds`. Use `added`, `renamed`, `disabled`, `reactivated`, and `updated` (for an unchanged store name with a changed format name); include `previousName` only for rename. Return names only, never source response/product data. Keep audit row as counts only. Rerun the focused test and `pnpm check`.
  ```ts
  type ChangedStore = { name: string; change: "added" | "renamed" | "disabled" | "reactivated" | "updated"; previousName?: string };
  const changedStores: ChangedStore[] = [
    ...plan.add.map(row => ({ name: row.storeName, change: "added" as const })),
    ...plan.update.map(({ id, row }) => {
      const before = existing.find(store => store.id === id)!;
      return before.enabled === 0 ? { name: row.storeName, change: "reactivated" as const }
        : before.name !== row.storeName ? { name: row.storeName, change: "renamed" as const, previousName: before.name }
        : { name: row.storeName, change: "updated" as const };
    }),
    ...plan.disableIds.map(id => ({ name: existing.find(store => store.id === id)!.name, change: "disabled" as const })),
  ];
  ```
- [ ] Extend `batch-routes.test.ts` so `POST /stores/sync` returns the injected `changedStores`, whereas `GET /stores` does not request or expose historical changed names. Update the `Options.storeSync.sync` result type accordingly; rerun route tests. Commit only these service and route files/tests.

## Task 2: Local batch validation and nearby feedback

- [ ] Add `server/hq/hq-credit-form.test.ts` for a pure `validateHqCreditForm` function. Input: the form's string fields and target kind. Expected: reason `调试` returns `{ field: 'approvalReason', message: '赠码原因至少填写 4 字' }`, reason `总部功能调试` passes, missing recipient/store or invalid amount/date returns corresponding field error. Run the focused test and confirm missing module failure.
  ```ts
  expect(validateHqCreditForm({ ...validForm, approvalReason: "调试" }, new Date("2026-09-18")))
    .toEqual({ field: "approvalReason", message: "赠码原因至少填写 4 字" });
  ```
- [ ] Create `client/src/pages/hq-credit-form.ts` exporting `HqCreditForm`, `HqFormError` and `validateHqCreditForm`. Validate required target, numeric bounds, future date, receipt/approver and promotion reason without changing server rules. Keep input values out of error messages. Rerun focused test and `pnpm check`.
  ```ts
  export type HqCreditForm = { targetKind: "store" | "hq_staff" | "company_test" | "trial"; storeId: string; recipientLabel: string; amount: string; quantity: string; expiresAt: string; purpose: "purchase" | "promotion"; receiptRef: string; approver: string; approvalReason: string };
  export type HqFormError = { field: keyof HqCreditForm; message: string };
  export function validateHqCreditForm(form: HqCreditForm, now = new Date()): HqFormError | null {
    if (form.targetKind === "store" && !form.storeId) return { field: "storeId", message: "请先选择门店" };
    if (form.targetKind !== "store" && !form.recipientLabel.trim()) return { field: "recipientLabel", message: "请填写接收人" };
    if (!Number.isSafeInteger(Number(form.amount)) || Number(form.amount) < 1 || Number(form.amount) > 1_000_000) return { field: "amount", message: "每码积分须在 1 到 1000000 之间" };
    if (form.targetKind === "store" && (!Number.isSafeInteger(Number(form.quantity)) || Number(form.quantity) < 1 || Number(form.quantity) > 1000)) return { field: "quantity", message: "数量须在 1 到 1000 之间" };
    const expires = new Date(`${form.expiresAt}T23:59:59`);
    if (!form.expiresAt || !Number.isFinite(expires.getTime()) || expires <= now) return { field: "expiresAt", message: "请选择将来的有效期" };
    if (!form.receiptRef.trim()) return { field: "receiptRef", message: "请填写审批编号或线下凭证" };
    const promotion = form.targetKind !== "store" || form.purpose === "promotion";
    if (promotion && form.approver.trim().length < 2) return { field: "approver", message: "请填写至少 2 字的审批人" };
    if (promotion && form.approvalReason.trim().length < 4) return { field: "approvalReason", message: "赠码原因至少填写 4 字" };
    return null;
  }
  ```
- [ ] Extend `hq-page.test.ts` with contract assertions for an error region near the create button, explicit 4-character reason hint, and no unique reliance on the top-page notice. Watch it fail. In `Hq.tsx`, keep `batchError` and `batchSuccess` local to the form; validate before request, focus the invalid field by DOM id, show API/network failure in `role="alert"` near the button, preserve form contents, show success nearby and clear errors. On close/relogin clear ephemeral messages. Rerun page/form tests and `pnpm check`. Commit form/UI error changes and tests.
  ```tsx
  const error = validateHqCreditForm(batchForm);
  if (error) { setBatchError(error.message); document.getElementById(`hq-${error.field}`)?.focus(); return; }
  // Within the form, directly above the submit button:
  {batchError && <p role="alert" className="text-red-800">{batchError}</p>}
  ```

## Task 3: Ephemeral sync panel, density and CSV help

- [ ] Extend `hq-page.test.ts` to assert `changedStores` lives only in React state, is cleared on logout/login/page load, old `groupedStores` persistent catalog is absent from the left panel, and CSV guidance names Numbers/Excel and the first column. Watch it fail.
- [ ] In `Hq.tsx`, set `changedStores` only from successful `POST /stores/sync`, clear before a new attempt/on logout/login, and render no store list on initial load or empty changes. The existing `stores` state remains for the enabled-store select. Place sync errors beside the sync button. Reduce HQ `text-lg` to `text-base`, main title `text-3xl` to `text-2xl`, and card/button/input padding by one step, keeping body and form at least 16px. Add the CSV help beside the activation table without altering the one-time download code. Rerun page tests, `pnpm check`, `pnpm build`; commit UI and tests.
  ```tsx
  const [changedStores, setChangedStores] = useState<ChangedStore[]>([]);
  // No call to setChangedStores from GET /stores or refresh().
  setChangedStores(result.changedStores); // only after POST succeeds
  {changedStores.length > 0 && changedStores.map(item => <li key={`${item.change}-${item.name}`}>{item.name} · {changeLabels[item.change]}</li>)}
  ```

## Task 4: Verification and release

- [ ] Run `pnpm test`, `pnpm check`, `pnpm build` after all commits; inspect final exit codes. No miniprogram source changes are expected; do not rebuild or re-upload it unless affected.
- [ ] Check scoped diff and status, preserving unrelated `miniprogram/project.config.json` and untracked user files. Push `codex/m4-release-ready`.
- [ ] Back up production DB with existing `scripts/deploy/04-credit-release-check.sh --backup` if the deployment script will run `db:push`; then deploy via `scripts/deploy/02-deploy.sh`. Use existing safe bundle fallback only if GitHub fetch stalls. Confirm revision parity, HTTPS `/api/mp/health` 200, HQ unauthenticated 401, PM2 one fork instance, and preserved `CONTENT_SECURITY=wechat`/`ARK_IMAGE_EDIT_MAX_EDGE=1536`. Do not create or activate real code batches. Report that the changed-store panel's real browser interaction still needs HQ operator confirmation.
