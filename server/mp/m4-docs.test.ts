import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function root(relativePath: string): string {
  return readFileSync(new URL(`../../${relativePath}`, import.meta.url), "utf8");
}

describe("M4 提审准备文档", () => {
  it("清单按执行角色分组且全部使用可勾选事项", () => {
    const checklist = root("docs/提审准备清单.md");
    for (const role of ["项目负责人/法务", "微信后台管理员", "研发/运维", "真机验收负责人"]) {
      expect(checklist).toContain(role);
    }
    expect((checklist.match(/- \[ \]/g) ?? []).length).toBeGreaterThanOrEqual(45);
  });

  it("覆盖资质、模型材料、JSON 消息推送、生产安全和 M1-M3 点检", () => {
    const checklist = root("docs/提审准备清单.md");
    for (const item of [
      "小程序备案", "深度合成", "AI问答", "算法备案编号", "合作协议模板",
      "消息格式：JSON", "MP_MOCK_LOGIN", "CONTENT_SECURITY=wechat", "真实模型密钥",
      "老摄影大师", "暖心文案", "AI 故事会", "生活助手", "AI 万花筒", "食物营养信息查询",
    ]) expect(checklist).toContain(item);
  });

  it("运行指南写清体验版指向生产后端及三种构建环境", () => {
    const guide = root("docs/小程序运行指南.md");
    for (const item of ["TARO_APP_RELEASE_CHANNEL", "develop", "trial", "release", "体验版", "生产后端"]) {
      expect(guide).toContain(item);
    }
  });
});
