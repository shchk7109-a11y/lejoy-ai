import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function source(relativePath: string): string {
  return readFileSync(new URL(`../../miniprogram/src/${relativePath}`, import.meta.url), "utf8");
}

describe("M4 小程序隐私授权", () => {
  it("声明相机、相册和麦克风用途，不把非位置 API 误填入 requiredPrivateInfos", () => {
    const appConfig = source("app.config.ts");
    expect(appConfig).toContain("requiredPrivateInfos: []");
    expect(appConfig).not.toMatch(/requiredPrivateInfos:\s*\[[^\]]*(chooseMedia|saveImageToPhotosAlbum|getRecorderManager)/s);
    expect(appConfig).toContain('"scope.camera": { desc: "用于拍摄需要修复或识别的照片" }');
    expect(appConfig).toContain('"scope.writePhotosAlbum": { desc: "用于把处理后的照片保存到您的相册" }');
    expect(appConfig).toContain('"scope.record": { desc: "用于把您说的话转换成文字" }');
  });

  it("隐私授权封装支持低版本基础库降级", () => {
    const privacy = source("services/privacy.ts");
    expect(privacy).toContain("ensurePrivacyAuthorized");
    expect(privacy).toMatch(/typeof Taro\.requirePrivacyAuthorize\s*!==\s*"function"/);
    expect(privacy).toContain("return Promise.resolve()");
  });

  it("相机、相册和麦克风调用前先触发官方隐私授权", () => {
    const voice = source("components/VoiceInput/index.tsx");
    const silverLens = source("pages/silver-lens/index.tsx");
    const life = source("pages/life-assistant/index.tsx");

    expect(voice.indexOf("await ensurePrivacyAuthorized()" )).toBeGreaterThan(0);
    expect(voice.indexOf("await ensurePrivacyAuthorized()" )).toBeLessThan(voice.indexOf("await Taro.getSetting()"));
    expect(silverLens.indexOf("await ensurePrivacyAuthorized()" )).toBeLessThan(silverLens.indexOf("await Taro.chooseMedia"));
    expect(silverLens.lastIndexOf("await ensurePrivacyAuthorized()" )).toBeLessThan(silverLens.indexOf("await Taro.saveImageToPhotosAlbum"));
    expect(life.indexOf("await ensurePrivacyAuthorized()" )).toBeLessThan(life.indexOf("await Taro.chooseMedia"));
  });
});
