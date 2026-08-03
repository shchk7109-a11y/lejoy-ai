export type StoryPageRenderPlan = {
  canvasWidth: number;
  canvasHeight: number;
  imageHeight: number;
  title: string;
  text: string;
  imagePath: string;
  footer: string;
};

export function wrapCanvasText(
  text: string,
  maxWidth: number,
  measure: (value: string) => number,
): string[] {
  const lines: string[] = [];
  let current = "";
  for (const character of text) {
    const next = `${current}${character}`;
    if (current && measure(next) > maxWidth) {
      lines.push(current);
      current = character;
    } else {
      current = next;
    }
  }
  if (current) lines.push(current);
  return lines;
}

export function buildStoryPageRenderPlan(input: {
  title: string;
  pageNumber: number;
  pageCount: number;
  text: string;
  imagePath: string;
}): StoryPageRenderPlan {
  return {
    canvasWidth: 1080,
    canvasHeight: 1440,
    imageHeight: 900,
    title: input.title,
    text: input.text,
    imagePath: input.imagePath,
    footer: `第 ${input.pageNumber} / ${input.pageCount} 页 · AI 生成内容`,
  };
}

export class StoryPageExportError extends Error {
  constructor(
    public readonly failedPage: number,
    public readonly completedPages: number[],
    public readonly originalError?: unknown,
  ) {
    super(`第 ${failedPage} 页保存失败`);
    this.name = "StoryPageExportError";
  }
}

export async function exportStoryPages<T extends number>(
  pageNumbers: T[],
  renderAndSave: (pageNumber: T) => Promise<void>,
): Promise<T[]> {
  const completedPages: T[] = [];
  for (const pageNumber of pageNumbers) {
    try {
      await renderAndSave(pageNumber);
      completedPages.push(pageNumber);
    } catch (error) {
      throw new StoryPageExportError(pageNumber, completedPages, error);
    }
  }
  return completedPages;
}
