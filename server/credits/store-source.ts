export type StoreCatalogRow = { formatId: string; formatName: string; storeId: string; storeName: string };

const SOURCE_URL = "https://ai.lingzhi-ip.com/api/products";
const MAX_BYTES = 5 * 1024 * 1024;

function sourceId(value: unknown): string {
  if (typeof value !== "string" || !/^[a-zA-Z0-9_-]{1,100}$/.test(value)) throw new Error("门店目录标识无效");
  return value;
}

function sourceName(value: unknown): string {
  if (typeof value !== "string" || !value.trim() || value.length > 160) throw new Error("门店目录名称无效");
  return value.trim();
}

async function readLimited(response: Response): Promise<string> {
  if (!response.body) throw new Error("门店目录响应为空");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BYTES) throw new Error("门店目录响应过大");
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks.map(chunk => Buffer.from(chunk))).toString("utf8");
}

export async function fetchStoreCatalog(options: { apiKey: string; fetchImpl?: typeof fetch; timeoutMs?: number }): Promise<StoreCatalogRow[]> {
  const apiKey = options.apiKey?.trim();
  if (!apiKey) throw new Error("门店同步密钥未配置");
  const timeoutMs = options.timeoutMs ?? 5000;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > 30_000) throw new Error("门店同步超时配置无效");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let response: Response;
  try {
    response = await (options.fetchImpl ?? fetch)(SOURCE_URL, {
      method: "GET",
      headers: { "X-Internal-API-Key": apiKey, "Cache-Control": "no-cache" },
      redirect: "manual",
      cache: "no-store",
      signal: controller.signal,
    });
    if (!response.ok || response.status >= 300) throw new Error("门店来源接口不可用");
    const raw: unknown = JSON.parse(await readLimited(response));
    if (!raw || typeof raw !== "object" || !Array.isArray((raw as { storeFormats?: unknown }).storeFormats)) throw new Error("门店目录格式无效");
    const formats = (raw as { storeFormats: unknown[] }).storeFormats;
    if (formats.length === 0 || formats.length > 100) throw new Error("门店目录业态数量无效");
    const rows: StoreCatalogRow[] = [];
    const seen = new Set<string>();
    for (const item of formats) {
      if (!item || typeof item !== "object") throw new Error("门店目录业态无效");
      const format = item as Record<string, unknown>;
      const formatId = sourceId(format.id);
      const formatName = sourceName(format.name);
      if (!Array.isArray(format.stores) || format.stores.length > 1000) throw new Error("门店目录门店列表无效");
      for (const entry of format.stores) {
        if (!entry || typeof entry !== "object") throw new Error("门店目录门店无效");
        const store = entry as Record<string, unknown>;
        const storeId = sourceId(store.id);
        const key = JSON.stringify([formatId, storeId]);
        if (seen.has(key)) throw new Error("门店目录存在重复门店");
        seen.add(key);
        rows.push({ formatId, formatName, storeId, storeName: sourceName(store.name) });
      }
    }
    if (rows.length === 0 || rows.length > 3000) throw new Error("门店目录为空或数量异常");
    return rows.sort((a, b) => a.formatId.localeCompare(b.formatId) || a.storeId.localeCompare(b.storeId));
  } finally {
    clearTimeout(timer);
  }
}
