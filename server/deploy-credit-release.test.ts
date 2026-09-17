import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const path = new URL("../scripts/deploy/04-credit-release-check.sh", import.meta.url);

describe("积分兑换上线预检脚本", () => {
  it("只用隔离的测试库和专用账号跑迁移与并发兑换", () => {
    const source = readFileSync(path, "utf8");
    expect(source).toContain("lejoy_ai_credit_test");
    expect(source).toContain("lejoy_credit_test");
    expect(source).toContain("TEST_DATABASE_URL");
    expect(source).toContain("drizzle-kit migrate");
    expect(source).toContain("redeem.integration.test.ts");
    expect(source).not.toContain("GRANT ALL PRIVILEGES ON lejoy_ai.*");
  });

  it("生产备份在迁移前完成，并验证备份完整性与私有权限", () => {
    const source = readFileSync(path, "utf8");
    expect(source).toContain("mysqldump");
    expect(source).toContain("gzip -t");
    expect(source).toContain("chmod 600");
    expect(source).toContain("pre-credit-");
  });
});
