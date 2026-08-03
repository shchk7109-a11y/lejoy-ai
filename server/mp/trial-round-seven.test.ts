import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const root = new URL("../../", import.meta.url);
const file = (path: string) => new URL(path, root);
const read = (path: string) => readFileSync(file(path), "utf8");

describe("试用第七轮故事会本机书架", () => {
  it("注册沉浸播放器且原故事页传递图片和音频文件键", () => {
    const playerPath = file("miniprogram/src/pages/story-player/index.tsx");
    expect(existsSync(playerPath)).toBe(true);
    if (!existsSync(playerPath)) return;

    const app = read("miniprogram/src/app.config.ts");
    const story = read("miniprogram/src/pages/story-time/index.tsx");
    const player = read("miniprogram/src/pages/story-player/index.tsx");

    expect(app).toContain('"pages/story-player/index"');
    expect(story).toContain("imageFileKey: image.fileKey");
    expect(story).toContain("audioFileKey: speech.fileKey");
    expect(story).toContain('Taro.navigateTo({ url: "/pages/story-player/index" })');
    expect(player).toContain("pages[currentPageIndex]");
    expect(player).not.toContain("pages.map(");
    expect(player).toContain("第 {currentPageIndex + 1} / {pages.length} 页");
    expect(player).toContain("audio.onEnded");
    expect(player).toContain("setKeepScreenOn({ keepScreenOn: true })");
    expect(player).toContain("setKeepScreenOn({ keepScreenOn: false })");
    expect(player).toContain("audio.destroy()");
  });

  it("播放器提供适老化的上一页、暂停继续、下一页和保存入口", () => {
    const playerPath = file("miniprogram/src/pages/story-player/index.tsx");
    expect(existsSync(playerPath)).toBe(true);
    if (!existsSync(playerPath)) return;
    const player = read("miniprogram/src/pages/story-player/index.tsx");
    const style = read("miniprogram/src/pages/story-player/index.scss");
    for (const label of ["上一页", "暂停", "继续", "下一页", "保存故事", "下载到相册"]) {
      expect(player).toContain(label);
    }
    expect(style).toContain("108rpx");
    expect(style).toContain("40rpx");
  });
});
