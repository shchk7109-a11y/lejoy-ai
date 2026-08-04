export type PlantImageApi = {
  getImageInfo(options: { src: string }): Promise<{ width: number; height: number }>;
  compressImage(options: {
    src: string;
    quality: number;
    compressedWidth: number;
    compressedHeight: number;
  }): Promise<{ tempFilePath: string }>;
};

export function fitImageWithin(width: number, height: number, maxSide = 1280): {
  width: number;
  height: number;
} {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0 || maxSide <= 0) {
    throw new Error("图片尺寸无效");
  }
  const scale = Math.min(1, maxSide / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

export async function compressPlantImage(filePath: string, api: PlantImageApi): Promise<string> {
  try {
    const original = await api.getImageInfo({ src: filePath });
    const target = fitImageWithin(original.width, original.height);
    if (target.width === original.width && target.height === original.height) return filePath;

    const compressed = await api.compressImage({
      src: filePath,
      quality: 82,
      compressedWidth: target.width,
      compressedHeight: target.height,
    });
    const verified = await api.getImageInfo({ src: compressed.tempFilePath });
    if (Math.max(verified.width, verified.height) > 1280) throw new Error("压缩后尺寸超限");
    return compressed.tempFilePath;
  } catch {
    throw new Error("图片压缩失败，请重新选择");
  }
}
