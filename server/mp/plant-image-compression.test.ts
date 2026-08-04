import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getImageInfo: vi.fn(),
  compressImage: vi.fn(),
}));

import {
  compressPlantImage,
  fitImageWithin,
} from "../../miniprogram/src/pages/life-assistant/image-compression";

describe("识花图片最长边压缩", () => {
  const api = { getImageInfo: mocks.getImageInfo, compressImage: mocks.compressImage };
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("按原比例将竖图最长边缩至 1280px", () => {
    expect(fitImageWithin(3024, 4032, 1280)).toEqual({ width: 960, height: 1280 });
    expect(fitImageWithin(4032, 3024, 1280)).toEqual({ width: 1280, height: 960 });
  });

  it("不放大已经小于限制的图片", () => {
    expect(fitImageWithin(800, 600, 1280)).toEqual({ width: 800, height: 600 });
  });

  it("超限图片压缩后复核尺寸", async () => {
    mocks.getImageInfo
      .mockResolvedValueOnce({ width: 3024, height: 4032 })
      .mockResolvedValueOnce({ width: 960, height: 1280 });
    mocks.compressImage.mockResolvedValue({ tempFilePath: "/tmp/flower-small.jpg" });

    await expect(compressPlantImage("/tmp/flower.jpg", api)).resolves.toBe("/tmp/flower-small.jpg");
    expect(mocks.compressImage).toHaveBeenCalledWith({
      src: "/tmp/flower.jpg",
      quality: 82,
      compressedWidth: 960,
      compressedHeight: 1280,
    });
    expect(mocks.getImageInfo).toHaveBeenLastCalledWith({ src: "/tmp/flower-small.jpg" });
  });

  it("压缩后仍超限时阻断上传", async () => {
    mocks.getImageInfo
      .mockResolvedValueOnce({ width: 3024, height: 4032 })
      .mockResolvedValueOnce({ width: 2000, height: 2667 });
    mocks.compressImage.mockResolvedValue({ tempFilePath: "/tmp/flower-still-large.jpg" });

    await expect(compressPlantImage("/tmp/flower.jpg", api))
      .rejects.toThrow("图片压缩失败，请重新选择");
  });
});
