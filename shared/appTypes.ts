// ─── Module Types ────────────────────────────────────────────
export type ModuleType = 'HOME' | 'SILVER_LENS' | 'COPYWRITER' | 'STORY_TIME' | 'LIFE_ASSISTANT' | 'AI_KALEIDOSCOPE';

// ─── Silver Lens ─────────────────────────────────────────────
export type LensMode = 'HOME' | 'EDIT' | 'CANVAS';
export type ArtStyle = 'OIL' | 'WATERCOLOR' | 'SKETCH' | 'INK' | 'IMPRESSIONISM';

export const ART_STYLE_LABELS: Record<ArtStyle, string> = {
  OIL: '油画',
  WATERCOLOR: '水彩',
  SKETCH: '素描',
  INK: '水墨画',
  IMPRESSIONISM: '印象派',
};

// ─── CopyWriter ──────────────────────────────────────────────
export type ScenarioType = 'BIRTHDAY' | 'FESTIVAL' | 'MOMENTS' | 'COMFORT' | null;
export type RelationType = 'FRIEND' | 'FAMILY' | 'ELDER' | 'JUNIOR' | 'PARTNER';
export type ToneType = 'WARM' | 'HUMOROUS' | 'LITERARY' | 'FORMAL' | 'POETRY' | 'PROSE' | 'SENTIMENT';

export const SCENARIO_LABELS: Record<string, string> = {
  BIRTHDAY: '生日祝福', FESTIVAL: '节日问候', MOMENTS: '朋友圈', COMFORT: '安慰鼓励',
};
export const RELATION_LABELS: Record<RelationType, string> = {
  FRIEND: '朋友', FAMILY: '家人', ELDER: '长辈', JUNIOR: '晚辈', PARTNER: '伴侣',
};
export const TONE_LABELS: Record<ToneType, string> = {
  WARM: '温馨', HUMOROUS: '幽默', LITERARY: '文艺', FORMAL: '正式', POETRY: '诗词', PROSE: '散文', SENTIMENT: '感性',
};

// ─── Story Time ──────────────────────────────────────────────
export type VoiceType = 'grandma' | 'grandpa' | 'sweet' | 'warm' | 'lively' | 'uncle' | 'calm';

export const VOICE_OPTIONS: Array<{ id: VoiceType; label: string; voiceId: string }> = [
  { id: 'grandma', label: '慈祥奶奶', voiceId: 'female-chengshu' },
  { id: 'grandpa', label: '慈祥爷爷', voiceId: 'male-qn-jingying' },
  { id: 'sweet', label: '甜美姐姐', voiceId: 'female-tianmei' },
  { id: 'warm', label: '温柔妈妈', voiceId: 'female-shaonv' },
  { id: 'lively', label: '活泼叔叔', voiceId: 'male-qn-qingse' },
  { id: 'uncle', label: '沉稳大叔', voiceId: 'male-qn-daxuesheng' },
  { id: 'calm', label: '平静阿姨', voiceId: 'female-tianmei' },
];

export type StoryTheme = 'adventure' | 'fairy' | 'science' | 'animal' | 'growth' | 'fantasy';

export const STORY_THEMES: Array<{ id: StoryTheme; label: string; icon: string }> = [
  { id: 'adventure', label: '冒险探索', icon: '🏔️' },
  { id: 'fairy', label: '童话世界', icon: '🏰' },
  { id: 'science', label: '科学发现', icon: '🔬' },
  { id: 'animal', label: '动物王国', icon: '🦁' },
  { id: 'growth', label: '成长故事', icon: '🌱' },
  { id: 'fantasy', label: '奇幻魔法', icon: '✨' },
];

export interface StoryPage {
  pageNumber: number;
  text: string;
  imagePrompt: string;
  imageUrl?: string;
  audioUrl?: string;
}

// ─── Life Assistant ──────────────────────────────────────────
export type LifeMode = 'FOOD' | 'PLANT' | 'HEALTH';

export const LIFE_MODE_LABELS: Record<LifeMode, { label: string; icon: string; desc: string }> = {
  FOOD: { label: '查菜谱', icon: '🍳', desc: '识别菜品或搜索菜谱' },
  PLANT: { label: '识花草', icon: '🌸', desc: '拍照识别花草植物' },
  HEALTH: { label: '健康百科', icon: '💊', desc: '食品营养与健康分析' },
};

// ─── Story Creativity Library (20+ per theme) ────────────────
export const STORY_IDEAS: Record<StoryTheme, string[]> = {
  adventure: [
    '小勇士寻找失落的彩虹桥', '海底探险记', '穿越沙漠的骆驼队', '神秘岛屿的宝藏',
    '勇闯恐龙谷', '太空冒险家', '丛林迷宫大冒险', '寻找北极星',
    '飞天扫帚环游世界', '地心历险记', '勇敢的小航海家', '攀登云端之巅',
    '穿越时空的冒险', '寻找传说中的凤凰', '勇闯火山岛', '深海潜水艇奇遇',
    '沙漠绿洲的秘密', '极地探险小分队', '寻找失落的古城', '勇敢者的森林之旅',
  ],
  fairy: [
    '月亮上的兔子裁缝', '花仙子的秘密花园', '会说话的星星', '糖果王国历险记',
    '小精灵的魔法课', '云朵上的城堡', '彩虹尽头的秘密', '梦境编织师',
    '水晶鞋的故事', '魔法森林的守护者', '小美人鱼的新朋友', '仙女的生日派对',
    '魔法画笔的奇遇', '精灵王国的音乐会', '会飞的南瓜马车', '童话镇的新居民',
    '魔法药水的配方', '仙境中的茶会', '会唱歌的玫瑰花', '精灵与独角兽',
  ],
  science: [
    '小小发明家', '恐龙蛋的秘密', '太阳系旅行记', '微观世界大冒险',
    '时间机器的故事', '机器人朋友', '植物的超能力', '天气预报员小云朵',
    '海洋深处的发光生物', '火箭工程师的梦想', 'DNA密码大揭秘', '电的奇妙旅程',
    '小小天文学家', '化石猎人的发现', '未来城市设计师', '声音的魔法',
    '水循环的冒险', '小小地质学家', '光的七彩世界', '种子的旅行日记',
  ],
  animal: [
    '小熊猫的竹林生活', '企鹅家族的南极之旅', '蜜蜂女王的一天', '小海龟回家记',
    '森林音乐会', '小狐狸学本领', '大象学校开学了', '猫头鹰的夜间巡逻',
    '小兔子的胡萝卜农场', '海豚湾的故事', '蚂蚁王国建城记', '小鸟学飞翔',
    '考拉的树上生活', '小松鼠存粮记', '萤火虫的灯笼', '小青蛙的池塘',
    '蝴蝶的变身记', '小刺猬交朋友', '猴子学校的运动会', '小鱼儿的珊瑚家',
  ],
  growth: [
    '第一次自己系鞋带', '学会分享的小明', '勇敢说对不起', '新同学来了',
    '我不再害怕黑暗', '第一次做饭', '学会骑自行车', '帮助邻居奶奶',
    '我的第一个好朋友', '学会整理房间', '克服舞台恐惧', '第一次独自购物',
    '学会游泳的夏天', '我的小花园', '第一次坐飞机', '学会说谢谢',
    '我长大了一岁', '第一次参加比赛', '学会照顾小动物', '我的梦想日记',
  ],
  fantasy: [
    '魔法学院入学记', '龙骑士的冒险', '会变身的魔法帽', '时间停止的一天',
    '隐形斗篷的秘密', '魔法棒的选择', '飞毯环游记', '精灵语言课',
    '魔法图书馆', '变小药水的麻烦', '会说话的影子', '梦境守护者',
    '魔法厨房的美食', '星际魔法师', '魔法动物园', '时间沙漏的秘密',
    '魔法音乐盒', '隐形城堡的主人', '会许愿的流星', '魔法世界的运动会',
  ],
};
