import { describe, expect, it } from "vitest";
import {
  ART_STYLES,
  PHOTO_EDIT_PRESETS,
  PHOTO_FIDELITY_CONSTRAINT,
  buildRestorePrompt,
  getArtStyleOptions,
  getArtStylePrompt,
  type PhotoEditPreset,
} from "./silverlens";

describe("SilverLens 共享提示词", () => {
  it("艺术风格清单由服务端唯一提供，包含四种画作与三种通用动漫风", () => {
    expect(Object.keys(ART_STYLES)).toEqual([
      "油画",
      "水彩",
      "素描",
      "水墨画",
      "三维动画风",
      "日式动漫风",
      "童话卡通风",
    ]);
    expect(getArtStyleOptions().map(({ name }) => name)).toEqual(Object.keys(ART_STYLES));
    expect(JSON.stringify(ART_STYLES)).not.toMatch(/皮克斯|迪士尼|宫崎骏|印象派/);
  });

  it("六个修图预设都包含完整保真约束", () => {
    expect(Object.keys(PHOTO_EDIT_PRESETS)).toEqual([
      "一键去路人",
      "清晨阳光",
      "日落余晖",
      "通透增强",
      "人像精修",
      "背景虚化",
    ]);
    for (const prompt of Object.values(PHOTO_EDIT_PRESETS)) {
      expect(prompt).toContain(PHOTO_FIDELITY_CONSTRAINT);
    }
  });

  it("默认使用通透增强，预设与自由描述可以叠加", () => {
    expect(buildRestorePrompt()).toBe(PHOTO_EDIT_PRESETS["通透增强"]);
    const prompt = buildRestorePrompt("把天空调蓝一点", "清晨阳光" as PhotoEditPreset);
    expect(prompt).toContain("清晨阳光");
    expect(prompt).toContain("把天空调蓝一点");
    expect(prompt).toContain(PHOTO_FIDELITY_CONSTRAINT);
    expect(getArtStylePrompt("水墨画")).toContain("水墨画");
  });
});
