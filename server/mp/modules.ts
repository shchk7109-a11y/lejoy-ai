export type MpModule = {
  id: string;
  name: string;
  icon: string;
  description: string;
  creditCost: number;
  enabled: boolean;
  theme?: { bg: string; border: string; title: string };
};

export const MP_MODULES: MpModule[] = [
  { id: "silver-lens", name: "老摄影大师", icon: "📸", description: "一键修图、人像美化与艺术创作", creditCost: 2, enabled: true, theme: { bg: "#FEF9C3", border: "#FDE68A", title: "#92400E" } },
  { id: "copy-writer", name: "暖心文案", icon: "✍️", description: "为您撰写节日祝福与朋友圈", creditCost: 1, enabled: true, theme: { bg: "#FFEDD5", border: "#FED7AA", title: "#9A3412" } },
  { id: "story-time", name: "AI 故事会", icon: "📖", description: "给孙辈讲个专属的好故事", creditCost: 3, enabled: true, theme: { bg: "#DBEAFE", border: "#BFDBFE", title: "#1D4ED8" } },
  { id: "life-assistant", name: "生活助手", icon: "🌿", description: "菜品健康分析、识花草", creditCost: 1, enabled: true, theme: { bg: "#DCFCE7", border: "#BBF7D0", title: "#166534" } },
  { id: "ai-photographer", name: "AI 摄影师", icon: "🎨", description: "专属人像大片，敬请期待", creditCost: 0, enabled: false, theme: { bg: "#CCFBF1", border: "#99F6E4", title: "#0F766E" } },
  { id: "ai-kaleidoscope", name: "AI 万花筒", icon: "🩺", description: "生活百科，陪您聊聊", creditCost: 1, enabled: true, theme: { bg: "#FCE7F3", border: "#FBCFE8", title: "#9D174D" } },
];
