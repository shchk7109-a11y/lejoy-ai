import { aiChat, aiVisionFast } from "./ai/gateway";

export type PlantIdentification = {
  name: string;
  commonNames: string[];
  summary: string;
  safetyNotice: string;
  provider: string;
  model: string;
  fallbackUsed: boolean;
  durationMs: number;
};

export type PlantDetails = {
  carePoints: string[];
  floweringAndHabits: string[];
  meaningAndStories: string[];
};

function parseJsonObject(raw: string): Record<string, unknown> {
  const cleaned = raw
    .replace(/<think>[\s\S]*?<\/think>/gu, "")
    .replace(/```json\s*/giu, "")
    .replace(/```/gu, "")
    .trim();
  const match = cleaned.match(/\{[\s\S]*\}/u);
  if (!match) throw new Error("未找到 JSON 对象");
  const parsed: unknown = JSON.parse(match[0]);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("JSON 根节点必须是对象");
  }
  return parsed as Record<string, unknown>;
}

function shortText(value: unknown, maxLength: number, allowEmpty = false): string {
  if (typeof value !== "string") throw new Error("字段不是字符串");
  const text = value.trim();
  if ((!allowEmpty && !text) || text.length > maxLength) throw new Error("字段长度无效");
  return text;
}

function shortTextList(value: unknown, maxItems: number, maxLength: number): string[] {
  if (!Array.isArray(value) || value.length > maxItems) throw new Error("列表数量无效");
  return value.map((item) => shortText(item, maxLength));
}

function logParseFailure(task: string, error: unknown): void {
  console.error(`[AI] ${task} JSON解析失败`, {
    errorType: error instanceof Error ? error.name : "UnknownError",
  });
}

export async function identifyPlantFast(imageUrl: string): Promise<PlantIdentification> {
  const response = await aiVisionFast({
    systemPrompt: "只返回JSON对象。你是植物识别专家，根据图片谨慎识别常见植物。",
    userPrompt: "识别图片主体植物，返回JSON对象：{\"name\":\"简短中文名\",\"commonNames\":[\"最多3个常用俗名\"],\"summary\":\"一句话简介\",\"safetyNotice\":\"仅在有毒、常见致敏、刺激或尖刺风险时给出简短提示，否则空字符串\"}。不要返回养护、花期或其他内容。",
    imageUrl,
    maxTokens: 180,
  });

  try {
    const parsed = parseJsonObject(response.content);
    return {
      name: shortText(parsed.name, 30),
      commonNames: shortTextList(parsed.commonNames, 3, 20),
      summary: shortText(parsed.summary, 100),
      safetyNotice: shortText(parsed.safetyNotice, 100, true),
      provider: response.provider,
      model: response.model,
      fallbackUsed: response.fallbackUsed,
      durationMs: response.durationMs,
    };
  } catch (error) {
    logParseFailure("植物识别", error);
    throw new Error("植物识别结果解析失败，请重试");
  }
}

export async function getPlantDetails(plantName: string): Promise<PlantDetails> {
  const normalizedName = shortText(plantName, 80);
  const raw = await aiChat({
    systemPrompt: "你是通俗可靠的植物知识助手，只返回JSON对象，不要添加其他文字。",
    userPrompt: `请按植物名称“${normalizedName}”生成简明资料。返回JSON对象：{"carePoints":["养护要点，最多4项"],"floweringAndHabits":["花期习性，最多4项"],"meaningAndStories":["寓意典故，最多4项"]}。每项不超过80字；不得提供医疗、治疗或食用安全结论。`,
    json: true,
  });

  try {
    const parsed = parseJsonObject(raw);
    return {
      carePoints: shortTextList(parsed.carePoints, 4, 80),
      floweringAndHabits: shortTextList(parsed.floweringAndHabits, 4, 80),
      meaningAndStories: shortTextList(parsed.meaningAndStories, 4, 80),
    };
  } catch (error) {
    logParseFailure("植物详情", error);
    throw new Error("植物详情解析失败，请重试");
  }
}
