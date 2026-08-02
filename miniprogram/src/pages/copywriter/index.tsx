import { useMemo, useRef, useState } from "react";
import { Text, Textarea, View } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { Button } from "@nutui/nutui-react-taro";
import { AigcBadge } from "../../components/AigcBadge";
import { ErrorState, useMpError } from "../../components/ErrorState";
import { PageHeader } from "../../components/PageHeader";
import { VoiceInput } from "../../components/VoiceInput";
import {
  advanceCopywriterFlow,
  initialCopywriterFlow,
  resetCopywriterFlow,
  setCopywriterContext,
  type CopywriterStep,
} from "../../features/copywriter/flow";
import { mpApi } from "../../services/api";
import { createOperationId } from "../../services/request-policy";
import "./index.scss";

const questions: Record<Exclude<CopywriterStep, "customContext">, { title: string; subtitle: string; options: string[] }> = {
  scenario: {
    title: "这段话用在什么场景？",
    subtitle: "第 1 步，共 4 步",
    options: ["节日祝福", "生日寿辰", "日常关怀", "安慰鼓励", "感谢致意", "发朋友圈"],
  },
  relationship: {
    title: "这段话想送给谁？",
    subtitle: "第 2 步，共 4 步",
    options: ["家人", "长辈", "朋友", "晚辈", "伴侣", "同事"],
  },
  tone: {
    title: "希望是什么语气？",
    subtitle: "第 3 步，共 4 步",
    options: ["温暖亲切", "庄重得体", "幽默轻松", "文采飞扬"],
  },
};

export default function CopywriterPage() {
  const [flow, setFlow] = useState(initialCopywriterFlow);
  const [wishes, setWishes] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const operationLockRef = useRef(false);
  const { errorState, showMpError, dismissError, retryError } = useMpError();
  const question = flow.step === "customContext" ? undefined : questions[flow.step];
  const selected = useMemo(() => flow[flow.step], [flow]);

  function selectOption(option: string) {
    setFlow((current) => advanceCopywriterFlow(current, option));
  }

  async function generate(
    operationId = createOperationId("copywriter"),
    requestData = {
      scenario: flow.scenario,
      relationship: flow.relationship,
      tone: flow.tone,
      customContext: flow.customContext.trim() || undefined,
    },
  ) {
    if (!flow.canGenerate || loading || operationLockRef.current) return;
    operationLockRef.current = true;
    setLoading(true);
    try {
      const result = await mpApi.generateCopywriter(requestData, operationId);
      setWishes(result.wishes);
    } catch (error) {
      showMpError(error, () => generate(operationId, requestData));
    } finally {
      operationLockRef.current = false;
      setLoading(false);
    }
  }

  async function copyWish(wish: string) {
    await Taro.setClipboardData({ data: wish });
    await Taro.showToast({ title: "复制成功", icon: "success" });
  }

  function startAgain() {
    setWishes([]);
    setFlow((current) => resetCopywriterFlow(current));
    dismissError();
  }

  return (
    <View className={`copywriter-page ${wishes.length ? "copywriter-page--result" : ""}`}>
      <PageHeader title="暖心文案" />
      {errorState ? <ErrorState error={errorState.error} onRetry={retryError} onDismiss={dismissError} /> : null}
      {wishes.length === 0 ? (
        <View className="guide-panel">
          {flow.step === "customContext" ? (
            <>
              <Text className="guide-panel__step">第 4 步，共 4 步（可跳过）</Text>
              <Text className="guide-panel__title">还有什么想特别说明？</Text>
              <Text className="guide-panel__hint">可以输入对方近况、称呼或想表达的心意</Text>
              <Textarea
                className="context-input"
                value={flow.customContext}
                maxlength={500}
                placeholder="例如：妈妈刚退休，最近开始学画画…"
                onInput={(event) => setFlow((current) => setCopywriterContext(current, event.detail.value))}
              />
              <VoiceInput
                onResult={(text) => setFlow((current) => setCopywriterContext(
                  current,
                  [current.customContext.trim(), text.trim()].filter(Boolean).join(" ").slice(0, 500),
                ))}
              />
            </>
          ) : question ? (
            <>
              <Text className="guide-panel__step">{question.subtitle}</Text>
              <Text className="guide-panel__title">{question.title}</Text>
              <View className="option-list">
                {question.options.map((option) => (
                  <View
                    key={option}
                    className={`option-card clickable ${selected === option ? "option-card--selected" : ""}`}
                    onClick={() => selectOption(option)}
                  >
                    <Text>{option}</Text>
                    <Text className="option-card__mark">{selected === option ? "✓" : "›"}</Text>
                  </View>
                ))}
              </View>
            </>
          ) : null}
          {flow.step === "customContext" ? (
            <View className="guide-panel__action">
              <Button block size="xlarge" type="primary" disabled={!flow.canGenerate} loading={loading} onClick={() => void generate()}>
                生成 3 条暖心文案
              </Button>
            </View>
          ) : null}
        </View>
      ) : (
        <View className="result-panel">
          <Text className="result-panel__title">为您生成了 3 条文案</Text>
          <Text className="result-panel__tip">选一条喜欢的，点击大按钮复制</Text>
          {wishes.map((wish, index) => (
            <View key={`${index}-${wish}`} className="wish-card">
              <Text className="wish-card__number">第 {index + 1} 条</Text>
              <Text className="wish-card__text">{wish}</Text>
              <Button block size="xlarge" type="primary" fill="outline" onClick={() => copyWish(wish)}>
                复制这条文案
              </Button>
            </View>
          ))}
          <View className="result-panel__again clickable" onClick={startAgain}>
            <Text>重新选择并生成</Text>
          </View>
        </View>
      )}
      {wishes.length > 0 ? <AigcBadge /> : null}
    </View>
  );
}
