import { Mic, MicOff, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useVoiceInput } from "@/hooks/useVoiceInput";

interface VoiceButtonProps {
  onResult: (text: string) => void;
  className?: string;
}

export function VoiceButton({ onResult, className }: VoiceButtonProps) {
  const { isRecording, isTranscribing, startRecording, stopRecording } = useVoiceInput(onResult);

  if (isTranscribing) {
    return (
      <Button variant="outline" size="icon" disabled className={className}>
        <Loader2 className="w-5 h-5 animate-spin" />
      </Button>
    );
  }

  return (
    <Button
      variant={isRecording ? "destructive" : "outline"}
      size="icon"
      onClick={isRecording ? stopRecording : startRecording}
      className={className}
      title={isRecording ? "停止录音" : "语音输入"}
    >
      {isRecording ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
    </Button>
  );
}
