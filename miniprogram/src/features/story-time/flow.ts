export const STORY_THEMES = [
  { name: "温馨治愈", emoji: "🤗", tip: "感受陪伴、分享与温暖" },
  { name: "科幻探险", emoji: "🚀", tip: "探索未来、星空和新世界" },
  { name: "卡通童话", emoji: "🏰", tip: "走进明亮有趣的想象世界" },
  { name: "睡前故事", emoji: "🌙", tip: "温柔安心地进入梦乡" },
  { name: "成语故事", emoji: "📜", tip: "从小故事里懂得大道理" },
  { name: "超级英雄", emoji: "🦸", tip: "用勇气和责任守护大家" },
] as const;

export function createCustomStoryTopic(value: string, childName: string): {
  title: string;
  description: string;
  protagonist: string;
} | undefined {
  const title = value.trim();
  if (!title) return undefined;
  return {
    title,
    description: "按您说的主题创作",
    protagonist: childName.trim() || "小朋友",
  };
}
