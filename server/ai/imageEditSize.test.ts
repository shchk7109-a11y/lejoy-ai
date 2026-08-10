import { describe, expect, it } from "vitest";
import { fitImageEditSize, resolveImageEditMaxEdge } from "./imageEditSize";

describe("fitImageEditSize", () => {
  it.each([
    [1200, 1600, "1152x1536"],
    [1600, 1200, "1536x1152"],
    [1920, 1080, "1536x864"],
    [1000, 1000, "1536x1536"],
  ])("保持 %sx%s 原图比例", (width, height, expected) => {
    expect(fitImageEditSize(width, height, 1536)).toBe(expected);
  });

  it("把短边四舍五入到最接近的 16 像素倍数", () => {
    expect(fitImageEditSize(1280, 1707, 1536)).toBe("1152x1536");
  });

  it("拒绝适配后短边不足 512 像素的极端比例", () => {
    expect(() => fitImageEditSize(4000, 500, 1536)).toThrow(/比例过于狭长/);
  });

  it.each([
    [0, 1000, 1536],
    [1000, Number.NaN, 1536],
    [1000, 1000, 500],
  ])("拒绝无效尺寸 %s x %s，最大边 %s", (width, height, maxEdge) => {
    expect(() => fitImageEditSize(width, height, maxEdge)).toThrow(/尺寸或修图最大边配置无效/);
  });
});

describe("resolveImageEditMaxEdge", () => {
  it("优先使用显式最大边", () => {
    expect(resolveImageEditMaxEdge("1536", "1152x1536")).toBe(1536);
  });

  it("从旧版固定尺寸中取较长边", () => {
    expect(resolveImageEditMaxEdge("", "1152x1536")).toBe(1536);
  });

  it("语义模型尺寸继续使用透传模式", () => {
    expect(resolveImageEditMaxEdge("", "1.5K")).toBeUndefined();
  });

  it("忽略无效显式配置并尝试旧版固定尺寸", () => {
    expect(resolveImageEditMaxEdge("not-a-size", "1024x1365")).toBe(1365);
  });
});
