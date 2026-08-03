export const PHOTO_FIDELITY_CONSTRAINT =
  "严格保持人物五官、表情、姿态、构图与原图一致，仅提升清晰度、修复瑕疵、还原色彩，不得重绘或改变任何内容布局";

const PHOTO_EDIT_INSTRUCTIONS = {
  "一键去路人": "一键去除背景中的无关路人和干扰物，自然补全被遮挡的背景，不动主体人物",
  "清晨阳光": "营造柔和明亮的清晨阳光，适度提亮暗部，保持自然肤色与真实光影",
  "日落余晖": "营造温暖自然的日落余晖与金色光线，保持原有明暗关系和真实肤色",
  "通透增强": "默认增强照片通透感，提升清晰度，去除雾感、噪点、划痕与褪色，还原自然真实的色彩",
  "人像精修": "自然精修人像，轻微改善肤色和皮肤瑕疵，保留年龄特征、皮肤纹理和个人辨识度",
  "背景虚化": "保持主体人物完整清晰，仅对背景增加自然、渐进的镜头虚化效果",
} as const;

export type PhotoEditPreset = keyof typeof PHOTO_EDIT_INSTRUCTIONS;

export const PHOTO_EDIT_PRESETS = Object.fromEntries(
  Object.entries(PHOTO_EDIT_INSTRUCTIONS).map(([name, instruction]) => [
    name,
    `${instruction}。${PHOTO_FIDELITY_CONSTRAINT}。`,
  ]),
) as Record<PhotoEditPreset, string>;

export const ART_STYLES = {
  "油画": {
    emoji: "🖼️",
    description: "厚重笔触，经典质感",
    prompt: "把照片转换为经典油画作品：使用厚重但细腻的笔触肌理与丰富色彩层次；人物五官、表情、姿态和原始构图必须准确一致，只改变绘画媒介表现。",
  },
  "水彩": {
    emoji: "🎨",
    description: "柔和通透，清新自然",
    prompt: "把照片转换为清新水彩作品：使用柔和色彩晕染、透明叠色和轻盈纸张质感；人物五官、表情、姿态和原始构图必须准确一致，只改变绘画媒介表现。",
  },
  "素描": {
    emoji: "✏️",
    description: "细腻线条，明暗分明",
    prompt: "把照片转换为细腻铅笔素描：使用清晰线条、排线与准确明暗塑造；人物五官、表情、姿态和原始构图必须准确一致，只改变绘画媒介表现。",
  },
  "水墨画": {
    emoji: "🖌️",
    description: "东方笔墨，诗意留白",
    prompt: "把照片转换为中国传统水墨画：使用自然墨色层次、写意笔触和克制留白；人物五官、表情、姿态和原始构图必须准确一致，只改变绘画媒介表现。",
  },
  "三维动画风": {
    emoji: "🧸",
    description: "立体柔润，明快温暖",
    prompt: "把照片转换为高品质三维动画风格：圆润立体造型、柔和材质、明快配色、电影级柔光与亲切表情；人物身份特征、五官、表情、姿态和原始构图必须准确一致。",
  },
  "日式动漫风": {
    emoji: "🌸",
    description: "细腻线稿，清透光影",
    prompt: "把照片转换为日式动漫风格：干净细腻的线稿、自然平涂层次、清透环境光与富有空气感的背景；人物身份特征、五官、表情、姿态和原始构图必须准确一致。",
  },
  "童话卡通风": {
    emoji: "🏰",
    description: "梦幻童趣，色彩柔美",
    prompt: "把照片转换为童话卡通风格：柔美梦幻配色、手绘质感、温暖光晕、富有童趣且精致的造型；人物身份特征、五官、表情、姿态和原始构图必须准确一致。",
  },
} as const;

export type ArtStyle = keyof typeof ART_STYLES;

export function getArtStyleOptions(): Array<{ name: ArtStyle; emoji: string; description: string }> {
  return (Object.entries(ART_STYLES) as Array<[ArtStyle, (typeof ART_STYLES)[ArtStyle]]>).map(
    ([name, { emoji, description }]) => ({ name, emoji, description }),
  );
}

export function buildRestorePrompt(customPrompt?: string, preset: PhotoEditPreset = "通透增强"): string {
  const instruction = PHOTO_EDIT_INSTRUCTIONS[preset] ?? PHOTO_EDIT_INSTRUCTIONS["通透增强"];
  const normalized = customPrompt?.trim();
  return `${instruction}${normalized ? `；同时按用户补充要求处理：${normalized}` : ""}。${PHOTO_FIDELITY_CONSTRAINT}。`;
}

export function getArtStylePrompt(style: ArtStyle): string {
  return ART_STYLES[style].prompt;
}
