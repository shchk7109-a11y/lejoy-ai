import { useEffect, useRef, useState } from "react";
import { Text, View } from "@tarojs/components";
import Taro, { useDidHide, useDidShow } from "@tarojs/taro";
import { formatGenerationProgress } from "./state";
import "./index.scss";

type GenerationProgressProps = {
  active: boolean;
  label: string;
  estimate?: string;
};

export function GenerationProgress({
  active,
  label,
  estimate = "约需半分钟",
}: GenerationProgressProps) {
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const activeRef = useRef(active);
  activeRef.current = active;

  useDidHide(() => {
    if (activeRef.current) {
      void Taro.setKeepScreenOn({ keepScreenOn: false }).catch(() => undefined);
    }
  });

  useDidShow(() => {
    if (activeRef.current) {
      void Taro.setKeepScreenOn({ keepScreenOn: true }).catch(() => undefined);
    }
  });

  useEffect(() => {
    if (!active) {
      setElapsedSeconds(0);
      return undefined;
    }

    setElapsedSeconds(0);
    void Taro.setKeepScreenOn({ keepScreenOn: true }).catch(() => undefined);
    const timer = setInterval(() => setElapsedSeconds((current) => current + 1), 1000);

    return () => {
      clearInterval(timer);
      void Taro.setKeepScreenOn({ keepScreenOn: false }).catch(() => undefined);
    };
  }, [active]);

  if (!active) return null;

  return (
    <View className="generation-progress" role="status" aria-live="polite">
      <View className="generation-progress__spinner" />
      <Text className="generation-progress__title">
        {formatGenerationProgress(label, elapsedSeconds, estimate)}
      </Text>
      <Text className="generation-progress__tip">请不要退出或重复点击</Text>
    </View>
  );
}
