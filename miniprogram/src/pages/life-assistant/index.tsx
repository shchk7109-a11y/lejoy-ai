import { useRef, useState } from "react";
import { Image, Text, Textarea, View } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { Button } from "@nutui/nutui-react-taro";
import { AigcBadge } from "../../components/AigcBadge";
import { ErrorState, useMpError } from "../../components/ErrorState";
import { GenerationProgress } from "../../components/GenerationProgress";
import { PageHeader } from "../../components/PageHeader";
import { VoiceInput } from "../../components/VoiceInput";
import { mpApi, type LifeResult } from "../../services/api";
import { ensurePrivacyAuthorized } from "../../services/privacy";
import { createOperationId } from "../../services/request-policy";
import "./index.scss";

type Mode = "recipe" | "plant" | "health";

const ENTRIES: Array<{ id: Mode; name: string; emoji: string; tip: string }> = [
  { id: "recipe", name: "查菜谱", emoji: "🍲", tip: "看看一道菜的营养与搭配" },
  { id: "plant", name: "识花草", emoji: "🌸", tip: "拍张照片认识身边植物" },
  { id: "health", name: "健康百科", emoji: "📚", tip: "了解日常饮食与保健常识" },
];

export default function LifeAssistantPage() {
  const [mode, setMode] = useState<Mode>();
  const [text, setText] = useState("");
  const [previewPath, setPreviewPath] = useState("");
  const [result, setResult] = useState<LifeResult>();
  const [busyMessage, setBusyMessage] = useState("");
  const operationLockRef = useRef(false);
  const { errorState, showMpError, dismissError, retryError } = useMpError();

  async function submitText(
    operationId = createOperationId("life-text"),
    requestedText = text.trim(),
    requestedMode = mode,
  ) {
    if (!requestedMode || !requestedText || busyMessage || operationLockRef.current) return;
    operationLockRef.current = true;
    setBusyMessage(requestedMode === "recipe" ? "正在整理菜谱和营养信息…" : "正在查询生活健康百科…");
    try {
      const data = requestedMode === "recipe"
        ? await mpApi.getRecipe(requestedText, operationId)
        : await mpApi.queryHealth({ textHint: requestedText }, operationId);
      setResult(data);
    } catch (error) {
      showMpError(error, () => submitText(operationId, requestedText, requestedMode));
    } finally {
      operationLockRef.current = false;
      setBusyMessage("");
    }
  }

  async function chooseAndAnalyze(sourceType: "camera" | "album", operationId = createOperationId("life-image")) {
    if (!mode || busyMessage || operationLockRef.current) return;
    const selectedMode = mode;
    operationLockRef.current = true;
    try {
      await ensurePrivacyAuthorized();
      const media = await Taro.chooseMedia({ count: 1, mediaType: ["image"], sourceType: [sourceType], sizeType: ["compressed", "original"] });
      const file = media.tempFiles[0];
      if (!file) return;
      if (file.size > 10 * 1024 * 1024) throw new Error("图片不能超过 10MB");
      setPreviewPath(file.tempFilePath);
      setBusyMessage("正在准备图片并识别…");
      const uploaded = await mpApi.uploadImage({ base64: await readBase64(file.tempFilePath), mimeType: imageMime(file.tempFilePath) });
      await analyzeUploaded(uploaded.fileKey, selectedMode, operationId);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!message.includes("cancel")) showMpError(error, () => chooseAndAnalyze(sourceType, operationId));
    } finally {
      operationLockRef.current = false;
      setBusyMessage("");
    }
  }

  async function analyzeUploaded(fileKey: string, selectedMode: Mode, operationId: string): Promise<void> {
    try {
      const data = selectedMode === "plant"
        ? await mpApi.identifyPlant(fileKey, operationId)
        : await mpApi.queryHealth({ sourceFileKey: fileKey }, operationId);
      setResult(data);
    } catch (error) {
      showMpError(error, () => retryUploadedAnalysis(fileKey, selectedMode, operationId));
    }
  }

  async function retryUploadedAnalysis(fileKey: string, selectedMode: Mode, operationId: string): Promise<void> {
    if (operationLockRef.current) return;
    operationLockRef.current = true;
    setBusyMessage("正在重新查询刚才的图片…");
    try {
      await analyzeUploaded(fileKey, selectedMode, operationId);
    } finally {
      operationLockRef.current = false;
      setBusyMessage("");
    }
  }

  function restart() {
    setMode(undefined);
    setText("");
    setPreviewPath("");
    setResult(undefined);
    dismissError();
  }

  return (
    <View className="life-page">
      <PageHeader title="生活助手" />
      {errorState ? <ErrorState error={errorState.error} onRetry={retryError} onDismiss={dismissError} /> : null}
      <View className="life-content">
        {!mode ? (
          <View>
            <Text className="life-title">今天想让我帮什么忙？</Text>
            <Text className="life-subtitle">一次选一件事，简单又清楚</Text>
            <View className="life-entry-list">
              {ENTRIES.map((entry) => (
                <View key={entry.id} className="life-entry clickable" onClick={() => setMode(entry.id)}>
                  <Text className="life-entry__emoji">{entry.emoji}</Text>
                  <View><Text className="life-entry__name">{entry.name}</Text><Text className="life-entry__tip">{entry.tip}</Text></View>
                </View>
              ))}
            </View>
          </View>
        ) : null}

        {mode && !result ? (
          <View>
            <Text className="life-step">{ENTRIES.find((entry) => entry.id === mode)?.name}</Text>
            <Text className="life-title">
              {mode === "recipe" ? "想查哪道菜？" : mode === "plant" ? "拍一张花草照片" : "想了解什么生活健康常识？"}
            </Text>
            {mode !== "plant" ? (
              <>
                <Textarea
                  className="life-input"
                  value={text}
                  maxlength={300}
                  placeholder={mode === "recipe" ? "例如：番茄炒蛋" : "例如：晚饭怎样搭配更清淡"}
                  onInput={(event) => setText(event.detail.value)}
                />
                <VoiceInput onResult={(voiceText) => setText(voiceText.slice(0, 300))} />
                <Button block size="xlarge" type="primary" disabled={!text.trim()} loading={Boolean(busyMessage)} onClick={() => void submitText()}>
                  {mode === "recipe" ? "生成菜谱营养卡" : "查询百科"}
                </Button>
              </>
            ) : null}
            {mode === "plant" || mode === "health" ? (
              <View className="life-photo-actions">
                <Button block size="xlarge" type="primary" onClick={() => chooseAndAnalyze("camera")}>📷 拍照识别</Button>
                <Button block size="xlarge" fill="outline" type="primary" onClick={() => chooseAndAnalyze("album")}>🖼️ 从相册选择</Button>
              </View>
            ) : null}
            <View className="life-back clickable" onClick={restart}><Text>返回重新选择</Text></View>
          </View>
        ) : null}

        {result ? (
          <View className="life-result">
            <Text className="life-result__title">{result.title}</Text>
            {result.imageUrl ? <Image className="life-result__image" src={result.imageUrl} mode="aspectFill" /> : previewPath ? <Image className="life-result__image" src={previewPath} mode="aspectFill" /> : null}
            <Text className="life-result__description">{result.description}</Text>
            <View className="life-tags">{result.tags.map((tag) => <Text key={tag} className="life-tag">{tag}</Text>)}</View>
            {result.healthyScore !== undefined ? <Text className="life-score">参考指数：{result.healthyScore} 分</Text> : null}
            {result.nutrition ? (
              <View className="life-section"><Text className="life-section__title">营养信息</Text>{Object.entries(result.nutrition).map(([key, value]) => <Text key={key} className="life-point">• {key}：{value}</Text>)}</View>
            ) : null}
            <View className="life-section"><Text className="life-section__title">要点</Text>{result.details.map((detail) => <Text key={detail} className="life-point">• {detail}</Text>)}</View>
            {result.advice ? <View className="life-section life-section--advice"><Text className="life-section__title">日常建议</Text><Text className="life-point">{result.advice}</Text></View> : null}
            <Button block size="xlarge" type="primary" onClick={restart}>继续使用生活助手</Button>
            <AigcBadge />
          </View>
        ) : null}
      </View>
      <GenerationProgress
        active={Boolean(busyMessage)}
        label={busyMessage || "正在查询生活助手"}
        estimate={busyMessage.includes("准备图片") ? "约需十几秒" : "约需半分钟"}
      />
    </View>
  );
}

function readBase64(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => Taro.getFileSystemManager().readFile({
    filePath,
    encoding: "base64",
    success: (value) => resolve(String(value.data)),
    fail: reject,
  }));
}

function imageMime(filePath: string): "image/jpeg" | "image/png" | "image/webp" {
  const extension = filePath.split("?")[0].split(".").pop()?.toLowerCase();
  return extension === "png" ? "image/png" : extension === "webp" ? "image/webp" : "image/jpeg";
}
