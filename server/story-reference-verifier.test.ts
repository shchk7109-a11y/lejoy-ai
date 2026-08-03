import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("故事儿童参考图真实链路验证脚本", () => {
  it("只输出页码、耗时、字节数和清理状态", async () => {
    const script = await readFile("scripts/verify-story-child-reference.ts", "utf8");

    expect(script).toContain("STORY_REFERENCE_IMAGE_PATH");
    expect(script).toContain("hasReferenceImage: true");
    expect(script).toContain("referenceCleanup: \"success\"");
    expect(script).not.toMatch(/console\.log\([^\n]*(?:reference\.url|\bkey\b|imagePath|input)/);
  });
});
