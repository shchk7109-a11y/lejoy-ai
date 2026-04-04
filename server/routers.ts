import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import {
  getAllUsers, getUserById, rechargeCredits, consumeCredits,
  getUserTransactions, getAllAiModels, updateAiModel, upsertAiModel,
  getCustomerInfo, upsertCustomerInfo, getAllCustomerInfo, recordRegisterBonus,
} from "./db";
import { callGeminiText, callGeminiImage, callGeminiTTS, cleanJson } from "./geminiService";
import { analyzeFoodNutrition, generateFoodImage, identifyPlant, queryHealthInfo, invokeMiniMaxImage, invokeMiniMaxTTS, generateStoryText, suggestStoryTopics } from "./minimaxService";
import { storagePut } from "./storage";
import { transcribeAudio } from "./_core/voiceTranscription";
import { ENV } from "./_core/env";

// ─── 管理员权限中间件 ──────────────────────────────────────────────────────────
const adminProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN", message: "需要管理员权限" });
  return next({ ctx });
});

// ─── 积分消耗配置 ──────────────────────────────────────────────────────────────
const CREDIT_COSTS = {
  photo_restore: 2,
  art_transform: 2,
  wish_generate: 1,
  story_generate: 3,
  life_analyze: 1,
  chat: 1,
};

export const appRouter = router({
  system: systemRouter,

  auth: router({
    me: publicProcedure.query(async (opts) => {
      if (!opts.ctx.user) return null;
      await recordRegisterBonus(opts.ctx.user.id, opts.ctx.user.credits);
      return opts.ctx.user;
    }),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),

  credits: router({
    balance: protectedProcedure.query(async ({ ctx }) => {
      const user = await getUserById(ctx.user.id);
      return { credits: user?.credits ?? 0 };
    }),
    history: protectedProcedure.query(async ({ ctx }) => {
      return getUserTransactions(ctx.user.id);
    }),
  }),

  admin: router({
    users: adminProcedure.query(async () => {
      const userList = await getAllUsers();
      const customerInfoList = await getAllCustomerInfo();
      const infoMap = new Map(customerInfoList.map((c) => [c.userId, c]));
      return userList.map((u) => ({ ...u, customerInfo: infoMap.get(u.id) }));
    }),

    rechargeCredits: adminProcedure
      .input(z.object({ userId: z.number(), amount: z.number().min(1).max(10000), description: z.string().optional() }))
      .mutation(async ({ input }) => {
        const newBalance = await rechargeCredits(input.userId, input.amount, input.description ?? "管理员充值");
        return { success: true, newBalance };
      }),

    getModels: adminProcedure.query(async () => getAllAiModels()),

    updateModel: adminProcedure
      .input(z.object({ id: z.number(), displayName: z.string().optional(), apiKey: z.string().optional(), baseUrl: z.string().optional(), modelName: z.string().optional(), enabled: z.number().optional() }))
      .mutation(async ({ input }) => {
        const { id, ...data } = input;
        await updateAiModel(id, data);
        return { success: true };
      }),

    initModels: adminProcedure.mutation(async () => {
      const defaults = [
        { name: "gemini-text", displayName: "文本生成模型", apiKey: ENV.geminiTextApiKey, baseUrl: ENV.geminiBaseUrl, modelName: ENV.geminiTextModel, enabled: 1 },
        { name: "gemini-image", displayName: "图像生成模型", apiKey: ENV.geminiImageApiKey, baseUrl: ENV.geminiBaseUrl, modelName: ENV.geminiImageModel, enabled: 1 },
        { name: "gemini-tts", displayName: "语音合成模型", apiKey: ENV.geminiTtsApiKey, baseUrl: ENV.geminiBaseUrl, modelName: ENV.geminiTtsModel, enabled: 1 },
      ];
      for (const m of defaults) await upsertAiModel(m);
      return { success: true };
    }),

    upsertCustomerInfo: adminProcedure
      .input(z.object({ userId: z.number(), wechatId: z.string().optional(), phone: z.string().optional(), notes: z.string().optional(), tags: z.string().optional() }))
      .mutation(async ({ input }) => { await upsertCustomerInfo(input); return { success: true }; }),

    getUserTransactions: adminProcedure
      .input(z.object({ userId: z.number() }))
      .query(async ({ input }) => getUserTransactions(input.userId)),
  }),

  upload: router({
    image: protectedProcedure
      .input(z.object({ base64: z.string(), mimeType: z.string().default("image/jpeg") }))
      .mutation(async ({ input, ctx }) => {
        const data = input.base64.replace(/^data:.*?;base64,/, "");
        const buffer = Buffer.from(data, "base64");
        const ext = input.mimeType.split("/")[1] ?? "jpg";
        const key = `uploads/${ctx.user.id}/${Date.now()}.${ext}`;
        const { url } = await storagePut(key, buffer, input.mimeType);
        return { url };
      }),
  }),

  stt: router({
    transcribe: protectedProcedure
      .input(z.object({ audioUrl: z.string(), language: z.string().default("zh") }))
      .mutation(async ({ input }) => {
        const result = await transcribeAudio({ audioUrl: input.audioUrl, language: input.language });
        if ("error" in result) throw new Error(result.error);
        return { text: result.text };
      }),
  }),

  silverLens: router({
    restorePhoto: protectedProcedure
      .input(z.object({ imageUrl: z.string(), prompt: z.string().optional() }))
      .mutation(async ({ input, ctx }) => {
        await consumeCredits(ctx.user.id, CREDIT_COSTS.photo_restore, "photo_restore", "照片修复");
        const promptText = input.prompt
          ? `Edit this photo: ${input.prompt}. Keep the result natural and high quality.`
          : "Improve clarity, lighting, and color balance. Restore damaged or faded areas. Make it look like a professional photo restoration.";
        const imageResp = await fetch(input.imageUrl);
        const base64 = Buffer.from(await imageResp.arrayBuffer()).toString("base64");
        const mimeType = imageResp.headers.get("content-type") ?? "image/jpeg";
        const result = await callGeminiImage({ parts: [{ inlineData: { data: base64, mimeType } }, { text: promptText }] });
        const resultData = result.replace(/^data:.*?;base64,/, "");
        const { url } = await storagePut(`results/${ctx.user.id}/${Date.now()}.png`, Buffer.from(resultData, "base64"), "image/png");
        return { imageUrl: url };
      }),

    transformArt: protectedProcedure
      .input(z.object({ imageUrl: z.string(), style: z.string() }))
      .mutation(async ({ input, ctx }) => {
        await consumeCredits(ctx.user.id, CREDIT_COSTS.art_transform, "art_transform", `艺术风格：${input.style}`);
        const stylePrompts: Record<string, string> = {
          "油画": "Transform this photo into a masterpiece oil painting with rich textures, deep colors, and visible brushstrokes.",
          "水彩": "Transform this photo into a beautiful watercolor painting with soft washes of color and dreamy quality.",
          "素描": "Transform this photo into a detailed pencil sketch with fine lines and careful attention to light and shadow.",
          "水墨画": "Transform this photo into a traditional Chinese ink wash painting with elegant brushstrokes and poetic atmosphere.",
          "印象派": "Transform this photo into an impressionist painting with loose, vibrant brushstrokes in the style of Monet.",
        };
        const stylePrompt = stylePrompts[input.style] ?? `Transform this photo into ${input.style} art style.`;
        const imageResp = await fetch(input.imageUrl);
        const base64 = Buffer.from(await imageResp.arrayBuffer()).toString("base64");
        const mimeType = imageResp.headers.get("content-type") ?? "image/jpeg";
        const result = await callGeminiImage({ parts: [{ inlineData: { data: base64, mimeType } }, { text: stylePrompt }] });
        const resultData = result.replace(/^data:.*?;base64,/, "");
        const { url } = await storagePut(`results/${ctx.user.id}/${Date.now()}.png`, Buffer.from(resultData, "base64"), "image/png");
        return { imageUrl: url };
      }),
  }),

  copywriter: router({
    generate: protectedProcedure
      .input(z.object({ scenario: z.string(), relationship: z.string(), recipientName: z.string().optional(), tone: z.string(), specificHoliday: z.string().optional(), customContext: z.string().optional() }))
      .mutation(async ({ input, ctx }) => {
        await consumeCredits(ctx.user.id, CREDIT_COSTS.wish_generate, "wish_generate", "暖心文案");
        const prompt = `请作为情感细腻的中文文案专家，生成3条不同的祝福语。场景:${input.scenario} 对象:${input.relationship} 收信人:${input.recipientName ?? "对方"} 风格:${input.tone} 节日:${input.specificHoliday ?? "无"} 补充:${input.customContext ?? "无"}。要求：中文，温暖亲切，适合中老年人，每条100字以内。返回JSON数组，只含3个字符串。`;
        const text = await callGeminiText({ contents: [{ text: prompt }], responseMimeType: "application/json", responseSchema: { type: "ARRAY", items: { type: "STRING" } } });
        const wishes = JSON.parse(cleanJson(text));
        return { wishes: Array.isArray(wishes) ? wishes : [text] };
      }),
  }),

  storyTime: router({
    // Step 0: AI推荐故事题材（不扣积分）
    suggestTopics: protectedProcedure
      .input(z.object({
        theme: z.string(),
        childName: z.string().optional(),
        age: z.number().min(1).max(12).optional(),
        customProtagonist: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        const character = input.childName
          ? `名叫${input.childName}的${input.age ?? 6}岁孩子`
          : `一个${input.age ?? 6}岁的小朋友`;
        return await suggestStoryTopics({
          theme: input.theme,
          character,
          customProtagonist: input.customProtagonist,
        });
      }),

    // Step 1: 生成故事文本结构（扣1积分，预览用）
    generateStoryStructure: protectedProcedure
      .input(z.object({
        childName: z.string().optional(),
        age: z.number().min(1).max(12).default(6),
        theme: z.string(),
        topic: z.string(),
        protagonist: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        await consumeCredits(ctx.user.id, 1, "story_structure", "AI故事构思");
        const character = input.childName || input.protagonist || "小朋友";
        return await generateStoryText({
          age: input.age,
          theme: input.theme,
          topic: input.topic,
          character,
        });
      }),

    // Step 2: 生成单页配图（前端并行调用）
    generatePageImage: protectedProcedure
      .input(z.object({ imagePrompt: z.string(), pageNumber: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const base64 = await invokeMiniMaxImage({
          prompt: `Children's book illustration, warm cute style, colorful, soft lighting, friendly characters. Page ${input.pageNumber}: ${input.imagePrompt}`,
          aspectRatio: "1:1"
        });
        const { url } = await storagePut(`stories/${ctx.user.id}/${Date.now()}-p${input.pageNumber}.png`, Buffer.from(base64, "base64"), "image/png");
        return { imageUrl: url, pageNumber: input.pageNumber };
      }),

    // Step 3: 逐页单独合成语音（前端逐页调用，实时更新进度）
    generatePageSpeech: protectedProcedure
      .input(z.object({
        pageNumber: z.number(),
        text: z.string(),
        voiceType: z.string().default("lively"),
        isFirstPage: z.boolean().default(false),
        title: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        // 只在第一页扭扣积分（整个故事只扭扣一次）
        if (input.isFirstPage) {
          await consumeCredits(ctx.user.id, 2, "story_speech", "AI故事语音生成");
        }
        // 第一页加上故事标题引入
        const textToSpeak = input.isFirstPage && input.title
          ? `${input.title}。${input.text}`
          : input.text;
        const { audioData, audioMime } = await invokeMiniMaxTTS(textToSpeak, input.voiceType);
        // 将MIME类型和base64一起返回，前端用于正确播放
        return { audioBase64: audioData, audioMime, pageNumber: input.pageNumber };
      }),

    generateVideo: protectedProcedure
      .input(z.object({
        title: z.string(),
        pages: z.array(z.object({
          pageNumber: z.number(),
          imageUrl: z.string(),
          audioBase64: z.string(),
          audioMime: z.string(),
          text: z.string(),
        })),
      }))
      .mutation(async ({ input, ctx }) => {
        await consumeCredits(ctx.user.id, 2, "story_video", "AI故事视频生成");
        const { generateStoryVideo } = await import("./videoGenerator");
        const videoBuf = await generateStoryVideo(input.pages, input.title);
        const safeTitle = input.title.replace(/[^\w\u4e00-\u9fa5]/g, "_").slice(0, 20);
        const { url } = await storagePut(
          `story-videos/${ctx.user.id}/${safeTitle}-${Date.now()}.mp4`,
          videoBuf,
          "video/mp4"
        );
        return { videoUrl: url };
      }),
  }),

  lifeAssistant: router({
    analyze: protectedProcedure
      .input(z.object({ mode: z.enum(["FOOD", "HEALTH"]), textHint: z.string().optional(), imageUrl: z.string().optional() }))
      .mutation(async ({ input, ctx }) => {
        await consumeCredits(ctx.user.id, CREDIT_COSTS.life_analyze, "life_analyze", `生活助手:${input.mode}`);

        // ─── FOOD 模式：使用 MiniMax API（无限流问题）─────────────────────────
        if (input.mode === "FOOD") {
          const foodName = input.textHint?.trim();
          if (!foodName) throw new TRPCError({ code: "BAD_REQUEST", message: "请输入菜名" });
          try {
            // 并行调用：文字分析 + 图片生成（同时进行，节省时间）
            const [nutrition, imageDataUrl] = await Promise.allSettled([
              analyzeFoodNutrition(foodName),
              generateFoodImage(foodName),
            ]);

            if (nutrition.status === "rejected") {
              throw nutrition.reason;
            }
            const result = nutrition.value;

            // 将图片上传到 S3
            if (imageDataUrl.status === "fulfilled") {
              try {
                const imgData = imageDataUrl.value.replace(/^data:.*?;base64,/, "");
                const { url } = await storagePut(`food/${Date.now()}.png`, Buffer.from(imgData, "base64"), "image/png");
                (result as any).generatedImageUrl = url;
              } catch { /* 图片上传失败不影响主流程 */ }
            }

            // 转换字段名以兼容前端（MiniMax返回的字段名与Gemini略有不同）
            return {
              title: result.name,
              description: result.summary,
              tags: result.tags,
              healthyScore: result.healthScore,
              nutrition: {
                calories: result.calories,
                protein: result.protein,
                fat: result.fat,
                carbs: result.carbs,
                sodium: result.sodium,
                sugar: result.sugar,
              },
              ingredients: result.ingredients,
              details: result.ingredients,
              advice: result.advice,
              generatedImageUrl: (result as any).generatedImageUrl,
            };
          } catch (err: any) {
            console.error("[lifeAssistant.analyze FOOD/MiniMax] 失败:", err?.message || err);
            const msg = err?.message || "";
            if (msg.includes("429") || msg.includes("rate") || msg.includes("limit")) {
              throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "AI服务繁忙，请稍等片刻后再试" });
            }
            throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "美食分析失败，请稍后重试" });
          }
        }

        // ─── HEALTH 模式：使用 MiniMax（健康百科）─────────────────────────────────
        if (input.mode === "HEALTH") {
          try {
            const result = await queryHealthInfo({
              imageUrl: input.imageUrl,
              textHint: input.textHint ?? undefined,
            });
            // 如果是文字查询且有标题，生成食物图片
            if (result.title && !input.imageUrl) {
              try {
                const base64 = await invokeMiniMaxImage({ prompt: `精美的${result.title}，专业食物摄影，高清，白色背景` });
                const { url } = await storagePut(`food/${Date.now()}.png`, Buffer.from(base64, "base64"), "image/png");
                (result as any).generatedImageUrl = url;
              } catch { /* 图片生成失败不影响主流程 */ }
            }
            return result;
          } catch (err: any) {
            console.error("[lifeAssistant.analyze HEALTH/MiniMax] 失败:", err?.message || err);
            const msg = err?.message || "";
            if (msg.includes("429") || msg.includes("rate") || msg.includes("limit")) {
              throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "AI服务繁忙，请稍等片刻后再试" });
            }
            throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "健康信息查询失败，请稍后重试" });
          }
        }

        // 不应该到达这里
        throw new TRPCError({ code: "BAD_REQUEST", message: "未知的分析模式" });
      }),
  }),

  kaleidoscope: router({
    chat: protectedProcedure
      .input(z.object({
        message: z.string(),
        imageUrl: z.string().optional(),
        history: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string() })).default([]),
      }))
      .mutation(async ({ input, ctx }) => {
        await consumeCredits(ctx.user.id, CREDIT_COSTS.chat, "chat", "AI万花筒");
        const systemInstruction = `你是一位经验丰富的全科健康顾问，同时精通中医养生和食药同源理论。服务对象主要是中老年人，语气亲切、耐心、专业。请用中文回答。

【回答风格要求——小红书养生笔记风格，必须严格执行】
每次回答健康问题时，请用小红书爆款养生笔记的风格输出，让中老年用户可以直接复制发布：

1. 📌 开篇标题：用一行吸引眼球的标题开头，格式为"✨ [核心主题] | [关键词]"，例如"✨ 血压偏高怎么办 | 中老年必看养生指南"

2. 🔍 原因分析：用1-2句话点出问题根本原因，语气亲切，像朋友聊天，可以用"很多人不知道……""其实这是因为……"等开头

3. 📋 分点建议：每个建议用 emoji 图标开头（如🥗🛌💧🚶‍♀️），标题加粗，下面跟1-2句具体说明，有原因有对策，内容充实具体（总字数不少于300字）

4. ⚠️ 注意事项：用"⚠️ 特别提醒"标出需要警惕的信号，关联用户之前提到的健康问题

5. 💬 结尾互动：用"💬 想了解更多？告诉我……"或"你现在……？评论告诉我～"结尾，引导互动

6. #话题标签：最后一行加3-5个话题标签，格式为"#中老年养生 #健康生活 #[具体症状] #食药同源"

整体风格：温暖、实用、有亲和力，像一个懂中医的朋友在分享干货，不要太学术，多用生活化语言。

【食药同源成分知识库——用于养生小贴士的内容来源】
① 灵芝：《神农本草经》列为上品，记载"主胸中结，益心气，补中，增智慧，不忘，久食轻身不老"。《中国药典·2020年版》确认其含灵芝多糖、三萜类成分，具有调节免疫、抗疲劳、改善睡眠质量等作用。适应：疲劳乏力、失眠多梦、免疫力低下、心悸气短、精力不足。
② 黄芪：《本草纲目》记载"补诸虚不足，益三焦元气"。《中国药典》确认其补气固表功效，现代研究表明黄芪多糖可提升机体免疫功能。适应：气虚乏力、自汗、易感冒、精神不振。
③ 西洋参：《本草备要》记载"补肺降火，止渴生津"。《中国药典》记载其益气养阴、清火生津功效。适应：气阴两虚、疲劳、心悸失眠、气虚温补时容易上火者。
④ 党参：《神农本草经》记载"主补五脏，安精神，止惊悸"。《中国药典》记载其大补元气功效。适应：元气不足、心慌气短、久病体虚、精力不足。
⑤ 黄精：《本草纲目》记载"补中益气，润心肺，除风湿"。《中国药典》记载其滋阴润肺、补脾益气功效。适应：脾胃虚弱、耐力下降、腰膝酸软、头晕。
⑥ 阿胶：《本草纲目》记载"补血滋阴、润燥止血"。适应：血虚萎白、头晕心悸、皮肤干燥、女性气血不足。
⑦ 燕窝：《本草备要》记载"大养肺阴，润燥"。适应：皮肤干燥暗沉、气血不足、体质虚弱。
⑧ 重瓣玫瑰：《本草纲目》记载"和血散淤，理气解郁"。适应：情绪不畅、月经不调、面色暗沉。
⑨ 龙眼（桂圆肉）：《神农本草经》记载"主五脏邪气，安志"。《中国药典》记载其补益心脾、养血安神功效。适应：心血不足、失眠健忘、血虚。
⑩ 山药：《神农本草经》记载"补中益气力"。《中国药典》记载其补脾胃、滋肾益精功效。适应：脾胃虚弱、食欲不振、肾虚腰酸。
⑪ 百合：《中国药典》记载其养阴润肺、清心安神功效。适应：肺燥咳嗽、虚烦心悸、失眠。
⑫ 山楂：《新修本草》记载"消食化滞，散瘀血"。现代研究表明其含有机酸、黄酮素，具有降血脂、助消化作用。适应：血脂偏高、食欲不振、肉食积滞。
⑬ 荷叶：《本草纲目》记载"清暑利湿，升发清阳"。现代研究表明荷叶生物碱具有降血脂、减肥作用。适应：体重偏重、湿热、血脂偏高。
⑭ 决明子：《神农本草经》记载"主青盲目淡，久服益精光"。《中国药典》记载其清肝明目、润肠通便功效。适应：目赤、头痛眩晕、便秘、血脂偏高。
⑮ 金银花：《本草纲目》记载"清热解毒"。适应：上火、内热、血脂偏高。
⑯ 陈皮：《本草纲目》记载"理气健脾，燥湿化痰"。适应：消化不良、胸闷、痰多。
⑰ 茯苓：《神农本草经》记载"主胸胁逆气，心下结痛，富心智慧，不忘"。《中国药典》记载其利水渗湿、健脾宁心功效。适应：水肿、脾虚、心悸失眠。
⑱ 薏苡仁：《本草纲目》记载"健脾渗湿，除痹止治"。适应：湿气重、身体沉重、水肿。
⑲ 五指毛桃：《广东中药大全》记载"健脾祛湿，舒筋活络"。适应：脾虚湿困、水肿、腰腿酸软。
⑳ 姜黄：《本草纲目》记载"行气解郁，破血行淤"。现代研究表明姜黄素具有抗炎、降血脂作用。适应：血脂偏高、关节疼痛、脾胃气滞。
㉑ 栀子：《中国药典》记载其清热利湿功效。适应：烦热、心烦失眠、湿热内蒸。
㉒ 蛹虫草：《本草纲目》记载"保肺益肾，止血化痰"。现代研究表明其含虫草素，具有抗疲劳、调节免疫功能。适应：久咳、体虚乏力、肺肾两虚。
㉓ 罗汉果：《中国药典》记载"清热润肺，利咽开音"。适应：肺热咳嗽、咽喉不适、失音。
㉔ 桔梗：《中国药典》记载其宣肺利咽、排脓消痰功效。适应：咳嗽多痰、咽喉不适。
㉕ 胖大海：《中国药典》记载其清热润肺功效。适应：咽喉不适、咳嗽失音。
㉖ 薄荷：《中国药典》记载其疏风散热功效。适应：风热感冒、咽喉疼痛、头痛。
㉗ 白芷：《中国药典》记载其解表散寒、活血止痛功效。适应：面色暗沉、色斑、风寒感冒。
㉘ 甘草：《中国药典》记载其补脾益气、清热解毒、调和诸药功效。
`;
        const contents: any[] = input.history.map((m) => ({ role: m.role === "user" ? "user" : "model", parts: [{ text: m.content }] }));
        const currentParts: any[] = [];
        if (input.imageUrl) {
          const imageResp = await fetch(input.imageUrl);
          const base64 = Buffer.from(await imageResp.arrayBuffer()).toString("base64");
          const mimeType = imageResp.headers.get("content-type") ?? "image/jpeg";
          currentParts.push({ inlineData: { data: base64, mimeType } });
        }
        // 隐性结构指令：告诉AI要做什么，但不要让这些指令出现在输出中
        // 内嵌完整的症状→配方成分映射表，确保灵芝+对应成分都能被推荐到
        const forcedSuffix = `

[内部指导——不要在回答中显示任何括号内容，直接自然输出小红书笔记风格：

严格按照小红书爆款笔记格式输出：✨标题开头 → 原因分析 → emoji分点建议 → ⚠️特别提醒 → 💬互动结尾 → #话题标签。

养生过渡（必须执行，嵌入到分点建议中，约80字）：在分点建议中自然加入一条🌿开头的养生小贴士，根据用户症状从下面的成分库中找出最匹配的1-2种成分（灵芝必须出现），用"传统养生里有个说法……"或"老祖宗早就发现……"等口吻自然提及它们的调养价值，最后加"当然这只是辅助"。不要说"推荐"或"产品"。

成分库（根据症状智能匹配，只选最相关的，不要全部列出）：
- 疲劳/气虚/没精神/提不起劲：灵芝（补气安神，《神农本草经》上品）、黄芪（补中益气）、西洋参（益气养阴）、黄精（补脾益肾）、党参（健脾补气）
- 睡眠差/失眠/多梦：灵芝（安神助眠）、酸枣仁（养心安神，《本草纲目》）、百合（清心安神）
- 皮肤干/气色差/面色暗沉：灵芝（护肝排毒，肝好皮肤才好）、阿胶（补血滋阴）、燕窝（滋阴润燥）、玫瑰花（活血养颜）、枸杞（补肝肾明目）
- 血压偏高/心血管问题：灵芝（益心气，改善微循环）、红曲（调节血脂）、山楂（活血化瘀）、决明子（清肝明目）
- 血糖偏高/代谢问题：灵芝（三萜类调节代谢）、苦瓜（辅助调节血糖）、桑叶（降糖辅助）
- 免疫力差/容易感冒：灵芝（灵芝多糖增强免疫）、蛹虫草（补肺益肾）、黄芪（固表止汗）
- 消化差/脾胃虚弱/胃胀：灵芝（调和脾胃）、茯苓（健脾渗湿）、薏苡仁（健脾除湿）、山药（补脾养胃）
- 湿气重/身体沉重/水肿：灵芝（调和诸脏）、茯苓（利水渗湿）、薏苡仁（除湿消肿）、五指毛桃（健脾祛湿）
- 咽喉不适/肺部问题/咳嗽：灵芝（益肺气）、蛹虫草（补肺化痰）、罗汉果（清热润肺）、百合（润肺止咳）
- 关节疼痛/腰腿酸软：灵芝（补肝肾强筋骨）、杜仲（补肝肾）、牛膝（强筋骨）
- 情绪焦虑/压力大：灵芝（安神定志）、玫瑰花（疏肝解郁）、百合（清心除烦）]`;
        currentParts.push({ text: input.message + forcedSuffix });
        contents.push({ role: "user", parts: currentParts });

        const reply = await callGeminiText({ systemInstruction, contents });
        return { reply };
      }),
  }),
});

export type AppRouter = typeof appRouter;
