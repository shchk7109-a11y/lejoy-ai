import { existsSync, readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

const componentPath = new URL("../../miniprogram/src/components/GenerationProgress/index.tsx", import.meta.url);
const statePath = new URL("../../miniprogram/src/components/GenerationProgress/state.ts", import.meta.url);

describe("统一 AI 生成等待态", () => {
  it("提供可复用组件并在生成期间开启防息屏、结束时恢复", () => {
    expect(existsSync(componentPath)).toBe(true);
    if (!existsSync(componentPath)) return;
    const component = readFileSync(componentPath, "utf8");
    expect(component).toContain("useDidHide");
    expect(component).toContain("useDidShow");
    expect(component).toContain("setKeepScreenOn({ keepScreenOn: true })");
    expect(component).toContain("setKeepScreenOn({ keepScreenOn: false })");
    expect(component).toContain("setInterval");
    expect(component).toContain("clearInterval");
  });

  it("大字文案包含已用秒数和预估时间", async () => {
    expect(existsSync(statePath)).toBe(true);
    if (!existsSync(statePath)) return;
    const state = await import(pathToFileURL(statePath.pathname).href);
    expect(state.formatGenerationProgress("正在处理", 12, "约需半分钟")).toBe(
      "正在处理…已用 12 秒，约需半分钟",
    );
  });

  it("修图、文案、故事和生活助手统一接入等待组件", () => {
    for (const page of ["silver-lens", "copywriter", "story-time", "life-assistant"]) {
      const content = readFileSync(
        new URL(`../../miniprogram/src/pages/${page}/index.tsx`, import.meta.url),
        "utf8",
      );
      expect(content, page).toContain("GenerationProgress");
    }
  });
});
