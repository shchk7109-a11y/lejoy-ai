export const MAX_LOCAL_STORIES = 6;

export type LocalStoryPage = {
  pageNumber: number;
  text: string;
  imagePrompt: string;
  imageUrl?: string;
  imageFileKey?: string;
  audioUrl?: string;
  audioFileKey?: string;
};

export type LocalStory = {
  id: string;
  title: string;
  theme: string;
  createdAt: number;
  pages: LocalStoryPage[];
};

export type AddStoryResult = {
  status: "saved" | "full";
  stories: LocalStory[];
};

export type RemoveStoryResult = {
  stories: LocalStory[];
  files: string[];
};

function isStoryPage(value: unknown): value is LocalStoryPage {
  if (!value || typeof value !== "object") return false;
  const page = value as Partial<LocalStoryPage>;
  return Number.isInteger(page.pageNumber)
    && typeof page.text === "string"
    && typeof page.imagePrompt === "string"
    && typeof page.imageUrl === "string"
    && !/^https?:\/\//i.test(page.imageUrl);
}

function isLocalStory(value: unknown): value is LocalStory {
  if (!value || typeof value !== "object") return false;
  const story = value as Partial<LocalStory>;
  if (typeof story.id !== "string" || !story.id) return false;
  if (typeof story.title !== "string" || typeof story.theme !== "string") return false;
  if (typeof story.createdAt !== "number" || !Array.isArray(story.pages) || story.pages.length !== 4) return false;
  if (!story.pages.every(isStoryPage)) return false;
  return new Set(story.pages.map((page) => page.pageNumber)).size === 4;
}

export function parseStoryLibrary(value: unknown): LocalStory[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isLocalStory).slice(0, MAX_LOCAL_STORIES);
}

export function addStoryToLibrary(stories: LocalStory[], story: LocalStory): AddStoryResult {
  const existingIndex = stories.findIndex((item) => item.id === story.id);
  if (existingIndex >= 0) {
    const next = [...stories];
    next[existingIndex] = story;
    return { status: "saved", stories: next };
  }
  if (stories.length >= MAX_LOCAL_STORIES) return { status: "full", stories };
  return { status: "saved", stories: [story, ...stories] };
}

export function removeStoryFromLibrary(stories: LocalStory[], storyId: string): RemoveStoryResult {
  const removed = stories.find((story) => story.id === storyId);
  const files = removed?.pages.flatMap((page) => [page.imageUrl, page.audioUrl].filter((value): value is string => Boolean(value))) ?? [];
  return {
    stories: stories.filter((story) => story.id !== storyId),
    files,
  };
}

export function previousStoryPage(currentIndex: number, pageCount: number): number {
  if (pageCount <= 0) return 0;
  return Math.max(0, Math.min(currentIndex - 1, pageCount - 1));
}

export function nextStoryPage(currentIndex: number, pageCount: number): number {
  if (pageCount <= 0) return 0;
  return Math.max(0, Math.min(currentIndex + 1, pageCount - 1));
}
