import { describe, expect, it } from "vitest";
import {
  StoryPageExportError,
  buildStoryPageRenderPlan,
  exportStoryPages,
  fitImageWithinBox,
  isAlbumPermissionError,
  wrapCanvasText,
} from "../../miniprogram/src/features/story-time/export-pages";

describe("故事绘本四页相册导出", () => {
  it("识别微信相册授权拒绝对象而不依赖 Error 实例", () => {
    expect(isAlbumPermissionError({ errMsg: "saveImageToPhotosAlbum:fail auth deny" })).toBe(true);
    expect(isAlbumPermissionError(new Error("canvas draw failed"))).toBe(false);
  });

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
    expect(plan.canvasHeight).toBe(1920);
    expect(plan.imageBox.y + plan.imageBox.height).toBeLessThan(plan.textY);
    expect(plan.footerY).toBeLessThan(plan.canvasHeight);
  });

  it.each([
    { name: "方图", source: [1024, 1024], expected: [900, 900] },
    { name: "横图", source: [1600, 900], expected: [900, 506.25] },
    { name: "竖图", source: [900, 1600], expected: [506.25, 900] },
  ])("$name按原始宽高比完整放入图片框", ({ source, expected }) => {
    const rect = fitImageWithinBox({
      sourceWidth: source[0],
      sourceHeight: source[1],
      box: { x: 90, y: 220, width: 900, height: 900 },
    });
    expect(rect.width).toBeCloseTo(expected[0]);
    expect(rect.height).toBeCloseTo(expected[1]);
    expect(rect.width / rect.height).toBeCloseTo(source[0] / source[1]);
    expect(rect.x).toBeGreaterThanOrEqual(90);
    expect(rect.y).toBeGreaterThanOrEqual(220);
    expect(rect.x + rect.width).toBeLessThanOrEqual(990);
    expect(rect.y + rect.height).toBeLessThanOrEqual(1120);
  });

  it("拒绝无效图片尺寸，避免导出空白或无限坐标", () => {
    expect(() => fitImageWithinBox({
      sourceWidth: 0,
      sourceHeight: 100,
      box: { x: 0, y: 0, width: 900, height: 900 },
    })).toThrow("图片尺寸无效");
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
