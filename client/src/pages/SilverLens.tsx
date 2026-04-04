import { useState } from "react";
import { ArrowLeft, Wand2, Palette, ZoomIn, Download, RefreshCw } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import ImageUploader from "@/components/ImageUploader";
import VoiceInput from "@/components/VoiceInput";
import InsufficientCreditsModal from "@/components/InsufficientCreditsModal";

const ART_STYLES = ["油画", "水彩", "素描", "水墨画", "印象派"];

const QUICK_EDITS = [
  { label: "一键去路人", prompt: "Remove passersby and distractions from the background, keep the main subject clean." },
  { label: "清晨阳光", prompt: "Adjust lighting to look like soft bright early morning sunlight." },
  { label: "日落余晖", prompt: "Adjust lighting to look like a warm sunset with golden and orange hues." },
  { label: "通透增强", prompt: "Enhance clarity, remove haze, make colors natural but vibrant." },
  { label: "人像精修", prompt: "Subtly beautify people in the photo, improve skin tones while keeping it natural." },
  { label: "背景虚化", prompt: "Keep main subject sharp and apply professional bokeh effect to background." },
];

type Mode = "home" | "edit" | "art";

export default function SilverLens() {
  const [mode, setMode] = useState<Mode>("home");
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [prompt, setPrompt] = useState("");
  const [artStyle, setArtStyle] = useState("油画");
  const [zoomImg, setZoomImg] = useState<string | null>(null);
  const [showCreditsModal, setShowCreditsModal] = useState(false);

  const { data: creditsData } = trpc.credits.balance.useQuery();
  const restoreMutation = trpc.silverLens.restorePhoto.useMutation({
    onSuccess: (data) => setResultUrl(data.imageUrl),
    onError: (err) => {
      if (err.message.includes("积分不足")) setShowCreditsModal(true);
      else if (err.message.includes("繁忙") || err.message.includes("429") || err.message.includes("TOO_MANY_REQUESTS"))
        toast.error("🙏 AI服务繁忙，请稍等1-2分钟后再试", { duration: 5000 });
      else toast.error(err.message || "AI处理失败，请稍后重试");
    },
  });
  const artMutation = trpc.silverLens.transformArt.useMutation({
    onSuccess: (data) => setResultUrl(data.imageUrl),
    onError: (err) => {
      if (err.message.includes("积分不足")) setShowCreditsModal(true);
      else if (err.message.includes("繁忙") || err.message.includes("429") || err.message.includes("TOO_MANY_REQUESTS"))
        toast.error("🙏 AI服务繁忙，请稍等1-2分钟后再试", { duration: 5000 });
      else toast.error(err.message || "AI处理失败，请稍后重试");
    },
  });

  const isLoading = restoreMutation.isPending || artMutation.isPending;

  const reset = () => {
    setImageUrl(null);
    setResultUrl(null);
    setPrompt("");
  };

  const handleQuickEdit = (p: string) => {
    if (!imageUrl) return toast.error("请先上传照片");
    restoreMutation.mutate({ imageUrl, prompt: p });
  };

  const handleRestore = () => {
    if (!imageUrl) return toast.error("请先上传照片");
    restoreMutation.mutate({ imageUrl, prompt: prompt || undefined });
  };

  const handleArt = () => {
    if (!imageUrl) return toast.error("请先上传照片");
    artMutation.mutate({ imageUrl, style: artStyle });
  };

  const downloadImage = async (url: string) => {
    const a = document.createElement("a");
    a.href = url;
    a.download = `lejoy-${Date.now()}.png`;
    a.click();
  };

  return (
    <div className="min-h-screen bg-stone-50 pb-20">
      {/* 放大预览 */}
      {zoomImg && (
        <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4" onClick={() => setZoomImg(null)}>
          <img src={zoomImg} className="max-w-full max-h-full rounded-xl" />
        </div>
      )}

      <InsufficientCreditsModal
        isOpen={showCreditsModal}
        onClose={() => setShowCreditsModal(false)}
        currentCredits={creditsData?.credits}
        requiredCredits={2}
      />

      {/* 加载遮罩 */}
      {isLoading && (
        <div className="fixed inset-0 z-40 bg-black/50 flex flex-col items-center justify-center gap-4">
          <div className="w-16 h-16 border-4 border-amber-400 border-t-transparent rounded-full animate-spin" />
          <p className="text-white text-lg font-medium">
            {mode === "art" ? "正在为您挥毫泼墨..." : "暗房工作中，正在精细修复..."}
          </p>
        </div>
      )}

      {/* 顶部导航 */}
      <header className="bg-white px-4 py-4 flex items-center justify-between shadow-sm sticky top-0 z-10">
        <button
          onClick={() => { if (mode === "home") window.history.back(); else { setMode("home"); reset(); } }}
          className="flex items-center gap-1 text-stone-600 font-medium"
        >
          <ArrowLeft className="w-5 h-5" /> 返回
        </button>
        <h1 className="text-lg font-bold font-serif text-stone-800">
          {mode === "home" ? "📸 老摄影大师" : mode === "edit" ? "✨ 智能修图" : "🎨 艺术画室"}
        </h1>
        <div className="w-16" />
      </header>

      <div className="max-w-lg mx-auto px-4 py-6 space-y-5">
        {/* 首页：选择模式 */}
        {mode === "home" && (
          <>
            <p className="text-stone-500 text-center text-sm">选择您想要的功能，让AI为您的照片增添光彩</p>
            <div className="grid grid-cols-2 gap-4">
              <button
                onClick={() => setMode("edit")}
                className="bg-amber-50 border-2 border-amber-200 rounded-2xl p-5 text-center hover:bg-amber-100 active:scale-95 transition-all"
              >
                <Wand2 className="w-10 h-10 text-amber-600 mx-auto mb-2" />
                <p className="font-bold text-stone-800 text-lg">智能修图</p>
                <p className="text-stone-500 text-xs mt-1">修复老照片、快速美化</p>
                <p className="text-amber-600 text-xs mt-2 font-medium">消耗 2 积分</p>
              </button>
              <button
                onClick={() => setMode("art")}
                className="bg-purple-50 border-2 border-purple-200 rounded-2xl p-5 text-center hover:bg-purple-100 active:scale-95 transition-all"
              >
                <Palette className="w-10 h-10 text-purple-600 mx-auto mb-2" />
                <p className="font-bold text-stone-800 text-lg">艺术画室</p>
                <p className="text-stone-500 text-xs mt-1">油画、水彩、水墨画</p>
                <p className="text-purple-600 text-xs mt-2 font-medium">消耗 2 积分</p>
              </button>
            </div>
          </>
        )}

        {/* 智能修图 */}
        {mode === "edit" && (
          <>
            <ImageUploader
              onUpload={setImageUrl}
              onClear={reset}
              imageUrl={imageUrl}
              label="点击上传要修复的照片"
            />

            {imageUrl && !resultUrl && (
              <>
                <div>
                  <p className="font-semibold text-stone-700 mb-3">⚡ 快速修图</p>
                  <div className="grid grid-cols-3 gap-2">
                    {QUICK_EDITS.map((q) => (
                      <button
                        key={q.label}
                        onClick={() => handleQuickEdit(q.prompt)}
                        className="bg-white border border-stone-200 rounded-xl py-2.5 text-sm font-medium text-stone-700 hover:bg-amber-50 hover:border-amber-300 active:scale-95 transition-all"
                      >
                        {q.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <p className="font-semibold text-stone-700 mb-2">✏️ 自定义修图</p>
                  <div className="flex gap-2">
                    <Textarea
                      value={prompt}
                      onChange={(e) => setPrompt(e.target.value)}
                      placeholder="描述您想要的修图效果，例如：让天空更蓝，人物更清晰..."
                      className="flex-1 rounded-xl text-base resize-none"
                      rows={2}
                    />
                    <VoiceInput onResult={(t) => setPrompt((p) => p + t)} />
                  </div>
                  <Button onClick={handleRestore} className="w-full mt-2 rounded-xl py-3 text-base" disabled={!prompt}>
                    开始修图
                  </Button>
                </div>
              </>
            )}

            {resultUrl && (
              <div className="space-y-3">
                <p className="font-semibold text-stone-700 text-center">✅ 修图完成！</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-xs text-stone-400 text-center mb-1">原图</p>
                    <img src={imageUrl!} className="w-full rounded-xl cursor-pointer" onClick={() => setZoomImg(imageUrl)} />
                  </div>
                  <div>
                    <p className="text-xs text-stone-400 text-center mb-1">修图后</p>
                    <img src={resultUrl} className="w-full rounded-xl cursor-pointer" onClick={() => setZoomImg(resultUrl)} />
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button onClick={() => downloadImage(resultUrl)} className="flex-1 rounded-xl gap-2">
                    <Download className="w-4 h-4" /> 保存图片
                  </Button>
                  <Button variant="outline" onClick={() => setResultUrl(null)} className="flex-1 rounded-xl gap-2">
                    <RefreshCw className="w-4 h-4" /> 再次修图
                  </Button>
                </div>
              </div>
            )}
          </>
        )}

        {/* 艺术画室 */}
        {mode === "art" && (
          <>
            <ImageUploader
              onUpload={setImageUrl}
              onClear={reset}
              imageUrl={imageUrl}
              label="点击上传要转换风格的照片"
            />

            {imageUrl && !resultUrl && (
              <>
                <div>
                  <p className="font-semibold text-stone-700 mb-3">🎨 选择艺术风格</p>
                  <div className="flex flex-wrap gap-2">
                    {ART_STYLES.map((s) => (
                      <button
                        key={s}
                        onClick={() => setArtStyle(s)}
                        className={`px-4 py-2 rounded-full border-2 font-medium text-sm transition-all ${
                          artStyle === s
                            ? "bg-purple-600 border-purple-600 text-white"
                            : "bg-white border-stone-200 text-stone-700 hover:border-purple-300"
                        }`}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
                <Button onClick={handleArt} className="w-full rounded-xl py-3 text-base bg-purple-600 hover:bg-purple-700">
                  <Palette className="w-5 h-5 mr-2" /> 开始艺术创作
                </Button>
              </>
            )}

            {resultUrl && (
              <div className="space-y-3">
                <p className="font-semibold text-stone-700 text-center">🎨 艺术创作完成！</p>
                <img src={resultUrl} className="w-full rounded-2xl cursor-pointer shadow-lg" onClick={() => setZoomImg(resultUrl)} />
                <div className="flex gap-2">
                  <Button onClick={() => downloadImage(resultUrl)} className="flex-1 rounded-xl gap-2 bg-purple-600 hover:bg-purple-700">
                    <Download className="w-4 h-4" /> 保存作品
                  </Button>
                  <Button variant="outline" onClick={() => setResultUrl(null)} className="flex-1 rounded-xl gap-2">
                    <RefreshCw className="w-4 h-4" /> 换个风格
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
