import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("首页积分胶囊", () => {
  it("使用金色钱币 emoji，不回退为灰色圆形图标", () => {
    const source = readFileSync(
      new URL("../../miniprogram/src/pages/home/index.tsx", import.meta.url),
      "utf8",
    );

    expect(source).toContain('<Text className="account-pill__coin">🪙</Text>');
    expect(source).not.toContain('<Text className="account-pill__coin">🌑</Text>');
    expect(source).not.toContain('<Text className="account-pill__coin">⚫</Text>');
  });
});
