import { describe, expect, it, vi } from "vitest";
import { fetchStoreCatalog } from "./store-source";

const catalog = {
  products: [{ id: "secret-product", ingredients: "do-not-copy" }],
  storeFormats: [
    { id: "community", name: "灵芝水铺·社区店", stores: [{ id: "nanjing", name: "南京店" }, { id: "suzhou", name: "苏州店" }] },
    { id: "business", name: "葫芦里卖什么·商务区店", stores: [{ id: "g60", name: "G60 店" }] },
  ],
};

function fakeFetch(body: unknown, status = 200) {
  return vi.fn(async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;
}

describe("内容裂变系统门店目录", () => {
  it("只投影业态与门店标识，不返回产品资料，也不向浏览器传密钥", async () => {
    const fetchImpl = fakeFetch(catalog);
    const rows = await fetchStoreCatalog({ apiKey: "test-internal-key", fetchImpl });
    expect(rows).toEqual([
      { formatId: "business", formatName: "葫芦里卖什么·商务区店", storeId: "g60", storeName: "G60 店" },
      { formatId: "community", formatName: "灵芝水铺·社区店", storeId: "nanjing", storeName: "南京店" },
      { formatId: "community", formatName: "灵芝水铺·社区店", storeId: "suzhou", storeName: "苏州店" },
    ]);
    expect(JSON.stringify(rows)).not.toContain("secret-product");
    expect(JSON.stringify(rows)).not.toContain("do-not-copy");
    const [url, init] = (fetchImpl as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://ai.lingzhi-ip.com/api/products");
    expect(init.redirect).toBe("manual");
    expect(init.cache).toBe("no-store");
    expect(new Headers(init.headers).get("X-Internal-API-Key")).toBe("test-internal-key");
  });

  it("无密钥、鉴权失败或重定向均拒绝同步", async () => {
    const fetchImpl = fakeFetch(catalog);
    await expect(fetchStoreCatalog({ apiKey: "", fetchImpl })).rejects.toThrow();
    expect(fetchImpl).not.toHaveBeenCalled();
    await expect(fetchStoreCatalog({ apiKey: "key", fetchImpl: fakeFetch({}, 401) })).rejects.toThrow();
    await expect(fetchStoreCatalog({ apiKey: "key", fetchImpl: fakeFetch({}, 302) })).rejects.toThrow();
  });

  it("空目录、重复来源键和错误字段不能覆盖本地镜像", async () => {
    const invalid = [
      { storeFormats: [] },
      { storeFormats: [{ id: "community", name: "社区店", stores: [] }] },
      { storeFormats: [{ id: "community", name: "社区店", stores: [{ id: "a", name: "A" }, { id: "a", name: "B" }] }] },
      { storeFormats: [{ id: "community", name: "社区店", stores: [{ id: "a", name: "" }] }] },
    ];
    for (const body of invalid) {
      await expect(fetchStoreCatalog({ apiKey: "key", fetchImpl: fakeFetch(body) })).rejects.toThrow();
    }
  });
});
