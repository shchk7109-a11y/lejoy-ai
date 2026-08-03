import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("故事会儿童照片参考 UI", () => {
  it("提供可选照片、隐私说明和无照片继续入口", async () => {
    const page = await readFile("miniprogram/src/pages/story-time/index.tsx", "utf8");

    expect(page).toContain("让孩子当故事主角（可选）");
    expect(page).toContain("照片仅用于本次绘本形象参考");
    expect(page).toContain("拍一张");
    expect(page).toContain("从相册选择");
    expect(page).toContain("不用照片");
    expect(page).toContain("ensurePrivacyAuthorized");
  });

  it("四页共享参考键且离页执行尽力清理", async () => {
    const page = await readFile("miniprogram/src/pages/story-time/index.tsx", "utf8");

    expect(page).toContain("runWithStoryReference");
    expect(page).toContain("referenceFileKey");
    expect(page).toContain("releaseStoryReference");
    expect(page).toContain("activeReferenceKeyRef");
  });

  it("照片预览不拉伸且操作按钮符合适老化尺寸", async () => {
    const style = await readFile("miniprogram/src/pages/story-time/index.scss", "utf8");

    expect(style).toContain(".story-reference-photo__preview");
    expect(style).toContain("min-height: 108rpx");
    expect(style).toContain("font-size: 40rpx");
  });
});
