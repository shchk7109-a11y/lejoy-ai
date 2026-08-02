/**
 * AI 业务任务层（原 MiniMax 服务层，P0 升级后改经模型网关路由）
 * - 文本类任务统一走 gateway.aiChat（auto 模式下优先 Kimi）
 * - 图片生成走 gateway.aiGenerateImage（auto 模式下优先即梦 Seedream）
 * - MiniMax 低层客户端已移至 ai/minimaxClient.ts，此处 re-export 保持兼容
 */
import { aiChat, aiGenerateImage } from "./ai/gateway";

export { invokeMiniMaxText, invokeMiniMaxImage, invokeMiniMaxTTS } from "./ai/minimaxClient";

/**
 * 解析模型返回的 JSON 内容（去除 think 标签与 markdown 代码块）
 */
function parseModelJson<T>(raw: string): T {
  let cleaned = raw.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
  cleaned = cleaned.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
  const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("未找到JSON内容");
  return JSON.parse(jsonMatch[0]) as T;
}

function parseModelJsonArray<T>(raw: string): T {
  let cleaned = raw.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
  cleaned = cleaned.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
  const arrMatch = cleaned.match(/\[[\s\S]*\]/);
  if (!arrMatch) throw new Error("未找到JSON数组内容");
  return JSON.parse(arrMatch[0]) as T;
}

export function buildStoryImagePrompt(imagePrompt: string, pageNumber: number): string {
  return `儿童绘本插画，温暖可爱的风格，色彩明亮柔和，角色友善。第${pageNumber}页：${imagePrompt}`;
}

/**
 * 生成故事文本结构
 */
export async function generateStoryText(params: {
  age: number;
  theme: string;
  topic: string;
  character: string;
}): Promise<{ title: string; pages: Array<{ pageNumber: number; text: string; imagePrompt: string }> }> {
  const prompt = `你是儿童故事大师。请为${params.age}岁的孩子创作一个「${params.theme}」风格的故事，主角叫${params.character}，故事主题：${params.topic}。要求：共4页，每页120-150字中文，语言生动有趣，富有想象力，每页有清晰的情节推进，结尾积极向上。返回JSON：{"title":"故事标题","pages":[{"pageNumber":1,"text":"中文故事内容","imagePrompt":"Detailed English description for children book illustration, warm colorful style"}]}`;
  const raw = await aiChat({
    systemPrompt: "你是儿童故事创作专家，只返回JSON格式内容，不要有任何多余的文字。",
    userPrompt: prompt,
    json: true,
  });
  return parseModelJson(raw);
}

/**
 * 推荐故事题材
 */
export async function suggestStoryTopics(params: {
  theme: string;
  character: string;
  customProtagonist?: string;
}): Promise<Array<{ title: string; description: string; protagonist: string }>> {
  const protagonistHint = params.customProtagonist
    ? `，主角必须是「${params.customProtagonist}」（可以是超级英雄、动漫角色等，保持其原有特征但适合儿童）`
    : ``;
  const prompt = `你是儿童故事创作专家。请为${params.character}推荐4个「${params.theme}」风格的故事题材${protagonistHint}。每个题材要有趣、有教育意义、适合孩子。返回JSON数组，每项包含：title（题材标题，10字内）、description（题材简介，30字内）、protagonist（主角名字${params.customProtagonist ? `，固定为「${params.customProtagonist}」` : `，如小明、小花、阿宝等随机有趣的名字`}）。格式：[{"title":"...","description":"...","protagonist":"..."}]`;
  const raw = await aiChat({
    systemPrompt: "你是儿童故事创作专家，只返回JSON格式内容，不要有任何多余的文字。",
    userPrompt: prompt,
    json: true,
  });
  return parseModelJsonArray(raw);
}

/**
 * 分析菜品营养信息
 */
export async function analyzeFoodNutrition(foodName: string): Promise<{
  name: string;
  healthScore: number;
  calories: string;
  protein: string;
  fat: string;
  carbs: string;
  sodium: string;
  sugar: string;
  tags: string[];
  summary: string;
  ingredients: string[];
  advice: string;
}> {
  const systemPrompt = `你是一位专业的营养师，擅长分析中国菜肴的营养价值。请根据菜名，提供详细的营养分析。
返回严格的JSON格式，不要有任何多余的文字。`;

  const userPrompt = `请分析"${foodName}"这道菜的营养信息，返回以下JSON格式：
{
  "name": "菜名（标准化）",
  "healthScore": 健康指数(0-100的整数),
  "calories": "热量(如142kcal/100g)",
  "protein": "蛋白质(如17.2g/100g)",
  "fat": "脂肪(如6.5g/100g)",
  "carbs": "碳水(如3.8g/100g)",
  "sodium": "钠含量(如450mg/100g)",
  "sugar": "糖分(如1.5g/100g)",
  "tags": ["标签1", "标签2", "标签3"],
  "summary": "营养概述（2-3句话，适合中老年人阅读）",
  "ingredients": ["主要食材及营养价值说明1", "主要食材及营养价值说明2", "主要食材及营养价值说明3"],
  "advice": "专家健康建议（针对中老年人，2-3句话，包括烹饪建议和注意事项）"
}`;

  const raw = await aiChat({ systemPrompt, userPrompt, json: true });
  try {
    return parseModelJson(raw);
  } catch (e) {
    console.error("[AI] 营养分析JSON解析失败，原始内容:", raw.substring(0, 500));
    throw new Error("营养分析结果解析失败，请重试");
  }
}

/**
 * 生成菜品图片，返回 data URL 格式（base64）
 */
export async function generateFoodImage(foodName: string): Promise<string> {
  const prompt = `一道精美的中国菜肴"${foodName}"，专业美食摄影，高清，色彩鲜艳，食欲感强，白色盘子，餐厅摆盘风格`;
  const base64 = await aiGenerateImage({ prompt, aspectRatio: "4:3" });
  return `data:image/jpeg;base64,${base64}`;
}

/**
 * 识别植物（支持图片URL或文字描述）
 */
export async function identifyPlant(params: {
  imageUrl?: string;
  textHint?: string;
}): Promise<{
  title: string;
  description: string;
  details: string[];
  tags: string[];
}> {
  const systemPrompt = `你是一位专业的植物学家，擅长识别各种植物花卉。请根据用户提供的图片或描述，识别植物并提供详细的养护建议。
返回严格的JSON格式，不要有任何多余的文字。`;

  const jsonSpec = `{
  "title": "植物名称（中文名+学名）",
  "description": "植物简介（2-3句话，包括特征和分布）",
  "details": ["养护要点1（如浇水频率）", "养护要点2（如光照需求）", "养护要点3（如施肥建议）", "养护要点4（如注意事项）"],
  "tags": ["标签1", "标签2", "标签3"]
}`;
  const userPrompt = params.textHint
    ? `请识别这种植物："${params.textHint}"，并返回以下JSON格式：\n${jsonSpec}`
    : `请识别图片中的植物，并返回以下JSON格式：\n${jsonSpec}`;

  const raw = await aiChat({ systemPrompt, userPrompt, imageUrl: params.imageUrl, json: true });
  try {
    return parseModelJson(raw);
  } catch (e) {
    console.error("[AI] 植物识别JSON解析失败，原始内容:", raw.substring(0, 500));
    throw new Error("植物识别结果解析失败，请重试");
  }
}

/**
 * 健康百科查询（支持图片或文字输入）
 */
export async function queryHealthInfo(params: {
  imageUrl?: string;
  textHint?: string;
}): Promise<{
  title: string;
  description: string;
  details: string[];
  tags: string[];
  healthyScore?: number;
  nutrition?: {
    calories: string;
    protein: string;
    fat: string;
    carbs: string;
  };
  advice: string;
}> {
  const systemPrompt = `你是一位专业的营养师和健康顾问，擅长分析食物营养价值和提供健康建议。请根据用户提供的图片或描述，分析营养成分并提供健康建议。
返回严格的JSON格式，不要有任何多余的文字。`;

  const jsonSpec = `{
  "title": "食物名称",
  "description": "营养概述（2-3句话）",
  "details": ["营养要点1", "营养要点2", "营养要点3", "健康功效1"],
  "tags": ["标签1", "标签2", "标签3"],
  "healthyScore": 健康指数(0-100的整数),
  "nutrition": {
    "calories": "热量(如142kcal/100g)",
    "protein": "蛋白质(如17.2g/100g)",
    "fat": "脂肪(如6.5g/100g)",
    "carbs": "碳水(如3.8g/100g)"
  },
  "advice": "健康建议（针对中老年人，2-3句话）"
}`;
  const userPrompt = params.textHint
    ? `请分析"${params.textHint}"的营养信息和健康价值，返回以下JSON格式：\n${jsonSpec}`
    : `请识别图片中的食物并分析其营养信息，返回以下JSON格式：\n${jsonSpec}`;

  const raw = await aiChat({ systemPrompt, userPrompt, imageUrl: params.imageUrl, json: true });
  try {
    return parseModelJson(raw);
  } catch (e) {
    console.error("[AI] 健康百科JSON解析失败，原始内容:", raw.substring(0, 500));
    throw new Error("健康信息解析失败，请重试");
  }
}
