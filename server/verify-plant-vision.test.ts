import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const scriptPath = new URL("../scripts/verify-plant-vision.ts", import.meta.url);

describe("识花视觉真实链路验证脚本", () => {
  it("覆盖花朵近拍、整株和树叶三类样本", () => {
    expect(existsSync(scriptPath)).toBe(true);
    if (!existsSync(scriptPath)) return;
    const source = readFileSync(scriptPath, "utf8");
    expect(source).toContain('sample: "close-flower"');
    expect(source).toContain('sample: "whole-plant"');
    expect(source).toContain('sample: "tree-leaf"');
    expect(source).toContain("under20s");
    expect(source).toContain("averageMs");
  });

  it("先把公开样本转为内联图片，避免模型侧拉取境外图片超时", () => {
    expect(existsSync(scriptPath)).toBe(true);
    if (!existsSync(scriptPath)) return;
    const source = readFileSync(scriptPath, "utf8");
    expect(source).toContain("fetchSampleAsDataUrl");
    expect(source).toContain("arrayBuffer");
    expect(source).toContain("data:image/jpeg;base64,");
  });

  it("只输出诊断字段，不读取或打印密钥与图片正文", () => {
    expect(existsSync(scriptPath)).toBe(true);
    if (!existsSync(scriptPath)) return;
    const source = readFileSync(scriptPath, "utf8");
    expect(source).not.toContain("DASHSCOPE_API_KEY");
    expect(source).not.toContain("Authorization");
    expect(source).not.toMatch(/console\.(?:log|error)\([^\n]*(?:imageUrl|dataUrl|base64)/);
    expect(source).toContain("provider");
    expect(source).toContain("model");
    expect(source).toContain("fallbackUsed");
    expect(source).toContain("durationMs");
    expect(source).toContain("identifiedName");
  });

  it("单张失败不阻断后续样本并最终返回失败退出码", () => {
    expect(existsSync(scriptPath)).toBe(true);
    if (!existsSync(scriptPath)) return;
    const source = readFileSync(scriptPath, "utf8");
    expect(source).toContain("for (const sample of SAMPLES)");
    expect(source).toContain("process.exitCode = 1");
    expect(source).toContain("successCount !== SAMPLES.length");
  });
});
