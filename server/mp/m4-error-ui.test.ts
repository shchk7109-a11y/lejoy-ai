import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function mini(relativePath: string): string {
  return readFileSync(new URL(`../../miniprogram/${relativePath}`, import.meta.url), "utf8");
}

const modulePages = ["silver-lens", "copywriter", "story-time", "life-assistant", "ai-kaleidoscope"];

describe("M4 五模块统一错误态", () => {
  it("五个模块页面都接入大字错误卡和手动重试", () => {
    for (const page of modulePages) {
      const content = mini(`src/pages/${page}/index.tsx`);
      expect(content, page).toContain("ErrorState");
      expect(content, page).toContain("useMpError");
      expect(content, page).toContain("retryError");
    }
  });

  it("错误卡展示标题、说明、积分帮助和明确重试按钮", () => {
    const component = mini("src/components/ErrorState/index.tsx");
    expect(component).toContain("error.title");
    expect(component).toContain("error.message");
    expect(component).toContain("error.helpText");
    expect(component).toContain("手动重试");
  });

  it("错误卡字号和按钮尺寸不低于适老化令牌", () => {
    const style = mini("src/components/ErrorState/index.scss");
    expect(style).toContain("$font-title");
    expect(style).toContain("$font-body");
    expect(style).toContain("$button-main-height");
  });
});
