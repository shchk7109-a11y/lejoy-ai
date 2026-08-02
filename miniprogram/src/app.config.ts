export default defineAppConfig({
  // 该字段只接受位置类 API；本项目不用位置能力，保留空清单供提审核对。
  requiredPrivateInfos: [],
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
