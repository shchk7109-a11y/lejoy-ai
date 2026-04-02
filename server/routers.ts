import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import * as db from "./db";
import * as ai from "./aiService";
import { transcribeAudio } from "./_core/voiceTranscription";
import { storagePut } from "./storage";
import { nanoid } from "nanoid";
import { getDevSystemModelConfig, getDevUserIfEnabled, mergeSystemModelConfigs } from "./_core/dev";

async function getRuntimeUser(userId: number, openId?: string | null) {
  return (await db.getUserById(userId)) ?? getDevUserIfEnabled(openId);
}

async function getRuntimeSystemModelConfig(configKey: string) {
  return (await db.getModelConfig(configKey)) ?? getDevSystemModelConfig(configKey);
}

// ─── Admin guard ─────────────────────────────────────────────
const adminProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN", message: "需要管理员权限" });
  return next({ ctx });
});

// ─── Points guard (check frozen + deduct) ────────────────────
const pointsGuardProcedure = protectedProcedure.use(async ({ ctx, next }) => {
  const user = await getRuntimeUser(ctx.user.id, ctx.user.openId);
  if (!user) throw new TRPCError({ code: "NOT_FOUND", message: "用户不存在" });
  if (user.isFrozen) throw new TRPCError({ code: "FORBIDDEN", message: "账号已被冻结" });
  const costStr = await db.getSetting("points_per_use");
  const cost = parseInt(costStr || "1", 10);
  if (user.points < cost) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "积分不足，请充值" });
  return next({ ctx: { ...ctx, pointsCost: cost } });
});

// ─── Helper: log API call with error safety ──────────────────
async function safeLogApiCall(userId: number, module: string, modelUsed: string | null, success: boolean, errorMessage?: string, durationMs?: number) {
  try {
    await db.logApiCall(userId, module, modelUsed, success, errorMessage, durationMs);
  } catch (e) {
    console.error("[ApiLog] Failed to write log:", e);
  }
}

// ─── Helper: timed AI call with logging ──────────────────────
async function withApiLog<T>(userId: number, module: string, model: string | null, fn: () => Promise<T>): Promise<T> {
  const start = Date.now();
  try {
    const result = await fn();
    await safeLogApiCall(userId, module, model, true, undefined, Date.now() - start);
    return result;
  } catch (err: any) {
    await safeLogApiCall(userId, module, model, false, err?.message || "Unknown error", Date.now() - start);
    throw err;
  }
}

type TtsDraftConfig = {
  modelName?: string;
  apiKey?: string;
  baseUrl?: string;
};

function normalizeDraftValue(value?: string | null): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

async function getResolvedUserTtsConfig(userId: number, overrides: TtsDraftConfig = {}) {
  const systemConfig = await getRuntimeSystemModelConfig("tts");
  const userConfig = await db.getUserApiConfig(userId, "tts");
  return {
    modelName: normalizeDraftValue(overrides.modelName)
      ?? normalizeDraftValue(userConfig?.modelName)
      ?? normalizeDraftValue(systemConfig?.modelName),
    apiKey: normalizeDraftValue(overrides.apiKey)
      ?? normalizeDraftValue(userConfig?.apiKey)
      ?? normalizeDraftValue(systemConfig?.apiKey)
      ?? "",
    baseUrl: normalizeDraftValue(overrides.baseUrl)
      ?? normalizeDraftValue(userConfig?.baseUrl)
      ?? normalizeDraftValue(systemConfig?.baseUrl)
      ?? "",
  };
}

async function getResolvedSystemTtsConfig(overrides: TtsDraftConfig = {}) {
  const systemConfig = await getRuntimeSystemModelConfig("tts");
  return {
    modelName: normalizeDraftValue(overrides.modelName)
      ?? normalizeDraftValue(systemConfig?.modelName),
    apiKey: normalizeDraftValue(overrides.apiKey)
      ?? normalizeDraftValue(systemConfig?.apiKey)
      ?? "",
    baseUrl: normalizeDraftValue(overrides.baseUrl)
      ?? normalizeDraftValue(systemConfig?.baseUrl)
      ?? "",
  };
}

const ttsHealthCheckInput = z.object({
  modelName: z.string().optional(),
  apiKey: z.string().optional(),
  baseUrl: z.string().optional(),
  sampleText: z.string().max(200).optional(),
  voiceType: z.string().optional(),
});

export const appRouter = router({
  system: systemRouter,

  auth: router({
    me: publicProcedure.query(async (opts) => {
      if (!opts.ctx.user) return null;
      const freshUser = await getRuntimeUser(opts.ctx.user.id, opts.ctx.user.openId);
      return freshUser || opts.ctx.user;
    }),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),

  // ─── Points ──────────────────────────────────────────────
  points: router({
    balance: protectedProcedure.query(async ({ ctx }) => {
      const user = await getRuntimeUser(ctx.user.id, ctx.user.openId);
      return { points: user?.points ?? 0 };
    }),
    history: protectedProcedure.query(async ({ ctx }) => {
      return db.getPointsHistory(ctx.user.id);
    }),
    recharge: protectedProcedure
      .input(z.object({ amount: z.number().min(1).max(10000) }))
      .mutation(async ({ ctx, input }) => {
        await db.updateUserPoints(ctx.user.id, input.amount);
        await db.addPointsLog(ctx.user.id, input.amount, "recharge", `充值${input.amount}积分`);
        return { success: true };
      }),
  }),

  // ─── Silver Lens (老摄影大师) ────────────────────────────
  silverLens: router({
    restore: pointsGuardProcedure
      .input(z.object({ imageBase64: z.string(), prompt: z.string().optional() }))
      .mutation(async ({ ctx, input }) => {
        await db.updateUserPoints(ctx.user.id, -(ctx as any).pointsCost);
        await db.addPointsLog(ctx.user.id, -(ctx as any).pointsCost, "consume", "老摄影大师-照片美化");
        const url = await withApiLog(ctx.user.id, "老摄影大师-照片美化", "image_generation", () =>
          ai.restorePhoto(input.imageBase64, input.prompt || "", ctx.user.id)
        );
        return { imageUrl: url };
      }),
    restoreOld: pointsGuardProcedure
      .input(z.object({ imageBase64: z.string() }))
      .mutation(async ({ ctx, input }) => {
        await db.updateUserPoints(ctx.user.id, -(ctx as any).pointsCost);
        await db.addPointsLog(ctx.user.id, -(ctx as any).pointsCost, "consume", "老摄影大师-老照片修复");
        const url = await withApiLog(ctx.user.id, "老摄影大师-老照片修复", "image_generation", () =>
          ai.restoreOldPhoto(input.imageBase64, ctx.user.id)
        );
        return { imageUrl: url };
      }),
    artTransform: pointsGuardProcedure
      .input(z.object({ imageBase64: z.string(), style: z.string() }))
      .mutation(async ({ ctx, input }) => {
        await db.updateUserPoints(ctx.user.id, -(ctx as any).pointsCost);
        await db.addPointsLog(ctx.user.id, -(ctx as any).pointsCost, "consume", "老摄影大师-艺术转换");
        const url = await withApiLog(ctx.user.id, "老摄影大师-艺术转换", "image_generation", () =>
          ai.transformPhotoToArt(input.imageBase64, input.style, ctx.user.id)
        );
        return { imageUrl: url };
      }),
  }),

  // ─── CopyWriter (暖心文案) ───────────────────────────────
  copywriter: router({
    generate: pointsGuardProcedure
      .input(z.object({
        scenario: z.string(), relationship: z.string(), recipientName: z.string(),
        tone: z.string(), specificHoliday: z.string().optional(), customContext: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        await db.updateUserPoints(ctx.user.id, -(ctx as any).pointsCost);
        await db.addPointsLog(ctx.user.id, -(ctx as any).pointsCost, "consume", "暖心文案");
        const wishes = await withApiLog(ctx.user.id, "暖心文案", "text_generation", () =>
          ai.generateWishes({
            ...input,
            specificHoliday: input.specificHoliday || "",
            customContext: input.customContext || "",
          }, ctx.user.id)
        );
        return { wishes };
      }),
  }),

  // ─── Story Time (AI故事会) ───────────────────────────────
  storyTime: router({
    generate: pointsGuardProcedure
      .input(z.object({
        childName: z.string().optional().default("小朋友"), age: z.string(), topic: z.string(),
        theme: z.string(), pageCount: z.number().min(4).max(8),
        voiceType: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        await db.updateUserPoints(ctx.user.id, -(ctx as any).pointsCost);
        await db.addPointsLog(ctx.user.id, -(ctx as any).pointsCost, "consume", "AI故事会");
        const structure = await withApiLog(ctx.user.id, "AI故事会-生成故事", "text_generation", () =>
          ai.generateStoryStructure({
            childName: input.childName,
            age: input.age,
            topic: input.topic,
            theme: input.theme,
            pageCount: input.pageCount,
          }, ctx.user.id)
        );
        return {
          title: structure.title,
          characterDescription: structure.characterDescription,
          pages: structure.pages,
        };
      }),

    generatePageImage: protectedProcedure
      .input(z.object({ imagePrompt: z.string() }))
      .mutation(async ({ ctx, input }) => {
        const url = await withApiLog(ctx.user.id, "AI故事会-生成插图", "image_generation", () =>
          ai.generateImage(input.imagePrompt, { userId: ctx.user.id })
        );
        return { imageUrl: url };
      }),

    generatePageAudio: protectedProcedure
      .input(z.object({ text: z.string(), voiceType: z.string().optional() }))
      .mutation(async ({ ctx, input }) => {
        const result = await withApiLog(ctx.user.id, "AI故事会-语音合成", "tts", () =>
          ai.generateSpeech(input.text, (input.voiceType as any) || "sweet", ctx.user.id)
        );
        return result;
      }),

    save: protectedProcedure
      .input(z.object({
        title: z.string(), characterName: z.string(), theme: z.string(),
        pageCount: z.number(), pages: z.any(),
      }))
      .mutation(async ({ ctx, input }) => {
        const id = await db.createStory(ctx.user.id, input);
        return { id };
      }),

    list: protectedProcedure.query(async ({ ctx }) => {
      return db.getUserStories(ctx.user.id);
    }),

    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        await db.deleteStory(input.id, ctx.user.id);
        return { success: true };
      }),
  }),

  // ─── Life Assistant (生活助手) ───────────────────────────
  lifeAssistant: router({
    analyze: pointsGuardProcedure
      .input(z.object({
        mode: z.enum(["FOOD", "PLANT", "HEALTH"]),
        textHint: z.string().optional(),
        imageBase64: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        await db.updateUserPoints(ctx.user.id, -(ctx as any).pointsCost);
        await db.addPointsLog(ctx.user.id, -(ctx as any).pointsCost, "consume", `生活助手-${input.mode}`);
        const resultText = await withApiLog(ctx.user.id, `生活助手-${input.mode}`, input.imageBase64 ? "image_processing" : "text_generation", () =>
          ai.analyzeContent(input.mode, input.textHint || "", input.imageBase64 || null, ctx.user.id)
        );
        const result = JSON.parse(ai.cleanJson(resultText));

        // For FOOD or HEALTH mode, generate a dish image if no user image was provided
        if ((input.mode === "FOOD" || input.mode === "HEALTH") && !input.imageBase64 && result.title) {
          try {
            const dishImageUrl = await withApiLog(ctx.user.id, "生活助手-菜品图片", "image_generation", () =>
              ai.generateImage(
                `A professional food photography of Chinese dish: ${result.title}. Beautifully plated, appetizing, warm lighting, top-down view, restaurant quality, high resolution.`,
                { userId: ctx.user.id }
              )
            );
            result.imageUrl = dishImageUrl;
          } catch (e) {
            console.warn("[LifeAssistant] Failed to generate dish image:", e);
            // Non-critical: continue without image
          }
        }

        return { result };
      }),
  }),

  // ─── AI Kaleidoscope (AI万花筒) ──────────────────────────
  chat: router({
    send: pointsGuardProcedure
      .input(z.object({
        conversationId: z.number().optional(),
        message: z.string(),
        imageBase64: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        let convId = input.conversationId;

        // Create new conversation if needed
        if (!convId) {
          convId = await db.createConversation(ctx.user.id, input.message.slice(0, 50));
        }

        // Get history
        const messages = convId ? await db.getConversationMessages(convId) : [];
        const history = messages.map(m => ({ role: m.role, content: m.content }));

        // Save user message
        let imageUrl: string | undefined;
        if (input.imageBase64) {
          const buffer = Buffer.from(input.imageBase64.replace(/^data:[^;]+;base64,/, ""), "base64");
          const result = await storagePut(`chat-images/${nanoid()}.jpg`, buffer, "image/jpeg");
          imageUrl = result.url;
        }
        await db.addChatMessage(convId!, "user", input.message, imageUrl);

        // Deduct points
        await db.updateUserPoints(ctx.user.id, -(ctx as any).pointsCost);
        await db.addPointsLog(ctx.user.id, -(ctx as any).pointsCost, "consume", "AI万花筒");

        // Get AI response with logging
        const response = await withApiLog(ctx.user.id, "AI万花筒", "text_generation", () =>
          ai.chatWithAI(input.message, input.imageBase64 || null, history, ctx.user.id)
        );
        await db.addChatMessage(convId!, "assistant", response);

        return { conversationId: convId, response };
      }),

    conversations: protectedProcedure.query(async ({ ctx }) => {
      return db.getUserConversations(ctx.user.id);
    }),

    messages: protectedProcedure
      .input(z.object({ conversationId: z.number() }))
      .query(async ({ ctx, input }) => {
        return db.getConversationMessages(input.conversationId);
      }),

    deleteConversation: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        await db.deleteConversation(input.id, ctx.user.id);
        return { success: true };
      }),
  }),

  // ─── Voice transcription ─────────────────────────────────
  voice: router({
    transcribe: protectedProcedure
      .input(z.object({ audioUrl: z.string(), language: z.string().optional() }))
      .mutation(async ({ ctx, input }) => {
        const result = await withApiLog(ctx.user.id, "语音转写", "whisper", async () => {
          const r = await transcribeAudio({
            audioUrl: input.audioUrl,
            language: input.language || "zh",
          });
          if ("error" in r) {
            const detail = (r as any).details ? `: ${(r as any).details}` : "";
            console.error(`[语音转写] ${r.error}${detail}`);
            throw new Error(`语音识别失败，请重试。${detail ? `(${(r as any).code || "错误"})` : ""}`);
          }
          return r;
        });
        return { text: result.text };
      }),

    upload: protectedProcedure
      .input(z.object({ audioBase64: z.string(), mimeType: z.string().optional() }))
      .mutation(async ({ input }) => {
        const ext = input.mimeType?.includes("webm") ? "webm" : "mp3";
        const buffer = Buffer.from(input.audioBase64.replace(/^data:[^;]+;base64,/, ""), "base64");
        const { url } = await storagePut(`voice/${nanoid()}.${ext}`, buffer, input.mimeType || "audio/webm");
        return { url };
      }),
  }),

  // ─── User API Config ─────────────────────────────────────
  apiConfig: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      const configs = await db.getUserApiConfigs(ctx.user.id);
      const systemConfigs = mergeSystemModelConfigs(await db.getAllModelConfigs(), { maskApiKey: true });
      return { userConfigs: configs, systemConfigs };
    }),
    save: protectedProcedure
      .input(z.object({
        configKey: z.string(),
        modelName: z.string().optional(),
        apiKey: z.string().optional(),
        baseUrl: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        if (!(await db.getDb())) {
          throw new TRPCError({ code: "PRECONDITION_FAILED", message: "当前未连接数据库。开发模式请直接修改根目录 .env.local 中的 DEV_* 模型变量。" });
        }
        await db.upsertUserApiConfig(ctx.user.id, input.configKey, {
          modelName: input.modelName,
          apiKey: input.apiKey,
          baseUrl: input.baseUrl,
        });
        return { success: true };
      }),
    testTts: protectedProcedure
      .input(ttsHealthCheckInput)
      .mutation(async ({ ctx, input }) => {
        const config = await getResolvedUserTtsConfig(ctx.user.id, input);
        return withApiLog(ctx.user.id, "模型设置-TTS检测", "tts-health-check", () =>
          ai.testTtsConfigHealth(config, {
            sampleText: input.sampleText,
            voiceType: (input.voiceType as any) || "grandma",
          })
        );
      }),
  }),

  // ─── Admin ───────────────────────────────────────────────
  admin: router({
    users: adminProcedure.query(async () => {
      return db.getAllUsers();
    }),

    giftPoints: adminProcedure
      .input(z.object({ userId: z.number(), amount: z.number().min(1) }))
      .mutation(async ({ ctx, input }) => {
        await db.updateUserPoints(input.userId, input.amount);
        await db.addPointsLog(input.userId, input.amount, "gift", `管理员赠送${input.amount}积分`, ctx.user.id);
        return { success: true };
      }),

    freezeUser: adminProcedure
      .input(z.object({ userId: z.number(), frozen: z.boolean() }))
      .mutation(async ({ input }) => {
        await db.setUserFrozen(input.userId, input.frozen);
        return { success: true };
      }),

    // Model config management
    modelConfigs: adminProcedure.query(async () => {
      return mergeSystemModelConfigs(await db.getAllModelConfigs(), { maskApiKey: true });
    }),

    saveModelConfig: adminProcedure
      .input(z.object({
        configKey: z.string(), label: z.string(), provider: z.string(),
        modelName: z.string(), apiKey: z.string().optional(), baseUrl: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        if (!(await db.getDb())) {
          throw new TRPCError({ code: "PRECONDITION_FAILED", message: "当前未连接数据库。开发模式请直接修改根目录 .env.local 中的 DEV_* 模型变量。" });
        }
        await db.upsertModelConfig(input);
        return { success: true };
      }),

    deleteModelConfig: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        await db.deleteModelConfig(input.id);
        return { success: true };
      }),

    testTts: adminProcedure
      .input(ttsHealthCheckInput)
      .mutation(async ({ ctx, input }) => {
        const config = await getResolvedSystemTtsConfig(input);
        return withApiLog(ctx.user.id, "管理后台-TTS检测", "tts-health-check", () =>
          ai.testTtsConfigHealth(config, {
            sampleText: input.sampleText,
            voiceType: (input.voiceType as any) || "grandma",
          })
        );
      }),

    // System settings
    settings: adminProcedure.query(async () => {
      const defaultPoints = await db.getSetting("default_points");
      const pointsPerUse = await db.getSetting("points_per_use");
      const rechargeRatio = await db.getSetting("recharge_ratio");
      return { defaultPoints, pointsPerUse, rechargeRatio };
    }),

    saveSetting: adminProcedure
      .input(z.object({ key: z.string(), value: z.string() }))
      .mutation(async ({ input }) => {
        await db.setSetting(input.key, input.value);
        return { success: true };
      }),

    // System monitoring
    apiStats: adminProcedure
      .input(z.object({ days: z.number().min(1).max(90).optional() }).optional())
      .query(async ({ input }) => {
        return db.getApiCallStats(input?.days || 7);
      }),
  }),
});

export type AppRouter = typeof appRouter;
