import { describe, expect, it } from "vitest";
import { callGeminiText } from "./geminiService";

describe("Gemini API 连接测试", () => {
  it("应该成功调用文本生成模型", async () => {
    const result = await callGeminiText({
      contents: [{ text: "请用一句话介绍人工智能。" }],
    });

    expect(result).toBeTruthy();
    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(10);
    console.log("✅ Gemini文本生成测试通过:", result.substring(0, 50));
  }, 30000);
});
