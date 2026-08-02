import { describe, expect, it } from "vitest";
import {
  advanceCopywriterFlow,
  initialCopywriterFlow,
  resetCopywriterFlow,
} from "../../miniprogram/src/features/copywriter/flow";

describe("暖心文案四步引导", () => {
  it("按场景、对象、语气推进到可选补充说明", () => {
    const scenario = advanceCopywriterFlow(initialCopywriterFlow, "生日寿辰");
    expect(scenario).toMatchObject({ step: "relationship", scenario: "生日寿辰", canGenerate: false });

    const relationship = advanceCopywriterFlow(scenario, "长辈");
    expect(relationship).toMatchObject({ step: "tone", relationship: "长辈", canGenerate: false });

    const tone = advanceCopywriterFlow(relationship, "温暖亲切");
    expect(tone).toMatchObject({ step: "customContext", tone: "温暖亲切", canGenerate: true, customContext: "" });
  });

  it("重置后回到场景问题且清空答案", () => {
    const completed = advanceCopywriterFlow(
      advanceCopywriterFlow(
        advanceCopywriterFlow(initialCopywriterFlow, "节日祝福"),
        "朋友",
      ),
      "幽默调侃",
    );

    expect(resetCopywriterFlow(completed)).toEqual(initialCopywriterFlow);
  });
});
