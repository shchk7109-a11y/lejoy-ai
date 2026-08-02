import { defineConfig, type UserConfigExport } from "@tarojs/cli";

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
  outputRoot: "dist",
  defineConstants: {
    __LEJOY_API_BASE_URL__: JSON.stringify(
      process.env.TARO_APP_API_BASE_URL || "http://127.0.0.1:3000",
    ),
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
