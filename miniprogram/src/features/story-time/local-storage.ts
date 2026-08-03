import {
  addStoryToLibrary,
  parseStoryLibrary,
  removeStoryFromLibrary,
  type LocalStory,
  type LocalStoryPage,
} from "./library";

export type StoryStorageDependencies = {
  readStories: () => unknown;
  writeStories: (stories: LocalStory[]) => void;
  readPendingAssets: () => unknown;
  writePendingAssets: (fileKeys: string[]) => void;
  download: (url: string) => Promise<string>;
  saveFile: (tempFilePath: string) => Promise<string>;
  unlink: (filePath: string) => Promise<void>;
};

export type SaveStoryResult = {
  status: "saved" | "full";
  story?: LocalStory;
  remoteFileKeys: string[];
};

function pendingFileKeys(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.filter((item): item is string => typeof item === "string" && Boolean(item))));
}

function remoteAssetKeys(story: LocalStory): string[] {
  return Array.from(new Set(story.pages.flatMap((page) => (
    [page.imageFileKey, page.audioFileKey].filter((value): value is string => Boolean(value))
  ))));
}

function isRemoteUrl(value: string | undefined): value is string {
  return Boolean(value && /^https?:\/\//i.test(value));
}

export function createStoryStorage(deps: StoryStorageDependencies) {
  const list = (): LocalStory[] => parseStoryLibrary(deps.readStories());

  const persistAsset = async (url: string | undefined, required: boolean, createdFiles: string[]): Promise<string | undefined> => {
    if (!url) {
      if (required) throw new Error("故事图片尚未准备完成");
      return undefined;
    }
    if (!isRemoteUrl(url)) return url;
    const tempFilePath = await deps.download(url);
    const savedFilePath = await deps.saveFile(tempFilePath);
    createdFiles.push(savedFilePath);
    return savedFilePath;
  };

  const saveDraft = async (draft: LocalStory): Promise<SaveStoryResult> => {
    const current = list();
    if (!current.some((story) => story.id === draft.id) && current.length >= 6) {
      return { status: "full", remoteFileKeys: [] };
    }
    const createdFiles: string[] = [];
    try {
      const pages: LocalStoryPage[] = [];
      for (const page of [...draft.pages].sort((left, right) => left.pageNumber - right.pageNumber)) {
        const imageUrl = await persistAsset(page.imageUrl, true, createdFiles);
        const audioUrl = await persistAsset(page.audioUrl, false, createdFiles);
        pages.push({
          ...page,
          imageUrl,
          audioUrl,
          imageFileKey: undefined,
          audioFileKey: undefined,
        });
      }
      const story = { ...draft, pages };
      const added = addStoryToLibrary(current, story);
      if (added.status === "full") return { status: "full", remoteFileKeys: [] };
      deps.writeStories(added.stories);
      return { status: "saved", story, remoteFileKeys: remoteAssetKeys(draft) };
    } catch (error) {
      await Promise.allSettled(createdFiles.map((filePath) => deps.unlink(filePath)));
      throw error;
    }
  };

  const remove = async (storyId: string): Promise<boolean> => {
    const current = list();
    const result = removeStoryFromLibrary(current, storyId);
    if (result.stories.length === current.length) return false;
    deps.writeStories(result.stories);
    await Promise.allSettled(result.files.map((filePath) => deps.unlink(filePath)));
    return true;
  };

  const queueRemoteAssets = (fileKeys: string[]): void => {
    deps.writePendingAssets(Array.from(new Set([
      ...pendingFileKeys(deps.readPendingAssets()),
      ...fileKeys.filter(Boolean),
    ])));
  };

  const flushRemoteAssets = async (release: (fileKeys: string[]) => Promise<unknown>): Promise<number> => {
    const fileKeys = pendingFileKeys(deps.readPendingAssets());
    if (!fileKeys.length) return 0;
    await release(fileKeys);
    deps.writePendingAssets([]);
    return fileKeys.length;
  };

  return { list, saveDraft, remove, queueRemoteAssets, flushRemoteAssets };
}

export type StoryStorage = ReturnType<typeof createStoryStorage>;
