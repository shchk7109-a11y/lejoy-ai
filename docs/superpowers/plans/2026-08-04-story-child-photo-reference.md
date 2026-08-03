# Story Child Photo Reference Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 AI 故事会增加可选儿童照片参考，使四页 Seedream 绘本保持同一主角外貌，同时确保原照片只短期使用并在一小时内删除。

**Architecture:** 小程序只在开始配图时上传本地临时照片，并用一个受控会话把同一 `referenceFileKey` 传给四页串行请求，随后在 `finally` 中释放。服务端使用独立 `story-refs/<userId>/` 前缀、所有权校验、媒体安全登记和定时清理；图片网关仅在故事 profile 下把参考 URL 传给 Seedream，其他图像业务不变。

**Tech Stack:** TypeScript、React 18、Taro 4、Express、Vitest、AWS S3 SDK（阿里云 OSS S3 兼容）、Seedream 图像生成 API。

---

## 文件结构

- Create: `server/mp/image-upload.ts` — 共享、安全地解析 10 MB 以内的 jpg/png/webp Base64，避免故事与修图上传规则分叉。
- Create: `server/mp/story-reference-cleanup.ts` — 识别临时参考图前缀、删除过期对象并启动 15 分钟清理定时器。
- Create: `server/mp/story-reference-cleanup.test.ts` — 验证一小时边界、前缀限制、删除失败隔离和定时器行为。
- Create: `miniprogram/src/features/story-time/reference-photo.ts` — 组织“上传一次—运行配图—必定清理”的照片会话。
- Create: `server/mp/story-reference-photo.test.ts` — 在 Node/Vitest 中验证小程序照片会话的成功、失败、无照片和清理失败路径。
- Create: `server/mp/story-child-reference-ui.test.ts` — 锁定故事页隐私授权、可选入口、参考键传递和适老化文案。
- Modify: `server/mp/m2-routes.ts` — 改用共享图片解码器，保持原 `/upload/image` 行为。
- Modify: `server/mp/m3-routes.ts` — 增加参考图上传/释放接口，并让 `/story/page-image` 可选接收当前用户参考图。
- Modify: `server/mp/m3-routes.test.ts` — 覆盖上传、所有权、媒体安全、释放、日志和参考配图参数。
- Modify: `server/storage.ts` — 增加按前缀分页列出 OSS 对象及最后修改时间的只读能力。
- Modify: `server/_core/index.ts` — 服务启动时启动临时参考图兜底清理器。
- Modify: `server/minimaxService.ts` — 为有参考图的故事页追加外貌一致性和隐私提示词。
- Modify: `server/story-shared.test.ts` — 验证有/无参考图两套提示词。
- Modify: `server/ai/gateway.ts` — `aiGenerateImage` 增加可选 `referenceImageUrl`，仅 Seedream 故事 profile 接收。
- Modify: `server/ai/gateway-edit.test.ts` — 验证故事模型、1K 和单张参考图参数，并验证非 Volc 不静默忽略。
- Create: `server/ai/gateway-story-reference-fallback.test.ts` — 在非 Volc 配置下验证参考图请求被明确拒绝。
- Modify: `miniprogram/src/services/api.ts` — 增加故事参考图上传/释放 API，并扩展单页配图请求类型。
- Modify: `miniprogram/src/pages/story-time/index.tsx` — 增加选图、预览、错误恢复、四页共享参考图和离页清理。
- Modify: `miniprogram/src/pages/story-time/index.scss` — 增加符合适老化令牌的照片卡片、预览和异常操作样式。
- Create: `scripts/verify-story-child-reference.ts` — 使用本地授权示例图实调四页 Seedream，输出脱敏耗时和清理结果。

### Task 1: 共享图片解码器并保持普通上传兼容

**Files:**
- Create: `server/mp/image-upload.ts`
- Modify: `server/mp/m2-routes.ts`
- Test: `server/mp/m2-routes.test.ts`

- [ ] **Step 1: 写失败测试，锁定共享解码器的格式和 10 MB 限制**

在 `server/mp/m2-routes.test.ts` 增加共享函数断言，使用真实 PNG 签名字节：

```ts
import { decodeImageUpload } from "./image-upload";

it("共享图片解码器只接受签名匹配的 jpg、png、webp", () => {
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    Buffer.from("reference"),
  ]);
  expect(decodeImageUpload({
    base64: png.toString("base64"),
    mimeType: "image/png",
  })).toEqual({ buffer: png, mimeType: "image/png", extension: "png" });
  expect(() => decodeImageUpload({
    base64: png.toString("base64"),
    mimeType: "image/jpeg",
  })).toThrow("图片内容与 MIME 类型不匹配");
});
```

- [ ] **Step 2: 运行测试并确认因模块不存在而失败**

Run: `pnpm vitest run server/mp/m2-routes.test.ts`

Expected: FAIL，提示无法解析 `./image-upload`。

- [ ] **Step 3: 创建共享解码器**

在 `server/mp/image-upload.ts` 实现：

```ts
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

export const IMAGE_MIME_EXTENSIONS = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
} as const;

export type ImageMimeType = keyof typeof IMAGE_MIME_EXTENSIONS;

export function decodeImageUpload(body: unknown): {
  buffer: Buffer;
  mimeType: ImageMimeType;
  extension: (typeof IMAGE_MIME_EXTENSIONS)[ImageMimeType];
} {
  if (!body || typeof body !== "object") throw new Error("图片参数不能为空");
  const input = body as { base64?: unknown; mimeType?: unknown };
  if (typeof input.base64 !== "string" || !input.base64) throw new Error("base64 图片不能为空");
  if (typeof input.mimeType !== "string" || !(input.mimeType in IMAGE_MIME_EXTENSIONS)) {
    throw new Error("仅支持 jpg、png、webp 图片");
  }
  const mimeType = input.mimeType as ImageMimeType;
  const dataUrl = input.base64.match(/^data:([^;]+);base64,([\s\S]+)$/);
  if (dataUrl && dataUrl[1] !== mimeType) throw new Error("图片 MIME 与数据内容不一致");
  const encoded = dataUrl?.[2] ?? input.base64;
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(encoded) || encoded.length % 4 !== 0) {
    throw new Error("base64 图片格式无效");
  }
  const buffer = Buffer.from(encoded, "base64");
  if (!buffer.length) throw new Error("图片内容不能为空");
  if (buffer.length > MAX_IMAGE_BYTES) throw new Error("图片不能超过 10MB");
  const signatureMatches = mimeType === "image/jpeg"
    ? buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff
    : mimeType === "image/png"
      ? buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
      : buffer.length >= 12 && buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP";
  if (!signatureMatches) throw new Error("图片内容与 MIME 类型不匹配");
  return { buffer, mimeType, extension: IMAGE_MIME_EXTENSIONS[mimeType] };
}
```

删除 `m2-routes.ts` 内重复的 `MAX_IMAGE_BYTES`、`IMAGE_MIME_EXTENSIONS` 和 `decodeImage`，改为导入 `decodeImageUpload`。普通上传使用 `decoded.extension` 组装文件键。

- [ ] **Step 4: 运行普通上传测试并确认通过**

Run: `pnpm vitest run server/mp/m2-routes.test.ts`

Expected: PASS，原 `/upload/image` 的有效、错误 MIME、超限和补偿删除测试均保持通过。

- [ ] **Step 5: 提交共享解码器**

```bash
git add server/mp/image-upload.ts server/mp/m2-routes.ts server/mp/m2-routes.test.ts
git commit -m "refactor(mp): share validated image upload decoder"
```

### Task 2: 服务端故事参考图接口与所有权校验

**Files:**
- Modify: `server/mp/m3-routes.ts`
- Test: `server/mp/m3-routes.test.ts`

- [ ] **Step 1: 写失败测试，覆盖上传、引用和释放**

在 `server/mp/m3-routes.test.ts` 增加以下三个用例：

```ts
it("上传故事参考图到当前用户临时目录并登记媒体安全", async () => {
  const deps = dependencies();
  const baseUrl = await startApp(deps);
  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0x01]);
  const response = await post(baseUrl, "/story/reference-image", {
    base64: jpeg.toString("base64"),
    mimeType: "image/jpeg",
  });
  expect(response.status).toBe(200);
  await expect(response.json()).resolves.toEqual({
    fileKey: "story-refs/7/fixed-id.jpg",
    securityStatus: "pending",
  });
  expect(deps.storagePut).toHaveBeenCalledWith(
    "story-refs/7/fixed-id.jpg",
    jpeg,
    "image/jpeg",
  );
});

it("单页配图只接受当前用户的故事参考图", async () => {
  const deps = dependencies({
    findMediaCheckTaskByFile: vi.fn(async (_userId, fileKey) => ({
      fileKey,
      status: "pass",
    } as never)),
  });
  const baseUrl = await startApp(deps);
  const accepted = await post(baseUrl, "/story/page-image", {
    imagePrompt: "孩子走进森林",
    pageNumber: 1,
    referenceFileKey: "story-refs/7/child.jpg",
  });
  expect(accepted.status).toBe(200);
  expect(deps.aiGenerateImage).toHaveBeenCalledWith(expect.objectContaining({
    referenceImageUrl: "https://cdn.example/story-refs/7/child.jpg",
  }));

  for (const referenceFileKey of [
    "story-refs/8/child.jpg",
    "uploads/7/child.jpg",
    "https://attacker.example/child.jpg",
  ]) {
    const rejected = await post(baseUrl, "/story/page-image", {
      imagePrompt: "孩子走进森林",
      pageNumber: 1,
      referenceFileKey,
    });
    expect(rejected.status).toBe(400);
  }
});

it("参考图释放接口幂等删除且拒绝其他用户文件", async () => {
  const deps = dependencies();
  const baseUrl = await startApp(deps);
  const accepted = await post(baseUrl, "/story/reference-image/release", {
    fileKey: "story-refs/7/child.jpg",
  });
  expect(accepted.status).toBe(200);
  await expect(accepted.json()).resolves.toEqual({ deleted: true });
  expect(deps.storageDelete).toHaveBeenCalledWith("story-refs/7/child.jpg");

  const rejected = await post(baseUrl, "/story/reference-image/release", {
    fileKey: "story-refs/8/child.jpg",
  });
  expect(rejected.status).toBe(400);
});
```

同时扩展已有单页日志断言，要求只出现 `hasReferenceImage: true/false`，不出现参考图 URL 或文件键。

- [ ] **Step 2: 运行测试并确认新路由返回 404 或缺少参考参数**

Run: `pnpm vitest run server/mp/m3-routes.test.ts`

Expected: FAIL，新上传和释放路由为 404，`aiGenerateImage` 未收到 `referenceImageUrl`。

- [ ] **Step 3: 实现受控上传、解析与释放**

在 `m3-routes.ts` 导入 `decodeImageUpload`，新增严格的所有权解析函数：

```ts
function ownedStoryReference(fileKey: string, userId: number): boolean {
  return new RegExp(
    `^story-refs/${userId}/[A-Za-z0-9][A-Za-z0-9._-]*\\.(?:jpe?g|png|webp)$`,
    "i",
  ).test(fileKey);
}

const resolveStoryReference = async (fileKey: string, user: { id: number }) => {
  if (!ownedStoryReference(fileKey, user.id)) return undefined;
  if (deps.contentSecurityMode === "wechat") {
    const task = await deps.findMediaCheckTaskByFile(user.id, fileKey);
    if (!task || task.status === "risky") return undefined;
  }
  return deps.storageGet(fileKey);
};
```

新增上传路由。响应中不返回 URL，只返回临时文件键和安全状态：

```ts
router.post("/story/reference-image", asyncRoute(async (req, res) => {
  let decoded: ReturnType<typeof decodeImageUpload>;
  try {
    decoded = decodeImageUpload(req.body);
  } catch (error) {
    badRequest(res, error instanceof Error ? error.message : "图片参数错误");
    return;
  }
  const user = (req as MpAuthenticatedRequest).mpUser;
  const file = await deps.storagePut(
    `story-refs/${user.id}/${deps.createFileId()}.${decoded.extension}`,
    decoded.buffer,
    decoded.mimeType,
  );
  const securityStatus = await submitStoredImage(file, user);
  res.json({ fileKey: file.key, securityStatus });
}));
```

新增幂等释放路由。`storageDelete` 对不存在对象也视为成功：

```ts
router.post("/story/reference-image/release", asyncRoute(async (req, res) => {
  const user = (req as MpAuthenticatedRequest).mpUser;
  const fileKey = nonEmpty(req.body?.fileKey);
  if (!ownedStoryReference(fileKey, user.id)) {
    badRequest(res, "只能删除当前用户自己的临时参考图");
    return;
  }
  await deps.storageDelete(fileKey);
  console.info("[story.reference-image.release]", { userId: user.id, deleted: true });
  res.json({ deleted: true });
}));
```

扩展 `/story/page-image`：`referenceFileKey` 缺省时走原流程；存在时必须通过 `resolveStoryReference`，并把 `referenceImageUrl: reference.url` 传给 `aiGenerateImage`。日志只加 `hasReferenceImage: Boolean(reference)`。

- [ ] **Step 4: 运行路由测试并确认通过**

Run: `pnpm vitest run server/mp/m3-routes.test.ts`

Expected: PASS，上传、跨用户拒绝、释放和原有故事/生活助手路由全部通过。

- [ ] **Step 5: 提交服务端接口**

```bash
git add server/mp/m3-routes.ts server/mp/m3-routes.test.ts
git commit -m "feat(story): add temporary child reference image API"
```

### Task 3: Seedream 参考图与四页一致性提示词

**Files:**
- Modify: `server/minimaxService.ts`
- Modify: `server/story-shared.test.ts`
- Modify: `server/ai/gateway.ts`
- Modify: `server/ai/gateway-edit.test.ts`

- [ ] **Step 1: 写失败测试，锁定提示词和网关参数**

在 `server/story-shared.test.ts` 增加：

```ts
it("有儿童参考图时追加外貌一致性与隐私约束", () => {
  const prompt = buildStoryImagePrompt("孩子在森林里帮助小鹿", 1, {
    hasChildReference: true,
  });
  expect(prompt).toContain("保留主角的脸型、发型、肤色和显著外貌特征");
  expect(prompt).toContain("四页保持主角年龄、五官、发型和服装一致");
  expect(prompt).toContain("忽略参考图背景、其他人物、文字、水印和标识");
  expect(prompt).toContain("不得推断或输出姓名、学校、地址等身份信息");
});
```

在 `server/ai/gateway-edit.test.ts` 增加：

```ts
it("故事页把一张儿童参考图传给专用 Seedream 模型", async () => {
  mocks.volcGenerateImage.mockResolvedValue("image-base64");
  await aiGenerateImage({
    prompt: "儿童绘本第一页",
    aspectRatio: "1:1",
    profile: "story",
    referenceImageUrl: "https://cdn.example/story-refs/7/child.jpg",
  });
  expect(mocks.volcGenerateImage).toHaveBeenCalledWith({
    prompt: "儿童绘本第一页",
    aspectRatio: "1:1",
    model: "story-image-model",
    size: "1K",
    imageUrls: ["https://cdn.example/story-refs/7/child.jpg"],
  });
});
```

创建 `server/ai/gateway-story-reference-fallback.test.ts`：

```ts
import { expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ invokeMiniMaxImage: vi.fn() }));
vi.mock("../_core/env", () => ({
  ENV: {
    aiImageProvider: "minimax",
    minimaxApiKey: "test-key",
    arkApiKey: "",
    geminiApiKey: "",
  },
}));
vi.mock("./minimaxClient", () => ({
  invokeMiniMaxImage: mocks.invokeMiniMaxImage,
  invokeMiniMaxText: vi.fn(),
  invokeMiniMaxTTS: vi.fn(),
}));
vi.mock("./volcImageClient", () => ({ volcGenerateImage: vi.fn() }));
vi.mock("../geminiService", () => ({ callGeminiImage: vi.fn(), callGeminiText: vi.fn(), callGeminiTTS: vi.fn() }));
vi.mock("../_core/voiceTranscription", () => ({ transcribeAudio: vi.fn() }));
vi.mock("./kimiClient", () => ({ kimiChat: vi.fn() }));
vi.mock("./aliVoiceClient", () => ({ dashscopeTTS: vi.fn(), dashscopeASR: vi.fn() }));

import { aiGenerateImage } from "./gateway";

it("非 Volc 图片供应商明确拒绝故事参考图", async () => {
  await expect(aiGenerateImage({
    prompt: "儿童绘本",
    profile: "story",
    referenceImageUrl: "https://cdn.example/story-refs/7/child.jpg",
  })).rejects.toThrow("当前图片服务暂不支持照片主角");
  expect(mocks.invokeMiniMaxImage).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: 运行测试并确认类型或断言失败**

Run: `pnpm vitest run server/story-shared.test.ts server/ai/gateway-edit.test.ts server/ai/gateway-story-reference-fallback.test.ts`

Expected: FAIL，`hasChildReference` 与 `referenceImageUrl` 尚未定义。

- [ ] **Step 3: 实现提示词与 Seedream 单图参考**

将提示词函数改为：

```ts
export function buildStoryImagePrompt(
  imagePrompt: string,
  pageNumber: number,
  options: { hasChildReference?: boolean } = {},
): string {
  const base = `儿童绘本插画，温暖可爱的风格，色彩明亮柔和，角色友善。第${pageNumber}页：${imagePrompt}`;
  if (!options.hasChildReference) return base;
  return `${base}。参考图仅用于主角外貌：保留主角的脸型、发型、肤色和显著外貌特征，转化为温暖适龄的儿童绘本形象；四页保持主角年龄、五官、发型和服装一致，默认参考并适度简化原照片服装，特殊装扮只改变服装；忽略参考图背景、地点、其他人物、文字、水印和标识；不得推断或输出姓名、学校、地址等身份信息；避免证件照和过度写实效果。`;
}
```

扩展网关类型并在故事 Volc 分支传图：

```ts
export async function aiGenerateImage(params: {
  prompt: string;
  aspectRatio?: AspectRatio;
  profile?: "story";
  referenceImageUrl?: string;
}): Promise<string> {
  const provider = pickImageProvider(ENV.aiImageProvider, currentKeys());
  if (params.referenceImageUrl && (params.profile !== "story" || provider !== "volc")) {
    throw new Error("当前图片服务暂不支持照片主角");
  }
  if (provider === "volc" && params.profile === "story") {
    recordAiRequestMetadata("volc", ENV.arkStoryImageModel);
    return volcGenerateImage({
      prompt: params.prompt,
      aspectRatio: params.aspectRatio,
      model: ENV.arkStoryImageModel,
      size: "1K",
      ...(params.referenceImageUrl ? { imageUrls: [params.referenceImageUrl] } : {}),
    });
  }
  if (provider === "volc") {
    recordAiRequestMetadata("volc", ENV.arkImageModel);
    return volcGenerateImage({ prompt: params.prompt, aspectRatio: params.aspectRatio });
  }
  if (provider === "minimax") {
    recordAiRequestMetadata("minimax", "image-01");
    return invokeMiniMaxImage({ prompt: params.prompt, aspectRatio: params.aspectRatio });
  }
  recordAiRequestMetadata("gemini", ENV.geminiImageModel);
  const dataUrl = await callGeminiImage({
    parts: [{ text: params.prompt }],
    aspectRatio: params.aspectRatio,
  });
  return dataUrl.replace(/^data:.*?;base64,/, "");
}
```

`m3-routes.ts` 调用 `buildStoryImagePrompt(imagePrompt, pageNumber, { hasChildReference: Boolean(reference) })`。

- [ ] **Step 4: 运行提示词、网关和请求体回归测试**

Run: `pnpm vitest run server/story-shared.test.ts server/ai/gateway-edit.test.ts server/ai/gateway-story-reference-fallback.test.ts server/ai/client-request.test.ts server/mp/m3-routes.test.ts`

Expected: PASS；故事图仍为专用模型和 1K，普通生图、修图 2K 自适应不变。

- [ ] **Step 5: 提交图片生成链路**

```bash
git add server/minimaxService.ts server/story-shared.test.ts server/ai/gateway.ts server/ai/gateway-edit.test.ts server/ai/gateway-story-reference-fallback.test.ts server/mp/m3-routes.ts
git commit -m "feat(story): preserve child likeness across story pages"
```

### Task 4: 一小时服务端兜底清理

**Files:**
- Modify: `server/storage.ts`
- Create: `server/mp/story-reference-cleanup.ts`
- Create: `server/mp/story-reference-cleanup.test.ts`
- Modify: `server/_core/index.ts`

- [ ] **Step 1: 写失败测试，覆盖过期边界和错误隔离**

创建 `server/mp/story-reference-cleanup.test.ts`：

```ts
import { describe, expect, it, vi } from "vitest";
import { deleteExpiredStoryReferences } from "./story-reference-cleanup";

describe("故事参考图兜底清理", () => {
  it("只删除 story-refs 下超过一小时的对象", async () => {
    const now = new Date("2026-08-04T12:00:00.000Z");
    const list = vi.fn(async () => [
      { key: "story-refs/7/old.jpg", lastModified: new Date("2026-08-04T10:59:59.000Z") },
      { key: "story-refs/7/fresh.jpg", lastModified: new Date("2026-08-04T11:30:00.000Z") },
    ]);
    const remove = vi.fn(async () => undefined);
    await expect(deleteExpiredStoryReferences({ now, list, remove })).resolves.toEqual({
      scanned: 2,
      deleted: 1,
      failed: 0,
    });
    expect(list).toHaveBeenCalledWith("story-refs/");
    expect(remove).toHaveBeenCalledWith("story-refs/7/old.jpg");
  });

  it("单个删除失败不会阻止清理其他过期对象", async () => {
    const remove = vi.fn()
      .mockRejectedValueOnce(new Error("temporary OSS error"))
      .mockResolvedValueOnce(undefined);
    const result = await deleteExpiredStoryReferences({
      now: new Date("2026-08-04T12:00:00.000Z"),
      list: async () => [
        { key: "story-refs/7/a.jpg", lastModified: new Date(0) },
        { key: "story-refs/8/b.jpg", lastModified: new Date(0) },
      ],
      remove,
    });
    expect(result).toEqual({ scanned: 2, deleted: 1, failed: 1 });
  });
});
```

- [ ] **Step 2: 运行测试并确认清理模块不存在**

Run: `pnpm vitest run server/mp/story-reference-cleanup.test.ts`

Expected: FAIL，无法解析 `./story-reference-cleanup`。

- [ ] **Step 3: 增加 OSS 按前缀分页列举能力**

在 `server/storage.ts` 导入 `ListObjectsV2Command`，新增：

```ts
export type StoredObjectSummary = { key: string; lastModified: Date };

export async function storageList(prefix: string): Promise<StoredObjectSummary[]> {
  if (!s3Enabled()) throw new Error("当前存储驱动不支持按前缀列举对象");
  const normalizedPrefix = normalizeKey(prefix);
  const objects: StoredObjectSummary[] = [];
  let continuationToken: string | undefined;
  do {
    const response = await getS3Client().send(new ListObjectsV2Command({
      Bucket: ENV.s3Bucket,
      Prefix: normalizedPrefix,
      ContinuationToken: continuationToken,
    }));
    for (const item of response.Contents ?? []) {
      if (item.Key && item.LastModified) objects.push({ key: item.Key, lastModified: item.LastModified });
    }
    continuationToken = response.IsTruncated ? response.NextContinuationToken : undefined;
  } while (continuationToken);
  return objects;
}
```

该能力只用于生产 OSS 兜底清理；即时释放仍支持现有 S3 与 Manus 两种驱动。

- [ ] **Step 4: 实现纯清理函数和 15 分钟定时器**

创建 `server/mp/story-reference-cleanup.ts`：

```ts
import { storageDelete, storageList, type StoredObjectSummary } from "../storage";

const ONE_HOUR_MS = 60 * 60 * 1000;
const CLEANUP_INTERVAL_MS = 15 * 60 * 1000;

type CleanupDependencies = {
  now: Date;
  list: (prefix: string) => Promise<StoredObjectSummary[]>;
  remove: (key: string) => Promise<void>;
};

export async function deleteExpiredStoryReferences(deps: CleanupDependencies) {
  const objects = await deps.list("story-refs/");
  const expired = objects.filter((item) => (
    deps.now.getTime() - item.lastModified.getTime() >= ONE_HOUR_MS
  ));
  let deleted = 0;
  let failed = 0;
  for (const item of expired) {
    try {
      await deps.remove(item.key);
      deleted += 1;
    } catch {
      failed += 1;
    }
  }
  return { scanned: objects.length, deleted, failed };
}

async function runScheduledCleanup(): Promise<void> {
  try {
    const result = await deleteExpiredStoryReferences({
      now: new Date(),
      list: storageList,
      remove: storageDelete,
    });
    console.info("[story.reference-image.cleanup]", result);
  } catch {
    console.warn("[story.reference-image.cleanup] unavailable");
  }
}

export function startStoryReferenceCleanup(): NodeJS.Timeout {
  void runScheduledCleanup();
  const timer = setInterval(() => void runScheduledCleanup(), CLEANUP_INTERVAL_MS);
  timer.unref();
  return timer;
}
```

在 `server/_core/index.ts` 中于注册路由后、监听端口前调用一次 `startStoryReferenceCleanup()`。生产 PM2 为 fork 单实例，因此不会产生多实例重复扫描。

- [ ] **Step 5: 运行清理、存储和类型测试**

Run: `pnpm vitest run server/mp/story-reference-cleanup.test.ts`

Run: `pnpm check`

Expected: PASS；`pnpm check` 不出现 S3 SDK 类型错误。

- [ ] **Step 6: 提交兜底清理**

```bash
git add server/storage.ts server/mp/story-reference-cleanup.ts server/mp/story-reference-cleanup.test.ts server/_core/index.ts
git commit -m "feat(story): expire temporary child reference photos"
```

### Task 5: 小程序参考照片会话与 API

**Files:**
- Create: `miniprogram/src/features/story-time/reference-photo.ts`
- Create: `server/mp/story-reference-photo.test.ts`
- Modify: `miniprogram/src/services/api.ts`

- [ ] **Step 1: 写失败测试，锁定上传一次和必定清理**

创建 `server/mp/story-reference-photo.test.ts`：

```ts
import { describe, expect, it, vi } from "vitest";
import { runWithStoryReference } from "../../miniprogram/src/features/story-time/reference-photo";

describe("故事参考照片会话", () => {
  it("有本地照片时上传一次、执行任务并在成功后清理", async () => {
    const upload = vi.fn(async () => ({ fileKey: "story-refs/7/child.jpg" }));
    const release = vi.fn(async () => undefined);
    const run = vi.fn(async (fileKey?: string) => fileKey);
    await expect(runWithStoryReference({
      localPath: "wxfile://child.jpg",
      upload,
      run,
      release,
    })).resolves.toBe("story-refs/7/child.jpg");
    expect(upload).toHaveBeenCalledOnce();
    expect(release).toHaveBeenCalledWith("story-refs/7/child.jpg");
  });

  it("任务失败和清理失败时保留原任务错误", async () => {
    const taskError = new Error("page generation failed");
    await expect(runWithStoryReference({
      localPath: "wxfile://child.jpg",
      upload: async () => ({ fileKey: "story-refs/7/child.jpg" }),
      run: async () => { throw taskError; },
      release: async () => { throw new Error("cleanup failed"); },
    })).rejects.toBe(taskError);
  });

  it("无照片时不上传不清理并以 undefined 运行", async () => {
    const upload = vi.fn();
    const release = vi.fn();
    const run = vi.fn(async (fileKey?: string) => fileKey ?? "no-reference");
    await expect(runWithStoryReference({ localPath: "", upload, run, release }))
      .resolves.toBe("no-reference");
    expect(upload).not.toHaveBeenCalled();
    expect(release).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: 运行测试并确认模块不存在**

Run: `pnpm vitest run server/mp/story-reference-photo.test.ts`

Expected: FAIL，无法解析小程序 `reference-photo` 模块。

- [ ] **Step 3: 实现无 Taro 依赖的会话函数**

创建 `miniprogram/src/features/story-time/reference-photo.ts`：

```ts
type StoryReferenceSession<Result> = {
  localPath: string;
  upload: (localPath: string) => Promise<{ fileKey: string }>;
  run: (fileKey?: string) => Promise<Result>;
  release: (fileKey: string) => Promise<void>;
  onReferenceReady?: (fileKey: string) => void;
  onReferenceReleased?: () => void;
};

export async function runWithStoryReference<Result>(
  session: StoryReferenceSession<Result>,
): Promise<Result> {
  if (!session.localPath) return session.run(undefined);
  const uploaded = await session.upload(session.localPath);
  session.onReferenceReady?.(uploaded.fileKey);
  let taskError: unknown;
  try {
    return await session.run(uploaded.fileKey);
  } catch (error) {
    taskError = error;
    throw error;
  } finally {
    try {
      await session.release(uploaded.fileKey);
    } catch (cleanupError) {
      if (!taskError) console.warn("[story.reference-photo] cleanup deferred");
    } finally {
      session.onReferenceReleased?.();
    }
  }
}
```

日志只表示延迟清理，不包含路径、文件键或儿童信息。

- [ ] **Step 4: 扩展小程序 API 契约**

在 `miniprogram/src/services/api.ts` 增加：

```ts
uploadStoryReference: (data: {
  base64: string;
  mimeType: "image/jpeg" | "image/png" | "image/webp";
}) => request<{ fileKey: string; securityStatus: MediaSecurityStatus }>(
  "/api/mp/story/reference-image",
  { method: "POST", data, retry: "never" },
),
releaseStoryReference: (fileKey: string) => request<{ deleted: true }>(
  "/api/mp/story/reference-image/release",
  { method: "POST", data: { fileKey }, retry: "never" },
),
generateStoryPageImage: (data: {
  imagePrompt: string;
  pageNumber: number;
  referenceFileKey?: string;
}, operationId?: string) => request<{
  imageUrl: string;
  fileKey: string;
  pageNumber: number;
  securityStatus: MediaSecurityStatus;
}>("/api/mp/story/page-image", {
  method: "POST",
  data,
  retry: "never",
  operationId,
  timeoutMs: MP_STORY_IMAGE_TIMEOUT_MS,
}),
```

所有三个生成相关调用继续 `retry: "never"`；参考图上传和释放不携带幂等扣费语义。

- [ ] **Step 5: 运行会话测试和小程序类型检查**

Run: `pnpm vitest run server/mp/story-reference-photo.test.ts && pnpm check:mp`

Expected: PASS。

- [ ] **Step 6: 提交小程序数据层**

```bash
git add miniprogram/src/features/story-time/reference-photo.ts miniprogram/src/services/api.ts server/mp/story-reference-photo.test.ts
git commit -m "feat(story): add child reference photo session"
```

### Task 6: 故事页选图、错误恢复与四页共享参考图

**Files:**
- Modify: `miniprogram/src/pages/story-time/index.tsx`
- Modify: `miniprogram/src/pages/story-time/index.scss`
- Create: `server/mp/story-child-reference-ui.test.ts`

- [ ] **Step 1: 写失败的 UI 契约测试**

创建 `server/mp/story-child-reference-ui.test.ts`，读取故事页源码并断言关键契约：

```ts
import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("故事会儿童照片参考 UI", () => {
  it("提供可选照片、隐私说明和无照片继续入口", async () => {
    const page = await readFile("miniprogram/src/pages/story-time/index.tsx", "utf8");
    expect(page).toContain("让孩子当故事主角（可选）");
    expect(page).toContain("照片仅用于本次绘本形象参考");
    expect(page).toContain("拍一张");
    expect(page).toContain("从相册选择");
    expect(page).toContain("不用照片");
    expect(page).toContain("ensurePrivacyAuthorized");
  });

  it("四页共享参考键且离页执行尽力清理", async () => {
    const page = await readFile("miniprogram/src/pages/story-time/index.tsx", "utf8");
    expect(page).toContain("runWithStoryReference");
    expect(page).toContain("referenceFileKey");
    expect(page).toContain("releaseStoryReference");
    expect(page).toContain("activeReferenceKeyRef");
  });
});
```

- [ ] **Step 2: 运行测试并确认界面文案和会话调用缺失**

Run: `pnpm vitest run server/mp/story-child-reference-ui.test.ts`

Expected: FAIL，找不到新文案和 `runWithStoryReference`。

- [ ] **Step 3: 增加本地选图与预览状态**

在故事页导入 `ensurePrivacyAuthorized` 和 `runWithStoryReference`，增加：

```ts
const [childPhotoPath, setChildPhotoPath] = useState("");
const [referencePhotoError, setReferencePhotoError] = useState("");
const activeReferenceKeyRef = useRef("");
```

实现 `readBase64`、`imageMime` 和 `chooseChildPhoto(sourceType)`。选择顺序必须是：先 `ensurePrivacyAuthorized()`，再 `Taro.chooseMedia({ count: 1, mediaType: ["image"], sourceType: [sourceType] })`，检查 10 MB，最后只保存 `tempFilePath`，不得立即上传。

权限失败时使用大字弹窗说明并提供 `Taro.openSetting()`；用户取消选择不显示错误。

- [ ] **Step 4: 在儿童信息步骤渲染照片卡片**

加入以下结构，按钮文字和说明不得缩小：

```tsx
<View className="story-reference-photo">
  <Text className="story-reference-photo__title">让孩子当故事主角（可选）</Text>
  <Text className="story-reference-photo__privacy">
    照片仅用于本次绘本形象参考，生成结束后自动删除，不保存到帐号或故事。
  </Text>
  {childPhotoPath ? (
    <>
      <Image className="story-reference-photo__preview" src={childPhotoPath} mode="aspectFit" />
      <View className="story-reference-photo__actions">
        <Button size="xlarge" onClick={() => void chooseChildPhoto("album")}>更换照片</Button>
        <Button size="xlarge" onClick={() => setChildPhotoPath("")}>不用照片</Button>
      </View>
    </>
  ) : (
    <View className="story-reference-photo__actions">
      <Button size="xlarge" onClick={() => void chooseChildPhoto("camera")}>拍一张</Button>
      <Button size="xlarge" onClick={() => void chooseChildPhoto("album")}>从相册选择</Button>
    </View>
  )}
</View>
```

SCSS 使用现有 `$font-body`、`$font-secondary`、`$color-primary`、`$color-border` 和 `$radius-card`；操作按钮 `min-height: 108rpx`、字号不小于 `40rpx`，预览使用 `aspectFit`，不得拉伸。

- [ ] **Step 5: 将四页队列包进参考照片会话**

实现本地上传函数：

```ts
async function uploadChildReference(localPath: string) {
  return mpApi.uploadStoryReference({
    base64: await readBase64(localPath),
    mimeType: imageMime(localPath),
  });
}
```

将 `generateStoryImages` 的队列执行放入：

```ts
await runWithStoryReference({
  localPath: childPhotoPath,
  upload: uploadChildReference,
  release: (fileKey) => mpApi.releaseStoryReference(fileKey).then(() => undefined),
  onReferenceReady: (fileKey) => { activeReferenceKeyRef.current = fileKey; },
  onReferenceReleased: () => { activeReferenceKeyRef.current = ""; },
  run: (referenceFileKey) => runStoryImageQueue(
    plans,
    (plan) => mpApi.generateStoryPageImage({
      imagePrompt: plan.imagePrompt,
      pageNumber: plan.pageNumber,
      referenceFileKey,
    }, plan.operationId),
    {
      onStart: (plan) => setActiveImagePage(plan.pageNumber),
      onSuccess: (plan, image) => {
        storyStorage.queueRemoteAssets([image.fileKey]);
        savePagePatch(plan.pageNumber, { imageUrl: image.imageUrl, imageFileKey: image.fileKey });
        setFailedImagePages((current) => current.filter((pageNumber) => pageNumber !== plan.pageNumber));
      },
      onFailure: (plan) => setFailedImagePages((current) => (
        current.includes(plan.pageNumber) ? current : [...current, plan.pageNumber]
      )),
    },
  ),
});
```

每次调用 `generateStoryImages` 都会建立独立会话，因此单页手动重试会重新上传本地照片、沿用原页幂等键、完成后再次删除。

- [ ] **Step 6: 增加上传失败恢复与离页清理**

如果参考图上传失败，设置 `referencePhotoError = "照片暂时无法使用，请换一张或不用照片继续"`，不要启动任何页面配图。结果页显示两个大按钮：

- “换一张照片”：选择成功后，对所有缺图页面再次调用 `generateStoryImages`；
- “不用照片继续”：清空照片和错误，随后仅生成缺图页面。

增加 effect 清理：

```ts
useEffect(() => () => {
  const fileKey = activeReferenceKeyRef.current;
  if (fileKey) void mpApi.releaseStoryReference(fileKey).catch(() => undefined);
}, []);
```

`restart()` 也先尽力释放活动参考键，再清空 `childPhotoPath`、`referencePhotoError` 和 ref。清理失败不得遮挡已经完成的故事内容。

- [ ] **Step 7: 运行 UI、会话、路由和类型测试**

Run: `pnpm vitest run server/mp/story-child-reference-ui.test.ts server/mp/story-reference-photo.test.ts server/mp/m3-routes.test.ts && pnpm check:mp`

Expected: PASS。

- [ ] **Step 8: 提交故事页交互**

```bash
git add miniprogram/src/pages/story-time/index.tsx miniprogram/src/pages/story-time/index.scss server/mp/story-child-reference-ui.test.ts
git commit -m "feat(story): let a child photo guide the story hero"
```

### Task 7: 全量验证、真实链路、发布与证据

**Files:**
- Create: `scripts/verify-story-child-reference.ts`
- Modify only when a failing verification identifies a defect in a file already listed above.

- [ ] **Step 1: 检查无用户私有文件进入暂存区**

Run: `git status --short && git diff --cached --name-only`

Expected: `miniprogram/project.config.json`、`.DS_Store`、`miniprogram/project.private.config.json` 仍未提交，暂存区为空。

- [ ] **Step 2: 运行完整静态检查与单测**

Run: `pnpm check && pnpm check:mp && pnpm test`

Expected: 三条命令退出码均为 0；真实联网测试在无对应密钥时按现有规则跳过。

- [ ] **Step 3: 运行生产小程序构建**

Run: `pnpm --dir miniprogram build:weapp:prod`

Expected: Taro 构建成功；校验脚本命中 `https://api.hxzhineng.xyz`，`127.0.0.1` 出现次数为 0。

- [ ] **Step 4: 创建脱敏的真实 Seedream 验证脚本**

创建 `scripts/verify-story-child-reference.ts`：

```ts
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
const mimeType = extension === ".png" ? "image/png" : extension === ".webp" ? "image/webp" : "image/jpeg";
const key = `story-refs/verification/${randomUUID()}${extension || ".jpg"}`;
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
```

脚本不保存生成图，不显示原图、Base64、URL、文件键、签名参数或人物信息。

- [ ] **Step 5: 使用授权的非敏感人物示例图实调四页 Seedream**

Run: `STORY_REFERENCE_IMAGE_PATH=/absolute/path/to/authorized-sample.jpg npx tsx scripts/verify-story-child-reference.ts`

Expected: 四页均返回成功；人工确认主角脸型/发型基本一致、背景未复制、图片未拉伸；释放接口返回成功。

- [ ] **Step 6: 确认临时参考图已删除**

通过服务端受控检查或再次调用 `storageGet` 后的对象访问结果确认对应 `story-refs/` 对象不存在。不得在终端回显签名 URL。

Expected: 对象不存在；清理日志只有 `{ scanned, deleted, failed }` 或 `{ deleted: true }`。

- [ ] **Step 7: 提交验证脚本并推送、部署生产服务器**

Run:

```bash
git add scripts/verify-story-child-reference.ts
git commit -m "test(story): add child reference model verifier"
git push origin codex/m4-release-ready
ssh root@47.100.254.32 'cd /opt/lejoy-ai && bash scripts/deploy/02-deploy.sh'
curl -fsS https://api.hxzhineng.xyz/api/mp/health
```

Expected: 部署脚本完成拉取、重建和 PM2 fork 单实例 reload；健康检查返回 `ok: true`。

- [ ] **Step 8: 抽查生产日志与临时目录**

在服务器仅查询结构化日志字段，确认出现 `hasReferenceImage`、provider、model、durationMs 和 success，不出现用户输入原文、照片 URL、Base64 或签名参数。

Expected: 日志合规，PM2 单实例 online，无循环重启。

- [ ] **Step 9: 最终提交（仅在验证过程中产生修正时）**

```bash
git add server miniprogram/src
git commit -m "fix(story): harden child reference photo flow"
git push origin codex/m4-release-ready
```

若验证未产生代码修正，则不创建空提交。
