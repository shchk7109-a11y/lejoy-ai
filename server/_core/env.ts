export const ENV = {
  appId: process.env.VITE_APP_ID ?? "",
  cookieSecret: process.env.JWT_SECRET ?? "",
  databaseUrl: process.env.DATABASE_URL ?? "",
  oAuthServerUrl: process.env.OAUTH_SERVER_URL ?? "",
  ownerOpenId: process.env.OWNER_OPEN_ID ?? "",
  isProduction: process.env.NODE_ENV === "production",
  forgeApiUrl: process.env.BUILT_IN_FORGE_API_URL ?? "",
  forgeApiKey: process.env.BUILT_IN_FORGE_API_KEY ?? "",

  // Gemini AI 模型配置（通过谷高API中转）
  geminiBaseUrl: process.env.GEMINI_BASE_URL ?? "https://api.gdoubolai.com/v1",
  geminiTextApiKey: process.env.GEMINI_TEXT_API_KEY ?? "",
  geminiTextModel: process.env.GEMINI_TEXT_MODEL ?? "gemini-3.1-flash-lite-preview",
  geminiImageApiKey: process.env.GEMINI_IMAGE_API_KEY ?? "",
  geminiImageModel: process.env.GEMINI_IMAGE_MODEL ?? "gemini-3.1-flash-image-preview",
  geminiTtsApiKey: process.env.GEMINI_TTS_API_KEY ?? "",
  geminiTtsModel: process.env.GEMINI_TTS_MODEL ?? "gemini-2.5-flash-preview-tts",
};
