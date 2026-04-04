import { describe, it, expect } from "vitest";
import axios from "axios";

describe("MiniMax API Key validation", () => {
  it("should have MINIMAX_API_KEY configured", () => {
    const key = process.env.MINIMAX_API_KEY;
    expect(key).toBeTruthy();
    expect(key?.length).toBeGreaterThan(10);
  });

  it("should successfully call MiniMax text API", async () => {
    const key = process.env.MINIMAX_API_KEY;
    expect(key).toBeTruthy();

    const resp = await axios.post(
      "https://api.minimaxi.com/v1/chat/completions",
      {
        model: "MiniMax-M2.5-highspeed",
        messages: [
          { role: "system", content: "你是助手，只回答一个词。" },
          { role: "user", content: "你好" },
        ],
        max_tokens: 10,
      },
      {
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
        },
        timeout: 30000,
      }
    );

    expect(resp.status).toBe(200);
    const content = resp.data?.choices?.[0]?.message?.content;
    expect(content).toBeTruthy();
    console.log("MiniMax API response:", content);
  }, 30000);
});
