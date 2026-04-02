import { useState, useRef } from "react";
import { Camera, ImagePlus, X } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ImageUploaderProps {
  onImageSelected: (base64: string) => void;
  currentImage?: string | null;
  onClear?: () => void;
  className?: string;
  accept?: string;
}

export function ImageUploader({ onImageSelected, currentImage, onClear, className, accept }: ImageUploaderProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const handleFile = (file: File) => {
    if (file.size > 10 * 1024 * 1024) {
      alert("图片大小不能超过10MB");
      return;
    }
    const reader = new FileReader();
    reader.onloadend = () => {
      onImageSelected(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className={className}>
      {currentImage ? (
        <div className="relative inline-block">
          <img
            src={currentImage}
            alt="已选图片"
            className="w-full max-w-xs rounded-xl border border-border object-cover"
          />
          {onClear && (
            <button
              onClick={onClear}
              className="absolute -top-2 -right-2 bg-destructive text-destructive-foreground rounded-full p-1 shadow-md"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      ) : (
        <div className="flex gap-3">
          <Button
            variant="outline"
            onClick={() => cameraInputRef.current?.click()}
            className="flex-1 h-20 flex-col gap-1"
          >
            <Camera className="w-6 h-6" />
            <span className="text-xs">拍照</span>
          </Button>
          <Button
            variant="outline"
            onClick={() => fileInputRef.current?.click()}
            className="flex-1 h-20 flex-col gap-1"
          >
            <ImagePlus className="w-6 h-6" />
            <span className="text-xs">相册</span>
          </Button>
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept={accept || "image/*"}
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
          e.target.value = "";
        }}
      />
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
          e.target.value = "";
        }}
      />
    </div>
  );
}
