export const ART_STYLES = {
  "油画": "把这张照片转换成经典油画风格：厚重的笔触肌理、浓郁的色彩层次，保持人物与构图不变。",
  "水彩": "把这张照片转换成清新水彩画风格：柔和的色彩晕染、通透梦幻的质感，保持人物与构图不变。",
  "素描": "把这张照片转换成细腻的铅笔素描风格：清晰的线条、讲究的明暗与光影，保持人物与构图不变。",
  "水墨画": "把这张照片转换成中国传统水墨画风格：飘逸的笔墨、留白意境、诗意氛围，保持人物与构图不变。",
  "印象派": "把这张照片转换成莫奈印象派油画风格：松弛而鲜活的笔触、斑斓的光影色彩，保持人物与构图不变。",
} as const;

export type ArtStyle = keyof typeof ART_STYLES;

const DEFAULT_RESTORE_PROMPT = "修复并增强这张老照片：提升清晰度与光线，修复破损、划痕、噪点与褪色区域，还原自然真实的色彩，人物面部保持原有特征不变，输出专业级照片修复效果。";

export function buildRestorePrompt(customPrompt?: string): string {
  const normalized = customPrompt?.trim();
  return normalized
    ? `按照以下要求修改这张照片：${normalized}。人物面部保持原有特征不变，效果自然真实、高清。`
    : DEFAULT_RESTORE_PROMPT;
}

export function getArtStylePrompt(style: ArtStyle): string {
  return ART_STYLES[style];
}
