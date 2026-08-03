import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function mini(relativePath: string): string {
  return readFileSync(new URL(`../../miniprogram/${relativePath}`, import.meta.url), "utf8");
}

describe("试用第一轮修复", () => {
  it("小程序构建把 React 及 JSX runtime 固定到自身的 React 18", () => {
    const config = mini("config/index.ts");

    expect(config).toContain('"react$"');
    expect(config).toContain('"react/jsx-runtime$"');
    expect(config).toContain('"react/jsx-dev-runtime$"');
    expect(config.match(/node_modules["']?,?\s*"react/g)?.length).toBeGreaterThanOrEqual(3);
  });

  it("暖心文案恢复旧版完整场景、对象和七种风格", () => {
    const page = mini("src/pages/copywriter/index.tsx");
    const expectedOptions = [
      "节日祝福",
      "生日寿辰",
      "发朋友圈",
      "日常关怀",
      "安慰鼓励",
      "感谢致意",
      "思念问候",
      "长辈祝寿",
      "朋友",
      "家人",
      "长辈",
      "晚辈",
      "伴侣",
      "同事",
      "温暖亲切",
      "幽默调侃",
      "文采飞扬",
      "诗歌赋词",
      "散文随笔",
      "人生感悟",
      "庄重得体",
    ];

    for (const option of expectedOptions) {
      expect(page, option).toContain(`"${option}"`);
    }
    expect(page).not.toContain('"幽默轻松"');
  });

  it("NutUI 主按钮统一使用暖橙设计令牌和适老化大尺寸", () => {
    const appStyles = mini("src/app.scss");
    const copywriterStyles = mini("src/pages/copywriter/index.scss");

    expect(appStyles).toContain(".nut-button-primary-solid");
    expect(appStyles).toMatch(/\.nut-button-primary-solid\s*\{[^}]*background:\s*\$color-primary\s*!important/s);
    expect(appStyles).toContain(".nut-button-xlarge");
    expect(appStyles).toContain(".nut-button-xlarge-children");
    expect(appStyles).toContain("min-height: $button-main-height !important");
    expect(appStyles).toContain("font-size: $font-button !important");
    expect(appStyles).not.toContain(".nut-button--xlarge");
    expect(copywriterStyles).toMatch(/\.guide-panel__action\s+\.nut-button\s*\{[^}]*width:\s*100%/s);
  });

  it("生成资格由三个必填值派生，异常禁用态点击后显示大字提示", () => {
    const page = mini("src/pages/copywriter/index.tsx");
    const styles = mini("src/pages/copywriter/index.scss");

    expect(page).toContain("canGenerateCopywriter(flow)");
    expect(page).toContain("disabled={!canGenerate}");
    expect(page).toContain("请先完成前面的选择");
    expect(page).toContain("guide-panel__validation");
    expect(styles).toMatch(/\.guide-panel__validation\s*\{[^}]*font-size:\s*\$font-button/s);
  });
});
