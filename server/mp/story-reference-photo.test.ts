import { describe, expect, it, vi } from "vitest";
import { runWithStoryReference } from "../../miniprogram/src/features/story-time/reference-photo";

describe("故事参考照片会话", () => {
  it("有本地照片时上传一次、执行任务并在成功后清理", async () => {
    const upload = vi.fn(async () => ({ fileKey: "story-refs/7/child.jpg" }));
    const release = vi.fn(async () => undefined);
    const run = vi.fn(async (fileKey?: string) => fileKey);

    await expect(runWithStoryReference({
      localPath: "wxfile://child.jpg",
      upload,
      run,
      release,
    })).resolves.toBe("story-refs/7/child.jpg");
    expect(upload).toHaveBeenCalledOnce();
    expect(release).toHaveBeenCalledWith("story-refs/7/child.jpg");
  });

  it("任务失败和清理失败时保留原任务错误", async () => {
    const taskError = new Error("page generation failed");

    await expect(runWithStoryReference({
      localPath: "wxfile://child.jpg",
      upload: async () => ({ fileKey: "story-refs/7/child.jpg" }),
      run: async () => { throw taskError; },
      release: async () => { throw new Error("cleanup failed"); },
    })).rejects.toBe(taskError);
  });

  it("无照片时不上传不清理并以 undefined 运行", async () => {
    const upload = vi.fn();
    const release = vi.fn();
    const run = vi.fn(async (fileKey?: string) => fileKey ?? "no-reference");

    await expect(runWithStoryReference({ localPath: "", upload, run, release }))
      .resolves.toBe("no-reference");
    expect(upload).not.toHaveBeenCalled();
    expect(release).not.toHaveBeenCalled();
  });
});
