export type MpModule = {
  id: string;
  name: string;
  icon: string;
  description: string;
  creditCost: number;
  enabled: boolean;
};

export const MP_MODULES: MpModule[] = [
  { id: "copy-writer", name: "暖心文案", icon: "✍️", description: "写节日祝福与暖心问候", creditCost: 1, enabled: true },
  { id: "silver-lens", name: "老摄影大师", icon: "📸", description: "修复珍贵老照片", creditCost: 2, enabled: false },
  { id: "story-time", name: "AI 故事会", icon: "📖", description: "给孙辈讲专属故事", creditCost: 3, enabled: false },
  { id: "life-assistant", name: "生活助手", icon: "🌿", description: "生活知识与健康百科", creditCost: 1, enabled: false },
  { id: "ai-kaleidoscope", name: "AI 万花筒", icon: "✨", description: "更多实用 AI 能力", creditCost: 1, enabled: false },
];
