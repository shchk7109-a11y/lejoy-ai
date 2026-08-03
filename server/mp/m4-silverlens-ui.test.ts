import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const pageSource = readFileSync(resolve(process.cwd(), "miniprogram/src/pages/silver-lens/index.tsx"), "utf8");

describe("老摄影大师小程序界面", () => {
  it("落地页使用老版两卡结构", () => {
    expect(pageSource).toContain("智能修图 & 美化");
    expect(pageSource).toContain("一键去除路人、调节光影、让照片更清晰");
    expect(pageSource).toContain("艺术画室");
    expect(pageSource).toContain("照片变油画、水墨画等艺术作品");
  });

  it("智能修图提供六个预设、自由输入、语音和两积分主按钮", () => {
    for (const label of ["一键去路人", "清晨阳光", "日落余晖", "通透增强", "人像精修", "背景虚化"]) {
      expect(pageSource).toContain(label);
    }
    expect(pageSource).toContain("我想怎么修");
    expect(pageSource).toContain("<VoiceInput");
    expect(pageSource).toContain("开始处理");
    expect(pageSource).toContain("2积分/次");
  });

  it("艺术风格从服务端接口读取，不在页面重复维护清单", () => {
    expect(pageSource).toContain("mpApi.silverLensStyles()");
    expect(pageSource).not.toContain("const ART_STYLES");
    expect(pageSource).not.toMatch(/皮克斯|迪士尼|宫崎骏|印象派/);
  });
});
