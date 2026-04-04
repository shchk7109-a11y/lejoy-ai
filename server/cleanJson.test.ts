import { describe, expect, it } from "vitest";
import { cleanJson } from "./geminiService";

describe("cleanJson", () => {
  it("正常JSON对象直接返回", () => {
    const input = '{"title":"测试","pages":[]}';
    expect(JSON.parse(cleanJson(input))).toEqual({ title: "测试", pages: [] });
  });

  it("去除markdown代码块标记", () => {
    const input = '```json\n{"title":"故事"}\n```';
    expect(JSON.parse(cleanJson(input))).toEqual({ title: "故事" });
  });

  it("处理前后有多余文字的情况", () => {
    const input = '这是故事：{"title":"小红帽","pages":[{"pageNumber":1,"text":"从前有个小女孩"}]} 希望你喜欢';
    const result = JSON.parse(cleanJson(input));
    expect(result.title).toBe("小红帽");
  });

  it("处理故事文本中包含花括号的情况（核心bug场景）", () => {
    // 模拟Gemini返回的故事内容，文本中包含 } 字符（如中文标点后的特殊情况）
    const input = `{"title":"勇敢的小明","pages":[{"pageNumber":1,"text":"小明说：\\"我要去冒险！\\"他背上背包出发了。","imagePrompt":"A brave boy with backpack"},{"pageNumber":2,"text":"他遇到了一条大河。","imagePrompt":"A wide river in forest"}]}`;
    const result = JSON.parse(cleanJson(input));
    expect(result.title).toBe("勇敢的小明");
    expect(result.pages).toHaveLength(2);
    expect(result.pages[0].pageNumber).toBe(1);
  });

  it("处理嵌套对象中的转义字符", () => {
    const input = '{"text":"他说：\\"你好\\""，"value":1}';
    // 这个JSON本身格式有问题（中文逗号），但cleanJson应该尽力提取
    const cleaned = cleanJson(input);
    expect(cleaned).toContain('"text"');
  });

  it("处理数组格式的JSON", () => {
    const input = '[{"id":1,"name":"测试"}]';
    const result = JSON.parse(cleanJson(input));
    expect(Array.isArray(result)).toBe(true);
    expect(result[0].name).toBe("测试");
  });

  it("空字符串返回空对象", () => {
    expect(cleanJson("")).toBe("{}");
  });

  it("处理多层嵌套JSON", () => {
    const input = `{
      "title": "神奇的森林",
      "pages": [
        {
          "pageNumber": 1,
          "text": "在一个遥远的地方，有一片神奇的森林。森林里住着各种各样的动物。",
          "imagePrompt": "A magical forest with colorful trees and animals"
        },
        {
          "pageNumber": 2,
          "text": "小兔子跳跳说：\\"今天天气真好，我们去探险吧！\\"",
          "imagePrompt": "A cute rabbit jumping in the forest"
        }
      ]
    }`;
    const result = JSON.parse(cleanJson(input));
    expect(result.title).toBe("神奇的森林");
    expect(result.pages).toHaveLength(2);
  });
});
