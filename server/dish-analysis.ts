import { aiChat } from "./ai/gateway";

export const DISH_ANALYSIS_DISCLAIMER = "营养数据为常见做法的估算值，仅供饮食参考，不构成医疗建议；实际数值会因食材、份量和烹饪方式不同而变化。";

export type DishIngredients = {
  primary: string[];
  secondary: string[];
  seasonings: string[];
};

export type DishNutritionAnalysis = {
  title: string;
  healthScore: number;
  scoreLabel: string;
  portionBasis: string;
  nutrition: Record<"calories" | "protein" | "fat" | "carbs" | "sodium" | "sugar", string>;
  ingredients: DishIngredients;
  overview: string;
  attentionPoints: Array<{ kind: "positive" | "caution"; title: string; detail: string }>;
  cookingTips: string[];
  pairingTips: string[];
  tags: string[];
  disclaimer: string;
};

type Chat = typeof aiChat;
type Fetch = typeof fetch;

const EMPTY_INGREDIENTS: DishIngredients = { primary: [], secondary: [], seasonings: [] };
const NUTRITION_KEYS = ["calories", "protein", "fat", "carbs", "sodium", "sugar"] as const;
const MEDICAL_LANGUAGE = /(?:服用|用药|药物|处方|治疗|诊断|治愈|疗效|剂量|停药|换药)/;
const MAX_METADATA_BYTES = 256 * 1024;

function parseJsonObject(raw: string): Record<string, unknown> {
  let cleaned = raw.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
  cleaned = cleaned.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
  if (cleaned.startsWith("[")) throw new Error("模型必须返回JSON对象");
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("模型未返回JSON对象");
  const parsed = JSON.parse(cleaned.slice(start, end + 1)) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("模型必须返回JSON对象");
  return parsed as Record<string, unknown>;
}

function boundedString(value: unknown, label: string, maxLength = 160): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${label}缺失`);
  const result = value.trim();
  if (result.length > maxLength) throw new Error(`${label}过长`);
  return result;
}

function optionalString(value: unknown, maxLength = 40): string | undefined {
  if (value === null || value === undefined || value === "") return undefined;
  if (typeof value !== "string") throw new Error("菜名格式无效");
  const result = value.trim();
  if (!result) return undefined;
  if (result.length > maxLength) throw new Error("菜名过长");
  return result;
}

function stringList(value: unknown, label: string, maxItems: number, maxLength = 80): string[] {
  if (!Array.isArray(value)) throw new Error(`${label}格式无效`);
  if (value.length > maxItems) throw new Error(`${label}数量过多`);
  return value.map((item) => boundedString(item, label, maxLength));
}

function parseIngredients(value: unknown): DishIngredients {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("食材拆解格式无效");
  const input = value as Record<string, unknown>;
  return {
    primary: stringList(input.primary, "原材料", 10, 30),
    secondary: stringList(input.secondary, "配料", 10, 30),
    seasonings: stringList(input.seasonings, "调味料", 10, 30),
  };
}

function scoreLabel(score: number): string {
  if (score >= 80) return "较健康";
  if (score >= 60) return "适量食用";
  return "建议少吃";
}

function assertNoMedicalLanguage(values: string[]): void {
  if (values.some((value) => MEDICAL_LANGUAGE.test(value))) throw new Error("健康建议包含医疗化表述");
}

export async function extractDishName(text: string, chat: Chat = aiChat): Promise<string | undefined> {
  const raw = await chat({
    systemPrompt: "你负责从中文菜名或分享文案中识别一道明确菜品。只返回JSON对象，不确定时返回null。",
    userPrompt: `从下面内容提取一道最明确的标准中文菜名。不得把账号名、食材名、广告语当成菜名。返回JSON对象：{"dishName":"菜名或null"}\n内容：${text.slice(0, 1200)}`,
    json: true,
  });
  return optionalString(parseJsonObject(raw).dishName);
}

export async function inspectDishImage(imageUrl: string, chat: Chat = aiChat): Promise<{
  dishName?: string;
  ingredients: DishIngredients;
}> {
  const raw = await chat({
    systemPrompt: "你是中国菜品视觉识别助手，只根据图片中可见内容判断，不确定时菜名返回null。只返回JSON对象。",
    userPrompt: `识别图片中的主要菜品并拆分食材，返回JSON对象：
{"dishName":"标准菜名或null","ingredients":{"primary":["原材料"],"secondary":["配料"],"seasonings":["能合理判断的调味料"]}}
原材料是构成菜品主体的食材；配料是少量搭配食材；调味料不要无依据罗列。`,
    imageUrl,
    json: true,
  });
  const parsed = parseJsonObject(raw);
  return {
    dishName: optionalString(parsed.dishName),
    ingredients: parsed.ingredients === undefined ? { ...EMPTY_INGREDIENTS } : parseIngredients(parsed.ingredients),
  };
}

export async function analyzeDishNutrition(
  input: { dishName: string; ingredients?: DishIngredients },
  chat: Chat = aiChat,
): Promise<DishNutritionAnalysis> {
  const ingredientsText = input.ingredients
    ? `\n已识别食材：\n原材料：${input.ingredients.primary.join("、") || "未识别到"}\n配料：${input.ingredients.secondary.join("、") || "未识别到"}\n调味料：${input.ingredients.seasonings.join("、") || "未识别到"}`
    : "";
  const raw = await chat({
    systemPrompt: "你是谨慎的中国菜品营养分析助手。只提供食物营养与烹饪层面的估算，不诊断疾病、不推荐药物或治疗。只返回JSON对象。",
    userPrompt: `分析菜品“${input.dishName}”。${ingredientsText}
按常见家庭做法估算并返回JSON对象：
{
  "title":"标准菜名",
  "healthScore":0到100的整数,
  "portionBasis":"每100克估算或常见一份约多少克",
  "nutrition":{"calories":"热量","protein":"蛋白质","fat":"脂肪","carbs":"碳水","sodium":"钠","sugar":"糖"},
  "ingredients":{"primary":[],"secondary":[],"seasonings":[]},
  "overview":"2至3句营养概述",
  "attentionPoints":[{"kind":"positive或caution","title":"短标题","detail":"原因"}],
  "cookingTips":["可执行的烹饪调整"],
  "pairingTips":["一餐搭配建议"],
  "tags":["最多4个营养标签"]
}
不要输出药物、治疗、诊断或针对疾病的个体化建议。`,
    json: true,
  });
  const parsed = parseJsonObject(raw);
  const healthScore = parsed.healthScore;
  if (typeof healthScore !== "number" || !Number.isInteger(healthScore) || healthScore < 0 || healthScore > 100) {
    throw new Error("健康指数必须是0到100的整数");
  }
  if (!parsed.nutrition || typeof parsed.nutrition !== "object" || Array.isArray(parsed.nutrition)) {
    throw new Error("营养数据格式无效");
  }
  const nutritionInput = parsed.nutrition as Record<string, unknown>;
  const nutrition = Object.fromEntries(NUTRITION_KEYS.map((key) => [
    key,
    boundedString(nutritionInput[key], key === "sodium" ? "钠" : key, 40),
  ])) as DishNutritionAnalysis["nutrition"];
  if (!Array.isArray(parsed.attentionPoints) || parsed.attentionPoints.length < 1 || parsed.attentionPoints.length > 4) {
    throw new Error("重点关注格式无效");
  }
  const attentionPoints = parsed.attentionPoints.map((point) => {
    if (!point || typeof point !== "object" || Array.isArray(point)) throw new Error("重点关注格式无效");
    const record = point as Record<string, unknown>;
    if (record.kind !== "positive" && record.kind !== "caution") throw new Error("重点关注类型无效");
    return {
      kind: record.kind,
      title: boundedString(record.title, "重点关注标题", 30),
      detail: boundedString(record.detail, "重点关注说明", 120),
    };
  });
  const cookingTips = stringList(parsed.cookingTips, "烹饪建议", 4, 120);
  const pairingTips = stringList(parsed.pairingTips, "搭配建议", 3, 120);
  const overview = boundedString(parsed.overview, "营养概述", 300);
  assertNoMedicalLanguage([
    overview,
    ...attentionPoints.flatMap((point) => [point.title, point.detail]),
    ...cookingTips,
    ...pairingTips,
  ]);
  return {
    title: boundedString(parsed.title, "菜名", 40),
    healthScore,
    scoreLabel: scoreLabel(healthScore),
    portionBasis: boundedString(parsed.portionBasis, "营养估算口径", 80),
    nutrition,
    ingredients: input.ingredients ?? parseIngredients(parsed.ingredients),
    overview,
    attentionPoints,
    cookingTips,
    pairingTips,
    tags: stringList(parsed.tags, "营养标签", 4, 24),
    disclaimer: DISH_ANALYSIS_DISCLAIMER,
  };
}

export function extractDouyinShortUrl(text: string): string | undefined {
  const candidate = text.match(/https:\/\/v\.douyin\.com\/[^\s<>"'，。！？；、]+/i)?.[0]
    ?.replace(/[)\]}]+$/, "");
  if (!candidate) return undefined;
  try {
    const parsed = new URL(candidate);
    return parsed.protocol === "https:" && parsed.hostname.toLowerCase() === "v.douyin.com"
      ? parsed.toString()
      : undefined;
  } catch {
    return undefined;
  }
}

function isAllowedDouyinUrl(url: URL): boolean {
  const hostname = url.hostname.toLowerCase();
  return url.protocol === "https:"
    && (hostname === "douyin.com" || hostname === "v.douyin.com" || hostname.endsWith(".douyin.com"));
}

function decodeHtml(value: string): string {
  return value
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#(\d+);/g, (_match, code: string) => String.fromCodePoint(Number(code)))
    .replace(/\s+/g, " ")
    .trim();
}

function metaAttributes(tag: string): Record<string, string> {
  const attributes: Record<string, string> = {};
  for (const match of tag.matchAll(/([:\w-]+)\s*=\s*(["'])([\s\S]*?)\2/g)) {
    attributes[match[1].toLowerCase()] = decodeHtml(match[3]);
  }
  return attributes;
}

function extractPublicMetadata(html: string): string | undefined {
  const values: string[] = [];
  const title = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  if (title) values.push(decodeHtml(title).slice(0, 300));
  for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
    const attributes = metaAttributes(tag);
    const key = (attributes.name ?? attributes.property ?? "").toLowerCase();
    if (["description", "og:title", "og:description"].includes(key) && attributes.content) {
      values.push(attributes.content.slice(0, 500));
    }
  }
  const unique = [...new Set(values.filter(Boolean))];
  return unique.length > 0 ? unique.join("\n").slice(0, 1000) : undefined;
}

export async function fetchDouyinPublicMetadata(
  text: string,
  fetchImpl: Fetch = fetch,
  timeoutMs = 5000,
): Promise<string | undefined> {
  const shortUrl = extractDouyinShortUrl(text);
  if (!shortUrl) return undefined;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    let current = new URL(shortUrl);
    for (let redirects = 0; redirects <= 3; redirects += 1) {
      if (!isAllowedDouyinUrl(current)) return undefined;
      const response = await fetchImpl(current.toString(), {
        method: "GET",
        redirect: "manual",
        signal: controller.signal,
        headers: {
          "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148",
          Accept: "text/html,application/xhtml+xml",
        },
      });
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get("location");
        if (!location || redirects === 3) return undefined;
        current = new URL(location, current);
        continue;
      }
      if (!response.ok || !response.headers.get("content-type")?.toLowerCase().includes("text/html")) return undefined;
      const declaredLength = Number(response.headers.get("content-length") ?? 0);
      if (Number.isFinite(declaredLength) && declaredLength > MAX_METADATA_BYTES) return undefined;
      const body = Buffer.from(await response.arrayBuffer());
      if (body.byteLength > MAX_METADATA_BYTES) return undefined;
      return extractPublicMetadata(body.toString("utf8"));
    }
    return undefined;
  } catch {
    return undefined;
  } finally {
    clearTimeout(timeout);
  }
}
