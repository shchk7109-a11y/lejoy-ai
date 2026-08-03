import { AsyncLocalStorage } from "node:async_hooks";

export type AiRequestMetadata = {
  provider: string | null;
  model: string | null;
};

const requestMetadataStorage = new AsyncLocalStorage<AiRequestMetadata>();

export function createAiRequestMetadata(): AiRequestMetadata {
  return { provider: null, model: null };
}

export function runWithAiRequestMetadata<T>(metadata: AiRequestMetadata, callback: () => T): T {
  return requestMetadataStorage.run(metadata, callback);
}

export function recordAiRequestMetadata(provider: string, model: string): void {
  const metadata = requestMetadataStorage.getStore();
  if (!metadata) return;
  metadata.provider = provider;
  metadata.model = model;
}
