import { describe, expect, it } from "vitest";
import { createTextSecurityBatches } from "./text-security-batches";

describe("createTextSecurityBatches", () => {
  it("把多条短输出合并成一个检测批次", () => {
    expect(createTextSecurityBatches([
      "愿您平安喜乐。",
      "愿温暖常伴左右。",
      "祝福日日常新。",
    ])).toEqual(["愿您平安喜乐。\n愿温暖常伴左右。\n祝福日日常新。"]);
  });

  it("合并文本超过 2500 字时拆分且不丢内容", () => {
    const inputs = ["甲".repeat(1800), "乙".repeat(1800)];
    const batches = createTextSecurityBatches(inputs);

    expect(batches).toHaveLength(2);
    expect(batches.every((batch) => batch.length <= 2500)).toBe(true);
    expect(batches.join("").replace("\n", "")).toBe(inputs.join(""));
  });
});
