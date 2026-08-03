import { describe, expect, it } from "vitest";
import {
  StoryPageExportError,
  buildStoryPageRenderPlan,
  exportStoryPages,
  wrapCanvasText,
} from "../../miniprogram/src/features/story-time/export-pages";

describe("故事绘本四页相册导出", () => {
  it("中文按画布宽度分行且不会丢字", () => {
    const lines = wrapCanvasText("小象把苹果分享给了新朋友", 7, (text) => text.length);
    expect(lines).toEqual(["小象把苹果分享", "给了新朋友"]);
    expect(lines.join("")).toBe("小象把苹果分享给了新朋友");
  });

  it("绘制计划包含标题、正文、页码和 AI 生成标识", () => {
    const plan = buildStoryPageRenderPlan({
      title: "小象学分享",
      pageNumber: 2,
      pageCount: 4,
      text: "第二页故事",
      imagePath: "wxfile://page-2.png",
    });
    expect(plan).toMatchObject({
      title: "小象学分享",
      imagePath: "wxfile://page-2.png",
      footer: "第 2 / 4 页 · AI 生成内容",
    });
    expect(plan.canvasWidth).toBeGreaterThan(0);
    expect(plan.canvasHeight).toBeGreaterThan(plan.imageHeight);
  });

  it("严格按一至四页串行导出", async () => {
    const active: number[] = [];
    const completed: number[] = [];
    let running = 0;
    let maxRunning = 0;
    await exportStoryPages([1, 2, 3, 4], async (pageNumber) => {
      running += 1;
      maxRunning = Math.max(maxRunning, running);
      active.push(pageNumber);
      await Promise.resolve();
      running -= 1;
      completed.push(pageNumber);
    });
    expect(active).toEqual([1, 2, 3, 4]);
    expect(completed).toEqual([1, 2, 3, 4]);
    expect(maxRunning).toBe(1);
  });

  it("失败时报告失败页和已经成功的页码", async () => {
    await expect(exportStoryPages([1, 2, 3, 4], async (pageNumber) => {
      if (pageNumber === 3) throw new Error("album denied");
    })).rejects.toEqual(expect.objectContaining<Partial<StoryPageExportError>>({
      failedPage: 3,
      completedPages: [1, 2],
    }));
  });
});
