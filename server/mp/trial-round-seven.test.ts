import { existsSync, readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
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
    expect(player).toContain('type="2d"');
    expect(player).toContain("exportStoryPages");
    expect(player).toContain("Taro.getImageInfo");
    expect(player).toContain("fitImageWithinBox");
    expect(player).toContain("canvas.width = plan.canvasWidth");
    expect(player).toContain("canvas.height = plan.canvasHeight");
    expect(player).not.toContain("Taro.createCanvasContext");
    expect(player).not.toContain("lines.slice(0, 7)");
    expect(player).toContain("saveImageToPhotosAlbum");
    expect(player).toContain("AI 生成内容");
    expect(player).toContain("Taro.openSetting");
    expect(player).toContain("4 张绘本图片已保存到相册");
  });

  it("换一批灵感不等待倒计时且请求期间防重复点击", () => {
    const story = read("miniprogram/src/pages/story-time/index.tsx");
    const style = read("miniprogram/src/pages/story-time/index.scss");
    const refreshBlock = story.slice(story.indexOf("topic-refresh-button"), story.indexOf("custom-topic"));
    expect(refreshBlock).toContain("换一批灵感");
    expect(refreshBlock).toContain("refreshTopics");
    expect(refreshBlock).toContain("disabled={Boolean(busyMessage)}");
    expect(story).not.toContain("topicRefreshReadyAt");
    expect(story).not.toContain("topicRefreshRemaining");
    expect(story).not.toContain("请等 ${remaining} 秒再换一批");
    expect(style).toContain(".topic-refresh-button");
    expect(style).toContain("min-height: 108rpx");
    expect(style).toContain("font-size: 40rpx");
    expect(style).not.toContain("topic-refresh-button--cooldown");
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

  it("故事结构失败不会启动配图，配图失败也不会回流成结构错误", async () => {
    const modulePath = file("miniprogram/src/features/story-time/generation-flow.ts");
    expect(existsSync(modulePath)).toBe(true);
    if (!existsSync(modulePath)) return;
    const { runStoryStructureThenIllustrate } = await import(pathToFileURL(modulePath.pathname).href);

    const structureFailureEvents: string[] = [];
    const failedResult = await runStoryStructureThenIllustrate({
      loadStructure: async () => { throw new Error("structure failed"); },
      onStructureReady: () => structureFailureEvents.push("ready"),
      illustrate: async () => { structureFailureEvents.push("illustrate"); },
      onStructureError: () => structureFailureEvents.push("structure-error"),
      onIllustrationError: () => structureFailureEvents.push("illustration-error"),
    });
    expect(failedResult).toBe("structure_failed");
    expect(structureFailureEvents).toEqual(["structure-error"]);

    const illustrationFailureEvents: string[] = [];
    const story = { title: "小熊回家" };
    const illustratedResult = await runStoryStructureThenIllustrate({
      loadStructure: async () => story,
      onStructureReady: (value: typeof story) => illustrationFailureEvents.push(`ready:${value.title}`),
      illustrate: async () => { illustrationFailureEvents.push("illustrate"); throw new Error("image failed"); },
      onStructureError: () => illustrationFailureEvents.push("structure-error"),
      onIllustrationError: () => illustrationFailureEvents.push("illustration-error"),
    });
    expect(illustratedResult).toBe("illustration_failed");
    expect(illustrationFailureEvents).toEqual(["ready:小熊回家", "illustrate", "illustration-error"]);
  });

  it("新一轮故事请求和结构成功都会清除陈旧全局错误", () => {
    const story = read("miniprogram/src/pages/story-time/index.tsx");
    const generateStart = story.indexOf("async function generateStory(");
    const structureRequest = story.indexOf("mpApi.generateStoryStructure", generateStart);
    const structureReady = story.indexOf("onStructureReady", structureRequest);
    expect(story.slice(generateStart, structureRequest)).toContain("dismissError();");
    expect(story.slice(structureReady, story.indexOf("illustrate:", structureReady))).toContain("dismissError();");
    expect(story).toContain("runStoryStructureThenIllustrate");
  });
});
