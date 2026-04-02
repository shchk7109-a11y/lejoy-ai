import { afterEach, describe, expect, it, vi } from "vitest";
import { appRouter } from "./routers";
import { COOKIE_NAME } from "../shared/const";
import type { TrpcContext } from "./_core/context";
import * as db from "./db";
import * as ai from "./aiService";
import * as storage from "./storage";
import * as voiceTranscription from "./_core/voiceTranscription";

type CookieCall = {
  name: string;
  options: Record<string, unknown>;
};

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createAuthContext(overrides?: Partial<AuthenticatedUser>): { ctx: TrpcContext; clearedCookies: CookieCall[] } {
  const clearedCookies: CookieCall[] = [];

  const user: AuthenticatedUser = {
    id: 1,
    openId: "test-user-001",
    email: "test@example.com",
    name: "Test User",
    loginMethod: "manus",
    role: "user",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
    ...overrides,
  };

  const ctx: TrpcContext = {
    user,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      clearCookie: (name: string, options: Record<string, unknown>) => {
        clearedCookies.push({ name, options });
      },
    } as TrpcContext["res"],
  };

  return { ctx, clearedCookies };
}

function createGuestContext(): { ctx: TrpcContext } {
  const ctx: TrpcContext = {
    user: null,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      clearCookie: () => {},
    } as TrpcContext["res"],
  };
  return { ctx };
}

function createTtsHealthResult(overrides: Record<string, unknown> = {}) {
  return {
    ok: true,
    audioUrl: "https://cdn.example.com/audio/test.mp3",
    mimeType: "audio/mpeg",
    format: "mp3",
    byteLength: 16 * 1024,
    modelUsed: "speech-02",
    provider: "minimax",
    source: "base64",
    latencyMs: 123,
    checkedAt: "2026-04-01T00:00:00.000Z",
    sampleText: "测试文本",
    voiceType: "grandma",
    warnings: [],
    ...overrides,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("auth.logout", () => {
  it("clears the session cookie and reports success", async () => {
    const { ctx, clearedCookies } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.auth.logout();

    expect(result).toEqual({ success: true });
    expect(clearedCookies).toHaveLength(1);
    expect(clearedCookies[0]?.name).toBe(COOKIE_NAME);
    expect(clearedCookies[0]?.options).toMatchObject({
      maxAge: -1,
      secure: true,
      sameSite: "none",
      httpOnly: true,
      path: "/",
    });
  });
});

describe("auth.me", () => {
  it("returns null for unauthenticated user", async () => {
    const { ctx } = createGuestContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.auth.me();
    expect(result).toBeNull();
  });
});

describe("admin routes", () => {
  it("rejects non-admin users from admin.users", async () => {
    const { ctx } = createAuthContext({ role: "user" });
    const caller = appRouter.createCaller(ctx);

    await expect(caller.admin.users()).rejects.toThrow("需要管理员权限");
  });

  it("rejects non-admin from admin.giftPoints", async () => {
    const { ctx } = createAuthContext({ role: "user" });
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.admin.giftPoints({ userId: 2, amount: 100 })
    ).rejects.toThrow("需要管理员权限");
  });

  it("rejects non-admin from admin.freezeUser", async () => {
    const { ctx } = createAuthContext({ role: "user" });
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.admin.freezeUser({ userId: 2, frozen: true })
    ).rejects.toThrow("需要管理员权限");
  });

  it("rejects non-admin from admin.saveModelConfig", async () => {
    const { ctx } = createAuthContext({ role: "user" });
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.admin.saveModelConfig({
        configKey: "test",
        label: "Test",
        provider: "test",
        modelName: "test-model",
      })
    ).rejects.toThrow("需要管理员权限");
  });
});

describe("points routes input validation", () => {
  it("rejects recharge with amount < 1", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.points.recharge({ amount: 0 })
    ).rejects.toThrow();
  });

  it("rejects recharge with amount > 10000", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.points.recharge({ amount: 10001 })
    ).rejects.toThrow();
  });
});

describe("story time input validation", () => {
  it("rejects page count less than 4", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.storyTime.generate({
        childName: "小明",
        age: "5",
        topic: "太空冒险",
        theme: "adventure",
        pageCount: 2,
      })
    ).rejects.toThrow();
  });

  it("rejects page count greater than 8", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.storyTime.generate({
        childName: "小明",
        age: "5",
        topic: "太空冒险",
        theme: "adventure",
        pageCount: 10,
      })
    ).rejects.toThrow();
  });
});

describe("life assistant input validation", () => {
  it("rejects invalid mode", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    await expect(
      // @ts-expect-error - testing invalid input
      caller.lifeAssistant.analyze({ mode: "INVALID" })
    ).rejects.toThrow();
  });
});

describe("admin.apiStats", () => {
  it("rejects non-admin users", async () => {
    const { ctx } = createAuthContext({ role: "user" });
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.admin.apiStats({ days: 7 })
    ).rejects.toThrow("需要管理员权限");
  });

  it("rejects days < 1", async () => {
    const { ctx } = createAuthContext({ role: "admin" });
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.admin.apiStats({ days: 0 })
    ).rejects.toThrow();
  });

  it("rejects days > 90", async () => {
    const { ctx } = createAuthContext({ role: "admin" });
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.admin.apiStats({ days: 100 })
    ).rejects.toThrow();
  });
});

describe("story time route defaults", () => {
  it("fills default childName when omitted", async () => {
    vi.spyOn(db, "getUserById").mockResolvedValue({ id: 1, points: 20, isFrozen: false } as any);
    vi.spyOn(db, "getSetting").mockResolvedValue("1");
    vi.spyOn(db, "updateUserPoints").mockResolvedValue(undefined);
    vi.spyOn(db, "addPointsLog").mockResolvedValue(undefined);
    vi.spyOn(db, "logApiCall").mockResolvedValue(undefined);
    const generateStoryStructureSpy = vi.spyOn(ai, "generateStoryStructure").mockResolvedValue({
      title: "星空奇遇记",
      characterDescription: "A curious child wearing a yellow raincoat",
      pages: [{ pageNumber: 1, text: "第一页", imagePrompt: "page-1" }],
    });

    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.storyTime.generate({
      age: "5",
      topic: "太空冒险",
      theme: "adventure",
      pageCount: 4,
    });

    expect(generateStoryStructureSpy).toHaveBeenCalledWith({
      childName: "小朋友",
      age: "5",
      topic: "太空冒险",
      theme: "adventure",
      pageCount: 4,
    }, 1);
    expect(result.title).toBe("星空奇遇记");
  });

  it("uses sweet voice by default for page audio", async () => {
    vi.spyOn(db, "logApiCall").mockResolvedValue(undefined);
    const generateSpeechSpy = vi.spyOn(ai, "generateSpeech").mockResolvedValue({
      audioUrl: "https://cdn.example.com/audio/page.mp3",
      mimeType: "audio/mpeg",
      format: "mp3",
      byteLength: 4096,
      modelUsed: "speech-02",
      provider: "minimax",
      source: "binary",
    });

    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.storyTime.generatePageAudio({ text: "欢迎来到故事时间" });

    expect(generateSpeechSpy).toHaveBeenCalledWith("欢迎来到故事时间", "sweet", 1);
    expect(result.audioUrl).toBe("https://cdn.example.com/audio/page.mp3");
  });

  it("passes through save payload with current user id", async () => {
    const createStorySpy = vi.spyOn(db, "createStory").mockResolvedValue(88 as any);
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const payload = {
      title: "星空奇遇记",
      characterName: "小朋友",
      theme: "adventure",
      pageCount: 4,
      pages: [{ pageNumber: 1, text: "第一页", imagePrompt: "prompt-1", audioUrl: "https://cdn.example.com/1.mp3" }],
    };

    const result = await caller.storyTime.save(payload);

    expect(createStorySpy).toHaveBeenCalledWith(1, payload);
    expect(result).toEqual({ id: 88 });
  });

  it("lists stories for current user", async () => {
    const stories = [{ id: 9, userId: 1, title: "月亮旅行", characterName: "小朋友", theme: "fantasy", pageCount: 6, pages: [], createdAt: new Date(), updatedAt: new Date() }];
    const getUserStoriesSpy = vi.spyOn(db, "getUserStories").mockResolvedValue(stories as any);

    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.storyTime.list();

    expect(getUserStoriesSpy).toHaveBeenCalledWith(1);
    expect(result).toEqual(stories);
  });

  it("deletes a story for current user", async () => {
    const deleteStorySpy = vi.spyOn(db, "deleteStory").mockResolvedValue(undefined);

    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.storyTime.delete({ id: 9 });

    expect(deleteStorySpy).toHaveBeenCalledWith(9, 1);
    expect(result).toEqual({ success: true });
  });
});

describe("voice routes", () => {
  it("uploads webm audio with the expected extension and content type", async () => {
    const storagePutSpy = vi.spyOn(storage, "storagePut").mockResolvedValue({
      key: "voice/test.webm",
      url: "https://cdn.example.com/voice/test.webm",
    });

    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.voice.upload({
      audioBase64: "data:audio/webm;base64,SGVsbG8=",
      mimeType: "audio/webm;codecs=opus",
    });

    expect(storagePutSpy).toHaveBeenCalledWith(
      expect.stringMatching(/^voice\/.+\.webm$/),
      Buffer.from("Hello"),
      "audio/webm;codecs=opus"
    );
    expect(result).toEqual({ url: "https://cdn.example.com/voice/test.webm" });
  });

  it("defaults upload mime type to audio/webm and mp3 extension when mimeType is omitted", async () => {
    const storagePutSpy = vi.spyOn(storage, "storagePut").mockResolvedValue({
      key: "voice/test.mp3",
      url: "https://cdn.example.com/voice/test.mp3",
    });

    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    await caller.voice.upload({ audioBase64: Buffer.from("hi").toString("base64") });

    expect(storagePutSpy).toHaveBeenCalledWith(
      expect.stringMatching(/^voice\/.+\.mp3$/),
      Buffer.from("hi"),
      "audio/webm"
    );
  });

  it("uses zh as the default language and returns text only on successful transcription", async () => {
    vi.spyOn(db, "logApiCall").mockResolvedValue(undefined);
    const transcribeAudioSpy = vi.spyOn(voiceTranscription, "transcribeAudio").mockResolvedValue({
      task: "transcribe",
      language: "zh",
      duration: 1.2,
      text: "今天天气很好",
      segments: [],
    });

    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.voice.transcribe({
      audioUrl: "https://cdn.example.com/voice/test.webm",
    });

    expect(transcribeAudioSpy).toHaveBeenCalledWith({
      audioUrl: "https://cdn.example.com/voice/test.webm",
      language: "zh",
    });
    expect(result).toEqual({ text: "今天天气很好" });
  });

  it("surfaces readable transcription errors with the upstream code", async () => {
    vi.spyOn(db, "logApiCall").mockResolvedValue(undefined);
    vi.spyOn(voiceTranscription, "transcribeAudio").mockResolvedValue({
      error: "Voice transcription service is not configured",
      code: "SERVICE_ERROR",
      details: "BUILT_IN_FORGE_API_URL is not set",
    });

    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.voice.transcribe({
        audioUrl: "https://cdn.example.com/voice/test.webm",
        language: "en",
      })
    ).rejects.toThrow("语音识别失败，请重试。(SERVICE_ERROR)");
  });
});

describe("tts health check routes", () => {
  it("prefers draft overrides for user TTS test and defaults grandma voice", async () => {
    vi.spyOn(db, "getModelConfig").mockResolvedValue({
      configKey: "tts",
      label: "TTS",
      provider: "minimax",
      modelName: "system-model",
      apiKey: "system-key",
      baseUrl: "https://system.example/v1",
    } as any);
    vi.spyOn(db, "getUserApiConfig").mockResolvedValue({
      id: 1,
      userId: 1,
      configKey: "tts",
      modelName: "user-model",
      apiKey: "user-key",
      baseUrl: "https://user.example/v1",
    } as any);
    vi.spyOn(db, "logApiCall").mockResolvedValue(undefined);
    const testTtsSpy = vi.spyOn(ai, "testTtsConfigHealth").mockResolvedValue(createTtsHealthResult() as any);

    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.apiConfig.testTts({
      modelName: "  draft-model  ",
      apiKey: "  draft-key  ",
      baseUrl: "  https://draft.example/v1/  ",
      sampleText: "  这是一次检测  ",
    });

    expect(testTtsSpy).toHaveBeenCalledWith({
      modelName: "draft-model",
      apiKey: "draft-key",
      baseUrl: "https://draft.example/v1/",
    }, {
      sampleText: "  这是一次检测  ",
      voiceType: "grandma",
    });
    expect(result.ok).toBe(true);
  });

  it("passes undefined apiKey through apiConfig.save when user leaves key blank", async () => {
    const upsertUserApiConfigSpy = vi.spyOn(db, "upsertUserApiConfig").mockResolvedValue(undefined);

    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.apiConfig.save({
      configKey: "tts",
      modelName: "speech-02",
      baseUrl: "https://tts.example.com/v1",
    });

    expect(upsertUserApiConfigSpy).toHaveBeenCalledWith(1, "tts", {
      modelName: "speech-02",
      apiKey: undefined,
      baseUrl: "https://tts.example.com/v1",
    });
    expect(result).toEqual({ success: true });
  });

  it("merges admin draft modelName with stored system TTS config", async () => {
    vi.spyOn(db, "getModelConfig").mockResolvedValue({
      configKey: "tts",
      label: "TTS",
      provider: "minimax",
      modelName: "system-model",
      apiKey: "system-key",
      baseUrl: "https://system.example/v1",
    } as any);
    vi.spyOn(db, "logApiCall").mockResolvedValue(undefined);
    const testTtsSpy = vi.spyOn(ai, "testTtsConfigHealth").mockResolvedValue(createTtsHealthResult({ voiceType: "grandpa" }) as any);

    const { ctx } = createAuthContext({ role: "admin" });
    const caller = appRouter.createCaller(ctx);
    await caller.admin.testTts({
      modelName: "  speech-01  ",
      sampleText: "后台检测",
      voiceType: "grandpa",
    });

    expect(testTtsSpy).toHaveBeenCalledWith({
      modelName: "speech-01",
      apiKey: "system-key",
      baseUrl: "https://system.example/v1",
    }, {
      sampleText: "后台检测",
      voiceType: "grandpa",
    });
  });

  it("passes undefined apiKey through admin.saveModelConfig when admin leaves key blank", async () => {
    const upsertModelConfigSpy = vi.spyOn(db, "upsertModelConfig").mockResolvedValue(undefined);

    const { ctx } = createAuthContext({ role: "admin" });
    const caller = appRouter.createCaller(ctx);
    const result = await caller.admin.saveModelConfig({
      configKey: "tts",
      label: "TTS",
      provider: "minimax",
      modelName: "speech-02",
      baseUrl: "https://tts.example.com/v1",
    });

    expect(upsertModelConfigSpy).toHaveBeenCalledWith({
      configKey: "tts",
      label: "TTS",
      provider: "minimax",
      modelName: "speech-02",
      apiKey: undefined,
      baseUrl: "https://tts.example.com/v1",
    });
    expect(result).toEqual({ success: true });
  });
});
