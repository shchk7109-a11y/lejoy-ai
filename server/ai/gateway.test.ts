import { describe, it, expect } from "vitest";
import { pickTextProvider, pickImageProvider, pickTtsProvider, pickAsrProvider, ProviderKeys } from "./gateway";
import { buildKimiMessages } from "./kimiClient";
import { mapAspectToSize, nearestSupportedAspectRatio } from "./volcImageClient";
import { mapVoice, resolveAliTtsProfile } from "./aliVoiceClient";
import { ENV } from "../_core/env";

const allKeys: ProviderKeys = { moonshot: true, ark: true, dashscope: true, minimax: true, gemini: true, forge: true };
const noNewKeys: ProviderKeys = { moonshot: false, ark: false, dashscope: false, minimax: true, gemini: true, forge: true };
const legacyOnly: ProviderKeys = { moonshot: false, ark: false, dashscope: false, minimax: false, gemini: true, forge: true };

describe("供应商选择逻辑", () => {
  it("auto 模式下境内新链路优先", () => {
    expect(pickTextProvider("auto", allKeys)).toBe("kimi");
    expect(pickImageProvider("auto", allKeys)).toBe("volc");
    expect(pickTtsProvider("auto", allKeys)).toBe("ali");
    expect(pickAsrProvider("auto", allKeys)).toBe("ali");
  });

  it("auto 模式下无新密钥时回落到 MiniMax/遗留链路", () => {
    expect(pickTextProvider("auto", noNewKeys)).toBe("minimax");
    expect(pickImageProvider("auto", noNewKeys)).toBe("minimax");
    expect(pickTtsProvider("auto", noNewKeys)).toBe("minimax");
    expect(pickAsrProvider("auto", noNewKeys)).toBe("forge");
    expect(pickTextProvider("auto", legacyOnly)).toBe("gemini");
    expect(pickImageProvider("auto", legacyOnly)).toBe("gemini");
    expect(pickTtsProvider("auto", legacyOnly)).toBe("gemini");
  });

  it("显式指定供应商时不做自动选择", () => {
    expect(pickTextProvider("gemini", allKeys)).toBe("gemini");
    expect(pickImageProvider("minimax", allKeys)).toBe("minimax");
    expect(pickTtsProvider("gemini", allKeys)).toBe("gemini");
    expect(pickAsrProvider("forge", allKeys)).toBe("forge");
  });
});

describe("Kimi 消息构建", () => {
  it("纯文本消息使用字符串 content", () => {
    const msgs = buildKimiMessages([
      { role: "system", text: "你是助手" },
      { role: "user", text: "你好" },
    ]);
    expect(msgs).toEqual([
      { role: "system", content: "你是助手" },
      { role: "user", content: "你好" },
    ]);
  });

  it("带图片的消息使用多段 content（image_url + text）", () => {
    const msgs = buildKimiMessages([
      { role: "user", text: "这是什么花？", imageDataUrl: "data:image/jpeg;base64,abc" },
    ]) as any[];
    expect(Array.isArray(msgs[0].content)).toBe(true);
    expect(msgs[0].content[0].type).toBe("image_url");
    expect(msgs[0].content[0].image_url.url).toBe("data:image/jpeg;base64,abc");
    expect(msgs[0].content[1]).toEqual({ type: "text", text: "这是什么花？" });
  });
});

describe("即梦尺寸映射", () => {
  it("宽高比映射为像素尺寸", () => {
    expect(mapAspectToSize("1:1")).toBe("2048x2048");
    expect(mapAspectToSize("4:3")).toBe("2304x1728");
    expect(mapAspectToSize("9:16")).toBe("1440x2560");
    expect(mapAspectToSize(undefined)).toBe("2048x2048");
  });

  it("原图比例映射到最接近的受支持尺寸档", () => {
    expect(nearestSupportedAspectRatio(4032, 3024)).toBe("4:3");
    expect(nearestSupportedAspectRatio(1080, 1920)).toBe("9:16");
    expect(nearestSupportedAspectRatio(3000, 2800)).toBe("1:1");
  });
});

describe("千问TTS音色映射", () => {
  it("现有音色键全部有映射", () => {
    for (const key of ["lively", "sweet", "gentle", "warm", "calm", "deep", "bright", "steady"]) {
      expect(mapVoice(key)).toBeTruthy();
    }
  });
  it("方言音色可用", () => {
    expect(mapVoice("dialect_sichuan")).toBe("Sunny");
    expect(mapVoice("dialect_cantonese")).toBe("Rocky");
    expect(mapVoice("dialect_beijing")).toBe("Dylan");
    expect(mapVoice("dialect_shanghai")).toBe("Jada");
  });
  it("未知音色回落到默认", () => {
    expect(mapVoice("nonexistent")).toBe("Cherry");
    expect(mapVoice(undefined)).toBe("Cherry");
  });
});

describe("阿里TTS模型分流", () => {
  it("温柔女声和沉稳讲述使用 CosyVoice 龙妙与龙楠", () => {
    expect(resolveAliTtsProfile("gentle")).toMatchObject({
      family: "cosyvoice",
      model: ENV.dashscopeCosyvoiceModel,
      voice: "longmiao_v3",
    });
    expect(resolveAliTtsProfile("steady")).toMatchObject({
      family: "cosyvoice",
      model: ENV.dashscopeCosyvoiceModel,
      voice: "longnan_v3",
    });
  });

  it("上海话继续使用 Qwen TTS 的 Jada", () => {
    expect(resolveAliTtsProfile("dialect_shanghai")).toMatchObject({
      family: "qwen",
      model: ENV.dashscopeTtsModel,
      voice: "Jada",
    });
  });
});
