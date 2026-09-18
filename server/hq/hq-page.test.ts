import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("HQ web portal isolation", () => {
  it("uses dedicated HQ API and never persists raw codes in browser storage", () => {
    const source = readFileSync(new URL("../../client/src/pages/Hq.tsx", import.meta.url), "utf8");
    expect(source).toContain("/api/hq/auth/login");
    expect(source).toContain("/api/hq/batches");
    expect(source).toContain("credentials: \"include\"");
    expect(source).not.toContain("localStorage");
    expect(source).not.toContain("trpc.admin");
  });
  it("仅提供手动同步门店，允许具名非门店赠码", () => {
    const source = readFileSync(new URL("../../client/src/pages/Hq.tsx", import.meta.url), "utf8");
    expect(source).toContain("同步门店信息");
    expect(source).toContain("/api/hq/stores/sync");
    expect(source).not.toContain("建立门店");
    expect(source).not.toContain("/api/hq/stores\", { method: \"POST\"");
    expect(source).toContain("recipientLabel");
    expect(source).toContain("lastSync.createdAt");
    expect(source).toContain("groupedStores");
    expect(source).toContain("company_test");
    expect(source).toContain("trial");
  });
  it("在批次表单旁显示校验与服务端错误", () => {
    const source = readFileSync(new URL("../../client/src/pages/Hq.tsx", import.meta.url), "utf8");
    expect(source).toContain("validateHqCreditForm(batchForm)");
    expect(source).toContain("赠码原因至少填写 4 字");
    expect(source).toContain('batchError && <p role="alert"');
    expect(source).toContain("setBatchError(error instanceof Error");
  });
});
