import { createContext, useCallback, useMemo, useState, type PropsWithChildren } from "react";
import { View } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { readLargeTextPreference, writeLargeTextPreference, type PreferenceStorage } from "./accessibility-preference";

export type AccessibilityState = {
  largeText: boolean;
  setLargeText: (enabled: boolean) => void;
};

export const AccessibilityContext = createContext<AccessibilityState>({
  largeText: false,
  setLargeText: () => undefined,
});

export function AccessibilityProvider({ children }: PropsWithChildren) {
  const storage: PreferenceStorage = useMemo(() => ({
    get: (key) => Taro.getStorageSync(key),
    set: (key, value) => Taro.setStorageSync(key, value),
  }), []);
  const [largeText, setLargeTextState] = useState(() => readLargeTextPreference(storage));
  const setLargeText = useCallback((enabled: boolean) => {
    setLargeTextState(enabled);
    writeLargeTextPreference(enabled, storage);
  }, [storage]);
  const value = useMemo(() => ({ largeText, setLargeText }), [largeText]);
  return (
    <AccessibilityContext.Provider value={value}>
      <View className={`accessibility-root ${largeText ? "large-text-mode" : ""}`}>{children}</View>
    </AccessibilityContext.Provider>
  );
}
