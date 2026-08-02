import { useState } from "react";
import { Image, Text, View } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { Button } from "@nutui/nutui-react-taro";
import { AigcBadge } from "../../components/AigcBadge";
import { ErrorState, useMpError } from "../../components/ErrorState";
import { PageHeader } from "../../components/PageHeader";
import { mpApi, type MediaSecurityStatus } from "../../services/api";
import { ensurePrivacyAuthorized } from "../../services/privacy";
import "./index.scss";

const ART_STYLES = [
  { name: "油画", emoji: "🖼️", description: "厚重笔触，经典质感" },
  { name: "水彩", emoji: "🎨", description: "柔和通透，清新自然" },
  { name: "素描", emoji: "✏️", description: "细腻线条，明暗分明" },
  { name: "水墨画", emoji: "🖌️", description: "东方笔墨，诗意留白" },
  { name: "印象派", emoji: "🌅", description: "鲜活光影，斑斓色彩" },
] as const;

type ArtStyle = (typeof ART_STYLES)[number]["name"];

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
  const [previewPath, setPreviewPath] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [sourceFileKey, setSourceFileKey] = useState("");
  const [resultUrl, setResultUrl] = useState("");
  const [selectedStyle, setSelectedStyle] = useState<ArtStyle>("油画");
  const [choosingStyle, setChoosingStyle] = useState(false);
  const [busyMessage, setBusyMessage] = useState("");
  const [securityStatus, setSecurityStatus] = useState<MediaSecurityStatus>();
  const { errorState, showMpError, dismissError, retryError } = useMpError();

  const busy = Boolean(busyMessage);

  async function chooseImage(sourceType: "camera" | "album") {
    if (busy) return;
    try {
      await ensurePrivacyAuthorized();
      const result = await Taro.chooseMedia({
        count: 1,
        mediaType: ["image"],
        sourceType: [sourceType],
        sizeType: ["compressed", "original"],
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

  async function processImage(mode: "restore" | "transform") {
    if (!sourceUrl || !sourceFileKey || busy) return;
    setBusyMessage(mode === "restore" ? "正在修复，约需半分钟" : "正在创作艺术照，约需半分钟");
    try {
      const result = mode === "restore"
        ? await mpApi.restorePhoto({ sourceFileKey })
        : await mpApi.transformPhoto({ sourceFileKey, style: selectedStyle });
      setResultUrl(result.imageUrl);
      setSecurityStatus(result.securityStatus);
      setChoosingStyle(false);
    } catch (error) {
      showMpError(error, () => processImage(mode));
    } finally {
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

  function reset() {
    setPreviewPath("");
    setSourceUrl("");
    setResultUrl("");
    setChoosingStyle(false);
    setSecurityStatus(undefined);
    dismissError();
  }

  return (
    <View className={`silver-page ${resultUrl ? "silver-page--result" : ""}`}>
      <PageHeader title="老摄影大师" />
      {errorState ? <ErrorState error={errorState.error} onRetry={retryError} onDismiss={dismissError} /> : null}
      {!previewPath ? (
        <View className="silver-entry">
          <View className="silver-entry__hero">
            <Text className="silver-entry__emoji">📸</Text>
            <Text className="silver-entry__title">让珍贵照片焕然一新</Text>
            <Text className="silver-entry__subtitle">拍一张或从相册选择，操作简单又清楚</Text>
          </View>
          <View className="silver-entry__actions">
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
          <Text className="silver-entry__privacy">照片仅用于本次处理，请放心使用</Text>
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
            <View className="result-actions__secondary clickable" onClick={reset}><Text>再来一张</Text></View>
          </View>
        </View>
      ) : (
        <View className="silver-preview">
          <Text className="silver-section__title">这张照片想怎么处理？</Text>
          <Image className="silver-preview__image" src={previewPath} mode="aspectFit" onClick={() => Taro.previewImage({ current: previewPath, urls: [previewPath] })} />
          {!choosingStyle ? (
            <View className="process-actions">
              <View className="process-card clickable" onClick={() => void processImage("restore")}>
                <Text className="process-card__icon">✨</Text>
                <View><Text className="process-card__title">一键修复</Text><Text className="process-card__tip">提高清晰度、修复划痕与褪色</Text></View>
              </View>
              <View className="process-card clickable" onClick={() => setChoosingStyle(true)}>
                <Text className="process-card__icon">🎨</Text>
                <View><Text className="process-card__title">变艺术照</Text><Text className="process-card__tip">选择喜欢的画作风格</Text></View>
              </View>
            </View>
          ) : (
            <View className="style-panel">
              <Text className="style-panel__title">选一种喜欢的风格</Text>
              {ART_STYLES.map((style) => (
                <View
                  key={style.name}
                  className={`style-card clickable ${selectedStyle === style.name ? "style-card--selected" : ""}`}
                  onClick={() => setSelectedStyle(style.name)}
                >
                  <Text className="style-card__emoji">{style.emoji}</Text>
                  <View className="style-card__copy"><Text className="style-card__name">{style.name}</Text><Text className="style-card__description">{style.description}</Text></View>
                  <Text className="style-card__mark">{selectedStyle === style.name ? "✓" : "›"}</Text>
                </View>
              ))}
              <Button block size="xlarge" type="primary" onClick={() => void processImage("transform")}>生成{selectedStyle}艺术照</Button>
            </View>
          )}
          <View className="change-photo clickable" onClick={reset}><Text>换一张照片</Text></View>
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
