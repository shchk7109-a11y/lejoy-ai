import { describe, expect, it } from "vitest";
import { ART_STYLES, buildRestorePrompt, getArtStylePrompt } from "./silverlens";

describe("SilverLens 共享提示词", () => {
  it("固定提供五种艺术风格", () => {
    expect(Object.keys(ART_STYLES)).toEqual(["油画", "水彩", "素描", "水墨画", "印象派"]);
  });

  it("修复提示词保留人物特征约束并支持补充要求", () => {
    expect(buildRestorePrompt()).toContain("人物面部保持原有特征不变");
    expect(buildRestorePrompt("去掉折痕")).toContain("去掉折痕");
    expect(getArtStylePrompt("水墨画")).toContain("水墨画");
  });
});
