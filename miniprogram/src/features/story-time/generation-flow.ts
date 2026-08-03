export type StoryGenerationResult = "completed" | "structure_failed" | "illustration_failed";

export async function runStoryStructureThenIllustrate<Story>(params: {
  loadStructure: () => Promise<Story>;
  onStructureReady: (story: Story) => void;
  illustrate: (story: Story) => Promise<void>;
  onStructureError: (error: unknown) => void;
  onIllustrationError: (error: unknown) => void;
}): Promise<StoryGenerationResult> {
  let story: Story;
  try {
    story = await params.loadStructure();
  } catch (error) {
    params.onStructureError(error);
    return "structure_failed";
  }

  params.onStructureReady(story);
  try {
    await params.illustrate(story);
    return "completed";
  } catch (error) {
    params.onIllustrationError(error);
    return "illustration_failed";
  }
}
