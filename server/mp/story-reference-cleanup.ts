import { storageDelete, storageList, type StoredObjectSummary } from "../storage";

const ONE_HOUR_MS = 60 * 60 * 1000;
const CLEANUP_INTERVAL_MS = 15 * 60 * 1000;

type CleanupDependencies = {
  now: Date;
  list: (prefix: string) => Promise<StoredObjectSummary[]>;
  remove: (key: string) => Promise<void>;
};

export async function deleteExpiredStoryReferences(deps: CleanupDependencies): Promise<{
  scanned: number;
  deleted: number;
  failed: number;
}> {
  const objects = await deps.list("story-refs/");
  const expired = objects.filter((item) => (
    deps.now.getTime() - item.lastModified.getTime() >= ONE_HOUR_MS
  ));
  let deleted = 0;
  let failed = 0;
  for (const item of expired) {
    try {
      await deps.remove(item.key);
      deleted += 1;
    } catch {
      failed += 1;
    }
  }
  return { scanned: objects.length, deleted, failed };
}

async function runScheduledCleanup(): Promise<void> {
  try {
    const result = await deleteExpiredStoryReferences({
      now: new Date(),
      list: storageList,
      remove: storageDelete,
    });
    console.info("[story.reference-image.cleanup]", result);
  } catch {
    console.warn("[story.reference-image.cleanup] unavailable");
  }
}

export function startStoryReferenceCleanup(): NodeJS.Timeout {
  void runScheduledCleanup();
  const timer = setInterval(() => void runScheduledCleanup(), CLEANUP_INTERVAL_MS);
  timer.unref();
  return timer;
}
