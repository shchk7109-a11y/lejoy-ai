import { useRef, useState } from "react";
import { Image, Text, Textarea, View } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { Button } from "@nutui/nutui-react-taro";
import { AigcBadge } from "../../components/AigcBadge";
import { ErrorState, useMpError } from "../../components/ErrorState";
import { GenerationProgress } from "../../components/GenerationProgress";
import { PageHeader } from "../../components/PageHeader";
import { VoiceInput } from "../../components/VoiceInput";
import {
  mpApi,
  type DishAnalyzeResult,
  type DishAnalyzeSuccess,
  type DishIngredients,
  type PlantDetails,
  type PlantIdentifyResult,
} from "../../services/api";
import { ensurePrivacyAuthorized } from "../../services/privacy";
import { createOperationId } from "../../services/request-policy";
import { compressPlantImage } from "./image-compression";
import "./index.scss";

type Mode = "dish" | "plant";

const ENTRIES: Array<{ id: Mode; name: string; emoji: string; tip: string }> = [
  { id: "dish", name: "菜品健康分析", emoji: "📊", tip: "输入菜名、粘贴分享内容，或拍一道菜" },
  { id: "plant", name: "识花草", emoji: "🌿", tip: "拍张照片认识身边植物" },
];

const NUTRIENTS: Array<{
  key: keyof DishAnalyzeSuccess["nutrition"];
  label: string;
  emoji: string;
}> = [
  { key: "calories", label: "热量", emoji: "🔥" },
  { key: "protein", label: "蛋白质", emoji: "🥚" },
  { key: "fat", label: "脂肪", emoji: "🥑" },
  { key: "carbs", label: "碳水", emoji: "🍞" },
  { key: "sodium", label: "钠", emoji: "🧂" },
  { key: "sugar", label: "糖", emoji: "🍬" },
];

const INGREDIENT_GROUPS: Array<{ key: keyof DishIngredients; label: string; emoji: string }> = [
  { key: "primary", label: "原材料", emoji: "🥬" },
  { key: "secondary", label: "配料", emoji: "🥣" },
  { key: "seasonings", label: "调味料", emoji: "🧂" },
];

export default function LifeAssistantPage() {
  const [mode, setMode] = useState<Mode>();
  const [dishText, setDishText] = useState("");
  const [dishNotice, setDishNotice] = useState("");
  const [dishInputFocused, setDishInputFocused] = useState(false);
  const [previewPath, setPreviewPath] = useState("");
  const [dishResult, setDishResult] = useState<DishAnalyzeSuccess>();
  const [plantResult, setPlantResult] = useState<PlantIdentifyResult>();
  const [plantDetails, setPlantDetails] = useState<PlantDetails>();
  const [plantDetailsBusy, setPlantDetailsBusy] = useState(false);
  const [busyMessage, setBusyMessage] = useState("");
  const operationLockRef = useRef(false);
  const { errorState, showMpError, dismissError, retryError } = useMpError();

  function focusDishInput(message: string) {
    setDishNotice(message);
    setDishResult(undefined);
    setDishInputFocused(false);
    setTimeout(() => setDishInputFocused(true), 0);
  }

  function acceptDishResult(data: DishAnalyzeResult) {
    if (data.code === "DISH_NOT_FOUND") {
      focusDishInput(data.message);
      return;
    }
    setDishNotice("");
    setDishResult(data);
  }

  async function submitDish(
    operationId = createOperationId("life-dish-text"),
    requestedText = dishText.trim(),
  ) {
    if (busyMessage || operationLockRef.current) return;
    if (!requestedText) {
      focusDishInput("请先输入菜名、粘贴分享内容，或者用语音说菜名");
      return;
    }
    operationLockRef.current = true;
    dismissError();
    setBusyMessage("正在识别菜品并分析营养…");
    try {
      acceptDishResult(await mpApi.analyzeDish({ dishText: requestedText }, operationId));
    } catch (error) {
      showMpError(error, () => submitDish(operationId, requestedText));
    } finally {
      operationLockRef.current = false;
      setBusyMessage("");
    }
  }

  async function chooseAndAnalyze(sourceType: "camera" | "album", operationId = createOperationId("life-image")) {
    if (!mode || busyMessage || operationLockRef.current) return;
    const selectedMode = mode;
    operationLockRef.current = true;
    dismissError();
    try {
      await ensurePrivacyAuthorized();
      const media = await Taro.chooseMedia({
        count: 1,
        mediaType: ["image"],
        sourceType: [sourceType],
        sizeType: selectedMode === "plant" ? ["compressed"] : ["compressed", "original"],
      });
      const file = media.tempFiles[0];
      if (!file) return;
      if (selectedMode === "dish" && file.size > 10 * 1024 * 1024) throw new Error("图片不能超过 10MB");
      setBusyMessage(selectedMode === "dish" ? "正在识别菜品并分析营养…" : "正在辨认");
      const preparedPath = selectedMode === "plant"
        ? await compressPlantImage(file.tempFilePath, Taro)
        : file.tempFilePath;
      const base64 = await readBase64(preparedPath);
      if (base64ByteLength(base64) > 10 * 1024 * 1024) throw new Error("图片不能超过 10MB");
      setPreviewPath(preparedPath);
      const uploaded = await mpApi.uploadImage({
        base64,
        mimeType: imageMime(preparedPath),
      });
      try {
        await analyzeUploaded(uploaded.fileKey, selectedMode, operationId);
      } catch (error) {
        showMpError(error, () => retryUploadedAnalysis(uploaded.fileKey, selectedMode, operationId));
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!message.includes("cancel")) showMpError(error, () => chooseAndAnalyze(sourceType, operationId));
    } finally {
      operationLockRef.current = false;
      setBusyMessage("");
    }
  }

  async function analyzeUploaded(fileKey: string, selectedMode: Mode, operationId: string): Promise<void> {
    if (selectedMode === "plant") {
      setPlantResult(await mpApi.identifyPlant(fileKey, operationId));
      setPlantDetails(undefined);
      return;
    }
    acceptDishResult(await mpApi.analyzeDish({ fileKey }, operationId));
  }

  async function retryUploadedAnalysis(fileKey: string, selectedMode: Mode, operationId: string): Promise<void> {
    if (operationLockRef.current) return;
    operationLockRef.current = true;
    dismissError();
    setBusyMessage(selectedMode === "dish" ? "正在重新分析刚才的菜品…" : "正在辨认");
    try {
      await analyzeUploaded(fileKey, selectedMode, operationId);
    } catch (error) {
      showMpError(error, () => retryUploadedAnalysis(fileKey, selectedMode, operationId));
    } finally {
      operationLockRef.current = false;
      setBusyMessage("");
    }
  }

  async function loadPlantDetails(operationId = createOperationId("life-plant-details")) {
    if (!plantResult || plantDetailsBusy || operationLockRef.current) return;
    operationLockRef.current = true;
    setPlantDetailsBusy(true);
    dismissError();
    try {
      setPlantDetails(await mpApi.getPlantDetails(plantResult.name, operationId));
    } catch (error) {
      showMpError(error, () => loadPlantDetails(operationId));
    } finally {
      operationLockRef.current = false;
      setPlantDetailsBusy(false);
    }
  }

  function chooseMode(selectedMode: Mode) {
    setMode(selectedMode);
    setDishNotice("");
    setPreviewPath("");
    setPlantDetails(undefined);
    dismissError();
    if (selectedMode === "dish") setTimeout(() => setDishInputFocused(true), 0);
  }

  function restart() {
    setMode(undefined);
    setDishText("");
    setDishNotice("");
    setDishInputFocused(false);
    setPreviewPath("");
    setDishResult(undefined);
    setPlantResult(undefined);
    setPlantDetails(undefined);
    setPlantDetailsBusy(false);
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
                <View key={entry.id} className="life-entry clickable" onClick={() => chooseMode(entry.id)}>
                  <Text className="life-entry__emoji">{entry.emoji}</Text>
                  <View>
                    <Text className="life-entry__name">{entry.name}</Text>
                    <Text className="life-entry__tip">{entry.tip}</Text>
                  </View>
                </View>
              ))}
            </View>
          </View>
        ) : null}

        {mode === "dish" && !dishResult ? (
          <View>
            <Text className="life-step">菜品健康分析</Text>
            <Text className="life-title">这道菜吃得健康吗？</Text>
            <Text className="life-subtitle">输入菜名，或粘贴抖音分享内容，也可以直接说出来</Text>
            {dishNotice ? <View className="life-notice"><Text>💡 {dishNotice}</Text></View> : null}
            {previewPath ? <Image className="life-photo-preview" src={previewPath} mode="aspectFit" /> : null}
            <Textarea
              className="life-input"
              value={dishText}
              maxlength={1000}
              focus={dishInputFocused}
              placeholder="例如：糖醋排骨，或粘贴抖音分享内容…"
              onFocus={() => setDishInputFocused(true)}
              onBlur={() => setDishInputFocused(false)}
              onInput={(event) => {
                setDishText(event.detail.value);
                if (dishNotice) setDishNotice("");
              }}
            />
            <VoiceInput onResult={(voiceText) => {
              setDishText(voiceText.slice(0, 1000));
              setDishNotice("");
            }} />
            <Button
              className="life-primary-button"
              block
              size="xlarge"
              type="primary"
              loading={Boolean(busyMessage)}
              onClick={() => void submitDish()}
            >
              分析这道菜（1积分）
            </Button>
            <View className="life-or"><Text>也可以拍照分析</Text></View>
            <View className="life-photo-actions life-photo-actions--row">
              <Button block size="xlarge" fill="outline" type="primary" onClick={() => void chooseAndAnalyze("camera")}>📷 拍一道菜</Button>
              <Button block size="xlarge" fill="outline" type="primary" onClick={() => void chooseAndAnalyze("album")}>🖼️ 从相册选择</Button>
            </View>
            <View className="life-back clickable" onClick={restart}><Text>返回重新选择</Text></View>
          </View>
        ) : null}

        {mode === "plant" && !plantResult ? (
          <View>
            <Text className="life-step">识花草</Text>
            <Text className="life-title">拍一张花草照片</Text>
            {previewPath ? <Image className="life-photo-preview" src={previewPath} mode="aspectFit" /> : null}
            <View className="life-photo-actions">
              <Button className="life-primary-button" block size="xlarge" type="primary" onClick={() => void chooseAndAnalyze("camera")}>📷 拍花草</Button>
              <Button block size="xlarge" fill="outline" type="primary" onClick={() => void chooseAndAnalyze("album")}>🖼️ 从相册选择</Button>
            </View>
            <View className="life-back clickable" onClick={restart}><Text>返回重新选择</Text></View>
          </View>
        ) : null}

        {dishResult ? <DishResultCard result={dishResult} previewPath={previewPath} onRestart={restart} /> : null}
        {plantResult ? (
          <PlantResultCard
            result={plantResult}
            details={plantDetails}
            detailsBusy={plantDetailsBusy}
            previewPath={previewPath}
            onLoadDetails={() => void loadPlantDetails()}
            onRestart={restart}
          />
        ) : null}
      </View>
      <GenerationProgress
        active={Boolean(busyMessage)}
        label={mode === "plant" ? "正在辨认" : (busyMessage || "正在查询生活助手")}
        estimate={mode === "dish" ? "约需半分钟" : "通常20秒内"}
        slowAfterSeconds={mode === "plant" ? 30 : undefined}
        slowLabel={mode === "plant" ? "网络有点慢，再等等" : undefined}
      />
    </View>
  );
}

function DishResultCard({ result, previewPath, onRestart }: {
  result: DishAnalyzeSuccess;
  previewPath: string;
  onRestart: () => void;
}) {
  const imageUrl = result.imageUrl || previewPath;
  return (
    <View className="life-result">
      {imageUrl ? <Image className="life-result__image" src={imageUrl} mode="aspectFit" /> : <View className="life-result__placeholder"><Text>🍲</Text></View>}
      <View className="life-score-card">
        <View className="life-score-card__main">
          <View className="life-score-card__name">
            <Text className="life-result__title">{result.title}</Text>
            <View className="life-tags">
              {result.tags.map((tag, index) => <Text key={`tag-${index}-${tag}`} className="life-tag">#{tag}</Text>)}
            </View>
          </View>
          <View className="life-score">
            <Text className="life-score__value">{result.healthScore}</Text>
            <Text className="life-score__label">{result.scoreLabel}</Text>
          </View>
        </View>
        <View className="life-portion">
          <Text className="life-portion__label">营养估算口径</Text>
          <Text className="life-portion__value">{result.portionBasis}</Text>
        </View>
      </View>

      <View className="life-section">
        <Text className="life-section__title">六项营养</Text>
        <View className="life-nutrition-grid">
          {NUTRIENTS.map((item) => (
            <View key={item.key} className={`life-nutrient life-nutrient--${item.key}`}>
              <Text className="life-nutrient__label">{item.emoji} {item.label}</Text>
              <Text className="life-nutrient__value">{result.nutrition[item.key]}</Text>
            </View>
          ))}
        </View>
      </View>

      <View className="life-section">
        <Text className="life-section__title">重点关注</Text>
        <View className="life-attention-list">
          {result.attentionPoints.map((point, index) => (
            <View key={`attention-${index}-${point.title}`} className={`life-attention life-attention--${point.kind}`}>
              <Text className="life-attention__title">{point.kind === "positive" ? "✓" : "!"} {point.title}</Text>
              <Text className="life-point">{point.detail}</Text>
            </View>
          ))}
        </View>
      </View>

      <View className="life-section">
        <Text className="life-section__title">食材拆解</Text>
        {INGREDIENT_GROUPS.map((group) => {
          const items = result.ingredients[group.key];
          return (
            <View key={group.key} className="life-ingredient-group">
              <Text className="life-ingredient-group__title">{group.emoji} {group.label}</Text>
              <View className="life-ingredient-list">
                {(items.length ? items : ["未识别到"]).map((item, index) => (
                  <Text key={`${group.key}-${index}-${item}`} className="life-ingredient">{item}</Text>
                ))}
              </View>
            </View>
          );
        })}
      </View>

      <View className="life-section life-section--overview">
        <Text className="life-section__title">营养概述</Text>
        <Text className="life-point">{result.overview}</Text>
      </View>

      <View className="life-section life-section--advice">
        <Text className="life-section__title">更健康的吃法</Text>
        <Text className="life-advice-subtitle">烹饪调整</Text>
        {result.cookingTips.map((tip, index) => <Text key={`cooking-${index}-${tip}`} className="life-point">• {tip}</Text>)}
        <Text className="life-advice-subtitle">一餐搭配</Text>
        {result.pairingTips.map((tip, index) => <Text key={`pairing-${index}-${tip}`} className="life-point">• {tip}</Text>)}
      </View>

      <View className="life-disclaimer"><Text>{result.disclaimer}</Text></View>
      <Button className="life-primary-button" block size="xlarge" type="primary" onClick={onRestart}>继续使用生活助手</Button>
      <AigcBadge />
    </View>
  );
}

function PlantResultCard({ result, details, detailsBusy, previewPath, onLoadDetails, onRestart }: {
  result: PlantIdentifyResult;
  details?: PlantDetails;
  detailsBusy: boolean;
  previewPath: string;
  onLoadDetails: () => void;
  onRestart: () => void;
}) {
  return (
    <View className="life-result">
      <Text className="life-plant-name">{result.name}</Text>
      {result.commonNames.length ? (
        <Text className="life-plant-common-names">俗名：{result.commonNames.join("、")}</Text>
      ) : null}
      {previewPath ? <Image className="life-result__image" src={previewPath} mode="aspectFit" /> : null}
      <Text className="life-result__description">{result.summary}</Text>
      {result.safetyNotice ? (
        <View className="life-plant-safety"><Text>⚠️ {result.safetyNotice}</Text></View>
      ) : null}

      {!details ? (
        <View>
          <Button
            className="life-primary-button"
            block
            size="xlarge"
            type="primary"
            loading={detailsBusy}
            onClick={onLoadDetails}
          >
            了解更多
          </Button>
          <GenerationProgress
            active={detailsBusy}
            inline
            label="正在整理养护知识"
            estimate="通常几秒钟"
          />
        </View>
      ) : (
        <View className="life-plant-details">
          <PlantDetailSection title="养护要点" items={details.carePoints} />
          <PlantDetailSection title="花期习性" items={details.floweringAndHabits} />
          <PlantDetailSection title="寓意典故" items={details.meaningAndStories} />
        </View>
      )}
      <Button className="life-primary-button" block size="xlarge" type="primary" onClick={onRestart}>继续使用生活助手</Button>
      <AigcBadge />
    </View>
  );
}

function PlantDetailSection({ title, items }: { title: string; items: string[] }) {
  return (
    <View className="life-section">
      <Text className="life-section__title">{title}</Text>
      {items.map((item, index) => (
        <Text key={`${title}-${index}-${item}`} className="life-point">• {item}</Text>
      ))}
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

function base64ByteLength(value: string): number {
  return Math.floor(value.length * 0.75);
}
