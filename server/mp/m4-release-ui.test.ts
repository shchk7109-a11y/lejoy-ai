import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function source(relativePath: string): string {
  return readFileSync(new URL(`../../miniprogram/${relativePath}`, import.meta.url), "utf8");
}

describe("M4 关于页与提审占位文档", () => {
  it("注册关于、用户协议和隐私政策页面，并从我的页进入", () => {
    const appConfig = source("src/app.config.ts");
    const profile = source("src/pages/profile/index.tsx");
    for (const page of ["pages/about/index", "pages/user-agreement/index", "pages/privacy-policy/index"]) {
      expect(appConfig).toContain(`"${page}"`);
    }
    expect(profile).toContain('/pages/about/index');
    expect(profile).toContain("MINIPROGRAM_VERSION");
  });

  it("关于页展示版本与运营主体占位，并可进入两份文档", () => {
    const about = source("src/pages/about/index.tsx");
    expect(about).toContain("MINIPROGRAM_VERSION");
    expect(about).toContain("运营主体名称");
    expect(about).toContain("TODO（运营填写）");
    expect(about).toContain('/pages/user-agreement/index');
    expect(about).toContain('/pages/privacy-policy/index');
  });

  it("政策模板含法务标记、信息用途和四家第三方清单", () => {
    const agreement = source("src/pages/user-agreement/index.tsx");
    const privacy = source("src/pages/privacy-policy/index.tsx");
    expect(agreement).toContain("TODO（法务定稿）");
    expect(privacy).toContain("TODO（法务定稿）");
    for (const section of ["信息收集清单", "使用目的", "第三方服务清单"]) expect(privacy).toContain(section);
    for (const provider of ["微信", "月之暗面（Kimi）", "火山引擎", "阿里云"]) expect(privacy).toContain(provider);
  });

  it("构建期定义版本号和 develop/trial/release 环境", () => {
    const config = source("config/index.ts");
    const release = source("src/config/release.ts");
    for (const channel of ["develop", "trial", "release"]) expect(config).toContain(`"${channel}"`);
    expect(config).toContain("TARO_APP_RELEASE_CHANNEL");
    expect(config).toContain("TARO_APP_API_BASE_URL_TRIAL");
    expect(config).toContain("TARO_APP_API_BASE_URL_RELEASE");
    expect(config).toContain("__LEJOY_MINIPROGRAM_VERSION__");
    expect(release).toContain("MINIPROGRAM_VERSION");
  });
});
