const DIMENSION_STEP = 16;
const MIN_DIMENSION = 512;

function positiveInteger(value: string): number | undefined {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

export function resolveImageEditMaxEdge(configured: string, legacySize: string): number | undefined {
  const explicit = positiveInteger(configured.trim());
  if (explicit) return explicit;

  const match = legacySize.trim().match(/^(\d+)x(\d+)$/i);
  if (!match) return undefined;
  return Math.max(Number(match[1]), Number(match[2]));
}

export function fitImageEditSize(width: number, height: number, maxEdge: number): string {
  if (![width, height, maxEdge].every(Number.isFinite) || width <= 0 || height <= 0 || maxEdge < MIN_DIMENSION) {
    throw new Error("原图尺寸或修图最大边配置无效");
  }

  const landscape = width >= height;
  const shortSource = landscape ? height : width;
  const longSource = landscape ? width : height;
  const alignedLong = Math.floor(maxEdge / DIMENSION_STEP) * DIMENSION_STEP;
  const alignedShort = Math.round((alignedLong * shortSource) / longSource / DIMENSION_STEP) * DIMENSION_STEP;
  if (alignedShort < MIN_DIMENSION) {
    throw new Error("原图比例过于狭长，无法在不改变构图的情况下处理");
  }

  return landscape ? `${alignedLong}x${alignedShort}` : `${alignedShort}x${alignedLong}`;
}
