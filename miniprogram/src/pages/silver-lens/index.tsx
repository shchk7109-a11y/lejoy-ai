import { useEffect, useRef, useState } from "react";
import { Image, Text, Textarea, View } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { Button } from "@nutui/nutui-react-taro";
import { AigcBadge } from "../../components/AigcBadge";
import { ErrorState, useMpError } from "../../components/ErrorState";
import { PageHeader } from "../../components/PageHeader";
import { VoiceInput } from "../../components/VoiceInput";
import {
  mpApi,
  type ArtStyleName,
  type ArtStyleOption,
  type MediaSecurityStatus,
  type PhotoEditPreset,
} from "../../services/api";
import { ensurePrivacyAuthorized } from "../../services/privacy";
import { createOperationId } from "../../services/request-policy";
import "./index.scss";

const PHOTO_PRESETS: PhotoEditPreset[] = ["一键去路人", "清晨阳光", "日落余晖", "通透增强", "人像精修", "背景虚化"];
type Mode = "landing" | "smart" | "art";

async function readBase64(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    Taro.getFileSystemManager().readFile({
      filePath,
      encoding: "base64",
      success: (result) => resolve(String(result.data)),
      fail: reject,
    });
  });
}

function imageMime(filePath: string): "image/jpeg" | "image/png" | "image/webp" {
  const suffix = filePath.split("?")[0].split(".").pop()?.toLowerCase();
  if (suffix === "png") return "image/png";
  if (suffix === "webp") return "image/webp";
  return "image/jpeg";
}

async function guideToSettings(title: string, content: string): Promise<void> {
  const result = await Taro.showModal({ title, content, confirmText: "去设置" });
  if (result.confirm) await Taro.openSetting();
}

export default function SilverLensPage() {
  const [mode, setMode] = useState<Mode>("landing");
  const [previewPath, setPreviewPath] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [sourceFileKey, setSourceFileKey] = useState("");
  const [resultUrl, setResultUrl] = useState("");
  const [selectedPreset, setSelectedPreset] = useState<PhotoEditPreset>("通透增强");
  const [customPrompt, setCustomPrompt] = useState("");
  const [styles, setStyles] = useState<ArtStyleOption[]>([]);
  const [selectedStyle, setSelectedStyle] = useState<ArtStyleName>("油画");
  const [busyMessage, setBusyMessage] = useState("");
  const [securityStatus, setSecurityStatus] = useState<MediaSecurityStatus>();
  const operationLockRef = useRef(false);
  const { errorState, showMpError, dismissError, retryError } = useMpError();
  const busy = Boolean(busyMessage);

  useEffect(() => {
    let active = true;
    void mpApi.silverLensStyles()
      .then(({ styles: serverStyles }) => {
        if (!active) return;
        setStyles(serverStyles);
        if (serverStyles[0]) setSelectedStyle(serverStyles[0].name);
      })
      .catch((error) => {
        if (active) showMpError(error, async () => { await Taro.redirectTo({ url: "/pages/silver-lens/index" }); });
      });
    return () => { active = false; };
  }, []);

  async function chooseImage(sourceType: "camera" | "album") {
    if (busy) return;
    try {
      await ensurePrivacyAuthorized();
      const result = await Taro.chooseMedia({
        count: 1,
        mediaType: ["image"],
        sourceType: [sourceType],
        sizeType: ["original", "compressed"],
      });
      const file = result.tempFiles[0];
      if (!file) return;
      if (file.size > 10 * 1024 * 1024) throw new Error("图片不能超过 10MB");
      setBusyMessage("正在准备照片，请稍候…");
      const base64 = await readBase64(file.tempFilePath);
      const uploaded = await mpApi.uploadImage({ base64, mimeType: imageMime(file.tempFilePath) });
      setPreviewPath(file.tempFilePath);
      setSourceUrl(uploaded.url);
      setSourceFileKey(uploaded.fileKey);
      setResultUrl("");
      setSecurityStatus(uploaded.securityStatus);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes("cancel")) return;
      if (message.includes("auth") || message.includes("permission") || message.includes("authorize")) {
        await guideToSettings("需要相机或相册权限", "请在设置中允许访问相机或相册，再回来选择照片。");
      } else {
        showMpError(error, () => chooseImage(sourceType));
      }
    } finally {
      setBusyMessage("");
    }
  }

  async function processSmart(
    operationId = createOperationId("silver-restore"),
    requestData = { sourceFileKey, preset: selectedPreset, prompt: customPrompt.trim() || undefined },
  ) {
    if (!sourceUrl || !requestData.sourceFileKey || busy || operationLockRef.current) return;
    operationLockRef.current = true;
    setBusyMessage("正在精细处理，约需半分钟");
    try {
      const result = await mpApi.restorePhoto(requestData, operationId);
      setResultUrl(result.imageUrl);
      setSecurityStatus(result.securityStatus);
    } catch (error) {
      showMpError(error, () => processSmart(operationId, requestData));
    } finally {
      operationLockRef.current = false;
      setBusyMessage("");
    }
  }

  async function processArt(
    operationId = createOperationId("silver-transform"),
    requestData = { sourceFileKey, style: selectedStyle },
  ) {
    if (!sourceUrl || !requestData.sourceFileKey || busy || operationLockRef.current) return;
    operationLockRef.current = true;
    setBusyMessage("正在创作艺术作品，约需半分钟");
    try {
      const result = await mpApi.transformPhoto(requestData, operationId);
      setResultUrl(result.imageUrl);
      setSecurityStatus(result.securityStatus);
    } catch (error) {
      showMpError(error, () => processArt(operationId, requestData));
    } finally {
      operationLockRef.current = false;
      setBusyMessage("");
    }
  }

  async function saveResult() {
    if (!resultUrl) return;
    try {
      await ensurePrivacyAuthorized();
      const setting = await Taro.getSetting();
      if (setting.authSetting["scope.writePhotosAlbum"] === false) {
        await guideToSettings("需要保存权限", "请在设置中允许保存到相册，再回来保存照片。");
        return;
      }
      const download = await Taro.downloadFile({ url: resultUrl });
      if (download.statusCode !== 200) throw new Error("下载照片失败");
      await Taro.saveImageToPhotosAlbum({ filePath: download.tempFilePath });
      await Taro.showToast({ title: "已保存到相册", icon: "success" });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes("auth") || message.includes("deny") || message.includes("permission")) {
        await guideToSettings("需要保存权限", "请在设置中允许保存到相册，再回来保存照片。");
      } else {
        showMpError(error, saveResult);
      }
    }
  }

  function resetPhoto() {
    setPreviewPath("");
    setSourceUrl("");
    setSourceFileKey("");
    setResultUrl("");
    setCustomPrompt("");
    setSelectedPreset("通透增强");
    setSecurityStatus(undefined);
    dismissError();
  }

  function returnToLanding() {
    resetPhoto();
    setMode("landing");
  }

  const pageTitle = mode === "smart" ? "智能修图" : mode === "art" ? "艺术画室" : "老摄影大师";

  return (
    <View className={`silver-page ${resultUrl ? "silver-page--result" : ""}`}>
      <PageHeader title={pageTitle} onBack={mode === "landing" ? undefined : returnToLanding} />
      {errorState ? <ErrorState error={errorState.error} onRetry={retryError} onDismiss={dismissError} /> : null}

      {mode === "landing" ? (
        <View className="mode-landing">
          <View className="mode-card mode-card--smart clickable" onClick={() => setMode("smart")}>
            <Text className="mode-card__icon">✨</Text>
            <Text className="mode-card__title">智能修图 & 美化</Text>
            <Text className="mode-card__description">一键去除路人、调节光影、让照片更清晰</Text>
          </View>
          <View className="mode-card mode-card--art clickable" onClick={() => setMode("art")}>
            <Text className="mode-card__icon">🎨</Text>
            <Text className="mode-card__title">艺术画室</Text>
            <Text className="mode-card__description">照片变油画、水墨画等艺术作品</Text>
          </View>
        </View>
      ) : !previewPath ? (
        <View className="source-picker">
          <Text className="silver-section__title">先选择一张照片</Text>
          <Text className="source-picker__tip">建议使用清晰原图，处理后会保持原来的画面比例</Text>
          <View className="source-picker__actions">
            <View className="source-card clickable" onClick={() => void chooseImage("camera")}>
              <Text className="source-card__icon">📷</Text>
              <Text className="source-card__title">拍照</Text>
              <Text className="source-card__tip">现在拍一张照片</Text>
            </View>
            <View className="source-card clickable" onClick={() => void chooseImage("album")}>
              <Text className="source-card__icon">🖼️</Text>
              <Text className="source-card__title">从相册选择</Text>
              <Text className="source-card__tip">选择已有照片</Text>
            </View>
          </View>
          <Text className="silver-privacy">照片仅用于本次处理，请放心使用</Text>
        </View>
      ) : resultUrl ? (
        <View className="silver-result">
          <Text className="silver-section__title">处理完成，看看前后变化</Text>
          <View className="compare-grid">
            <View className="compare-card clickable" onClick={() => Taro.previewImage({ current: previewPath, urls: [previewPath, resultUrl] })}>
              <Text className="compare-card__label">处理前</Text>
              <Image className="compare-card__image" src={previewPath} mode="aspectFit" />
            </View>
            <View className="compare-card clickable" onClick={() => Taro.previewImage({ current: resultUrl, urls: [previewPath, resultUrl] })}>
              <Text className="compare-card__label compare-card__label--after">处理后</Text>
              <Image className="compare-card__image" src={resultUrl} mode="aspectFit" />
            </View>
          </View>
          {securityStatus === "pending" ? <Text className="security-tip">🛡️ 图片正在进行内容安全审核</Text> : null}
          <Button block size="xlarge" type="primary" onClick={() => void saveResult()}>保存到相册</Button>
          <View className="result-actions">
            <View className="result-actions__secondary clickable" onClick={() => setResultUrl("")}><Text>重新处理</Text></View>
            <View className="result-actions__secondary clickable" onClick={resetPhoto}><Text>再来一张</Text></View>
          </View>
        </View>
      ) : (
        <View className="workbench">
          <Image className="workbench__image" src={previewPath} mode="aspectFit" onClick={() => Taro.previewImage({ current: previewPath, urls: [previewPath] })} />

          {mode === "smart" ? (
            <View className="smart-panel">
              <View className="panel-heading">
                <Text className="panel-heading__title">🪄 选择修图魔法</Text>
                <Text className="panel-heading__cost">2积分/次</Text>
              </View>
              <Text className="panel-heading__tip">已默认选中通透增强，可换成其他效果</Text>
              <View className="preset-grid">
                {PHOTO_PRESETS.map((preset) => (
                  <View
                    key={preset}
                    className={`preset-button clickable ${selectedPreset === preset ? "preset-button--selected" : ""}`}
                    onClick={() => setSelectedPreset(preset)}
                  >
                    <Text>{preset}</Text>
                  </View>
                ))}
              </View>
              <View className="custom-edit">
                <Text className="custom-edit__label">我想怎么修：</Text>
                <Textarea
                  className="custom-edit__textarea"
                  value={customPrompt}
                  maxlength={200}
                  placeholder="例如：把天空变蓝，照片调亮点"
                  onInput={(event) => setCustomPrompt(event.detail.value)}
                />
                <VoiceInput onResult={(text) => setCustomPrompt((current) => `${current}${current ? "，" : ""}${text}`)} />
              </View>
              <Button block size="xlarge" type="primary" onClick={() => void processSmart()}>🚀 开始处理</Button>
            </View>
          ) : (
            <View className="style-panel">
              <View className="panel-heading">
                <Text className="panel-heading__title">🎨 选择艺术风格</Text>
                <Text className="panel-heading__cost">2积分/次</Text>
              </View>
              {styles.map((style) => (
                <View
                  key={style.name}
                  className={`style-card clickable ${selectedStyle === style.name ? "style-card--selected" : ""}`}
                  onClick={() => setSelectedStyle(style.name)}
                >
                  <Text className="style-card__emoji">{style.emoji}</Text>
                  <View className="style-card__copy">
                    <Text className="style-card__name">{style.name}</Text>
                    <Text className="style-card__description">{style.description}</Text>
                  </View>
                  <Text className="style-card__mark">{selectedStyle === style.name ? "✓" : "›"}</Text>
                </View>
              ))}
              <Button block size="xlarge" type="primary" disabled={!styles.length} onClick={() => void processArt()}>生成{selectedStyle}艺术作品</Button>
            </View>
          )}
          <View className="change-photo clickable" onClick={resetPhoto}><Text>换一张照片</Text></View>
        </View>
      )}

      {busy ? (
        <View className="processing-mask">
          <View className="processing-mask__spinner" />
          <Text className="processing-mask__title">{busyMessage}</Text>
          <Text className="processing-mask__tip">请不要退出或重复点击</Text>
        </View>
      ) : null}
      {resultUrl ? <AigcBadge /> : null}
    </View>
  );
}
