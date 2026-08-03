export type StoryImagePlan = {
  pageNumber: number;
  imagePrompt: string;
  operationId: string;
};

export type StoryImageFailure = {
  plan: StoryImagePlan;
  error: unknown;
};

type StoryImageQueueHandlers<Result> = {
  onStart?: (plan: StoryImagePlan, index: number, total: number) => void;
  onSuccess?: (plan: StoryImagePlan, result: Result) => void;
  onFailure?: (plan: StoryImagePlan, error: unknown) => void;
};

export async function runStoryImageQueue<Result>(
  plans: StoryImagePlan[],
  generate: (plan: StoryImagePlan) => Promise<Result>,
  handlers: StoryImageQueueHandlers<Result> = {},
): Promise<StoryImageFailure[]> {
  const failures: StoryImageFailure[] = [];
  for (let index = 0; index < plans.length; index += 1) {
    const plan = plans[index];
    handlers.onStart?.(plan, index, plans.length);
    try {
      const result = await generate(plan);
      handlers.onSuccess?.(plan, result);
    } catch (error) {
      failures.push({ plan, error });
      handlers.onFailure?.(plan, error);
    }
  }
  return failures;
}
