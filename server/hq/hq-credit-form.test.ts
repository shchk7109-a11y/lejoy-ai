import { describe, expect, it } from "vitest";
import { validateHqCreditForm, type HqCreditForm } from "../../client/src/pages/hq-credit-form";

const valid: HqCreditForm = { targetKind: "company_test", storeId: "", recipientLabel: "公司测试员", amount: "100", quantity: "1", expiresAt: "2026-12-31", purpose: "promotion", receiptRef: "0001", approver: "孙勇", approvalReason: "总部功能调试" };
const now = new Date("2026-09-18T00:00:00Z");

describe("总部批次表单校验", () => {
  it("在发请求前指出短赠码原因，并允许合格原因", () => {
    expect(validateHqCreditForm({ ...valid, approvalReason: "调试" }, now)).toEqual({ field: "approvalReason", message: "赠码原因至少填写 4 字" });
    expect(validateHqCreditForm(valid, now)).toBeNull();
  });
  it("指出缺失对象、非法数量、积分及日期", () => {
    expect(validateHqCreditForm({ ...valid, recipientLabel: " " }, now)?.field).toBe("recipientLabel");
    expect(validateHqCreditForm({ ...valid, targetKind: "store", storeId: "", purpose: "purchase" }, now)?.field).toBe("storeId");
    expect(validateHqCreditForm({ ...valid, amount: "0" }, now)?.field).toBe("amount");
    expect(validateHqCreditForm({ ...valid, targetKind: "store", storeId: "1", purpose: "purchase", quantity: "1001" }, now)?.field).toBe("quantity");
    expect(validateHqCreditForm({ ...valid, expiresAt: "2026-01-01" }, now)?.field).toBe("expiresAt");
    expect(validateHqCreditForm({ ...valid, receiptRef: "" }, now)?.field).toBe("receiptRef");
  });
});
