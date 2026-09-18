export type HqCreditForm = {
  targetKind: "store" | "hq_staff" | "company_test" | "trial";
  storeId: string;
  recipientLabel: string;
  amount: string;
  quantity: string;
  expiresAt: string;
  purpose: "purchase" | "promotion";
  receiptRef: string;
  approver: string;
  approvalReason: string;
};
export type HqFormError = { field: keyof HqCreditForm; message: string };

export function validateHqCreditForm(form: HqCreditForm, now = new Date()): HqFormError | null {
  const storeTarget = form.targetKind === "store";
  if (storeTarget && (!Number.isSafeInteger(Number(form.storeId)) || Number(form.storeId) <= 0)) return { field: "storeId", message: "请先选择门店" };
  if (!storeTarget && (!form.recipientLabel.trim() || form.recipientLabel.length > 160)) return { field: "recipientLabel", message: "请填写不超过 160 字的接收人" };
  if (!Number.isSafeInteger(Number(form.amount)) || Number(form.amount) < 1 || Number(form.amount) > 1_000_000) return { field: "amount", message: "每码积分须在 1 到 1000000 之间" };
  if (storeTarget && (!Number.isSafeInteger(Number(form.quantity)) || Number(form.quantity) < 1 || Number(form.quantity) > 1000)) return { field: "quantity", message: "数量须在 1 到 1000 之间" };
  const expires = new Date(`${form.expiresAt}T23:59:59`);
  if (!form.expiresAt || !Number.isFinite(expires.getTime()) || expires <= now) return { field: "expiresAt", message: "请选择将来的有效期" };
  if (!form.receiptRef.trim() || form.receiptRef.length > 160) return { field: "receiptRef", message: "请填写不超过 160 字的审批编号或线下凭证" };
  const promotion = !storeTarget || form.purpose === "promotion";
  if (promotion && (form.approver.trim().length < 2 || form.approver.length > 80)) return { field: "approver", message: "审批人须填写 2 到 80 字" };
  if (promotion && (form.approvalReason.trim().length < 4 || form.approvalReason.length > 200)) return { field: "approvalReason", message: "赠码原因至少填写 4 字" };
  if (promotion && (`对象:${form.targetKind}; 收件人:${form.recipientLabel.trim()}; 审批人:${form.approver.trim()}; 原因:${form.approvalReason.trim()}; 审批编号:${form.receiptRef.trim()}`).length > 500) return { field: "approvalReason", message: "审批信息过长，请缩短后重试" };
  return null;
}
