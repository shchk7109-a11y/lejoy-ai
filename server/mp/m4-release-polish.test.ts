import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function mini(relativePath: string): string {
  return readFileSync(new URL(`../../miniprogram/${relativePath}`, import.meta.url), "utf8");
}

describe("M4 提审界面打磨", () => {
  it("首页积分为零时给出清楚的获取指引占位", () => {
    const home = mini("src/pages/home/index.tsx");
    expect(home).toContain("user?.credits === 0");
    expect(home).toContain("积分暂时为 0");
    expect(home).toContain("TODO（运营配置积分获取方式）");
  });

  it("五个模块结果均有 AIGC 标识，故事朗读标为 AI 合成语音", () => {
    for (const page of ["silver-lens", "copywriter", "story-time", "life-assistant", "ai-kaleidoscope"]) {
      expect(mini(`src/pages/${page}/index.tsx`), page).toContain("<AigcBadge");
    }
    expect(mini("src/pages/story-time/index.tsx")).toContain("AI 合成语音");
  });

  it("全局长文字允许断行，双列网格不会被内容撑宽", () => {
    expect(mini("src/app.scss")).toContain("overflow-wrap: anywhere");
    expect(mini("src/pages/story-time/index.scss")).toContain("minmax(0, 1fr)");
    expect(mini("src/pages/silver-lens/index.scss")).toContain("minmax(0, 1fr)");
  });
});
