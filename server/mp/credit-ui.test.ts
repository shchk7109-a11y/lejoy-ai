import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { formatCreditCode, redeemErrorMessage } from "../../miniprogram/src/pages/credits/logic";

describe("accessible mini-program credit center", () => {
  it("formats pasted codes and explains stable failures in Chinese", () => {
    expect(formatCreditCode("abcd efgh-jklm")).toBe("ABCD-EFGH-JKLM");
    expect(redeemErrorMessage("CODE_USED")).toBe("这张兑换码已使用，请向店长领取新码");
    expect(redeemErrorMessage("CODE_EXPIRED")).toContain("已过期");
  });
  it("does not silently retry redemption or advertise unsupported payments", () => {
    const api = readFileSync(new URL("../../miniprogram/src/services/api.ts", import.meta.url), "utf8");
    const page = readFileSync(new URL("../../miniprogram/src/pages/credits/index.tsx", import.meta.url), "utf8");
    const home = readFileSync(new URL("../../miniprogram/src/pages/home/index.tsx", import.meta.url), "utf8");
    expect(api).toContain("/api/mp/credits/redeem");
    expect(api).toContain('retry: "never"');
    expect(page).toContain("await Promise.all([mpApi.me(), mpApi.creditHistory()])");
    expect(page).toContain("credits: result.balance");
    expect(page).toContain("明细暂未刷新");
    expect(page).toContain("disabled={busy}");
    expect(page).not.toContain("立即购买");
    expect(home).not.toContain("运营配置积分获取方式");
  });
});
