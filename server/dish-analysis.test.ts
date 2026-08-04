import { describe, expect, it, vi } from "vitest";
import {
  DISH_ANALYSIS_DISCLAIMER,
  analyzeDishNutrition,
  extractDishName,
  extractDouyinShortUrl,
  fetchDouyinPublicMetadata,
  inspectDishImage,
} from "./dish-analysis";

const nutritionPayload = {
  title: "番茄炒蛋",
  healthScore: 82,
  portionBasis: "每100克估算",
  nutrition: {
    calories: "120kcal",
    protein: "6g",
    fat: "7g",
    carbs: "8g",
    sodium: "300mg",
    sugar: "3g",
  },
  ingredients: {
    primary: ["番茄", "鸡蛋"],
    secondary: [],
    seasonings: ["食用油", "盐"],
  },
  overview: "蛋白质和蔬菜搭配较均衡，烹饪油盐会影响最终营养值。",
  attentionPoints: [
    { kind: "positive", title: "蛋白质来源", detail: "鸡蛋可以提供蛋白质。" },
    { kind: "caution", title: "留意用油", detail: "炒制时用油量会影响脂肪和热量。" },
  ],
  cookingTips: ["少放油，番茄炒软后再加入鸡蛋。"],
  pairingTips: ["搭配一份绿叶菜和少量杂粮饭。"],
  tags: ["家常菜", "蛋白质"],
};

describe("菜品分析模型契约", () => {
  it("从分享文案中提取标准菜名并要求 JSON 对象", async () => {
    const chat = vi.fn(async () => '{"dishName":"糖醋排骨"}');

    await expect(extractDishName("今天做糖醋排骨，酸甜下饭", chat)).resolves.toBe("糖醋排骨");
    expect(chat).toHaveBeenCalledWith(expect.objectContaining({ json: true }));
    expect(chat.mock.calls[0][0].userPrompt).toContain("JSON对象");
  });

  it("无法确认菜名时返回 undefined，拒绝裸数组", async () => {
    await expect(extractDishName("今天吃点好的", vi.fn(async () => '{"dishName":null}'))).resolves.toBeUndefined();
    await expect(extractDishName("糖醋排骨", vi.fn(async () => '["糖醋排骨"]'))).rejects.toThrow("JSON对象");
  });

  it("使用视觉模型拆出菜名及三类食材", async () => {
    const chat = vi.fn(async () => JSON.stringify({
      dishName: "番茄炒蛋",
      ingredients: nutritionPayload.ingredients,
    }));

    await expect(inspectDishImage("https://cdn.example/dish.jpg", chat)).resolves.toEqual({
      dishName: "番茄炒蛋",
      ingredients: nutritionPayload.ingredients,
    });
    expect(chat).toHaveBeenCalledWith(expect.objectContaining({
      imageUrl: "https://cdn.example/dish.jpg",
      json: true,
    }));
  });

  it("图片无法确认菜名时仍保留空的三类食材", async () => {
    const chat = vi.fn(async () => JSON.stringify({
      dishName: null,
      ingredients: { primary: [], secondary: [], seasonings: [] },
    }));

    await expect(inspectDishImage("https://cdn.example/unknown.jpg", chat)).resolves.toEqual({
      dishName: undefined,
      ingredients: { primary: [], secondary: [], seasonings: [] },
    });
  });

  it("校验营养结构、派生评分标签并使用固定免责声明", async () => {
    const chat = vi.fn(async () => JSON.stringify(nutritionPayload));

    await expect(analyzeDishNutrition({ dishName: "番茄炒蛋" }, chat)).resolves.toMatchObject({
      title: "番茄炒蛋",
      healthScore: 82,
      scoreLabel: "较健康",
      disclaimer: DISH_ANALYSIS_DISCLAIMER,
      ingredients: nutritionPayload.ingredients,
    });
  });

  it("图片食材拆解会进入营养提示词", async () => {
    const chat = vi.fn(async () => JSON.stringify(nutritionPayload));

    await analyzeDishNutrition({ dishName: "番茄炒蛋", ingredients: nutritionPayload.ingredients }, chat);

    const prompt = chat.mock.calls[0][0].userPrompt;
    expect(prompt).toContain("原材料：番茄、鸡蛋");
    expect(prompt).toContain("调味料：食用油、盐");
  });

  it("拒绝越界评分、缺失营养字段和医疗化建议", async () => {
    await expect(analyzeDishNutrition(
      { dishName: "番茄炒蛋" },
      vi.fn(async () => JSON.stringify({ ...nutritionPayload, healthScore: 120 })),
    )).rejects.toThrow("健康指数");

    const { sodium: _sodium, ...incompleteNutrition } = nutritionPayload.nutrition;
    await expect(analyzeDishNutrition(
      { dishName: "番茄炒蛋" },
      vi.fn(async () => JSON.stringify({ ...nutritionPayload, nutrition: incompleteNutrition })),
    )).rejects.toThrow("钠");

    await expect(analyzeDishNutrition(
      { dishName: "番茄炒蛋" },
      vi.fn(async () => JSON.stringify({ ...nutritionPayload, cookingTips: ["建议服用降糖药治疗"] })),
    )).rejects.toThrow("医疗化");
  });
});

describe("抖音公开元数据降级", () => {
  it("只提取 v.douyin.com HTTPS 短链接", () => {
    expect(extractDouyinShortUrl("复制 https://v.douyin.com/abc123/ 打开抖音")).toBe("https://v.douyin.com/abc123/");
    expect(extractDouyinShortUrl("http://v.douyin.com/abc123/")).toBeUndefined();
    expect(extractDouyinShortUrl("https://attacker.example/?next=v.douyin.com")).toBeUndefined();
  });

  it("跟随受控官方跳转并读取标题与描述", async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(new Response(null, {
        status: 302,
        headers: { location: "https://www.douyin.com/video/123" },
      }))
      .mockResolvedValueOnce(new Response(
        '<html><head><title>糖醋排骨的家常做法</title><meta name="description" content="少油版糖醋排骨"></head></html>',
        { status: 200, headers: { "content-type": "text/html; charset=utf-8" } },
      ));

    await expect(fetchDouyinPublicMetadata("复制 https://v.douyin.com/abc/ 看看", fetchImpl as typeof fetch))
      .resolves.toBe("糖醋排骨的家常做法\n少油版糖醋排骨");
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(fetchImpl.mock.calls[0][1]).toMatchObject({ redirect: "manual" });
    expect((fetchImpl.mock.calls[0][1]?.headers as Record<string, string>)["User-Agent"]).toContain("Mozilla");
  });

  it("支持 og:title 与 og:description 属性顺序变化", async () => {
    const html = '<meta content="红烧鱼做法" property="og:title"><meta content="家常少油版" property="og:description">';
    const fetchImpl = vi.fn(async () => new Response(html, {
      status: 200,
      headers: { "content-type": "text/html" },
    }));

    await expect(fetchDouyinPublicMetadata("https://v.douyin.com/fish/", fetchImpl as typeof fetch))
      .resolves.toBe("红烧鱼做法\n家常少油版");
  });

  it("非法跳转、非 HTML、过大页面与网络失败均静默降级", async () => {
    const unsafeRedirect = vi.fn(async () => new Response(null, {
      status: 302,
      headers: { location: "https://attacker.example/private" },
    }));
    const nonHtml = vi.fn(async () => new Response("{}", {
      status: 200,
      headers: { "content-type": "application/json" },
    }));
    const oversized = vi.fn(async () => new Response("x".repeat(256 * 1024 + 1), {
      status: 200,
      headers: { "content-type": "text/html" },
    }));
    const failed = vi.fn(async () => { throw new Error("network down"); });

    await expect(fetchDouyinPublicMetadata("https://v.douyin.com/a/", unsafeRedirect as typeof fetch)).resolves.toBeUndefined();
    await expect(fetchDouyinPublicMetadata("https://v.douyin.com/a/", nonHtml as typeof fetch)).resolves.toBeUndefined();
    await expect(fetchDouyinPublicMetadata("https://v.douyin.com/a/", oversized as typeof fetch)).resolves.toBeUndefined();
    await expect(fetchDouyinPublicMetadata("https://v.douyin.com/a/", failed as typeof fetch)).resolves.toBeUndefined();
  });

  it("无 Content-Length 的大页面在流读取超限时立即取消", async () => {
    const chunks = [new Uint8Array(200 * 1024), new Uint8Array(80 * 1024)];
    const reader = {
      read: vi.fn(async () => chunks.length > 0
        ? { done: false as const, value: chunks.shift()! }
        : { done: true as const, value: undefined }),
      cancel: vi.fn(async () => undefined),
    };
    const arrayBuffer = vi.fn(async () => { throw new Error("不应整页读取"); });
    const response = {
      status: 200,
      ok: true,
      headers: new Headers({ "content-type": "text/html" }),
      body: { getReader: () => reader },
      arrayBuffer,
    } as unknown as Response;
    const fetchImpl = vi.fn(async () => response);

    await expect(fetchDouyinPublicMetadata("https://v.douyin.com/large/", fetchImpl as typeof fetch))
      .resolves.toBeUndefined();
    expect(reader.cancel).toHaveBeenCalledOnce();
    expect(arrayBuffer).not.toHaveBeenCalled();
  });

  it("没有短链接时不发网络请求", async () => {
    const fetchImpl = vi.fn();
    await expect(fetchDouyinPublicMetadata("糖醋排骨", fetchImpl as typeof fetch)).resolves.toBeUndefined();
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
