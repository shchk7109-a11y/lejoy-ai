import { describe, expect, it, vi } from "vitest";
import { createStoryStorage, type StoryStorageDependencies } from "../../miniprogram/src/features/story-time/local-storage";
import { MAX_LOCAL_STORIES, type LocalStory } from "../../miniprogram/src/features/story-time/library";

function remoteStory(id = "story-1"): LocalStory {
  return {
    id,
    title: "小象学分享",
    theme: "温馨治愈",
    createdAt: 1,
    pages: [1, 2, 3, 4].map((pageNumber) => ({
      pageNumber,
      text: `第 ${pageNumber} 页`,
      imagePrompt: `page ${pageNumber}`,
      imageUrl: `https://cdn.example/${id}-p${pageNumber}.png`,
      imageFileKey: `stories/7/${id}-p${pageNumber}.png`,
      audioUrl: pageNumber <= 2 ? `https://cdn.example/${id}-p${pageNumber}.mp3` : undefined,
      audioFileKey: pageNumber <= 2 ? `stories-audio/7/${id}-p${pageNumber}.mp3` : undefined,
    })),
  };
}

function harness(overrides: Partial<StoryStorageDependencies> = {}) {
  let stories: unknown = [];
  let pending: unknown = [];
  const events: string[] = [];
  const deps: StoryStorageDependencies = {
    readStories: () => stories,
    writeStories: (value) => { events.push("write-stories"); stories = value; },
    readPendingAssets: () => pending,
    writePendingAssets: (value) => { pending = value; },
    download: vi.fn(async (url) => { events.push(`download:${url}`); return `temp://${url.split("/").pop()}`; }),
    saveFile: vi.fn(async (path) => { events.push(`save:${path}`); return path.replace("temp://", "wxfile://"); }),
    unlink: vi.fn(async (path) => { events.push(`unlink:${path}`); }),
    ...overrides,
  };
  return { storage: createStoryStorage(deps), deps, events, getStories: () => stories, getPending: () => pending };
}

describe("故事本地文件事务", () => {
  it("四页图片全部持久化后才写书架且只保存已有音频", async () => {
    const test = harness();

    const result = await test.storage.saveDraft(remoteStory());

    expect(result.status).toBe("saved");
    expect(test.deps.download).toHaveBeenCalledTimes(6);
    expect(test.deps.saveFile).toHaveBeenCalledTimes(6);
    expect(test.events.at(-1)).toBe("write-stories");
    expect(result.story?.pages.map((page) => page.imageUrl)).toEqual([
      "wxfile://story-1-p1.png",
      "wxfile://story-1-p2.png",
      "wxfile://story-1-p3.png",
      "wxfile://story-1-p4.png",
    ]);
    expect(result.remoteFileKeys).toHaveLength(6);
  });

  it("中途失败会回滚本次已经保存的文件且不写书架", async () => {
    let calls = 0;
    const test = harness({
      saveFile: vi.fn(async (path) => {
        calls += 1;
        if (calls === 3) throw new Error("storage full");
        return path.replace("temp://", "wxfile://");
      }),
    });

    await expect(test.storage.saveDraft(remoteStory())).rejects.toThrow("storage full");

    expect(test.deps.unlink).toHaveBeenCalledTimes(2);
    expect(test.getStories()).toEqual([]);
  });

  it("书架已满时不下载第七本", async () => {
    const full = Array.from({ length: MAX_LOCAL_STORIES }, (_, index) => ({ ...remoteStory(`story-${index}`), pages: remoteStory(`story-${index}`).pages.map((page) => ({ ...page, imageUrl: `wxfile://story-${index}-${page.pageNumber}.png` })) }));
    const test = harness({ readStories: () => full });

    const result = await test.storage.saveDraft(remoteStory("story-7"));

    expect(result.status).toBe("full");
    expect(test.deps.download).not.toHaveBeenCalled();
  });

  it("删除故事会删除其本地图片和音频并更新索引", async () => {
    const saved = remoteStory();
    saved.pages = saved.pages.map((page) => ({
      ...page,
      imageUrl: page.imageUrl?.replace("https://cdn.example/", "wxfile://"),
      audioUrl: page.audioUrl?.replace("https://cdn.example/", "wxfile://"),
      imageFileKey: undefined,
      audioFileKey: undefined,
    }));
    const test = harness({ readStories: () => [saved] });

    const removed = await test.storage.remove(saved.id);

    expect(removed).toBe(true);
    expect(test.deps.unlink).toHaveBeenCalledTimes(6);
    expect(test.getStories()).toEqual([]);
  });

  it("待释放文件键会去重且只有服务端确认后才清空", async () => {
    const test = harness();
    test.storage.queueRemoteAssets(["stories/7/a.png", "stories/7/a.png", "stories-audio/7/a.mp3"]);
    expect(test.getPending()).toEqual(["stories/7/a.png", "stories-audio/7/a.mp3"]);
    const release = vi.fn(async () => undefined);

    await test.storage.flushRemoteAssets(release);

    expect(release).toHaveBeenCalledWith(["stories/7/a.png", "stories-audio/7/a.mp3"]);
    expect(test.getPending()).toEqual([]);
  });

  it("服务端要求保留的审核中图片会继续留在待释放队列", async () => {
    const test = harness();
    test.storage.queueRemoteAssets(["stories/7/pending.png", "stories-audio/7/done.mp3"]);

    await test.storage.flushRemoteAssets(async () => ({ retainedFileKeys: ["stories/7/pending.png"] }));

    expect(test.getPending()).toEqual(["stories/7/pending.png"]);
  });
});
