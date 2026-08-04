import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const apiPath = new URL("../../miniprogram/src/services/api.ts", import.meta.url);
const pagePath = new URL("../../miniprogram/src/pages/life-assistant/index.tsx", import.meta.url);
const stylePath = new URL("../../miniprogram/src/pages/life-assistant/index.scss", import.meta.url);

describe("识花草两段式小程序契约", () => {
  it("API 区分识别短结果与不扣分详情", () => {
    const api = readFileSync(apiPath, "utf8");
    expect(api).toContain("export type PlantIdentifyResult");
    expect(api).toContain("commonNames: string[]");
    expect(api).toContain("safetyNotice: string");
    expect(api).toContain("export type PlantDetails");
    expect(api).toContain("carePoints: string[]");
    expect(api).toContain("floweringAndHabits: string[]");
    expect(api).toContain("meaningAndStories: string[]");
    expect(api).toContain('request<PlantDetails>("/api/mp/life/plant-details"');
    expect(api).toContain('retry: "never"');
  });

  it("识花图片先限制到 1280px，菜品拍照不切换视觉链路", () => {
    const page = readFileSync(pagePath, "utf8");
    expect(page).toContain("compressPlantImage");
    expect(page).toContain('selectedMode === "plant" ? ["compressed"] : ["compressed", "original"]');
    expect(page).toContain("compressPlantImage(file.tempFilePath, Taro)");
    expect(page).toContain("mpApi.identifyPlant");
    expect(page).toContain("mpApi.analyzeDish");
  });

  it("先展示识别结果，再由了解更多展开三组详情", () => {
    const page = readFileSync(pagePath, "utf8");
    expect(page).toContain("了解更多");
    expect(page).toContain("养护要点");
    expect(page).toContain("花期习性");
    expect(page).toContain("寓意典故");
    expect(page).toContain("plantDetailsBusy");
    expect(page).toContain("loadPlantDetails");
    expect(page).toContain("result.name");
  });

  it("识别等待在 30 秒后去掉不准确的预计时长", () => {
    const page = readFileSync(pagePath, "utf8");
    expect(page).toContain('estimate={mode === "dish" ? "约需半分钟" : "通常20秒内"}');
    expect(page).toContain("slowAfterSeconds={mode === \"plant\" ? 30 : undefined}");
    expect(page).toContain('slowLabel={mode === "plant" ? "网络有点慢，再等等" : undefined}');
    expect(page).not.toContain("约需十几秒");
  });

  it("结果页使用大字名称、安全提示和令牌化主按钮", () => {
    const styles = readFileSync(stylePath, "utf8");
    expect(styles).toContain(".life-plant-name");
    expect(styles).toContain(".life-plant-common-names");
    expect(styles).toContain(".life-plant-safety");
    expect(styles).toContain("$font-hero");
    expect(styles).toContain("$button-main-height");
  });
});
