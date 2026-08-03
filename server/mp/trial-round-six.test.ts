import { existsSync, readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { describe, expect, it, vi } from "vitest";

const queuePath = new URL("../../miniprogram/src/features/story-time/image-queue.ts", import.meta.url);

describe("试用第六轮故事配图", () => {
  it("四页严格串行，单页失败后继续并逐页回填", async () => {
    expect(existsSync(queuePath)).toBe(true);
    if (!existsSync(queuePath)) return;
    const { runStoryImageQueue } = await import(pathToFileURL(queuePath.pathname).href);
    const events: string[] = [];
    let active = 0;
    let maxActive = 0;
    const plans = [1, 2, 3, 4].map((pageNumber) => ({
      pageNumber,
      imagePrompt: `page ${pageNumber}`,
      operationId: `story-image-${pageNumber}-abcdefghijkl`,
    }));

    const failures = await runStoryImageQueue(plans, async (plan: { pageNumber: number }) => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await Promise.resolve();
      active -= 1;
      if (plan.pageNumber === 2) throw new Error("page 2 failed");
      return { imageUrl: `https://cdn.example/page-${plan.pageNumber}.png` };
    }, {
      onStart: (plan: { pageNumber: number }) => events.push(`start-${plan.pageNumber}`),
      onSuccess: (plan: { pageNumber: number }) => events.push(`success-${plan.pageNumber}`),
      onFailure: (plan: { pageNumber: number }) => events.push(`failure-${plan.pageNumber}`),
    });

    expect(maxActive).toBe(1);
    expect(events).toEqual([
      "start-1", "success-1",
      "start-2", "failure-2",
      "start-3", "success-3",
      "start-4", "success-4",
    ]);
    expect(failures.map((failure: { plan: { pageNumber: number } }) => failure.plan.pageNumber)).toEqual([2]);
  });

  it("页面显示当前页进度、页内重试，并仅在四页齐全后显示朗读入口", () => {
    const page = readFileSync(
      new URL("../../miniprogram/src/pages/story-time/index.tsx", import.meta.url),
      "utf8",
    );
    const progress = readFileSync(
      new URL("../../miniprogram/src/components/GenerationProgress/index.tsx", import.meta.url),
      "utf8",
    );
    const progressStyle = readFileSync(
      new URL("../../miniprogram/src/components/GenerationProgress/index.scss", import.meta.url),
      "utf8",
    );
    expect(page).toContain("正在画第 ${activeImagePage} 页（共 4 页）");
    expect(page).toContain("每页约半分钟");
    expect(page).toContain("inline={true}");
    expect(progress).toContain("generation-progress--inline");
    expect(progressStyle).toContain(".generation-progress--inline");
    expect(page).toContain("重试这一页");
    expect(page).toContain("getStoryImageOperationId");
    expect(page).not.toContain("Promise.all(plans.map");
    expect(page).toContain("const allImagesReady = pages.length === 4 && pages.every((page) => Boolean(page.imageUrl))");
    expect(page).toContain("{allImagesReady ? (");
  });

  it("环境示例登记故事模型且前端生成请求保持不自动重试", () => {
    const env = readFileSync(new URL("../../.env.example", import.meta.url), "utf8");
    const api = readFileSync(new URL("../../miniprogram/src/services/api.ts", import.meta.url), "utf8");
    const pageImageBlock = api.slice(
      api.indexOf("generateStoryPageImage"),
      api.indexOf("generateStoryPageSpeech"),
    );
    expect(env).toContain("ARK_STORY_IMAGE_MODEL=doubao-seedream-4-0-250828");
    expect(pageImageBlock).toContain('"/api/mp/story/page-image"');
    expect(pageImageBlock).toContain('retry: "never"');
    expect(pageImageBlock).toContain("operationId");
  });

  it("Seedream 网关单次调用保留 120 秒超时余量", () => {
    const client = readFileSync(new URL("../ai/volcImageClient.ts", import.meta.url), "utf8");
    expect(client).toContain("timeout: 120000");
  });

  it("page-image 客户端等待时间覆盖服务端 120 秒且不改变其他请求", async () => {
    const policy = await import(new URL("../../miniprogram/src/services/request-policy.ts", import.meta.url).href);
    const api = readFileSync(new URL("../../miniprogram/src/services/api.ts", import.meta.url), "utf8");
    expect(policy.MP_STORY_IMAGE_TIMEOUT_MS).toBeGreaterThan(120_000);
    expect(api).toContain("timeout: options.timeoutMs ?? MP_REQUEST_TIMEOUT_MS");
    expect(api).toContain("timeoutMs: MP_STORY_IMAGE_TIMEOUT_MS");
  });
});
