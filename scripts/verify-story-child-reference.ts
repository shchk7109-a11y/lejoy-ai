import "dotenv/config";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { extname } from "node:path";
import { aiGenerateImage } from "../server/ai/gateway";
import { buildStoryImagePrompt } from "../server/minimaxService";
import { storageDelete, storageGet, storagePut } from "../server/storage";

const imagePath = process.env.STORY_REFERENCE_IMAGE_PATH;
if (!imagePath) throw new Error("请设置 STORY_REFERENCE_IMAGE_PATH 指向授权的非敏感人物示例图");

const extension = extname(imagePath).toLowerCase();
if (![".jpg", ".jpeg", ".png", ".webp"].includes(extension)) {
  throw new Error("示例图仅支持 jpg、png、webp");
}
const mimeType = extension === ".png" ? "image/png" : extension === ".webp" ? "image/webp" : "image/jpeg";
const storageExtension = extension === ".jpeg" ? ".jpg" : extension;
const key = `story-refs/verification/${randomUUID()}${storageExtension}`;
const input = await readFile(imagePath);
const prompts = [
  "孩子在森林入口挥手",
  "孩子帮助迷路的小鹿",
  "孩子和小鹿越过小溪",
  "孩子在夕阳下与朋友告别",
];

try {
  await storagePut(key, input, mimeType);
  const reference = await storageGet(key);
  for (let index = 0; index < prompts.length; index += 1) {
    const startedAt = Date.now();
    const image = await aiGenerateImage({
      prompt: buildStoryImagePrompt(prompts[index], index + 1, { hasChildReference: true }),
      aspectRatio: "1:1",
      profile: "story",
      referenceImageUrl: reference.url,
    });
    console.log(JSON.stringify({
      pageNumber: index + 1,
      durationMs: Date.now() - startedAt,
      outputBytes: Buffer.from(image, "base64").byteLength,
      hasReferenceImage: true,
    }));
  }
} finally {
  await storageDelete(key);
  console.log(JSON.stringify({ referenceCleanup: "success" }));
}
