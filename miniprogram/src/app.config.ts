export default defineAppConfig({
  pages: [
    "pages/login/index",
    "pages/home/index",
    "pages/copywriter/index",
    "pages/profile/index",
  ],
  window: {
    navigationStyle: "custom",
    backgroundTextStyle: "light",
    backgroundColor: "#fff7ed",
  },
  sitemapLocation: "sitemap.json",
});
