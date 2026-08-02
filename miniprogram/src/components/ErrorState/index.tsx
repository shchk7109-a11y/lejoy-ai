import { useRef, useState } from "react";
import { Text, View } from "@tarojs/components";
import { Button } from "@nutui/nutui-react-taro";
import { normalizeApiError, type MpApiError } from "../../services/request-policy";
import "./index.scss";

type RetryAction = () => void | Promise<void>;
type MpErrorState = { error: MpApiError; retry: RetryAction };

export function useMpError() {
  const [errorState, setErrorState] = useState<MpErrorState>();
  const retryingRef = useRef(false);

  function showMpError(error: unknown, retry: RetryAction) {
    setErrorState({ error: normalizeApiError(error), retry });
  }

  function dismissError() {
    setErrorState(undefined);
  }

  function retryError() {
    if (retryingRef.current) return;
    const retry = errorState?.retry;
    if (!retry) return;
    retryingRef.current = true;
    setErrorState(undefined);
    void Promise.resolve(retry()).finally(() => {
      retryingRef.current = false;
    });
  }

  return { errorState, showMpError, dismissError, retryError };
}

export function ErrorState({
  error,
  onRetry,
  onDismiss,
}: {
  error: MpApiError;
  onRetry: () => void;
  onDismiss: () => void;
}) {
  return (
    <View className={`error-state error-state--${error.kind}`}>
      <Text className="error-state__icon">{error.kind === "insufficient_credits" ? "🪙" : "⚠️"}</Text>
      <Text className="error-state__title">{error.title}</Text>
      <Text className="error-state__message">{error.message}</Text>
      {error.helpText ? <Text className="error-state__help">{error.helpText}</Text> : null}
      <Button block size="xlarge" type="primary" onClick={onRetry}>手动重试</Button>
      <View className="error-state__dismiss clickable" onClick={onDismiss}><Text>先返回当前页面</Text></View>
    </View>
  );
}
