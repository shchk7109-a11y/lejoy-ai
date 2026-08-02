export default defineAppConfig({
  // Taro 4.2.1 的类型仍只列位置类接口，微信提审实际还要求声明以下隐私接口。
  requiredPrivateInfos: ["chooseMedia", "saveImageToPhotosAlbum", "getRecorderManager"] as never[],
  permission: {
    "scope.camera": { desc: "用于拍摄需要修复或识别的照片" },
    "scope.writePhotosAlbum": { desc: "用于把处理后的照片保存到您的相册" },
    "scope.record": { desc: "用于把您说的话转换成文字" },
  },
  pages: [
    "pages/login/index",
    "pages/home/index",
    "pages/silver-lens/index",
    "pages/story-time/index",
    "pages/life-assistant/index",
    "pages/ai-kaleidoscope/index",
    "pages/copywriter/index",
    "pages/profile/index",
    "pages/about/index",
    "pages/user-agreement/index",
    "pages/privacy-policy/index",
  ],
  window: {
    navigationStyle: "custom",
    backgroundTextStyle: "light",
    backgroundColor: "#faf9f5",
  },
  sitemapLocation: "sitemap.json",
});
