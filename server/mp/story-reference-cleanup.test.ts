import { describe, expect, it, vi } from "vitest";
import { deleteExpiredStoryReferences } from "./story-reference-cleanup";

describe("故事参考图兜底清理", () => {
  it("只删除 story-refs 下超过一小时的对象", async () => {
    const now = new Date("2026-08-04T12:00:00.000Z");
    const list = vi.fn(async () => [
      { key: "story-refs/7/old.jpg", lastModified: new Date("2026-08-04T10:59:59.000Z") },
      { key: "story-refs/7/fresh.jpg", lastModified: new Date("2026-08-04T11:30:00.000Z") },
    ]);
    const remove = vi.fn(async () => undefined);

    await expect(deleteExpiredStoryReferences({ now, list, remove })).resolves.toEqual({
      scanned: 2,
      deleted: 1,
      failed: 0,
    });
    expect(list).toHaveBeenCalledWith("story-refs/");
    expect(remove).toHaveBeenCalledWith("story-refs/7/old.jpg");
  });

  it("单个删除失败不会阻止清理其他过期对象", async () => {
    const remove = vi.fn()
      .mockRejectedValueOnce(new Error("temporary OSS error"))
      .mockResolvedValueOnce(undefined);

    const result = await deleteExpiredStoryReferences({
      now: new Date("2026-08-04T12:00:00.000Z"),
      list: async () => [
        { key: "story-refs/7/a.jpg", lastModified: new Date(0) },
        { key: "story-refs/8/b.jpg", lastModified: new Date(0) },
      ],
      remove,
    });

    expect(result).toEqual({ scanned: 2, deleted: 1, failed: 1 });
    expect(remove).toHaveBeenCalledTimes(2);
  });
});
