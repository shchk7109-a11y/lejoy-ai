import { z } from "zod";
import { aiChat } from "./ai/gateway";
import { cleanJson } from "./geminiService";

export const copywriterInputSchema = z.object({
  scenario: z.string().trim().min(1).max(40),
  relationship: z.string().trim().min(1).max(40),
  recipientName: z.string().trim().max(40).optional(),
  tone: z.string().trim().min(1).max(40),
  specificHoliday: z.string().trim().max(40).optional(),
  customContext: z.string().trim().max(500).optional(),
});

export type CopywriterInput = z.infer<typeof copywriterInputSchema>;

export function buildCopywriterPrompts(input: CopywriterInput) {
  return {
    systemPrompt: "你是情感细腻的中文文案专家，只返回JSON格式内容。",
    userPrompt: `请作为情感细腻的中文文案专家，生成3条不同的祝福语。场景:${input.scenario} 对象:${input.relationship} 收信人:${input.recipientName ?? "对方"} 风格:${input.tone} 节日:${input.specificHoliday ?? "无"} 补充:${input.customContext ?? "无"}。要求：中文，温暖亲切，适合中老年人，每条100字以内。返回JSON对象，格式：{"wishes":["祝福语1","祝福语2","祝福语3"]}，不要任何多余文字。`,
  };
}

export function parseCopywriterWishes(text: string): string[] {
  const parsed = JSON.parse(cleanJson(text));
  const wishes = Array.isArray(parsed) ? parsed : parsed?.wishes;
  if (!Array.isArray(wishes)) throw new Error("AI 未返回有效文案列表");
  const normalized = wishes
    .filter((wish): wish is string => typeof wish === "string")
    .map((wish) => wish.trim())
    .filter(Boolean)
    .slice(0, 3);
  if (normalized.length !== 3) throw new Error("AI 未返回三条有效文案");
  return normalized;
}

export async function generateCopywriterWishes(input: CopywriterInput): Promise<string[]> {
  const prompts = buildCopywriterPrompts(input);
  const text = await aiChat({ ...prompts, json: true });
  return parseCopywriterWishes(text);
}
