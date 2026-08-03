import Taro from "@tarojs/taro";
import { createStoryStorage } from "./local-storage";
import type { LocalStory } from "./library";

const STORY_LIBRARY_KEY = "lejoy.story.library.v1";
const STORY_PENDING_ASSETS_KEY = "lejoy.story.remote-assets.v1";
export const STORY_PLAYING_KEY = "lejoy.story.playing.v1";

function unlink(filePath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    Taro.getFileSystemManager().unlink({
      filePath,
      success: () => resolve(),
      fail: reject,
    });
  });
}

function saveFile(tempFilePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    Taro.saveFile({
      tempFilePath,
      success: (result) => resolve(result.savedFilePath),
      fail: reject,
    });
  });
}

export const storyStorage = createStoryStorage({
  readStories: () => Taro.getStorageSync(STORY_LIBRARY_KEY),
  writeStories: (stories) => Taro.setStorageSync(STORY_LIBRARY_KEY, stories),
  readPendingAssets: () => Taro.getStorageSync(STORY_PENDING_ASSETS_KEY),
  writePendingAssets: (fileKeys) => Taro.setStorageSync(STORY_PENDING_ASSETS_KEY, fileKeys),
  download: async (url) => {
    const result = await Taro.downloadFile({ url });
    if (result.statusCode < 200 || result.statusCode >= 300) throw new Error("故事文件下载失败");
    return result.tempFilePath;
  },
  saveFile,
  unlink,
});

export function createStoryId(): string {
  return `story-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function writePlayingStory(story: LocalStory): void {
  Taro.setStorageSync(STORY_PLAYING_KEY, story);
}

export function readPlayingStory(): LocalStory | undefined {
  const story = Taro.getStorageSync(STORY_PLAYING_KEY) as LocalStory | undefined;
  return story && Array.isArray(story.pages) && story.pages.length === 4 ? story : undefined;
}
