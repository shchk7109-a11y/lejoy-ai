import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function source(relativePath: string): string {
  return readFileSync(new URL(`../../miniprogram/src/${relativePath}`, import.meta.url), "utf8");
}

describe("M4 小程序隐私授权", () => {
  it("不把相机、相册和麦克风 scope 误填入 app permission，并保留运行时用途说明", () => {
    const appConfig = source("app.config.ts");
    const voice = source("components/VoiceInput/index.tsx");
    const silverLens = source("pages/silver-lens/index.tsx");

    expect(appConfig).toContain("requiredPrivateInfos: []");
    expect(appConfig).not.toMatch(/requiredPrivateInfos:\s*\[[^\]]*(chooseMedia|saveImageToPhotosAlbum|getRecorderManager)/s);
    expect(appConfig).not.toContain("permission:");
    expect(appConfig).not.toContain("scope.camera");
    expect(appConfig).not.toContain("scope.writePhotosAlbum");
    expect(appConfig).not.toContain("scope.record");
    expect(voice).toContain("需要麦克风权限");
    expect(voice).toContain("请在设置中允许使用麦克风");
    expect(silverLens).toContain("需要相机或相册权限");
    expect(silverLens).toContain("需要保存权限");
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
