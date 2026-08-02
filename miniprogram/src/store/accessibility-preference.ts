export const LARGE_TEXT_STORAGE_KEY = "lejoy_large_text";

export type PreferenceStorage = {
  get: (key: string) => unknown;
  set: (key: string, value: boolean) => void;
};

export function readLargeTextPreference(storage: PreferenceStorage): boolean {
  return storage.get(LARGE_TEXT_STORAGE_KEY) === true;
}

export function writeLargeTextPreference(enabled: boolean, storage: PreferenceStorage): void {
  storage.set(LARGE_TEXT_STORAGE_KEY, enabled);
}
