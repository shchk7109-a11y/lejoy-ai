import axios from "axios";

const MINIMAX_API_BASE = "https://api.minimaxi.com/v1";
const MINIMAX_TEXT_MODEL = "MiniMax-M2.5-highspeed";

/**
 * MiniMax TTS 语音合成
 * 返回 base64 编码的 MP3 音频数据
 */
export async function invokeMiniMaxTTS(text: string, voiceType = "lively"): Promise<{ audioData: string; audioMime: string }> {
  const apiKey = getApiKey();
  // 根据voiceType选择音色（使用MiniMax官方正确的voice_id）
  const voiceMap: Record<string, string> = {
    lively: "lovely_girl",          // 萌萌女童，活泼生动，适合故事朗读
    gentle: "female-chengshu",      // 成熟女性，温柔亲切
    deep: "male-qn-qingse",         // 青涩青年，清晰自然
    warm: "female-shaonv",          // 少女音色，温暖甜美
  };
  const voiceId = voiceMap[voiceType] ?? "lovely_girl";
  const resp = await axios.post(
    `${MINIMAX_API_BASE}/t2a_v2`,
    {
      model: "speech-02-hd",
      text,
      stream: false,
      voice_setting: {
        voice_id: voiceId,
        speed: 0.9,
        vol: 1.0,
        pitch: 0,
      },
      audio_setting: {
        sample_rate: 24000,
        bitrate: 128000,
        format: "mp3",
        channel: 1,
      },
    },
    {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      timeout: 90000,
    }
  );
  // MiniMax TTS返回hex编码的音频数据
  const hexData: string = resp.data?.data?.audio;
  if (!hexData) throw new Error("MiniMax TTS 返回音频数据为空");
  // 将hex转为base64
  const buf = Buffer.from(hexData, "hex");
  return { audioData: buf.toString("base64"), audioMime: "audio/mp3" };
}

/**
 * 生成故事文本结构（使用 MiniMax 文本模型）
 */
export async function generateStoryText(params: {
  age: number;
  theme: string;
  topic: string;
  character: string;
}): Promise<{ title: string; pages: Array<{ pageNumber: number; text: string; imagePrompt: string }> }> {
  const prompt = `你是儿童故事大师。请为${params.age}岁的孩子创作一个「${params.theme}」风格的故事，主角叫${params.character}，故事主题：${params.topic}。要求：共4页，每页120-150字中文，语言生动有趣，富有想象力，每页有清晰的情节推进，结尾积极向上。返回JSON：{"title":"故事标题","pages":[{"pageNumber":1,"text":"中文故事内容","imagePrompt":"Detailed English description for children book illustration, warm colorful style"}]}`;
  const raw = await invokeMiniMaxText({
    systemPrompt: "你是儿童故事创作专家，只返回JSON格式内容，不要有任何多余的文字。",
    userPrompt: prompt,
    responseFormat: "json",
  });
  // 解析JSON
  let cleaned = raw.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
  cleaned = cleaned.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
  const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("故事生成返回格式错误");
  return JSON.parse(jsonMatch[0]);
}

/**
 * 推荐故事题材（使用 MiniMax 文本模型）
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
  const raw = await invokeMiniMaxText({
    systemPrompt: "你是儿童故事创作专家，只返回JSON格式内容，不要有任何多余的文字。",
    userPrompt: prompt,
    responseFormat: "json",
  });
  let cleaned = raw.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
  cleaned = cleaned.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
  // 提取JSON数组
  const arrMatch = cleaned.match(/\[[\s\S]*\]/);
  if (!arrMatch) throw new Error("题材推荐返回格式错误");
  return JSON.parse(arrMatch[0]);
}

function getApiKey(): string {
  const key = process.env.MINIMAX_API_KEY;
  if (!key) throw new Error("MINIMAX_API_KEY is not configured");
  return key;
}

/**
 * 解析 MiniMax 返回的 JSON 内容（去除 think 标签等）
 */
function parseMinimaxJson<T>(raw: string): T {
  // 去掉 <think>...</think> 思维链内容
  let cleaned = raw.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
  // 清理可能的markdown代码块
  cleaned = cleaned.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
  // 提取第一个完整的JSON对象
  const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("未找到JSON内容");
  return JSON.parse(jsonMatch[0]) as T;
}

/**
 * 调用 MiniMax 文本生成模型（支持可选图片输入 Vision）
 */
export async function invokeMiniMaxText(params: {
  systemPrompt: string;
  userPrompt: string;
  imageUrl?: string;  // 可选：图片URL（用于Vision识别）
  responseFormat?: "json" | "text";
}): Promise<string> {
  const apiKey = getApiKey();

  // 构建用户消息内容
  let userContent: any;
  if (params.imageUrl) {
    // Vision 模式：图片 + 文字
    userContent = [
      {
        type: "image_url",
        image_url: { url: params.imageUrl },
      },
      {
        type: "text",
        text: params.userPrompt,
      },
    ];
  } else {
    userContent = params.userPrompt;
  }

  const body: Record<string, unknown> = {
    model: MINIMAX_TEXT_MODEL,
    messages: [
      { role: "system", content: params.systemPrompt },
      { role: "user", content: userContent },
    ],
    max_tokens: 4096,
  };

  if (params.responseFormat === "json") {
    body.response_format = { type: "json_object" };
  }

  const resp = await axios.post(`${MINIMAX_API_BASE}/chat/completions`, body, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    timeout: 60000,
  });

  const content = resp.data?.choices?.[0]?.message?.content;
  if (!content) throw new Error("MiniMax 返回内容为空");
  return content as string;
}

/**
 * 调用 MiniMax 图片生成模型
 * 返回 base64 编码的图片数据
 */
export async function invokeMiniMaxImage(params: {
  prompt: string;
  aspectRatio?: "1:1" | "16:9" | "4:3" | "3:4" | "9:16";
}): Promise<string> {
  const apiKey = getApiKey();

  const resp = await axios.post(
    `${MINIMAX_API_BASE}/image_generation`,
    {
      model: "image-01",
      prompt: params.prompt,
      aspect_ratio: params.aspectRatio ?? "4:3",
      response_format: "base64",
    },
    {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      timeout: 120000,
    }
  );

  const images: string[] = resp.data?.data?.image_base64;
  if (!images || images.length === 0) throw new Error("MiniMax 图片生成返回为空");
  return images[0];
}

/**
 * 分析菜品营养信息（使用 MiniMax 文本模型）
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

  const raw = await invokeMiniMaxText({
    systemPrompt,
    userPrompt,
    responseFormat: "json",
  });

  try {
    return parseMinimaxJson(raw);
  } catch (e) {
    console.error("[MiniMax] 营养分析JSON解析失败，原始内容:", raw.substring(0, 500));
    throw new Error("营养分析结果解析失败，请重试");
  }
}

/**
 * 生成菜品图片（使用 MiniMax 图片模型）
 * 返回 data URL 格式（base64）
 */
export async function generateFoodImage(foodName: string): Promise<string> {
  const prompt = `一道精美的中国菜肴"${foodName}"，专业美食摄影，高清，色彩鲜艳，食欲感强，白色盘子，餐厅摆盘风格`;
  const base64 = await invokeMiniMaxImage({ prompt, aspectRatio: "4:3" });
  return `data:image/jpeg;base64,${base64}`;
}

/**
 * 识别植物（使用 MiniMax Vision 模型）
 * 支持图片URL或文字描述
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

  let userPrompt: string;
  if (params.textHint) {
    userPrompt = `请识别这种植物："${params.textHint}"，并返回以下JSON格式：
{
  "title": "植物名称（中文名+学名）",
  "description": "植物简介（2-3句话，包括特征和分布）",
  "details": ["养护要点1（如浇水频率）", "养护要点2（如光照需求）", "养护要点3（如施肥建议）", "养护要点4（如注意事项）"],
  "tags": ["标签1", "标签2", "标签3"]
}`;
  } else {
    userPrompt = `请识别图片中的植物，并返回以下JSON格式：
{
  "title": "植物名称（中文名+学名）",
  "description": "植物简介（2-3句话，包括特征和分布）",
  "details": ["养护要点1（如浇水频率）", "养护要点2（如光照需求）", "养护要点3（如施肥建议）", "养护要点4（如注意事项）"],
  "tags": ["标签1", "标签2", "标签3"]
}`;
  }

  const raw = await invokeMiniMaxText({
    systemPrompt,
    userPrompt,
    imageUrl: params.imageUrl,
    responseFormat: "json",
  });

  try {
    return parseMinimaxJson(raw);
  } catch (e) {
    console.error("[MiniMax] 植物识别JSON解析失败，原始内容:", raw.substring(0, 500));
    throw new Error("植物识别结果解析失败，请重试");
  }
}

/**
 * 健康百科查询（使用 MiniMax 文本模型）
 * 支持图片或文字输入
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

  let userPrompt: string;
  if (params.textHint) {
    userPrompt = `请分析"${params.textHint}"的营养信息和健康价值，返回以下JSON格式：
{
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
  } else {
    userPrompt = `请识别图片中的食物并分析其营养信息，返回以下JSON格式：
{
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
  }

  const raw = await invokeMiniMaxText({
    systemPrompt,
    userPrompt,
    imageUrl: params.imageUrl,
    responseFormat: "json",
  });

  try {
    return parseMinimaxJson(raw);
  } catch (e) {
    console.error("[MiniMax] 健康百科JSON解析失败，原始内容:", raw.substring(0, 500));
    throw new Error("健康信息解析失败，请重试");
  }
}
