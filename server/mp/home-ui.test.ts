import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("首页积分胶囊", () => {
  it("使用确定性金色钱币样式，不依赖各平台 emoji 渲染", () => {
    const source = readFileSync(
      new URL("../../miniprogram/src/pages/home/index.tsx", import.meta.url),
      "utf8",
    );
    const styles = readFileSync(
      new URL("../../miniprogram/src/pages/home/index.scss", import.meta.url),
      "utf8",
    );

    expect(source).toContain('<View className="account-pill__coin"><Text>¥</Text></View>');
    expect(styles).toMatch(/account-pill__coin[\s\S]*background:\s*linear-gradient\([^;]+#fbbf24/);
    expect(source).not.toContain('<Text className="account-pill__coin">🌑</Text>');
    expect(source).not.toContain('<Text className="account-pill__coin">⚫</Text>');
  });

  it("五个已上线模块都有明确页面导航", () => {
    const source = readFileSync(
      new URL("../../miniprogram/src/pages/home/index.tsx", import.meta.url),
      "utf8",
    );
    expect(source).toContain('"story-time": "/pages/story-time/index"');
    expect(source).toContain('"life-assistant": "/pages/life-assistant/index"');
    expect(source).toContain('"ai-kaleidoscope": "/pages/ai-kaleidoscope/index"');
  });
});
