import { describe, expect, it } from "vitest";
import { readImageDimensions } from "./imageDimensions";

describe("原图尺寸读取", () => {
  it("读取 PNG 的宽高", () => {
    const png = Buffer.alloc(24);
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(png);
    png.writeUInt32BE(4032, 16);
    png.writeUInt32BE(3024, 20);
    expect(readImageDimensions(png)).toEqual({ width: 4032, height: 3024 });
  });

  it("读取 JPEG 的宽高", () => {
    const jpeg = Buffer.from([
      0xff, 0xd8,
      0xff, 0xe0, 0x00, 0x04, 0x00, 0x00,
      0xff, 0xc0, 0x00, 0x0b, 0x08, 0x07, 0x80, 0x04, 0x38, 0x03, 0x01, 0x11, 0x00,
      0xff, 0xd9,
    ]);
    expect(readImageDimensions(jpeg)).toEqual({ width: 1080, height: 1920 });
  });
});
