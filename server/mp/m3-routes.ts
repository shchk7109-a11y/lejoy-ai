import { randomUUID } from "node:crypto";
import { Router, type NextFunction, type Request, type RequestHandler, type Response } from "express";
import type { InsertMediaCheckTask, MediaCheckTask } from "../../drizzle/schema";
import { aiChatMulti, aiGenerateImage, aiTTS } from "../ai/gateway";
import { ENV } from "../_core/env";
import { withCreditCharge } from "../credits-charge";
import { getUserById } from "../db";
import {
  analyzeDishNutrition,
  extractDishName,
  fetchDouyinPublicMetadata,
  inspectDishImage,
} from "../dish-analysis";
import {
  analyzeFoodNutrition,
  buildStoryImagePrompt,
  generateFoodImage,
  generateStoryText,
  queryHealthInfo,
  suggestStoryTopics,
} from "../minimaxService";
import { getPlantDetails, identifyPlantFast } from "../plant-identification";
import { storageDelete, storageGet, storagePut } from "../storage";
import type { MpAuthenticatedRequest } from "./auth";
import { sendMpTimeoutError } from "./operations";
import { appendChatDisclaimer, blocksChatInput, blocksChatOutput } from "./chat-guard";
import { CHAT_MEDICAL_GUIDANCE, CHAT_SYSTEM_PROMPT } from "./chat-persona";
import { createMediaCheckTask, findMediaCheckTaskByFile } from "./media-check-tasks";
import { decodeImageUpload } from "./image-upload";
import { checkMediaSecurity, checkTextSecurity, type MediaSecuritySubmission, type SecurityCheckResult } from "./security";
import { createTextSecurityBatches } from "./text-security-batches";

type StoredFile = { key: string; url: string };
type StoryResult = Awaited<ReturnType<typeof generateStoryText>>;

export type M3Dependencies = {
  contentSecurityMode: string;
  storagePut: typeof storagePut;
  storageGet: typeof storageGet;
  storageDelete: typeof storageDelete;
  submitMediaCheck: (url: string, openId?: string) => Promise<MediaSecuritySubmission>;
  createMediaCheckTask: (task: InsertMediaCheckTask) => Promise<void>;
  findMediaCheckTaskByFile: (userId: number, fileKey: string) => Promise<MediaCheckTask | undefined>;
  withCreditCharge: typeof withCreditCharge;
  suggestStoryTopics: typeof suggestStoryTopics;
  generateStoryText: typeof generateStoryText;
  aiGenerateImage: typeof aiGenerateImage;
  aiTTS: typeof aiTTS;
  analyzeFoodNutrition: typeof analyzeFoodNutrition;
  generateFoodImage: typeof generateFoodImage;
  extractDishName: typeof extractDishName;
  fetchDouyinPublicMetadata: typeof fetchDouyinPublicMetadata;
  inspectDishImage: typeof inspectDishImage;
  analyzeDishNutrition: typeof analyzeDishNutrition;
  identifyPlantFast: typeof identifyPlantFast;
  getPlantDetails: typeof getPlantDetails;
  queryHealthInfo: typeof queryHealthInfo;
  aiChatMulti: typeof aiChatMulti;
  checkTextSecurity: (text: string, openId?: string) => Promise<SecurityCheckResult>;
  getCredits: (userId: number) => Promise<number>;
  createFileId: () => string;
};

export function defaultM3Dependencies(): M3Dependencies {
  return {
    contentSecurityMode: ENV.contentSecurity,
    storagePut,
    storageGet,
    storageDelete,
    submitMediaCheck: checkMediaSecurity,
    createMediaCheckTask,
    findMediaCheckTaskByFile,
    withCreditCharge,
    suggestStoryTopics,
    generateStoryText,
    aiGenerateImage,
    aiTTS,
    analyzeFoodNutrition,
    generateFoodImage,
    extractDishName,
    fetchDouyinPublicMetadata,
    inspectDishImage,
    analyzeDishNutrition,
    identifyPlantFast,
    getPlantDetails,
    queryHealthInfo,
    aiChatMulti,
    checkTextSecurity,
    getCredits: async (userId) => (await getUserById(userId))?.credits ?? 0,
    createFileId: randomUUID,
  };
}

function asyncRoute(handler: (req: Request, res: Response, next: NextFunction) => Promise<void>): RequestHandler {
  return (req, res, next) => void handler(req, res, next).catch(next);
}

function badRequest(res: Response, message: string): void {
  res.status(400).json({ error: { code: "BAD_REQUEST", message } });
}

function nonEmpty(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function topicExclusions(value: unknown): string[] | undefined {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 40) return undefined;
  const titles = value.map(nonEmpty);
  if (titles.some((title) => !title || title.length > 20)) return undefined;
  return titles;
}

function ownedStoryReference(fileKey: string, userId: number): boolean {
  return new RegExp(
    `^story-refs/${userId}/[A-Za-z0-9][A-Za-z0-9._-]*\\.(?:jpe?g|png|webp)$`,
    "i",
  ).test(fileKey);
}

export function createM3Router(deps: M3Dependencies, authenticate: RequestHandler): Router {
  const router = Router();
  router.use(authenticate);

  const checkTextBatches = async (texts: string[], openId: string): Promise<SecurityCheckResult> => {
    for (const batch of createTextSecurityBatches(texts)) {
      const result = await deps.checkTextSecurity(batch, openId);
      if (!result.safe) return result;
    }
    return { safe: true };
  };

  const submitStoredImage = async (file: StoredFile, user: { id: number; openId: string }) => {
    if (deps.contentSecurityMode !== "wechat") return "bypassed" as const;
    try {
      const submission = await deps.submitMediaCheck(file.url, user.openId);
      if (submission.status !== "pending") return submission.status;
      await deps.createMediaCheckTask({
        traceId: submission.traceId,
        userId: user.id,
        fileKey: file.key,
        status: "pending",
      });
      return submission.status;
    } catch (error) {
      try {
        await deps.storageDelete(file.key);
      } catch {
        console.error("[MP M3 media compensation] cleanup failed");
      }
      throw error;
    }
  };

  const resolveOwnedImage = async (fileKey: string, user: { id: number }) => {
    const ownedImagePattern = new RegExp(`^uploads/${user.id}/[A-Za-z0-9][A-Za-z0-9._-]*\\.(?:jpe?g|png|webp)$`, "i");
    if (!ownedImagePattern.test(fileKey)) return undefined;
    if (deps.contentSecurityMode === "wechat") {
      const task = await deps.findMediaCheckTaskByFile(user.id, fileKey);
      if (!task || task.status === "risky") return undefined;
    }
    return deps.storageGet(fileKey);
  };

  const resolveStoryReference = async (fileKey: string, user: { id: number }) => {
    if (!ownedStoryReference(fileKey, user.id)) return undefined;
    if (deps.contentSecurityMode === "wechat") {
      const task = await deps.findMediaCheckTaskByFile(user.id, fileKey);
      if (!task || task.status === "risky") return undefined;
    }
    return deps.storageGet(fileKey);
  };

  router.post("/story/reference-image", asyncRoute(async (req, res) => {
    let decoded: ReturnType<typeof decodeImageUpload>;
    try {
      decoded = decodeImageUpload(req.body);
    } catch (error) {
      badRequest(res, error instanceof Error ? error.message : "图片参数错误");
      return;
    }
    const user = (req as MpAuthenticatedRequest).mpUser;
    const file = await deps.storagePut(
      `story-refs/${user.id}/${deps.createFileId()}.${decoded.extension}`,
      decoded.buffer,
      decoded.mimeType,
    );
    const securityStatus = await submitStoredImage(file, user);
    res.json({ fileKey: file.key, securityStatus });
  }));

  router.post("/story/reference-image/release", asyncRoute(async (req, res) => {
    const user = (req as MpAuthenticatedRequest).mpUser;
    const fileKey = nonEmpty(req.body?.fileKey);
    if (!ownedStoryReference(fileKey, user.id)) {
      badRequest(res, "只能删除当前用户自己的临时参考图");
      return;
    }
    await deps.storageDelete(fileKey);
    console.info("[story.reference-image.release]", { userId: user.id, deleted: true });
    res.json({ deleted: true });
  }));

  router.post("/story/release-assets", asyncRoute(async (req, res) => {
    const user = (req as MpAuthenticatedRequest).mpUser;
    const rawFileKeys = req.body?.fileKeys;
    if (!Array.isArray(rawFileKeys) || rawFileKeys.length < 1 || rawFileKeys.length > 16) {
      badRequest(res, "故事资源列表无效");
      return;
    }
    const ownedStoryFile = new RegExp(`^(?:stories|stories-audio)/${user.id}/[A-Za-z0-9][A-Za-z0-9._-]*$`);
    const fileKeys = Array.from(new Set(rawFileKeys.map(nonEmpty)));
    if (fileKeys.length < 1 || fileKeys.some((fileKey) => !ownedStoryFile.test(fileKey))) {
      badRequest(res, "只能释放当前用户自己的故事资源");
      return;
    }
    const startedAt = Date.now();
    const retainedFileKeys: string[] = [];
    const deletableFileKeys: string[] = [];
    for (const fileKey of fileKeys) {
      if (deps.contentSecurityMode === "wechat" && fileKey.startsWith(`stories/${user.id}/`)) {
        const task = await deps.findMediaCheckTaskByFile(user.id, fileKey);
        if (task?.status === "pending") {
          retainedFileKeys.push(fileKey);
          continue;
        }
      }
      deletableFileKeys.push(fileKey);
    }
    await Promise.all(deletableFileKeys.map((fileKey) => deps.storageDelete(fileKey)));
    console.info("[story.release-assets]", {
      userId: user.id,
      fileCount: deletableFileKeys.length,
      retainedCount: retainedFileKeys.length,
      durationMs: Math.max(0, Date.now() - startedAt),
    });
    res.json({
      deleted: deletableFileKeys.length,
      ...(retainedFileKeys.length ? { retainedFileKeys } : {}),
    });
  }));

  router.post("/story/suggest-topics", asyncRoute(async (req, res) => {
    const theme = nonEmpty(req.body?.theme);
    const childName = nonEmpty(req.body?.childName);
    const age = Number(req.body?.age ?? 6);
    const customProtagonist = nonEmpty(req.body?.customProtagonist) || undefined;
    const excludeTitles = topicExclusions(req.body?.excludeTitles);
    if (excludeTitles === undefined) {
      badRequest(res, "历史题材列表无效");
      return;
    }
    if (!theme || !Number.isInteger(age) || age < 1 || age > 12) {
      badRequest(res, "请选择故事主题并填写 1 至 12 岁的年龄");
      return;
    }
    const character = childName ? `名叫${childName}的${age}岁孩子` : `一个${age}岁的小朋友`;
    const topics = await deps.suggestStoryTopics({ theme, character, customProtagonist, excludeTitles });
    res.json({ topics: topics.slice(0, 4) });
  }));

  router.post("/story/structure", asyncRoute(async (req, res) => {
    const theme = nonEmpty(req.body?.theme);
    const topic = nonEmpty(req.body?.topic);
    const childName = nonEmpty(req.body?.childName);
    const protagonist = nonEmpty(req.body?.protagonist);
    const age = Number(req.body?.age ?? 6);
    if (!theme || !topic || !Number.isInteger(age) || age < 1 || age > 12) {
      badRequest(res, "故事主题、题材或年龄无效");
      return;
    }
    const user = (req as MpAuthenticatedRequest).mpUser;
    const charged = await deps.withCreditCharge(
      user.id,
      1,
      "story_structure",
      async () => {
        const story = await deps.generateStoryText({
          age,
          theme,
          topic,
          character: childName || protagonist || "小朋友",
        });
        if (!isFourPageStory(story)) throw new Error("故事结构必须包含四页");
        return story;
      },
      "AI故事构思",
    );
    res.json({ ...charged.value, credits: charged.credits });
  }));

  router.post("/story/page-image", asyncRoute(async (req, res) => {
    const imagePrompt = nonEmpty(req.body?.imagePrompt);
    const pageNumber = Number(req.body?.pageNumber);
    if (!imagePrompt || !Number.isInteger(pageNumber) || pageNumber < 1 || pageNumber > 4) {
      badRequest(res, "故事页码或配图描述无效");
      return;
    }
    const user = (req as MpAuthenticatedRequest).mpUser;
    const referenceFileKey = nonEmpty(req.body?.referenceFileKey);
    const reference = referenceFileKey
      ? await resolveStoryReference(referenceFileKey, user)
      : undefined;
    if (referenceFileKey && !reference) {
      badRequest(res, "请选择当前账号已上传且通过安全登记的故事参考图");
      return;
    }
    const startedAt = Date.now();
    let success = false;
    try {
      const base64 = await deps.aiGenerateImage({
        prompt: buildStoryImagePrompt(imagePrompt, pageNumber, { hasChildReference: Boolean(reference) }),
        aspectRatio: "1:1",
        profile: "story",
        ...(reference ? { referenceImageUrl: reference.url } : {}),
      });
      const file = await deps.storagePut(
        `stories/${user.id}/${deps.createFileId()}-p${pageNumber}.png`,
        Buffer.from(base64, "base64"),
        "image/png",
      );
      const securityStatus = await submitStoredImage(file, user);
      success = true;
      res.json({ imageUrl: file.url, fileKey: file.key, pageNumber, securityStatus });
    } finally {
      console.info("[story.page-image]", {
        pageNumber,
        hasReferenceImage: Boolean(reference),
        durationMs: Math.max(0, Date.now() - startedAt),
        success,
      });
    }
  }));

  router.post("/story/page-speech", asyncRoute(async (req, res) => {
    const pageNumber = Number(req.body?.pageNumber);
    const text = nonEmpty(req.body?.text);
    const title = nonEmpty(req.body?.title);
    const voiceType = nonEmpty(req.body?.voiceType) || "lively";
    const isFirstPage = req.body?.isFirstPage === true;
    if (!text || !Number.isInteger(pageNumber) || pageNumber < 1 || pageNumber > 4) {
      badRequest(res, "故事页码或朗读文字无效");
      return;
    }
    const user = (req as MpAuthenticatedRequest).mpUser;
    const generateSpeech = async () => {
      const textToSpeak = isFirstPage && title ? `${title}。${text}` : text;
      const audio = await deps.aiTTS(textToSpeak, voiceType);
      const extension = audio.audioMime.includes("wav") ? "wav" : audio.audioMime.includes("mpeg") ? "mp3" : "audio";
      const file = await deps.storagePut(
        `stories-audio/${user.id}/${deps.createFileId()}-p${pageNumber}.${extension}`,
        Buffer.from(audio.audioData, "base64"),
        audio.audioMime,
      );
      return { audioUrl: file.url, fileKey: file.key, pageNumber };
    };
    if (!isFirstPage) {
      res.json(await generateSpeech());
      return;
    }
    const charged = await deps.withCreditCharge(user.id, 2, "story_speech", generateSpeech, "AI故事语音生成");
    res.json({ ...charged.value, credits: charged.credits });
  }));

  router.post("/life/dish-analyze", asyncRoute(async (req, res) => {
    const user = (req as MpAuthenticatedRequest).mpUser;
    const dishText = nonEmpty(req.body?.dishText);
    const fileKey = nonEmpty(req.body?.fileKey);
    if (Boolean(dishText) === Boolean(fileKey)) {
      badRequest(res, "请输入菜名或分享内容，或者选择一张菜品图片");
      return;
    }
    if (dishText.length > 1000) {
      badRequest(res, "菜名或分享内容不能超过 1000 字");
      return;
    }

    let dishName: string | undefined;
    let ingredients: Awaited<ReturnType<typeof deps.inspectDishImage>>["ingredients"] | undefined;
    let source: StoredFile | undefined;
    if (dishText) {
      const inputCheck = await checkTextBatches([dishText], user.openId);
      if (!inputCheck.safe) {
        res.status(422).json({
          error: { code: "CONTENT_REJECTED", message: inputCheck.reason ?? "输入内容未通过安全检查" },
        });
        return;
      }
      dishName = await deps.extractDishName(dishText);
      if (!dishName) {
        const metadata = await deps.fetchDouyinPublicMetadata(dishText);
        if (metadata) dishName = await deps.extractDishName(metadata);
      }
    } else {
      source = await resolveOwnedImage(fileKey, user);
      if (!source) {
        badRequest(res, "请选择当前账号已上传且通过安全登记的菜品图片");
        return;
      }
      const inspection = await deps.inspectDishImage(source.url);
      dishName = inspection.dishName;
      ingredients = inspection.ingredients;
    }

    if (!dishName) {
      res.json({
        code: "DISH_NOT_FOUND",
        message: "没认出这道菜，请说一下菜名，或拍张照片",
        credits: await deps.getCredits(user.id),
      });
      return;
    }

    const charged = await deps.withCreditCharge(
      user.id,
      1,
      "life_dish_analyze",
      async () => {
        const nutritionPromise = deps.analyzeDishNutrition({ dishName, ingredients });
        const imagePromise = source
          ? Promise.resolve(undefined)
          : deps.generateFoodImage(dishName);
        const [nutritionResult, imageResult] = await Promise.allSettled([nutritionPromise, imagePromise]);
        if (nutritionResult.status === "rejected") throw nutritionResult.reason;

        let imageUrl = source?.url;
        let imageSource: "generated" | "upload" | "none" = source ? "upload" : "none";
        let securityStatus: "bypassed" | "pending" | undefined;
        if (!source && imageResult.status === "fulfilled" && imageResult.value) {
          try {
            const imageMatch = imageResult.value.match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/);
            if (imageMatch) {
              const mimeType = imageMatch[1];
              const extension = mimeType === "image/png" ? "png" : mimeType === "image/webp" ? "webp" : "jpg";
              const file = await deps.storagePut(
                `life-food/${user.id}/${deps.createFileId()}.${extension}`,
                Buffer.from(imageMatch[2], "base64"),
                mimeType,
              );
              securityStatus = await submitStoredImage(file, user);
              imageUrl = file.url;
              imageSource = "generated";
            }
          } catch {
            imageUrl = undefined;
            imageSource = "none";
            securityStatus = undefined;
          }
        }
        return {
          code: "OK" as const,
          ...nutritionResult.value,
          imageUrl,
          imageSource,
          ...(securityStatus ? { securityStatus } : {}),
        };
      },
      "生活助手：菜品健康分析",
    );
    res.json({ ...charged.value, credits: charged.credits });
  }));

  router.post("/life/recipe", asyncRoute(async (req, res) => {
    const foodName = nonEmpty(req.body?.foodName);
    if (!foodName || foodName.length > 80) {
      badRequest(res, "请输入 80 字以内的菜名");
      return;
    }
    const user = (req as MpAuthenticatedRequest).mpUser;
    const charged = await deps.withCreditCharge(
      user.id,
      1,
      "life_recipe",
      async () => {
        const [nutrition, imageDataUrl] = await Promise.all([
          deps.analyzeFoodNutrition(foodName),
          deps.generateFoodImage(foodName),
        ]);
        const imageMatch = imageDataUrl.match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/);
        if (!imageMatch) throw new Error("菜品图片格式无效");
        const mimeType = imageMatch[1];
        const extension = mimeType === "image/png" ? "png" : mimeType === "image/webp" ? "webp" : "jpg";
        const file = await deps.storagePut(
          `life-food/${user.id}/${deps.createFileId()}.${extension}`,
          Buffer.from(imageMatch[2], "base64"),
          mimeType,
        );
        const securityStatus = await submitStoredImage(file, user);
        return {
          title: nutrition.name,
          description: nutrition.summary,
          tags: nutrition.tags,
          healthyScore: nutrition.healthScore,
          nutrition: {
            calories: nutrition.calories,
            protein: nutrition.protein,
            fat: nutrition.fat,
            carbs: nutrition.carbs,
            sodium: nutrition.sodium,
            sugar: nutrition.sugar,
          },
          details: nutrition.ingredients,
          advice: nutrition.advice,
          imageUrl: file.url,
          fileKey: file.key,
          securityStatus,
        };
      },
      "生活助手：查菜谱",
    );
    res.json({ ...charged.value, credits: charged.credits });
  }));

  router.post("/life/identify", asyncRoute(async (req, res) => {
    const user = (req as MpAuthenticatedRequest).mpUser;
    const fileKey = nonEmpty(req.body?.sourceFileKey);
    const source = await resolveOwnedImage(fileKey, user);
    if (!source) {
      badRequest(res, "请选择当前账号已上传且通过安全登记的植物图片");
      return;
    }
    const startedAt = Date.now();
    let provider: string | undefined;
    let model: string | undefined;
    let fallbackUsed: boolean | undefined;
    let success = false;
    try {
      const charged = await deps.withCreditCharge(
        user.id,
        1,
        "life_identify",
        () => deps.identifyPlantFast(source.url),
        "生活助手：识花草",
      );
      provider = charged.value.provider;
      model = charged.value.model;
      fallbackUsed = charged.value.fallbackUsed;
      success = true;
      res.json({
        ...charged.value,
        title: charged.value.name,
        description: charged.value.summary,
        tags: [],
        details: [],
        credits: charged.credits,
      });
    } finally {
      console.info("[life.plant-identify]", {
        userId: user.id,
        provider,
        model,
        fallbackUsed,
        durationMs: Math.max(0, Date.now() - startedAt),
        success,
      });
    }
  }));

  router.post("/life/plant-details", asyncRoute(async (req, res) => {
    const plantName = nonEmpty(req.body?.plantName);
    if (!plantName || plantName.length > 80) {
      badRequest(res, "请输入 80 字以内的植物名称");
      return;
    }
    res.json(await deps.getPlantDetails(plantName));
  }));

  router.post("/life/health", asyncRoute(async (req, res) => {
    const user = (req as MpAuthenticatedRequest).mpUser;
    const textHint = nonEmpty(req.body?.textHint) || undefined;
    const fileKey = nonEmpty(req.body?.sourceFileKey);
    const source = fileKey ? await resolveOwnedImage(fileKey, user) : undefined;
    if ((!textHint && !fileKey) || (fileKey && !source)) {
      badRequest(res, fileKey ? "请选择当前账号已上传且通过安全登记的图片" : "请输入想了解的生活健康常识或选择图片");
      return;
    }
    const charged = await deps.withCreditCharge(
      user.id,
      1,
      "life_health",
      () => deps.queryHealthInfo({ textHint, imageUrl: source?.url }),
      "生活助手：健康百科",
    );
    res.json({ ...charged.value, credits: charged.credits });
  }));

  router.post("/chat", asyncRoute(async (req, res) => {
    const message = nonEmpty(req.body?.message);
    const historyInput = req.body?.history;
    if (!message || message.length > 500 || !Array.isArray(historyInput) || historyInput.length > 20) {
      badRequest(res, "请输入 500 字以内的问题，对话历史不能超过 20 轮");
      return;
    }
    const history = historyInput.map((item: unknown) => {
      if (!item || typeof item !== "object") return undefined;
      const role = (item as { role?: unknown }).role;
      const content = nonEmpty((item as { content?: unknown }).content);
      if ((role !== "user" && role !== "assistant") || !content || content.length > 500) return undefined;
      return { role, content };
    });
    if (history.some((item) => !item)) {
      badRequest(res, "对话历史格式无效");
      return;
    }
    const safeHistory = history.slice(-12) as Array<{ role: "user" | "assistant"; content: string }>;
    const user = (req as MpAuthenticatedRequest).mpUser;
    const inputCheck = await checkTextBatches([message], user.openId);
    if (!inputCheck.safe) {
      res.status(422).json({ error: { code: "CONTENT_REJECTED", message: inputCheck.reason ?? "输入内容未通过安全检查" } });
      return;
    }

    if (safeHistory.length > 0) {
      const historyCheck = await checkTextBatches(
        safeHistory.map((item) => `${item.role === "user" ? "用户" : "助手"}：${item.content}`),
        user.openId,
      );
      if (!historyCheck.safe) {
        res.status(422).json({ error: { code: "CONTENT_REJECTED", message: historyCheck.reason ?? "对话历史未通过安全检查" } });
        return;
      }
    }

    const historyHitsRedLine = safeHistory.some((item) => (
      blocksChatInput(item.content) || blocksChatOutput(item.content)
    ));
    if (blocksChatInput(message) || historyHitsRedLine) {
      const reply = appendChatDisclaimer(CHAT_MEDICAL_GUIDANCE);
      const outputCheck = await checkTextBatches([reply], user.openId);
      if (!outputCheck.safe) {
        res.status(422).json({ error: { code: "CONTENT_REJECTED", message: outputCheck.reason ?? "回复内容未通过安全检查" } });
        return;
      }
      res.json({ reply, credits: user.credits, guarded: true });
      return;
    }

    try {
      const charged = await deps.withCreditCharge(
        user.id,
        1,
        "life_chat",
        async () => {
          const generated = await deps.aiChatMulti({
            systemPrompt: CHAT_SYSTEM_PROMPT,
            history: safeHistory,
            message,
          });
          if (blocksChatOutput(generated)) throw new ChatOutputBlockedError();
          const reply = appendChatDisclaimer(generated);
          const outputCheck = await checkTextBatches([reply], user.openId);
          if (!outputCheck.safe) throw new ChatContentRejectedError(outputCheck.reason ?? "回复内容未通过安全检查");
          return reply;
        },
        "AI万花筒",
      );
      res.json({ reply: charged.value, credits: charged.credits, guarded: false });
    } catch (error) {
      if (error instanceof ChatOutputBlockedError) {
        const reply = appendChatDisclaimer(CHAT_MEDICAL_GUIDANCE);
        const outputCheck = await checkTextBatches([reply], user.openId);
        if (!outputCheck.safe) {
          res.status(422).json({ error: { code: "CONTENT_REJECTED", message: outputCheck.reason ?? "回复内容未通过安全检查" } });
          return;
        }
        res.json({ reply, credits: await deps.getCredits(user.id), guarded: true });
        return;
      }
      if (error instanceof ChatContentRejectedError) {
        res.status(422).json({ error: { code: "CONTENT_REJECTED", message: error.message } });
        return;
      }
      throw error;
    }
  }));

  router.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (sendMpTimeoutError(error, res)) return;
    if (error instanceof Error && error.message.includes("积分不足")) {
      res.status(402).json({ error: { code: "INSUFFICIENT_CREDITS", message: error.message } });
      return;
    }
    res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "服务暂时不可用，请稍后重试" } });
  });

  return router;
}

function isFourPageStory(story: StoryResult): boolean {
  return story.pages.length === 4 && story.pages.every((page, index) => (
    page.pageNumber === index + 1 && Boolean(page.text.trim()) && Boolean(page.imagePrompt.trim())
  ));
}

class ChatOutputBlockedError extends Error {}

class ChatContentRejectedError extends Error {}
