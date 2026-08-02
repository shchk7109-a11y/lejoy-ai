import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import config from "../../miniprogram/config";

describe("小程序构建期环境注入", () => {
  it("把 API 地址固化为构建常量，避免小程序运行时访问 Node process", () => {
    expect(config.defineConstants?.__LEJOY_API_BASE_URL__).toBe(
      JSON.stringify("http://127.0.0.1:3000"),
    );

    const apiSource = readFileSync(
      new URL("../../miniprogram/src/services/api.ts", import.meta.url),
      "utf8",
    );
    expect(apiSource).not.toContain("process.env");
    expect(apiSource).toContain("__LEJOY_API_BASE_URL__");
  });
});
