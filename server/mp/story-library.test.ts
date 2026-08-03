import { describe, expect, it } from "vitest";
import {
  MAX_LOCAL_STORIES,
  addStoryToLibrary,
  nextStoryPage,
  previousStoryPage,
  removeStoryFromLibrary,
  type LocalStory,
} from "../../miniprogram/src/features/story-time/library";

function makeStory(index: number, local = true): LocalStory {
  return {
    id: `story-${index}`,
    title: `故事 ${index}`,
    theme: "温馨治愈",
    createdAt: index,
    pages: [1, 2, 3, 4].map((pageNumber) => ({
      pageNumber,
      text: `第 ${pageNumber} 页`,
      imagePrompt: `page ${pageNumber}`,
      imageUrl: local ? `wxfile://story-${index}-page-${pageNumber}.png` : `https://cdn.example/story-${index}-${pageNumber}.png`,
      audioUrl: pageNumber <= 2 && local ? `wxfile://story-${index}-page-${pageNumber}.mp3` : undefined,
    })),
  };
}

describe("本机故事书架领域规则", () => {
  it("最多保存六本且第七本不会覆盖已有故事", () => {
    const stories = Array.from({ length: MAX_LOCAL_STORIES }, (_, index) => makeStory(index + 1));

    const result = addStoryToLibrary(stories, makeStory(7));

    expect(result.status).toBe("full");
    expect(result.stories).toEqual(stories);
  });

  it("相同故事再次保存会更新内容而不是占用新位置", () => {
    const existing = makeStory(1);
    const updated = { ...makeStory(1), title: "更新后的故事" };

    const result = addStoryToLibrary([existing], updated);

    expect(result.status).toBe("saved");
    expect(result.stories).toHaveLength(1);
    expect(result.stories[0].title).toBe("更新后的故事");
  });

  it("删除故事会返回需要清理的全部本地文件", () => {
    const story = makeStory(1);

    const result = removeStoryFromLibrary([story], story.id);

    expect(result.stories).toEqual([]);
    expect(result.files).toEqual([
      "wxfile://story-1-page-1.png",
      "wxfile://story-1-page-1.mp3",
      "wxfile://story-1-page-2.png",
      "wxfile://story-1-page-2.mp3",
      "wxfile://story-1-page-3.png",
      "wxfile://story-1-page-4.png",
    ]);
  });

  it("播放器页码不会越过第一页和第四页", () => {
    expect(previousStoryPage(0, 4)).toBe(0);
    expect(previousStoryPage(2, 4)).toBe(1);
    expect(nextStoryPage(2, 4)).toBe(3);
    expect(nextStoryPage(3, 4)).toBe(3);
  });
});
