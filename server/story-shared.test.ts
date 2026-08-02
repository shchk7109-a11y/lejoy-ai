import { describe, expect, it } from "vitest";
import { buildStoryImagePrompt } from "./minimaxService";

describe("故事会共享提示词", () => {
  it("为 H5 与小程序生成同源的单页绘本配图提示词", () => {
    expect(buildStoryImagePrompt("a brave little squirrel", 2)).toBe(
      "儿童绘本插画，温暖可爱的风格，色彩明亮柔和，角色友善。第2页：a brave little squirrel",
    );
  });
});
