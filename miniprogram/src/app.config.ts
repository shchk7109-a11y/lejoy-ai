export default defineAppConfig({
  pages: [
    "pages/login/index",
    "pages/home/index",
    "pages/silver-lens/index",
    "pages/copywriter/index",
    "pages/profile/index",
  ],
  window: {
    navigationStyle: "custom",
    backgroundTextStyle: "light",
    backgroundColor: "#faf9f5",
  },
  sitemapLocation: "sitemap.json",
});
