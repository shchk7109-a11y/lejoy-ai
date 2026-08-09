import { describe, expect, it } from "vitest";

import {
  BENCHMARK_CASES,
  buildOutputFileName,
  escapeMarkdownCell,
  filterImageModels,
} from "../scripts/benchmark-restore";

describe("修图提速基准脚本", () => {
  it("包含用户指定的四组参数与 Seedream 5.0 Lite 快速候选", () => {
    expect(BENCHMARK_CASES).toEqual([
      { label: "seedream-5.0-pro_2K", model: "doubao-seedream-5-0-pro-260628", size: "2K" },
      { label: "seedream-5.0-pro_1.5K", model: "doubao-seedream-5-0-pro-260628", size: "1.5K" },
      { label: "seedream-4.0_2K", model: "doubao-seedream-4-0-250828", size: "2K" },
      { label: "seedream-4.0_1K", model: "doubao-seedream-4-0-250828", size: "1K" },
      { label: "seedream-5.0-lite_2K", model: "doubao-seedream-5-0-260128", size: "2K" },
      { label: "seedream-5.0-lite_1K", model: "doubao-seedream-5-0-260128", size: "1K" },
    ]);
  });

  it("只列出 API 返回的 Seedream 与 SeedEdit 图像模型并去重排序", () => {
    expect(filterImageModels([
      "text-model",
      "doubao-seedream-5-0-pro-260628",
      "doubao-seededit-3-0-i2i-250628",
      "doubao-seedream-5-0-pro-260628",
    ])).toEqual([
      "doubao-seededit-3-0-i2i-250628",
      "doubao-seedream-5-0-pro-260628",
    ]);
  });

  it("结果文件名包含组合参数且不含路径危险字符", () => {
    expect(buildOutputFileName("seedream-5.0-pro_1.5K", "png")).toBe(
      "restore_seedream-5.0-pro_1.5K.png",
    );
    expect(buildOutputFileName("../../bad name", "jpeg")).toBe("restore_bad-name.jpeg");
  });

  it("报告表格会转义错误消息中的竖线", () => {
    expect(escapeMarkdownCell("HTTP 400 | InvalidParameter")).toBe(
      "HTTP 400 \\| InvalidParameter",
    );
  });
});
