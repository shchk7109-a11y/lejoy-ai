import { useState, useRef, useCallback } from "react";
import { trpc } from "@/lib/trpc";

export function useVoiceInput(onResult: (text: string) => void) {
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const uploadMutation = trpc.voice.upload.useMutation();
  const transcribeMutation = trpc.voice.transcribe.useMutation();

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : "audio/mp4",
      });
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        const blob = new Blob(chunksRef.current, { type: mediaRecorder.mimeType });

        if (blob.size > 16 * 1024 * 1024) {
          alert("录音文件过大，请缩短录音时间");
          return;
        }

        setIsTranscribing(true);
        try {
          // Convert to base64
          const reader = new FileReader();
          const base64 = await new Promise<string>((resolve) => {
            reader.onloadend = () => resolve(reader.result as string);
            reader.readAsDataURL(blob);
          });

          // Upload audio
          const { url } = await uploadMutation.mutateAsync({
            audioBase64: base64,
            mimeType: mediaRecorder.mimeType,
          });

          // Transcribe
          const { text } = await transcribeMutation.mutateAsync({
            audioUrl: url,
            language: "zh",
          });

          if (text) onResult(text);
        } catch (err: any) {
          console.error("语音转写失败:", err);
          const msg = err?.message || "语音识别失败";
          alert(msg.includes("语音") ? msg : `语音识别失败: ${msg}`);
        } finally {
          setIsTranscribing(false);
        }
      };

      mediaRecorder.start();
      setIsRecording(true);
    } catch (err) {
      console.error("无法访问麦克风:", err);
      alert("请允许使用麦克风权限");
    }
  }, [onResult, uploadMutation, transcribeMutation]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  }, []);

  return {
    isRecording,
    isTranscribing,
    startRecording,
    stopRecording,
  };
}
