import { createContext, useMemo, useState, type PropsWithChildren } from "react";
import { View } from "@tarojs/components";

export type AccessibilityState = {
  largeText: boolean;
  setLargeText: (enabled: boolean) => void;
};

export const AccessibilityContext = createContext<AccessibilityState>({
  largeText: false,
  setLargeText: () => undefined,
});

export function AccessibilityProvider({ children }: PropsWithChildren) {
  const [largeText, setLargeText] = useState(false);
  const value = useMemo(() => ({ largeText, setLargeText }), [largeText]);
  return (
    <AccessibilityContext.Provider value={value}>
      <View className={largeText ? "large-text-mode" : ""}>{children}</View>
    </AccessibilityContext.Provider>
  );
}
