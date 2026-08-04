import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function source(relativePath: string): string {
  return readFileSync(new URL(`../../miniprogram/src/${relativePath}`, import.meta.url), "utf8");
}

describe("M3 小程序页面契约", () => {
  it("注册故事会、生活助手和万花筒三个页面及 REST 客户端", () => {
    const appConfig = source("app.config.ts");
    const api = source("services/api.ts");
    for (const page of ["pages/story-time/index", "pages/life-assistant/index", "pages/ai-kaleidoscope/index"]) {
      expect(appConfig).toContain(`"${page}"`);
    }
    for (const method of [
      "suggestStoryTopics",
      "generateStoryStructure",
      "generateStoryPageImage",
      "generateStoryPageSpeech",
      "analyzeDish",
      "getRecipe",
      "identifyPlant",
      "queryHealth",
      "chat",
    ]) {
      expect(api).toContain(`${method}:`);
    }
  });

  it("故事会包含六种风格、可选儿童信息、四页生成和方言朗读", () => {
    const page = source("pages/story-time/index.tsx");
    const player = source("pages/story-player/index.tsx");
    const flow = source("features/story-time/flow.ts");
    for (const theme of ["温馨治愈", "科幻探险", "卡通童话", "睡前故事", "成语故事", "超级英雄"]) {
      expect(flow).toContain(theme);
    }
    expect(page).toContain("VoiceInput");
    expect(page).toContain("四川话");
    expect(page).toContain("上海话");
    expect(page).toContain('id: "dialect_shanghai"');
    expect(page).toContain("粤语");
    expect(player).toContain("createInnerAudioContext");
    expect(page).toContain("pageNumber");
    expect(page).toContain("AigcBadge");
    expect(page).toContain("setIllustrating(true)");
    expect(page).toMatch(/setPages\(\(current\)\s*=>\s*current\.map/);
    expect(page).toContain("正在逐页补图");
    expect(page).toContain("配图未完成");
  });

  it("生活助手统一菜名、分享、语音和拍照入口并移除健康百科", () => {
    const page = source("pages/life-assistant/index.tsx");
    const styles = source("pages/life-assistant/index.scss");
    for (const entry of ["菜品健康分析", "识花草", "输入菜名，或粘贴抖音分享内容", "拍一道菜", "从相册选择"]) {
      expect(page).toContain(entry);
    }
    for (const removed of ["查菜谱", "健康百科"]) expect(page).not.toContain(removed);
    expect(page.match(/<VoiceInput/g)?.length).toBeGreaterThanOrEqual(1);
    expect(page).toContain("chooseMedia");
    expect(page).toContain("DISH_NOT_FOUND");
    expect(page).toContain("focus={dishInputFocused}");
    expect(page).toContain('mode="aspectFit"');
    for (const section of ["营养估算口径", "重点关注", "原材料", "配料", "调味料", "更健康的吃法"]) {
      expect(page).toContain(section);
    }
    expect(page).toContain("AigcBadge");
    expect(styles).toMatch(/life-primary-button[\s\S]*min-height:\s*\$button-main-height/);
    expect(styles).toMatch(/life-primary-button[\s\S]*font-size:\s*\$font-button/);
    expect(styles).toMatch(/life-nutrition-grid[\s\S]*grid-template-columns:\s*repeat\(2/);
  });

  it("万花筒提供一次性提示、多轮气泡、语音输入、朗读和常驻标识", () => {
    const page = source("pages/ai-kaleidoscope/index.tsx");
    const styles = source("pages/ai-kaleidoscope/index.scss");
    expect(page).toContain("我是生活小帮手，健康问题请咨询医生");
    expect(page).toContain("setStorageSync");
    expect(page).toContain("VoiceInput");
    expect(page).toContain("读给我听");
    expect(page).toContain("AigcBadge");
    expect(styles).toMatch(/chat-bubble[\s\S]*font-size:\s*(?:3[6-9]|[4-9]\d)rpx/);
    expect(styles).toMatch(/chat-list\s*\{[^}]*height:\s*600rpx/);
  });
});
