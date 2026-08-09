import "dotenv/config";

import axios from "axios";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, dirname, extname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { ENV } from "../server/_core/env";
import { readImageDimensions } from "../server/ai/imageDimensions";
import { buildRestorePrompt } from "../server/silverlens";
import { storageDelete, storagePut } from "../server/storage";

export type BenchmarkCase = {
  label: string;
  model: string;
  size: string;
};

export const BENCHMARK_CASES: BenchmarkCase[] = [
  { label: "seedream-5.0-pro_2K", model: "doubao-seedream-5-0-pro-260628", size: "2K" },
  { label: "seedream-5.0-pro_1.5K", model: "doubao-seedream-5-0-pro-260628", size: "1.5K" },
  { label: "seedream-4.0_2K", model: "doubao-seedream-4-0-250828", size: "2K" },
  { label: "seedream-4.0_1K", model: "doubao-seedream-4-0-250828", size: "1K" },
  { label: "seedream-5.0-lite_2K", model: "doubao-seedream-5-0-260128", size: "2K" },
  { label: "seedream-5.0-lite_1K", model: "doubao-seedream-5-0-260128", size: "1K" },
];

type BenchmarkResult = BenchmarkCase & {
  status: "success" | "failed";
  durationMs: number;
  outputFile?: string;
  outputBytes?: number;
  outputDimensions?: string;
  error?: string;
};

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "..");
const defaultInput = resolve(
  repoRoot,
  "../../模型验证/老照片/b1a1bf74511d53debb9a5ebbe7ae3c49.jpg",
);
const defaultOutputDir = resolve(repoRoot, "../../模型验证/修图对比");
const requestTimeoutMs = 120_000;

export function filterImageModels(modelIds: string[]): string[] {
  return [...new Set(modelIds.filter((id) => /seedream|seededit/i.test(id)))].sort();
}

export function buildOutputFileName(label: string, extension: string): string {
  const safeLabel = label
    .replace(/\.\.[/\\]/g, "")
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/^[._-]+|[._-]+$/g, "");
  const safeExtension = extension.toLowerCase().replace(/[^a-z0-9]/g, "") || "png";
  return `restore_${safeLabel || "result"}.${safeExtension}`;
}

export function escapeMarkdownCell(value: string): string {
  return value.replace(/\|/g, "\\|").replace(/[\r\n]+/g, " ");
}

function parseOptions(argv: string[]): { inputPath: string; outputDir: string } {
  let inputPath = process.env.RESTORE_BENCHMARK_IMAGE_PATH?.trim() || defaultInput;
  let outputDir = process.env.RESTORE_BENCHMARK_OUTPUT_DIR?.trim() || defaultOutputDir;
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--image" && argv[index + 1]) inputPath = resolve(argv[++index]);
    else if (argv[index] === "--output" && argv[index + 1]) outputDir = resolve(argv[++index]);
  }
  return { inputPath: resolve(inputPath), outputDir: resolve(outputDir) };
}

function inputMime(path: string): string {
  const extension = extname(path).toLowerCase();
  if (extension === ".png") return "image/png";
  if (extension === ".webp") return "image/webp";
  return "image/jpeg";
}

function outputFormat(buffer: Buffer): { extension: string; mime: string } {
  if (buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return { extension: "png", mime: "image/png" };
  }
  if (buffer.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))) {
    return { extension: "jpg", mime: "image/jpeg" };
  }
  if (buffer.subarray(0, 4).toString("ascii") === "RIFF" && buffer.subarray(8, 12).toString("ascii") === "WEBP") {
    return { extension: "webp", mime: "image/webp" };
  }
  throw new Error("模型返回内容不是可识别的 PNG/JPEG/WebP 图片");
}

function safeError(error: unknown): string {
  const candidate = error as {
    code?: string;
    message?: string;
    response?: { status?: number; data?: { error?: { code?: string; message?: string }; message?: string } };
  };
  const status = candidate.response?.status;
  const code = candidate.response?.data?.error?.code ?? candidate.code;
  const message = candidate.response?.data?.error?.message
    ?? candidate.response?.data?.message
    ?? candidate.message
    ?? "未知错误";
  return [status ? `HTTP ${status}` : "", code ?? "", message].filter(Boolean).join(" | ");
}

async function listApiImageModels(): Promise<string[]> {
  const response = await axios.get(`${ENV.arkBaseUrl.replace(/\/+$/, "")}/models`, {
    headers: { Authorization: `Bearer ${ENV.arkApiKey}` },
    timeout: 20_000,
  });
  const ids = (Array.isArray(response.data?.data) ? response.data.data : [])
    .map((item: { id?: unknown }) => item.id)
    .filter((id: unknown): id is string => typeof id === "string");
  return filterImageModels(ids);
}

async function requestRestore(inputUrl: string, benchmarkCase: BenchmarkCase): Promise<Buffer> {
  const response = await axios.post(
    `${ENV.arkBaseUrl.replace(/\/+$/, "")}/images/generations`,
    {
      model: benchmarkCase.model,
      prompt: buildRestorePrompt(),
      image: inputUrl,
      response_format: "b64_json",
      size: benchmarkCase.size,
      watermark: ENV.arkImageWatermark,
      stream: false,
    },
    {
      headers: {
        Authorization: `Bearer ${ENV.arkApiKey}`,
        "Content-Type": "application/json",
      },
      timeout: requestTimeoutMs,
    },
  );

  const item = response.data?.data?.[0];
  if (typeof item?.b64_json === "string" && item.b64_json) {
    return Buffer.from(item.b64_json, "base64");
  }
  if (typeof item?.url === "string" && item.url) {
    const downloaded = await axios.get<ArrayBuffer>(item.url, {
      responseType: "arraybuffer",
      timeout: 60_000,
    });
    return Buffer.from(downloaded.data);
  }
  throw new Error("模型未返回图片数据");
}

function markdownReport(params: {
  startedAt: string;
  inputPath: string;
  sourceFile: string;
  models: string[];
  results: BenchmarkResult[];
}): string {
  const rows = params.results.map((result) => {
    const duration = (result.durationMs / 1000).toFixed(2);
    const output = escapeMarkdownCell(
      result.outputFile ? basename(result.outputFile) : `失败：${result.error ?? "未知错误"}`,
    );
    return `| ${result.label} | \`${result.model}\` | ${result.size} | ${result.status === "success" ? "成功" : "失败"} | ${duration} | ${result.outputDimensions ?? "—"} | ${output} |`;
  });
  return [
    "# 修图提速基准报告",
    "",
    `- 开始时间：${params.startedAt}`,
    `- 输入文件：${params.inputPath}`,
    `- 对比源图：${basename(params.sourceFile)}`,
    `- 单次请求超时：${requestTimeoutMs / 1000} 秒`,
    "- 计时范围：方舟编辑请求发出至完整结果图接收；同一输入图只上传一次，组合串行执行且不自动重试。",
    "- 生产配置：未修改。",
    "",
    "## API 当前可见的 Seedream / SeedEdit 模型",
    "",
    ...params.models.map((model) => `- \`${model}\``),
    "",
    "## 耗时对比",
    "",
    "| 组合 | 模型 ID | 尺寸 | 状态 | 耗时（秒） | 输出尺寸 | 文件 |",
    "|---|---|---:|---|---:|---:|---|",
    ...rows,
    "",
  ].join("\n");
}

export async function main(argv = process.argv.slice(2)): Promise<void> {
  if (!ENV.arkApiKey) throw new Error("ARK_API_KEY 未配置");
  const { inputPath, outputDir } = parseOptions(argv);
  const input = await readFile(inputPath);
  await mkdir(outputDir, { recursive: true });

  console.log("方舟 API 当前可见的 Seedream / SeedEdit 模型：");
  const imageModels = await listApiImageModels();
  for (const model of imageModels) console.log(`- ${model}`);

  const unavailableModels = [...new Set(BENCHMARK_CASES.map((item) => item.model))]
    .filter((model) => !imageModels.includes(model));
  if (unavailableModels.length > 0) {
    throw new Error(`以下基准模型不在 API 可见清单中：${unavailableModels.join(", ")}`);
  }

  const sourceFile = resolve(outputDir, `source_${basename(inputPath)}`);
  await copyFile(inputPath, sourceFile);
  const storageExtension = extname(inputPath).toLowerCase() || ".jpg";
  const storageKey = `model-verification/restore-benchmark/${Date.now()}${storageExtension}`;
  const startedAt = new Date().toISOString();
  const results: BenchmarkResult[] = [];

  console.log(`\n固定输入图：${inputPath}`);
  console.log(`结果目录：${outputDir}`);
  console.log("组合按顺序串行执行，每组只请求一次。\n");

  const uploaded = await storagePut(storageKey, input, inputMime(inputPath));
  try {
    for (const benchmarkCase of BENCHMARK_CASES) {
      const started = performance.now();
      console.log(`[开始] ${benchmarkCase.label} | ${benchmarkCase.model} | ${benchmarkCase.size}`);
      try {
        const image = await requestRestore(uploaded.url, benchmarkCase);
        const durationMs = Math.round(performance.now() - started);
        const { extension } = outputFormat(image);
        const outputFile = resolve(outputDir, buildOutputFileName(benchmarkCase.label, extension));
        await writeFile(outputFile, image);
        const dimensions = readImageDimensions(image);
        const outputDimensions = dimensions ? `${dimensions.width}x${dimensions.height}` : "未知";
        results.push({
          ...benchmarkCase,
          status: "success",
          durationMs,
          outputFile,
          outputBytes: image.byteLength,
          outputDimensions,
        });
        console.log(`[成功] ${benchmarkCase.label} | ${(durationMs / 1000).toFixed(2)} 秒 | ${outputDimensions} | ${outputFile}`);
      } catch (error) {
        const durationMs = Math.round(performance.now() - started);
        const message = safeError(error);
        results.push({ ...benchmarkCase, status: "failed", durationMs, error: message });
        console.log(`[失败] ${benchmarkCase.label} | ${(durationMs / 1000).toFixed(2)} 秒 | ${message}`);
      }
    }
  } finally {
    await storageDelete(storageKey);
    console.log("临时参考图已从对象存储清理。\n");
  }

  const reportPath = resolve(outputDir, "修图基准报告.md");
  const jsonPath = resolve(outputDir, "benchmark-results.json");
  await writeFile(reportPath, markdownReport({ startedAt, inputPath, sourceFile, models: imageModels, results }), "utf8");
  await writeFile(jsonPath, `${JSON.stringify({ startedAt, inputPath, sourceFile, imageModels, results }, null, 2)}\n`, "utf8");
  console.log(`报告：${reportPath}`);
  console.log(`原始结果：${jsonPath}`);
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : "";
if (import.meta.url === invokedPath) {
  main().catch((error) => {
    console.error(`基准测试失败：${safeError(error)}`);
    process.exitCode = 1;
  });
}
