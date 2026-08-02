import { consumeCredits, refundCredits } from "./db";

export type CreditOperations = {
  consume: (userId: number, amount: number, feature: string, description: string) => Promise<number>;
  refund: (userId: number, amount: number, feature: string, description: string) => Promise<number>;
};

const defaultOperations: CreditOperations = {
  consume: consumeCredits,
  refund: refundCredits,
};

export async function withCreditCharge<T>(
  userId: number,
  cost: number,
  feature: string,
  fn: () => Promise<T>,
  description = feature,
  operations: CreditOperations = defaultOperations,
): Promise<{ value: T; credits: number }> {
  const credits = await operations.consume(userId, cost, feature, description);
  try {
    return { value: await fn(), credits };
  } catch (error) {
    await operations.refund(userId, cost, feature, `${description}生成失败退还`);
    throw error;
  }
}
