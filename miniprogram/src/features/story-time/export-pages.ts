export type StoryPageRenderPlan = {
  canvasWidth: number;
  canvasHeight: number;
  titleX: number;
  titleY: number;
  imageBox: Rect;
  textX: number;
  textY: number;
  textMaxWidth: number;
  textLineHeight: number;
  footerY: number;
  title: string;
  text: string;
  imagePath: string;
  footer: string;
};

export type Rect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export function fitImageWithinBox(input: {
  sourceWidth: number;
  sourceHeight: number;
  box: Rect;
}): Rect {
  const { sourceWidth, sourceHeight, box } = input;
  if (sourceWidth <= 0 || sourceHeight <= 0 || box.width <= 0 || box.height <= 0) {
    throw new Error("图片尺寸无效");
  }
  const scale = Math.min(box.width / sourceWidth, box.height / sourceHeight);
  const width = sourceWidth * scale;
  const height = sourceHeight * scale;
  return {
    x: box.x + (box.width - width) / 2,
    y: box.y + (box.height - height) / 2,
    width,
    height,
  };
}

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
    canvasHeight: 1920,
    titleX: 72,
    titleY: 112,
    imageBox: { x: 60, y: 190, width: 960, height: 960 },
    textX: 72,
    textY: 1240,
    textMaxWidth: 936,
    textLineHeight: 58,
    footerY: 1840,
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

export function isAlbumPermissionError(error: unknown): boolean {
  const message = error instanceof Error
    ? error.message
    : error && typeof error === "object" && "errMsg" in error
      ? String((error as { errMsg?: unknown }).errMsg ?? "")
      : String(error ?? "");
  return /auth|authorize|permission|deny/i.test(message);
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
