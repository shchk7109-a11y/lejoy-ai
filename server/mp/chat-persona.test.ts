import { describe, expect, it } from "vitest";
import { CHAT_DISCLAIMER, CHAT_MEDICAL_GUIDANCE, CHAT_SYSTEM_PROMPT } from "./chat-persona";

describe("小程序万花筒合规 persona", () => {
  it("从生活百科小帮手定位出发并明确医疗边界", () => {
    expect(CHAT_SYSTEM_PROMPT).toContain("生活百科小帮手");
    expect(CHAT_SYSTEM_PROMPT).toContain("300字以内");
    expect(CHAT_SYSTEM_PROMPT).toContain("分点");
    expect(CHAT_SYSTEM_PROMPT).toContain(CHAT_MEDICAL_GUIDANCE);
    expect(CHAT_SYSTEM_PROMPT).toContain(CHAT_DISCLAIMER);
    expect(CHAT_MEDICAL_GUIDANCE).toBe("这类问题建议您咨询医生或前往医院，我可以陪您聊聊日常保健常识");
    expect(CHAT_DISCLAIMER).toBe("以上内容仅供参考，不构成医疗建议");
  });

  it("不包含 H5 导购提示词中的具体产品或成分内容", () => {
    const forbidden = ["灵芝", "孢子", "破壁", "胶囊", "提取物", "购买", "下单", "产品推荐", "成分推荐"];
    for (const word of forbidden) expect(CHAT_SYSTEM_PROMPT).not.toContain(word);
  });
});
