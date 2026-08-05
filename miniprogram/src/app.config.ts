export default defineAppConfig({
  // 该字段只接受位置类 API；本项目不用位置能力，保留空清单供提审核对。
  requiredPrivateInfos: [],
  pages: [
    "pages/login/index",
    "pages/home/index",
    "pages/silver-lens/index",
    "pages/story-time/index",
    "pages/story-player/index",
    "pages/story-library/index",
    "pages/life-assistant/index",
    "pages/ai-kaleidoscope/index",
    "pages/copywriter/index",
    "pages/profile/index",
    "pages/about/index",
    "pages/user-agreement/index",
    "pages/privacy-policy/index",
    "pages/index/index",
  ],
  window: {
    navigationStyle: "custom",
    backgroundTextStyle: "light",
    backgroundColor: "#faf9f5",
  },
  sitemapLocation: "sitemap.json",
});
