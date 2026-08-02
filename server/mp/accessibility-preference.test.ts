import { describe, expect, it } from "vitest";
import {
  LARGE_TEXT_STORAGE_KEY,
  readLargeTextPreference,
  writeLargeTextPreference,
  type PreferenceStorage,
} from "../../miniprogram/src/store/accessibility-preference";

describe("大字模式偏好", () => {
  it("写入并在重新读取时保持开启状态", () => {
    const values = new Map<string, unknown>();
    const storage: PreferenceStorage = {
      get: (key) => values.get(key),
      set: (key, value) => { values.set(key, value); },
    };

    writeLargeTextPreference(true, storage);

    expect(values.get(LARGE_TEXT_STORAGE_KEY)).toBe(true);
    expect(readLargeTextPreference(storage)).toBe(true);
  });
});
