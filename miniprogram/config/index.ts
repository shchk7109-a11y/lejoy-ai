import { defineConfig, type UserConfigExport } from "@tarojs/cli";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const miniprogramRoot = fileURLToPath(new URL("../", import.meta.url));

const releaseChannel = process.env.TARO_APP_RELEASE_CHANNEL || "develop";
const apiBaseUrls: Record<string, string | undefined> = {
  "develop": process.env.TARO_APP_API_BASE_URL_DEVELOP || "http://127.0.0.1:3000",
  "trial": process.env.TARO_APP_API_BASE_URL_TRIAL,
  "release": process.env.TARO_APP_API_BASE_URL_RELEASE,
};

if (!Object.prototype.hasOwnProperty.call(apiBaseUrls, releaseChannel)) {
  throw new Error(`TARO_APP_RELEASE_CHANNEL 仅支持 develop、trial 或 release，当前为 ${releaseChannel}`);
}

const apiBaseUrl = process.env.TARO_APP_API_BASE_URL || apiBaseUrls[releaseChannel];
if (!apiBaseUrl) {
  throw new Error(`${releaseChannel} 构建缺少对应的 API 地址，请设置 TARO_APP_API_BASE_URL_${releaseChannel.toUpperCase()}`);
}

const config: UserConfigExport = {
  projectName: "lejoy-ai-miniprogram",
  date: "2026-08-02",
  designWidth: 750,
  deviceRatio: {
    640: 2.34 / 2,
    750: 1,
    828: 1.81 / 2,
  },
  sourceRoot: "src",
  outputRoot: process.env.TARO_APP_OUTPUT_ROOT || "dist",
  alias: {
    "react$": resolve(miniprogramRoot, "node_modules", "react", "index.js"),
    "react/jsx-runtime$": resolve(miniprogramRoot, "node_modules", "react", "jsx-runtime.js"),
    "react/jsx-dev-runtime$": resolve(miniprogramRoot, "node_modules", "react", "jsx-dev-runtime.js"),
  },
  defineConstants: {
    __LEJOY_API_BASE_URL__: JSON.stringify(apiBaseUrl),
    __LEJOY_MINIPROGRAM_VERSION__: JSON.stringify("1.0.0"),
    __LEJOY_RELEASE_CHANNEL__: JSON.stringify(releaseChannel),
  },
  framework: "react",
  compiler: {
    type: "webpack5",
    prebundle: { enable: false },
  },
  cache: { enable: false },
  mini: {
    postcss: {
      pxtransform: { enable: true, config: {} },
      url: { enable: true, config: { limit: 1024 } },
      cssModules: { enable: false, config: { namingPattern: "module", generateScopedName: "[name]__[local]___[hash:base64:5]" } },
    },
  },
};

export default defineConfig(config);
