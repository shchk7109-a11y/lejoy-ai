import { describe, expect, it } from "vitest";
import {
  CHAT_INPUT_RED_LINES,
  appendChatDisclaimer,
  blocksChatInput,
  blocksChatOutput,
} from "./chat-guard";
import { CHAT_DISCLAIMER } from "./chat-persona";

describe("万花筒输入红线", () => {
  it("关键词表至少 30 条并拦截症状、用药、诊断和报告解读", () => {
    expect(CHAT_INPUT_RED_LINES.length).toBeGreaterThanOrEqual(30);
    for (const input of [
      "血压高吃什么药",
      "帮我看看化验单",
      "胸口疼是不是心梗",
      "这个检查报告能确诊吗",
      "二甲双胍能不能停药",
    ]) {
      expect(blocksChatInput(input), input).toBe(true);
    }
  });

  it("正常生活、节气、饮食、运动、睡眠和传统文化问题可通过", () => {
    for (const input of [
      "立秋有哪些传统习俗",
      "晚饭怎样搭配更清淡",
      "睡前可以做哪些放松活动",
      "适合老年人的日常散步习惯",
      "给我讲讲端午节的来历",
    ]) {
      expect(blocksChatInput(input), input).toBe(false);
    }
  });

  it("支持追加可配置红线词", () => {
    expect(blocksChatInput("需要特别处理", ["特别处理"])).toBe(true);
  });
});

describe("万花筒输出红线", () => {
  it("拦截药品名、剂量、服用和每日次数模式", () => {
    for (const output of [
      "可以服用阿司匹林。",
      "建议每次 20mg。",
      "建议每次 20毫克。",
      "每日3次，饭后口服。",
      "布洛芬一次一片。",
      "服用这种药物后观察。",
    ]) {
      expect(blocksChatOutput(output), output).toBe(true);
    }
  });

  it("拦截通用药物、保健品和治疗方案推荐表达", () => {
    for (const output of [
      "可以考虑缬沙坦。",
      "建议使用某品牌鱼油保健品。",
      "建议采用针灸治疗方案。",
    ]) {
      expect(blocksChatOutput(output), output).toBe(true);
    }
    expect(blocksChatOutput("可以考虑在晚饭后散步十分钟。" )).toBe(false);
    expect(blocksChatOutput("可以等当地平静下来再出门。" )).toBe(false);
  });

  it("普通生活建议不会被输出过滤器误伤", () => {
    expect(blocksChatOutput("春天可以适当散步，饮食注意多样化，晚上保持规律作息。" )).toBe(false);
  });

  it("免责声明追加幂等，确保当前首轮和末轮回复都带固定行", () => {
    const once = appendChatDisclaimer("可以从规律作息开始。" );
    expect(once).toBe(`可以从规律作息开始。\n\n${CHAT_DISCLAIMER}`);
    expect(appendChatDisclaimer(once)).toBe(once);
  });
});
