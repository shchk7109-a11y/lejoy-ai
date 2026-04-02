import type { ModelConfig, User } from "../../drizzle/schema";
import { maskApiKey } from "../crypto";
import { ENV } from "./env";

type DevModelConfigMeta = {
  label: string;
  defaultProvider: string;
  defaultModelName: string;
};

const DEV_MODEL_CONFIGS: Record<string, DevModelConfigMeta> = {
  text_generation: {
    label: "文本生成模型",
    defaultProvider: "google_proxy",
    defaultModelName: "gemini-2.5-flash",
  },
  image_processing: {
    label: "图像处理模型",
    defaultProvider: "google_proxy",
    defaultModelName: "gemini-2.5-flash",
  },
  image_generation: {
    label: "图像生成模型",
    defaultProvider: "minimax",
    defaultModelName: "image-01",
  },
  tts: {
    label: "语音合成模型",
    defaultProvider: "minimax",
    defaultModelName: "speech-2.8-hd",
  },


  kimi: {
    label: "Kimi文本模型",
    defaultProvider: "kimi",
    defaultModelName: "moonshot-v1-8k",
  },
};

function readEnv(name: string): string {
  return process.env[name]?.trim() ?? "";
}

function toPositiveInt(value: string, fallback: number): number {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function isDevLoginEnabled() {
  if (ENV.isProduction) return false;
  return readEnv("DEV_LOGIN_ENABLED") !== "false";
}

export function isDevLoginClientEnabled() {
  if (ENV.isProduction) return false;
  return readEnv("VITE_DEV_LOGIN_ENABLED") !== "false";
}

export function getDevUser(): User {
  const now = new Date();
  return {
    id: toPositiveInt(readEnv("DEV_LOGIN_USER_ID"), 1),
    openId: readEnv("DEV_LOGIN_OPEN_ID") || "local-dev-user",
    name: readEnv("DEV_LOGIN_NAME") || "本地调试管理员",
    email: readEnv("DEV_LOGIN_EMAIL") || "dev@local.test",
    loginMethod: "dev",
    role: readEnv("DEV_LOGIN_ROLE") === "user" ? "user" : "admin",
    points: toPositiveInt(readEnv("DEV_LOGIN_POINTS"), 9999),
    isFrozen: false,
    createdAt: now,
    updatedAt: now,
    lastSignedIn: now,
  };
}

export function getDevUserIfEnabled(openId?: string | null): User | null {
  if (!isDevLoginEnabled()) return null;
  const devUser = getDevUser();
  if (!openId) return devUser;
  return openId === devUser.openId ? devUser : null;
}

export function getDevSystemModelConfig(
  configKey: string,
  options?: { maskApiKey?: boolean }
): ModelConfig | undefined {
  const meta = DEV_MODEL_CONFIGS[configKey];
  if (!meta) return undefined;

  const prefix = `DEV_${configKey.toUpperCase()}`;
  const modelName = readEnv(`${prefix}_MODEL_NAME`) || meta.defaultModelName;
  const apiKey = readEnv(`${prefix}_API_KEY`);
  const baseUrl = readEnv(`${prefix}_BASE_URL`);
  const provider = readEnv(`${prefix}_PROVIDER`) || meta.defaultProvider;

  if (!apiKey && !baseUrl && !readEnv(`${prefix}_MODEL_NAME`)) {
    return undefined;
  }

  const now = new Date();
  return {
    id: -(Object.keys(DEV_MODEL_CONFIGS).indexOf(configKey) + 1),
    configKey,
    label: meta.label,
    provider,
    modelName,
    apiKey: apiKey ? (options?.maskApiKey ? maskApiKey(apiKey) : apiKey) : null,
    baseUrl: baseUrl || null,
    extraParams: null,
    isActive: true,
    createdAt: now,
    updatedAt: now,
  };
}

export function getDevSystemModelConfigs(options?: { maskApiKey?: boolean }): ModelConfig[] {
  return Object.keys(DEV_MODEL_CONFIGS)
    .map(configKey => getDevSystemModelConfig(configKey, options))
    .filter((config): config is ModelConfig => Boolean(config));
}

export function mergeSystemModelConfigs(
  storedConfigs: ModelConfig[],
  options?: { maskApiKey?: boolean }
): ModelConfig[] {
  const merged = new Map(storedConfigs.map(config => [config.configKey, config]));
  for (const devConfig of getDevSystemModelConfigs(options)) {
    if (!merged.has(devConfig.configKey)) {
      merged.set(devConfig.configKey, devConfig);
    }
  }
  return Array.from(merged.values());
}
