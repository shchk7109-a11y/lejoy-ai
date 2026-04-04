import { useState, useRef, useCallback } from "react";
import { Mic, MicOff, Loader2 } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

interface Props {
  onResult: (text: string) => void;
  className?: string;
  size?: "sm" | "md" | "lg";
}

export default function VoiceInput({ onResult, className = "", size = "md" }: Props) {
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const uploadMutation = trpc.upload.image.useMutation();
  const transcribeMutation = trpc.stt.transcribe.useMutation();

  const sizeClasses = {
    sm: "w-8 h-8",
    md: "w-10 h-10",
    lg: "w-12 h-12",
  };
  const iconSizes = { sm: "w-4 h-4", md: "w-5 h-5", lg: "w-6 h-6" };

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream, { mimeType: "audio/webm" });
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        setIsProcessing(true);
        try {
          const blob = new Blob(chunksRef.current, { type: "audio/webm" });
          const reader = new FileReader();
          reader.readAsDataURL(blob);
          reader.onloadend = async () => {
            const base64 = (reader.result as string).split(",")[1];
            // 上传音频到S3
            const { url } = await uploadMutation.mutateAsync({
              base64,
              mimeType: "audio/webm",
            });
            // 调用STT
            const { text } = await transcribeMutation.mutateAsync({ audioUrl: url, language: "zh" });
            if (text) onResult(text);
          };
        } catch (err) {
          toast.error("语音识别失败，请重试");
        } finally {
          setIsProcessing(false);
        }
      };

      mediaRecorder.start();
      setIsRecording(true);
    } catch (err) {
      toast.error("无法访问麦克风，请检查权限设置");
    }
  }, [onResult, uploadMutation, transcribeMutation]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  }, [isRecording]);

  const handleClick = () => {
    if (isProcessing) return;
    if (isRecording) stopRecording();
    else startRecording();
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={isProcessing}
      title={isRecording ? "点击停止录音" : "点击开始语音输入"}
      className={`
        ${sizeClasses[size]} rounded-full flex items-center justify-center transition-all duration-200
        ${isRecording
          ? "bg-red-500 text-white animate-pulse shadow-lg shadow-red-200"
          : isProcessing
          ? "bg-amber-100 text-amber-600 cursor-not-allowed"
          : "bg-stone-100 text-stone-600 hover:bg-amber-100 hover:text-amber-700 active:scale-95"
        }
        ${className}
      `}
    >
      {isProcessing ? (
        <Loader2 className={`${iconSizes[size]} animate-spin`} />
      ) : isRecording ? (
        <MicOff className={iconSizes[size]} />
      ) : (
        <Mic className={iconSizes[size]} />
      )}
    </button>
  );
}
