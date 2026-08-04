import "dotenv/config";
import { identifyPlantFast } from "../server/plant-identification";

const SAMPLES = [
  {
    sample: "close-flower",
    imageUrl: "https://commons.wikimedia.org/wiki/Special:FilePath/Red%20rose%20close-up.jpg?width=1280",
  },
  {
    sample: "whole-plant",
    imageUrl: "https://commons.wikimedia.org/wiki/Special:FilePath/Common%20sunflower.jpg?width=1280",
  },
  {
    sample: "tree-leaf",
    imageUrl: "https://commons.wikimedia.org/wiki/Special:FilePath/Maple%20leaf%20%2851163110492%29.jpg?width=1280",
  },
] as const;

type SuccessfulResult = {
  sample: string;
  ok: true;
  provider: string;
  model: string;
  fallbackUsed: boolean;
  durationMs: number;
  identifiedName: string;
};

async function fetchSampleAsDataUrl(imageUrl: string): Promise<string> {
  const response = await fetch(imageUrl, {
    redirect: "follow",
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`sample download failed: ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length === 0 || bytes.length > 5 * 1024 * 1024) {
    throw new Error("sample image size is invalid");
  }
  return `data:image/jpeg;base64,${bytes.toString("base64")}`;
}

const successes: SuccessfulResult[] = [];

for (const sample of SAMPLES) {
  let startedAt = Date.now();
  try {
    const dataUrl = await fetchSampleAsDataUrl(sample.imageUrl);
    startedAt = Date.now();
    const result = await identifyPlantFast(dataUrl);
    const output: SuccessfulResult = {
      sample: sample.sample,
      ok: true,
      provider: result.provider,
      model: result.model,
      fallbackUsed: result.fallbackUsed,
      durationMs: Math.max(0, Date.now() - startedAt),
      identifiedName: result.name,
    };
    successes.push(output);
    console.log(JSON.stringify(output));
  } catch (error) {
    console.log(JSON.stringify({
      sample: sample.sample,
      ok: false,
      errorType: error instanceof Error ? error.name : "UnknownError",
      durationMs: Math.max(0, Date.now() - startedAt),
    }));
  }
}

const successCount = successes.length;
const under20s = successes.filter((item) => item.durationMs <= 20_000).length;
const fallbackCount = successes.filter((item) => item.fallbackUsed).length;
const averageMs = successCount
  ? Math.round(successes.reduce((sum, item) => sum + item.durationMs, 0) / successCount)
  : 0;

console.log(
  `plant_vision_summary total=${SAMPLES.length} success=${successCount} under20s=${under20s} fallback=${fallbackCount} averageMs=${averageMs}`,
);

if (successCount !== SAMPLES.length) process.exitCode = 1;
