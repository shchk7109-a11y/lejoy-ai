import { describe, expect, it } from "vitest";
import { MP_MODULES } from "./modules";

describe("首页模块注册表", () => {
  it("按设计规范下发固定六项、启用 SilverLens 并携带主题", () => {
    expect(MP_MODULES.map((module) => module.id)).toEqual([
      "silver-lens",
      "copy-writer",
      "story-time",
      "life-assistant",
      "ai-photographer",
      "ai-kaleidoscope",
    ]);
    expect(MP_MODULES[0]).toMatchObject({
      enabled: true,
      theme: { bg: "#FEF9C3", border: "#FDE68A", title: "#92400E" },
    });
    expect(MP_MODULES.find((module) => module.id === "ai-photographer")).toMatchObject({
      name: "AI 摄影师",
      enabled: false,
    });
    expect(MP_MODULES.find((module) => module.id === "story-time")).toMatchObject({ enabled: true });
    expect(MP_MODULES.find((module) => module.id === "life-assistant")).toMatchObject({
      enabled: true,
      description: "菜品健康分析、识花草",
    });
    expect(MP_MODULES.find((module) => module.id === "ai-kaleidoscope")).toMatchObject({
      enabled: true,
      description: "生活百科，陪您聊聊",
    });
    expect(MP_MODULES.filter((module) => module.enabled)).toHaveLength(5);
    const removedLegacyName = ["旅游", "达人"].join("");
    expect(MP_MODULES.some((module) => module.name.includes(removedLegacyName))).toBe(false);
    expect(MP_MODULES.every((module) => module.theme)).toBe(true);
  });
});
