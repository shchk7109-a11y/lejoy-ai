import { CHAT_DISCLAIMER } from "./chat-persona";

export const CHAT_INPUT_RED_LINES = [
  "血压高",
  "高血压",
  "血糖高",
  "糖尿病",
  "胸痛",
  "胸口疼",
  "胸闷",
  "呼吸困难",
  "头晕",
  "头痛",
  "发烧",
  "发热",
  "咳嗽",
  "心慌",
  "腹痛",
  "呕吐",
  "便血",
  "尿血",
  "晕厥",
  "癌",
  "肿瘤",
  "中风",
  "脑梗",
  "心梗",
  "吃什么药",
  "用什么药",
  "怎么用药",
  "能不能停药",
  "药量",
  "剂量",
  "服药",
  "用药",
  "诊断",
  "确诊",
  "是不是得了",
  "化验单",
  "检查报告",
  "检验报告",
  "报告单",
  "指标异常",
  "血常规",
  "ct报告",
  "核磁",
  "b超",
  "处方",
  "治疗方案",
  "阿司匹林",
  "布洛芬",
  "二甲双胍",
  "胰岛素",
] as const;

const OUTPUT_DRUG_NAMES = [
  "阿司匹林",
  "布洛芬",
  "对乙酰氨基酚",
  "二甲双胍",
  "硝苯地平",
  "氨氯地平",
  "奥美拉唑",
  "头孢",
  "青霉素",
  "胰岛素",
] as const;

const OUTPUT_DOSAGE_PATTERNS = [
  /\d+(?:\.\d+)?\s*(?:mg|ml|毫克|毫升)\b/i,
  /(?:每日|每天)\s*[一二两三四五六七八九十\d]+\s*次/,
  /(?:服用|口服|吞服|冲服)[^，。！？\n]{0,30}/,
  /(?:饭前|饭后|睡前)\s*(?:服|吃|口服)/,
] as const;

function normalized(value: string): string {
  return value.toLowerCase().replace(/\s+/g, "");
}

export function blocksChatInput(input: string, extraKeywords: readonly string[] = []): boolean {
  const value = normalized(input);
  return [...CHAT_INPUT_RED_LINES, ...extraKeywords].some((keyword) => value.includes(normalized(keyword)));
}

export function blocksChatOutput(output: string): boolean {
  const value = normalized(output);
  return OUTPUT_DRUG_NAMES.some((name) => value.includes(normalized(name)))
    || OUTPUT_DOSAGE_PATTERNS.some((pattern) => pattern.test(output));
}

export function appendChatDisclaimer(output: string): string {
  const trimmed = output.trim();
  return trimmed.endsWith(CHAT_DISCLAIMER) ? trimmed : `${trimmed}\n\n${CHAT_DISCLAIMER}`;
}
