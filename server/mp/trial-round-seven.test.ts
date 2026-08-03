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
    expect(player).not.toContain("{pages.map(");
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

  it("提供最多六本的本机书架、二次确认删除和播放入口", () => {
    const libraryPath = file("miniprogram/src/pages/story-library/index.tsx");
    expect(existsSync(libraryPath)).toBe(true);
    if (!existsSync(libraryPath)) return;
    const app = read("miniprogram/src/app.config.ts");
    const library = read("miniprogram/src/pages/story-library/index.tsx");
    const story = read("miniprogram/src/pages/story-time/index.tsx");
    const player = read("miniprogram/src/pages/story-player/index.tsx");

    expect(app).toContain('"pages/story-library/index"');
    expect(library).toContain("最多保存 6 本");
    expect(library).toContain("还没有保存故事");
    expect(library).toContain("播放");
    expect(library).toContain("删除");
    expect(library).toContain("Taro.showModal");
    expect(library).toContain("storyStorage.remove");
    expect(story).toContain("我的故事");
    expect(player).toContain("我的故事");
    expect(player).toContain('Taro.navigateTo({ url: "/pages/story-library/index" })');
  });

  it("逐页合成带正文、页码和 AI 标识的四张图片保存到相册", () => {
    const player = read("miniprogram/src/pages/story-player/index.tsx");
    expect(player).toContain("<Canvas");
    expect(player).toContain("exportStoryPages");
    expect(player).toContain("saveImageToPhotosAlbum");
    expect(player).toContain("AI 生成内容");
    expect(player).toContain("Taro.openSetting");
    expect(player).toContain("4 张绘本图片已保存到相册");
  });

  it("换一批灵感按钮始终可见且冷却期点击会给大字提示", () => {
    const story = read("miniprogram/src/pages/story-time/index.tsx");
    const style = read("miniprogram/src/pages/story-time/index.scss");
    const refreshBlock = story.slice(story.indexOf("topic-refresh-button"), story.indexOf("custom-topic"));
    expect(refreshBlock).toContain("换一批灵感");
    expect(refreshBlock).toContain("topicRefreshRemaining");
    expect(refreshBlock).toContain("refreshTopics");
    expect(refreshBlock).not.toContain("disabled={topicRefreshRemaining");
    expect(style).toContain(".topic-refresh-button");
    expect(style).toContain("min-height: 108rpx");
    expect(style).toContain("font-size: 40rpx");
    expect(style).toContain("topic-refresh-button--ready");
  });

  it("故事资源生成后进入待释放队列并在下次进入时补清理", () => {
    const story = read("miniprogram/src/pages/story-time/index.tsx");
    const player = read("miniprogram/src/pages/story-player/index.tsx");
    expect(story).toContain("storyStorage.queueRemoteAssets([image.fileKey])");
    expect(story).toContain("storyStorage.queueRemoteAssets([speech.fileKey])");
    expect(story).toContain("storyStorage.flushRemoteAssets");
    expect(player).toContain("destroyAudio();");
    expect(player).toContain("playPage(currentPageIndex, result.story)");
    expect(player).toContain("flushRemoteAssets((fileKeys) => mpApi.releaseStoryAssets(fileKeys)).catch");
  });
});
