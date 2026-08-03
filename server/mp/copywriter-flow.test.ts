import { describe, expect, it } from "vitest";
import {
  advanceCopywriterFlow,
  initialCopywriterFlow,
  resetCopywriterFlow,
  setCopywriterContext,
} from "../../miniprogram/src/features/copywriter/flow";

describe("暖心文案四步引导", () => {
  function completeRequiredSteps() {
    const scenario = advanceCopywriterFlow(initialCopywriterFlow, "生日寿辰");
    expect(scenario).toMatchObject({ step: "tone", scenario: "生日寿辰", canGenerate: false });

    const tone = advanceCopywriterFlow(scenario, "温暖亲切");
    expect(tone).toMatchObject({ step: "relationship", tone: "温暖亲切", canGenerate: false });

    return advanceCopywriterFlow(tone, "长辈");
  }

  it("按场景、风格、对象推进到可跳过的补充说明后即可生成", () => {
    const completed = completeRequiredSteps();

    expect(completed).toMatchObject({
      step: "customContext",
      scenario: "生日寿辰",
      tone: "温暖亲切",
      relationship: "长辈",
      customContext: "",
      canGenerate: true,
    });
  });

  it("语音回填补充说明后仍可生成，并能纠正过期的资格状态", () => {
    const completed = completeRequiredSteps();
    const staleState = { ...completed, canGenerate: false };
    const withVoiceContext = setCopywriterContext(staleState, "妈妈刚退休，最近开始学画画");

    expect(withVoiceContext).toMatchObject({
      step: "customContext",
      customContext: "妈妈刚退休，最近开始学画画",
      canGenerate: true,
    });
  });

  it("重置后回到场景问题且清空答案", () => {
    const completed = advanceCopywriterFlow(
      advanceCopywriterFlow(
        advanceCopywriterFlow(initialCopywriterFlow, "节日祝福"),
        "幽默调侃",
      ),
      "朋友",
    );

    expect(resetCopywriterFlow(completed)).toEqual(initialCopywriterFlow);
  });
});
