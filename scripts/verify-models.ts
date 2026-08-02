import { config } from "dotenv";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "..");
config({ path: resolve(repoRoot, ".env"), override: false, quiet: true });

type Status = "PASS" | "FAIL" | "SKIP";

interface CheckResult {
  name: string;
  status: Status;
  durationMs: number;
  detail: string;
}

const REQUIRED_ENV_KEYS = [
  "MOONSHOT_API_KEY",
  "ARK_API_KEY",
  "DASHSCOPE_API_KEY",
  "S3_ENDPOINT",
  "S3_REGION",
  "S3_BUCKET",
  "S3_ACCESS_KEY_ID",
  "S3_SECRET_ACCESS_KEY",
  "S3_PUBLIC_BASE_URL",
] as const;

const SECRET_ENV_KEYS = [
  "MOONSHOT_API_KEY",
  "ARK_API_KEY",
  "DASHSCOPE_API_KEY",
  "S3_ACCESS_KEY_ID",
  "S3_SECRET_ACCESS_KEY",
  "JWT_SECRET",
  "WECHAT_MINI_SECRET",
] as const;

const secrets = SECRET_ENV_KEYS.map((key) => process.env[key] ?? "").filter(
  (value) => value.length >= 6,
);

function redact(value: unknown): string {
  let text = value instanceof Error ? value.message : String(value);
  if (value && typeof value === "object" && "response" in value) {
    const response = (
      value as { response?: { status?: number; data?: unknown } }
    ).response;
    if (response) {
      let responseData = "";
      try {
        responseData = JSON.stringify(response.data);
      } catch {
        responseData = String(response.data);
      }
      text = `${text}; HTTP ${response.status ?? "unknown"}; 响应 ${compact(responseData, 800)}`;
    }
  }
  for (const secret of secrets) text = text.split(secret).join("[REDACTED]");
  return text.replace(
    /([?&](?:accessKey|signature|token|x-amz-[^=]+)=)[^&\s]+/gi,
    "$1[REDACTED]",
  );
}

function compact(value: string, limit = 160): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length <= limit
    ? normalized
    : `${normalized.slice(0, limit)}…`;
}

function imageMime(buffer: Buffer): string {
  if (
    buffer
      .subarray(0, 8)
      .equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  ) {
    return "image/png";
  }
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff)
    return "image/jpeg";
  if (
    buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
    buffer.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    return "image/webp";
  }
  return "application/octet-stream";
}

async function runCheck(
  name: string,
  action: () => Promise<string>,
): Promise<CheckResult> {
  const startedAt = Date.now();
  try {
    const detail = redact(await action());
    return { name, status: "PASS", durationMs: Date.now() - startedAt, detail };
  } catch (error) {
    return {
      name,
      status: "FAIL",
      durationMs: Date.now() - startedAt,
      detail: redact(error),
    };
  }
}

function printResult(index: number, total: number, result: CheckResult): void {
  console.log(
    `[${index}/${total}] ${result.name}: ${result.status} (${result.durationMs}ms)`,
  );
  console.log(`  ${result.detail}`);
}

function markdownEscape(value: string): string {
  return value.replace(/\|/g, "\\|").replace(/\r?\n/g, "<br>");
}

function reportTimestamp(date: Date): string {
  const parts = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const value = Object.fromEntries(
    parts.map((part) => [part.type, part.value]),
  );
  return `${value.year}${value.month}${value.day}-${value.hour}${value.minute}${value.second}`;
}

function displayTime(date: Date): string {
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    dateStyle: "medium",
    timeStyle: "long",
  }).format(date);
}

async function main(): Promise<void> {
  const startedAt = new Date();
  const missingKeys = REQUIRED_ENV_KEYS.filter(
    (key) => !(process.env[key] ?? "").trim(),
  );
  if (missingKeys.length > 0) {
    throw new Error(`缺少必需环境变量：${missingKeys.join(", ")}`);
  }

  const { aiASR, aiChat, aiGenerateImage, aiTTS } = await import(
    "../server/ai/gateway"
  );
  const { storageDelete, storagePut } = await import("../server/storage");

  const results: CheckResult[] = [];
  let speech: { audioData: string; audioMime: string } | undefined;
  let audioObject: { key: string; url: string } | undefined;

  console.log("乐享AI 真实密钥模型链路实测");
  console.log(`开始时间：${displayTime(startedAt)}`);
  console.log("密钥预检：PASS（仅检查是否配置，不输出值）");
  console.log(
    `模型配置：Kimi=${process.env.MOONSHOT_MODEL}; Seedream=${process.env.ARK_IMAGE_MODEL}; TTS=${process.env.DASHSCOPE_TTS_MODEL}; ASR=${process.env.DASHSCOPE_ASR_MODEL}`,
  );

  results.push(
    await runCheck("Kimi 文本生成", async () => {
      const response = await aiChat({
        systemPrompt:
          "你是模型连通性测试助手。只回答一句简短中文，不提供医疗建议。",
        userPrompt: "请用一句话确认乐享AI文本链路可以正常响应。",
      });
      if (!response.trim()) throw new Error("模型返回空文本");
      return `返回 ${response.trim().length} 字；内容摘要：${compact(response)}`;
    }),
  );
  printResult(1, 5, results[0]);

  results.push(
    await runCheck("Seedream 文生图", async () => {
      const base64 = await aiGenerateImage({
        prompt:
          "温暖明亮的中国社区活动室，几位银发长者一起学习使用智能手机，真实摄影风格，画面自然友善，无文字无商标",
        aspectRatio: "1:1",
      });
      const image = Buffer.from(base64, "base64");
      const mime = imageMime(image);
      if (image.byteLength < 1024 || mime === "application/octet-stream") {
        throw new Error(
          `返回的图像数据无效（${image.byteLength} bytes, ${mime}）`,
        );
      }
      return `收到 ${image.byteLength} bytes；格式 ${mime}`;
    }),
  );
  printResult(2, 5, results[1]);

  results.push(
    await runCheck("DashScope TTS", async () => {
      speech = await aiTTS(
        "乐享AI模型链路验证成功。祝您今天心情愉快。",
        "lively",
      );
      const audio = Buffer.from(speech.audioData, "base64");
      if (audio.byteLength < 256)
        throw new Error(`返回的音频数据过小（${audio.byteLength} bytes）`);
      return `收到 ${audio.byteLength} bytes；格式 ${speech.audioMime}`;
    }),
  );
  printResult(3, 5, results[2]);

  const objectKey = `model-verification/${reportTimestamp(startedAt)}/tts-sample.audio`;
  if (speech) {
    results.push(
      await runCheck("OSS 临时上传", async () => {
        audioObject = await storagePut(
          objectKey,
          Buffer.from(speech!.audioData, "base64"),
          speech!.audioMime,
        );
        const url = new URL(audioObject.url);
        return `上传成功；对象键 ${audioObject.key}；公开地址 ${url.origin}${url.pathname}`;
      }),
    );
  } else {
    results.push({
      name: "OSS 临时上传",
      status: "SKIP",
      durationMs: 0,
      detail: "依赖的 TTS 检查失败，未执行上传",
    });
  }
  printResult(4, 5, results[3]);

  if (audioObject) {
    results.push(
      await runCheck("DashScope ASR", async () => {
        const response = await aiASR(audioObject!.url, "zh");
        if (!response.text.trim()) throw new Error("模型返回空转写");
        return `转写 ${response.text.trim().length} 字；内容摘要：${compact(response.text)}`;
      }),
    );
  } else {
    results.push({
      name: "DashScope ASR",
      status: "SKIP",
      durationMs: 0,
      detail: "依赖的 OSS 临时上传未成功，未执行识别",
    });
  }
  printResult(5, 5, results[4]);

  let cleanup = "未产生临时对象，无需清理";
  if (audioObject) {
    try {
      await storageDelete(audioObject.key);
      cleanup = `PASS（已删除 ${audioObject.key}）`;
    } catch (error) {
      cleanup = `FAIL（${redact(error)}）`;
    }
  }
  console.log(`临时对象清理：${cleanup}`);

  const finishedAt = new Date();
  const passed = results.filter((result) => result.status === "PASS").length;
  const failed = results.filter((result) => result.status === "FAIL").length;
  const skipped = results.filter((result) => result.status === "SKIP").length;
  const overall =
    failed === 0 && skipped === 0 && !cleanup.startsWith("FAIL")
      ? "PASS"
      : "FAIL";

  const reportDir = resolve(repoRoot, "docs", "model-verification");
  const reportPath = resolve(
    reportDir,
    `真实密钥模型链路实测-${reportTimestamp(startedAt)}.md`,
  );
  await mkdir(reportDir, { recursive: true });
  const report = [
    "# 乐享AI真实密钥模型链路实测报告",
    "",
    `- 开始时间：${displayTime(startedAt)}`,
    `- 完成时间：${displayTime(finishedAt)}`,
    `- 总结果：**${overall}**（PASS ${passed} / FAIL ${failed} / SKIP ${skipped}）`,
    "- 安全说明：密钥仅从根目录 `.env` 读取；报告不记录密钥、鉴权参数或完整签名 URL。",
    "",
    "## 模型配置",
    "",
    `- Kimi：${process.env.MOONSHOT_MODEL}`,
    `- Seedream：${process.env.ARK_IMAGE_MODEL}`,
    `- DashScope TTS：${process.env.DASHSCOPE_TTS_MODEL}`,
    `- DashScope ASR：${process.env.DASHSCOPE_ASR_MODEL}`,
    "",
    "## 验证结果",
    "",
    "| 项目 | 状态 | 耗时 | 详情 |",
    "|---|---:|---:|---|",
    ...results.map(
      (result) =>
        `| ${markdownEscape(result.name)} | ${result.status} | ${result.durationMs}ms | ${markdownEscape(result.detail)} |`,
    ),
    "",
    "## 临时对象清理",
    "",
    cleanup,
    "",
  ].join("\n");
  await writeFile(reportPath, report, "utf8");

  console.log(
    `汇总：${overall}（PASS ${passed} / FAIL ${failed} / SKIP ${skipped}）`,
  );
  console.log(`验证报告：${reportPath}`);

  if (overall !== "PASS") process.exitCode = 1;
}

main().catch((error) => {
  console.error(`验证脚本启动失败：${redact(error)}`);
  process.exitCode = 1;
});
