import { useEffect, useRef, useState } from "react";
import { Text, View } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { mpApi } from "../../services/api";
import { ensurePrivacyAuthorized } from "../../services/privacy";
import "./index.scss";

export function formatRecordingTime(seconds: number): string {
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

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

async function guideToRecordSettings(): Promise<void> {
  const result = await Taro.showModal({
    title: "需要麦克风权限",
    content: "请在设置中允许使用麦克风，才能按住说话。",
    confirmText: "去设置",
  });
  if (result.confirm) await Taro.openSetting();
}

export function VoiceInput({ onResult }: { onResult: (text: string) => void }) {
  const recorderRef = useRef<ReturnType<typeof Taro.getRecorderManager> | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const activeRef = useRef(true);
  const touchHeldRef = useRef(false);
  const recordingRef = useRef(false);
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [transcribing, setTranscribing] = useState(false);

  function stopTimer() {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
  }

  async function transcribe(filePath: string) {
    setTranscribing(true);
    try {
      const base64 = await readBase64(filePath);
      const uploaded = await mpApi.uploadAudio({ base64, mimeType: "audio/mpeg" });
      const result = await mpApi.transcribeAudio(uploaded.fileKey);
      onResult(result.text);
      await Taro.showToast({ title: "已转成文字", icon: "success" });
    } catch (error) {
      await Taro.showToast({ title: error instanceof Error ? error.message : "语音识别失败，请重试", icon: "none", duration: 3000 });
    } finally {
      setTranscribing(false);
      setSeconds(0);
    }
  }

  useEffect(() => {
    const recorder = Taro.getRecorderManager();
    recorderRef.current = recorder;
    const onStart = () => {
      if (!activeRef.current) return;
      recordingRef.current = true;
      if (!touchHeldRef.current) {
        recorder.stop();
        return;
      }
      setRecording(true);
      setSeconds(0);
      stopTimer();
      timerRef.current = setInterval(() => setSeconds((value) => value + 1), 1000);
    };
    const onStop = (result: { tempFilePath: string }) => {
      if (!activeRef.current) return;
      recordingRef.current = false;
      setRecording(false);
      stopTimer();
      void transcribe(result.tempFilePath);
    };
    const onError = () => {
      if (!activeRef.current) return;
      recordingRef.current = false;
      setRecording(false);
      stopTimer();
      void Taro.showToast({ title: "录音失败，请检查麦克风权限", icon: "none" });
    };
    recorder.onStart(onStart);
    recorder.onStop(onStop);
    recorder.onError(onError);
    return () => {
      activeRef.current = false;
      stopTimer();
    };
  }, []);

  async function startRecording() {
    if (recording || transcribing) return;
    touchHeldRef.current = true;
    try {
      await ensurePrivacyAuthorized();
      const setting = await Taro.getSetting();
      const permission = setting.authSetting["scope.record"];
      if (permission === false) {
        touchHeldRef.current = false;
        await guideToRecordSettings();
        return;
      }
      if (permission !== true) await Taro.authorize({ scope: "scope.record" });
      if (!touchHeldRef.current) return;
      recorderRef.current?.start({
        duration: 60000,
        sampleRate: 16000,
        numberOfChannels: 1,
        encodeBitRate: 48000,
        format: "mp3",
      });
    } catch {
      touchHeldRef.current = false;
      await guideToRecordSettings();
    }
  }

  function stopRecording() {
    touchHeldRef.current = false;
    if (recordingRef.current) recorderRef.current?.stop();
  }

  return (
    <View className={`voice-input ${recording ? "voice-input--recording" : ""}`}>
      <View
        className={`voice-input__button clickable ${transcribing ? "voice-input__button--busy" : ""}`}
        onTouchStart={() => void startRecording()}
        onTouchEnd={stopRecording}
        onTouchCancel={stopRecording}
      >
        <Text className="voice-input__icon">🎙️</Text>
        <Text>{transcribing ? "正在转成文字…" : recording ? `松开结束 ${formatRecordingTime(seconds)}` : "按住说话"}</Text>
      </View>
      {recording ? (
        <View className="voice-input__wave" aria-label="正在录音">
          {[0, 1, 2, 3, 4].map((bar) => <View key={bar} className={`voice-input__bar voice-input__bar--${bar + 1}`} />)}
        </View>
      ) : <Text className="voice-input__tip">长按按钮说出补充内容，松开后自动转文字</Text>}
    </View>
  );
}
