type StoryReferenceSession<Result> = {
  localPath: string;
  upload: (localPath: string) => Promise<{ fileKey: string }>;
  run: (fileKey?: string) => Promise<Result>;
  release: (fileKey: string) => Promise<void>;
  onReferenceReady?: (fileKey: string) => void;
  onReferenceReleased?: () => void;
};

export async function runWithStoryReference<Result>(
  session: StoryReferenceSession<Result>,
): Promise<Result> {
  if (!session.localPath) return session.run(undefined);
  const uploaded = await session.upload(session.localPath);
  session.onReferenceReady?.(uploaded.fileKey);
  let taskError: unknown;
  try {
    return await session.run(uploaded.fileKey);
  } catch (error) {
    taskError = error;
    throw error;
  } finally {
    try {
      await session.release(uploaded.fileKey);
    } catch {
      if (!taskError) console.warn("[story.reference-photo] cleanup deferred");
    } finally {
      session.onReferenceReleased?.();
    }
  }
}
