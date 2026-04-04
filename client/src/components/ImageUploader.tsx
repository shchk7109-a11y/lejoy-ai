import { useRef, useState } from "react";
import { Upload, X, ImageIcon } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

interface Props {
  onUpload: (url: string) => void;
  onClear?: () => void;
  imageUrl?: string | null;
  label?: string;
  accept?: string;
  maxSizeMB?: number;
}

export default function ImageUploader({
  onUpload,
  onClear,
  imageUrl,
  label = "点击上传照片",
  accept = "image/*",
  maxSizeMB = 10,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const uploadMutation = trpc.upload.image.useMutation();

  const handleFile = async (file: File) => {
    if (file.size > maxSizeMB * 1024 * 1024) {
      toast.error(`图片大小不能超过 ${maxSizeMB}MB`);
      return;
    }
    setUploading(true);
    try {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onloadend = async () => {
        const base64 = (reader.result as string).split(",")[1];
        const { url } = await uploadMutation.mutateAsync({ base64, mimeType: file.type });
        onUpload(url);
      };
    } catch {
      toast.error("上传失败，请重试");
    } finally {
      setUploading(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith("image/")) handleFile(file);
  };

  if (imageUrl) {
    return (
      <div className="relative rounded-2xl overflow-hidden border-2 border-stone-200 bg-stone-100">
        <img src={imageUrl} alt="已上传" className="w-full object-contain max-h-96" />
        {onClear && (
          <button
            onClick={onClear}
            className="absolute top-2 right-2 bg-black/50 text-white rounded-full p-1.5 hover:bg-black/70"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>
    );
  }

  return (
    <div
      onClick={() => inputRef.current?.click()}
      onDrop={handleDrop}
      onDragOver={(e) => e.preventDefault()}
      className="border-2 border-dashed border-stone-300 rounded-2xl p-8 text-center cursor-pointer hover:border-amber-400 hover:bg-amber-50 transition-colors"
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
      />
      {uploading ? (
        <div className="flex flex-col items-center gap-2 text-amber-600">
          <div className="w-8 h-8 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
          <span className="text-sm">上传中...</span>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-2 text-stone-400">
          <div className="w-12 h-12 bg-stone-100 rounded-full flex items-center justify-center">
            <ImageIcon className="w-6 h-6" />
          </div>
          <span className="font-medium text-stone-600">{label}</span>
          <span className="text-xs">支持 JPG、PNG、HEIC 格式，最大 {maxSizeMB}MB</span>
        </div>
      )}
    </div>
  );
}
