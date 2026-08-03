export const ENV = {
  appId: process.env.VITE_APP_ID ?? "",
  cookieSecret: process.env.JWT_SECRET ?? "",
  databaseUrl: process.env.DATABASE_URL ?? "",
  wechatMiniAppId: process.env.WECHAT_MINI_APPID ?? "",
  wechatMiniSecret: process.env.WECHAT_MINI_SECRET ?? "",
  mpMockLogin: process.env.MP_MOCK_LOGIN === "true",
  contentSecurity: process.env.CONTENT_SECURITY ?? "off",
  wechatMpCallbackToken: process.env.WECHAT_MP_CALLBACK_TOKEN ?? "",
  oAuthServerUrl: process.env.OAUTH_SERVER_URL ?? "",
  ownerOpenId: process.env.OWNER_OPEN_ID ?? "",
  isProduction: process.env.NODE_ENV === "production",
  forgeApiUrl: process.env.BUILT_IN_FORGE_API_URL ?? "",
  forgeApiKey: process.env.BUILT_IN_FORGE_API_KEY ?? "",

  // Gemini AI 模型配置（通过谷高API中转）——遗留链路，仅作降级备用
  geminiBaseUrl: process.env.GEMINI_BASE_URL ?? "https://api.gdoubolai.com/v1",
  geminiTextApiKey: process.env.GEMINI_TEXT_API_KEY ?? "",
  geminiTextModel: process.env.GEMINI_TEXT_MODEL ?? "gemini-3.1-flash-lite-preview",
  geminiImageApiKey: process.env.GEMINI_IMAGE_API_KEY ?? "",
  geminiImageModel: process.env.GEMINI_IMAGE_MODEL ?? "gemini-3.1-flash-image-preview",
  geminiTtsApiKey: process.env.GEMINI_TTS_API_KEY ?? "",
  geminiTtsModel: process.env.GEMINI_TTS_MODEL ?? "gemini-2.5-flash-preview-tts",

  // ─── 境内模型平台（P0 升级新增）───────────────────────────────────────────

  // 月之暗面 Kimi（文本/视觉理解）
  moonshotApiKey: process.env.MOONSHOT_API_KEY ?? "",
  moonshotBaseUrl: process.env.MOONSHOT_BASE_URL ?? "https://api.moonshot.cn/v1",
  moonshotModel: process.env.MOONSHOT_MODEL ?? "kimi-k2.6", // 日常任务（支持视觉）
  moonshotModelHeavy: process.env.MOONSHOT_MODEL_HEAVY ?? "kimi-k3", // 重任务（长上下文/深度推理）

  // DeepSeek（纯文本快速任务）
  deepseekApiKey: process.env.DEEPSEEK_API_KEY ?? "",
  deepseekBaseUrl: process.env.DEEPSEEK_BASE_URL ?? "https://api.deepseek.com",
  deepseekModel: process.env.DEEPSEEK_MODEL ?? "deepseek-v4-flash",

  // 火山引擎方舟 即梦 Seedream（图像生成/编辑）
  arkApiKey: process.env.ARK_API_KEY ?? "",
  arkBaseUrl: process.env.ARK_BASE_URL ?? "https://ark.cn-beijing.volces.com/api/v3",
  arkImageModel: process.env.ARK_IMAGE_MODEL ?? "doubao-seedream-4-0-250828", // 上控制台模型广场核实最新版本号
  arkStoryImageModel: process.env.ARK_STORY_IMAGE_MODEL ?? process.env.ARK_IMAGE_MODEL ?? "doubao-seedream-4-0-250828",
  arkImageWatermark: process.env.ARK_IMAGE_WATERMARK !== "false", // AIGC标识合规，默认开

  // 阿里云 DashScope（TTS语音合成 + ASR语音识别）
  dashscopeApiKey: process.env.DASHSCOPE_API_KEY ?? "",
  dashscopeBaseUrl: process.env.DASHSCOPE_BASE_URL ?? "https://dashscope.aliyuncs.com",
  dashscopeTtsModel: process.env.DASHSCOPE_TTS_MODEL ?? "qwen3-tts-flash",
  dashscopeAsrModel: process.env.DASHSCOPE_ASR_MODEL ?? "qwen3-asr-flash",

  // 能力级供应商切换："auto"（有密钥则用新链路）| 明确指定 deepseek/kimi/volc/ali/minimax/gemini/forge
  aiTextFastProvider: process.env.AI_TEXT_FAST_PROVIDER ?? "auto",
  aiTextProvider: process.env.AI_TEXT_PROVIDER ?? "auto",
  aiImageProvider: process.env.AI_IMAGE_PROVIDER ?? "auto",
  aiTtsProvider: process.env.AI_TTS_PROVIDER ?? "auto",
  aiAsrProvider: process.env.AI_ASR_PROVIDER ?? "auto",

  // 阿里云 OSS（S3兼容）存储——配置后替代 Manus 内置存储
  s3Endpoint: process.env.S3_ENDPOINT ?? "", // 如 https://oss-cn-shanghai.aliyuncs.com
  s3Region: process.env.S3_REGION ?? "cn-shanghai",
  s3Bucket: process.env.S3_BUCKET ?? "",
  s3AccessKeyId: process.env.S3_ACCESS_KEY_ID ?? "",
  s3SecretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? "",
  s3PublicBaseUrl: process.env.S3_PUBLIC_BASE_URL ?? "", // 公开读的自定义域名/桶域名，留空则生成长效签名URL
};
