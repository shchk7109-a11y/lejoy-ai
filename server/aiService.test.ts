import { afterEach, describe, expect, it, vi } from "vitest";
import { VOICE_OPTIONS, STORY_THEMES, STORY_IDEAS } from "../shared/appTypes";
import { truncateWish, cleanJson, generateSpeech, testTtsConfigHealth } from "./aiService";
import * as db from "./db";
import * as storage from "./storage";

function createWavBuffer(size = 9000) {
  const buffer = Buffer.alloc(size);
  buffer.write("RIFF", 0, "ascii");
  buffer.write("WAVE", 8, "ascii");
  return buffer;
}

function createMp3Buffer(size = 9000) {
  const buffer = Buffer.alloc(size);
  buffer.write("ID3", 0, "ascii");
  return buffer;
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("VOICE_OPTIONS shared constants", () => {
  it("has grandma as the first voice option", () => {
    expect(VOICE_OPTIONS[0].id).toBe("grandma");
    expect(VOICE_OPTIONS[0].label).toBe("慈祥奶奶");
  });

  it("has grandpa as the second voice option", () => {
    expect(VOICE_OPTIONS[1].id).toBe("grandpa");
    expect(VOICE_OPTIONS[1].label).toBe("慈祥爷爷");
  });

  it("has at least 7 voice options", () => {
    expect(VOICE_OPTIONS.length).toBeGreaterThanOrEqual(7);
  });

  it("all voice options have valid voiceId", () => {
    for (const v of VOICE_OPTIONS) {
      expect(v.voiceId).toBeTruthy();
      expect(typeof v.voiceId).toBe("string");
    }
  });

  it("all voice options have Chinese labels", () => {
    for (const v of VOICE_OPTIONS) {
      expect(v.label).toMatch(/[\u4e00-\u9fff]/);
    }
  });
});

describe("STORY_THEMES shared constants", () => {
  it("has at least 6 themes", () => {
    expect(STORY_THEMES.length).toBeGreaterThanOrEqual(6);
  });

  it("each theme has Chinese label and icon", () => {
    for (const t of STORY_THEMES) {
      expect(t.label).toMatch(/[\u4e00-\u9fff]/);
      expect(t.icon).toBeTruthy();
    }
  });
});

describe("STORY_IDEAS shared constants", () => {
  it("has at least 20 ideas per theme", () => {
    for (const theme of STORY_THEMES) {
      const ideas = STORY_IDEAS[theme.id as keyof typeof STORY_IDEAS];
      expect(ideas).toBeDefined();
      expect(ideas.length).toBeGreaterThanOrEqual(20);
    }
  });
});

describe("truncateWish (exported from aiService)", () => {
  it("returns short text unchanged", () => {
    const short = "祝你生日快乐，万事如意！";
    expect(truncateWish(short)).toBe(short);
  });

  it("truncates text longer than 200 chars at sentence boundary", () => {
    const part1 = "这是一段很长的祝福文案，充满了温暖和关怀。";
    const part2 = "愿你在新的一年里，事事顺心，万事如意，身体健康，阖家幸福。";
    const part3 = "每一天都充满阳光和希望，每一刻都洋溢着幸福和快乐。";
    const longText = (part1 + part2 + part3).repeat(3);
    const result = truncateWish(longText);
    expect(result.length).toBeLessThanOrEqual(200);
    expect(result).toMatch(/[。！？~]$/);
  });

  it("hard truncates at 200 if no sentence boundary found after position 30", () => {
    const noPunc = "这是一段没有标点符号的文字".repeat(20);
    const result = truncateWish(noPunc);
    expect(result.length).toBe(200);
  });

  it("trims whitespace from input", () => {
    const padded = "  祝你生日快乐  ";
    expect(truncateWish(padded)).toBe("祝你生日快乐");
  });

  it("returns exactly 200 chars when text is exactly 200 chars", () => {
    const exact = "字".repeat(200);
    expect(truncateWish(exact)).toBe(exact);
    expect(truncateWish(exact).length).toBe(200);
  });
});

describe("cleanJson (exported from aiService)", () => {
  it("extracts JSON object from markdown code block", () => {
    const input = '```json\n{"name":"test"}\n```';
    const result = cleanJson(input);
    expect(JSON.parse(result)).toEqual({ name: "test" });
  });

  it("extracts JSON array from text", () => {
    const input = 'Here is the result: ["a","b","c"] end';
    const result = cleanJson(input);
    expect(JSON.parse(result)).toEqual(["a", "b", "c"]);
  });

  it("returns {} for empty input", () => {
    expect(cleanJson("")).toBe("{}");
  });
});

describe("life assistant nutrition labels are Chinese", () => {
  const NUTRITION_LABELS: Record<string, string> = {
    calories: "热量", protein: "蛋白质", fat: "脂肪",
    carbs: "碳水", sodium: "钠含量", sugar: "糖分",
    fiber: "膳食纤维", cholesterol: "胆固醇",
  };

  it("all nutrition labels are in Chinese", () => {
    for (const [, label] of Object.entries(NUTRITION_LABELS)) {
      expect(label).toMatch(/[\u4e00-\u9fff]/);
    }
  });
});

describe("TTS configuration guards", () => {
  it("generateSpeech throws when TTS config is incomplete", async () => {
    vi.spyOn(db, "getModelConfig").mockResolvedValue(undefined);
    vi.spyOn(db, "getUserApiConfig").mockResolvedValue(undefined);

    await expect(generateSpeech("你好，小朋友", "sweet", 1)).rejects.toThrow("语音合成服务未配置完整");
  });

  it("testTtsConfigHealth rejects missing apiKey", async () => {
    await expect(
      testTtsConfigHealth({ apiKey: "", baseUrl: "https://tts.example.com/v1" })
    ).rejects.toThrow("TTS API Key 未配置");
  });

  it("testTtsConfigHealth rejects missing baseUrl", async () => {
    await expect(
      testTtsConfigHealth({ apiKey: "test-key", baseUrl: "   " })
    ).rejects.toThrow("TTS Base URL 未配置");
  });
});

describe("TTS fallback and audio decoding", () => {
  it("falls back to the next model when current model is unsupported", async () => {
    const wavBuffer = createWavBuffer();
    vi.spyOn(storage, "storagePut").mockResolvedValue({
      key: "audio/test.wav",
      url: "https://cdn.example.com/audio/test.wav",
    });

    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify({
        base_resp: { status_code: 1001, status_msg: "not support model" },
      }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        base_resp: { status_code: 0 },
        data: {
          audio: wavBuffer.toString("base64"),
          mime_type: "audio/wav",
        },
      }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }));

    const result = await testTtsConfigHealth({
      modelName: "speech-x",
      apiKey: "test-key",
      baseUrl: "https://tts.example.com/v1",
    }, {
      sampleText: "这是一次回退检测",
      voiceType: "grandma",
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.modelUsed).toBe("speech-02");
    expect(result.source).toBe("base64");
    expect(result.format).toBe("wav");
    expect(result.warnings).toContain("已自动回退到模型 speech-02");
  });

  it("downloads remote audio urls and reports remote source warning", async () => {
    const mp3Buffer = createMp3Buffer();
    vi.spyOn(storage, "storagePut").mockResolvedValue({
      key: "audio/test.mp3",
      url: "https://cdn.example.com/audio/test.mp3",
    });

    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify({
        base_resp: { status_code: 0 },
        data: {
          audio_url: "https://tts.example.com/files/generated.mp3",
        },
      }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }))
      .mockResolvedValueOnce(new Response(mp3Buffer, {
        status: 200,
        headers: { "Content-Type": "audio/mpeg" },
      }));

    const result = await testTtsConfigHealth({
      modelName: "speech-02",
      apiKey: "test-key",
      baseUrl: "https://tts.example.com/v1",
    }, {
      sampleText: "这是一次远程音频检测",
      voiceType: "grandpa",
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.source).toBe("remote_url");
    expect(result.audioUrl).toBe("https://cdn.example.com/audio/test.mp3");
    expect(result.warnings).toContain("本次检测返回的是远程音频地址，系统已自动下载后再上传存储");
  });

  it("decodes hex audio payload from stored tts config", async () => {
    const wavBuffer = createWavBuffer();
    vi.spyOn(db, "getModelConfig").mockResolvedValue({
      configKey: "tts",
      label: "TTS",
      provider: "minimax",
      modelName: "speech-02",
      apiKey: "system-key",
      baseUrl: "https://tts.example.com/v1",
    } as any);
    vi.spyOn(db, "getUserApiConfig").mockResolvedValue(undefined);
    vi.spyOn(storage, "storagePut").mockResolvedValue({
      key: "audio/test.wav",
      url: "https://cdn.example.com/audio/hex.wav",
    });

    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      base_resp: { status_code: 0 },
      data: {
        audio: wavBuffer.toString("hex"),
        mime_type: "audio/wav",
      },
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await generateSpeech("十六进制音频检测", "sweet", 1);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.audioUrl).toBe("https://cdn.example.com/audio/hex.wav");
    expect(result.source).toBe("hex");
    expect(result.format).toBe("wav");
    expect(result.modelUsed).toBe("speech-02");
  });
});
