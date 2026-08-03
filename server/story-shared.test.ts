import { describe, expect, it } from "vitest";
import { buildStoryImagePrompt } from "./minimaxService";

describe("故事会共享提示词", () => {
  it("为 H5 与小程序生成同源的单页绘本配图提示词", () => {
    expect(buildStoryImagePrompt("a brave little squirrel", 2)).toBe(
      "儿童绘本插画，温暖可爱的风格，色彩明亮柔和，角色友善。第2页：a brave little squirrel",
    );
  });

  it("有儿童参考图时追加外貌一致性与隐私约束", () => {
    const prompt = buildStoryImagePrompt("孩子在森林里帮助小鹿", 1, {
      hasChildReference: true,
    });

    expect(prompt).toContain("保留主角的脸型、发型、肤色和显著外貌特征");
    expect(prompt).toContain("四页保持主角年龄、五官、发型和服装一致");
    expect(prompt).toContain("忽略参考图背景、地点、其他人物、文字、水印和标识");
    expect(prompt).toContain("不得推断或输出姓名、学校、地址等身份信息");
  });
});
