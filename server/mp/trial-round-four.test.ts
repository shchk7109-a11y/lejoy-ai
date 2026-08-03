import { existsSync, readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

const flowPath = new URL("../../miniprogram/src/features/story-time/flow.ts", import.meta.url);

describe("试用第四轮故事会交互", () => {
  it("六种故事风格对齐老版丰富度并移除品牌词", async () => {
    expect(existsSync(flowPath)).toBe(true);
    if (!existsSync(flowPath)) return;
    const flow = await import(pathToFileURL(flowPath.pathname).href);
    expect(flow.STORY_THEMES.map((item: { name: string }) => item.name)).toEqual([
      "温馨治愈",
      "科幻探险",
      "卡通童话",
      "睡前故事",
      "成语故事",
      "超级英雄",
    ]);
    expect(JSON.stringify(flow.STORY_THEMES)).not.toMatch(/漫威|Marvel/i);
  });

  it("自定义主题去除首尾空格并形成可生成的题材", async () => {
    expect(existsSync(flowPath)).toBe(true);
    if (!existsSync(flowPath)) return;
    const flow = await import(pathToFileURL(flowPath.pathname).href);
    expect(flow.createCustomStoryTopic("  一次去动物园的冒险  ", "乐乐")).toEqual({
      title: "一次去动物园的冒险",
      description: "按您说的主题创作",
      protagonist: "乐乐",
    });
    expect(flow.createCustomStoryTopic("   ", "乐乐")).toBeUndefined();
  });

  it("换一批灵感严格限制 30 秒内不能连点", async () => {
    expect(existsSync(flowPath)).toBe(true);
    if (!existsSync(flowPath)) return;
    const flow = await import(pathToFileURL(flowPath.pathname).href);
    expect(flow.remainingTopicRefreshSeconds(1_000, 31_000)).toBe(30);
    expect(flow.remainingTopicRefreshSeconds(30_001, 31_000)).toBe(1);
    expect(flow.remainingTopicRefreshSeconds(31_000, 31_000)).toBe(0);
  });

  it("题材步骤同时提供四张推荐卡、自定义文字语音和换一批按钮", () => {
    const page = readFileSync(
      new URL("../../miniprogram/src/pages/story-time/index.tsx", import.meta.url),
      "utf8",
    );
    expect(page).toContain("topics.map");
    expect(page).toContain("我来说主题");
    expect(page).toContain("例如：学会分享，或者一次去动物园的冒险…");
    expect(page).toContain("<VoiceInput");
    expect(page).toContain("换一批灵感");
    expect(page).toContain("TOPIC_REFRESH_COOLDOWN_MS");
  });
});
