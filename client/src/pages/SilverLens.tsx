import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { ModuleHeader } from "@/components/ModuleHeader";
import { ImageUploader } from "@/components/ImageUploader";
import { VoiceButton } from "@/components/VoiceButton";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Download, Sparkles, Palette, RotateCcw, Wand2, Sun, Sunset, Eye, UserRound, Aperture } from "lucide-react";
import { useLocation } from "wouter";
import { toast } from "sonner";

const ART_STYLES = [
  { id: "oil", label: "油画风格", icon: "🎨" },
  { id: "watercolor", label: "水彩画", icon: "🖌️" },
  { id: "sketch", label: "素描", icon: "✏️" },
  { id: "chinese", label: "国画", icon: "🏯" },
  { id: "cartoon", label: "卡通动漫", icon: "🎭" },
  { id: "retro", label: "复古怀旧", icon: "📷" },
];

const QUICK_ACTIONS = [
  { id: "remove_bg", label: "一键去路人", icon: Wand2, prompt: "去除照片背景中的其他路人，只保留主体人物，背景保持干净自然" },
  { id: "morning", label: "清晨阳光", icon: Sun, prompt: "添加温暖的清晨阳光效果，柔和的金色光线从侧面照射" },
  { id: "sunset", label: "日落余晖", icon: Sunset, prompt: "添加温暖的日落余晖效果，橙红色的暖色调光线" },
  { id: "clarity", label: "通透增强", icon: Eye, prompt: "增强照片通透感，提高清晰度和色彩饱和度，让画面更加明亮通透" },
  { id: "portrait", label: "人像精修", icon: UserRound, prompt: "人像精修：适度磨皮美白、提亮肤色、增强眼神光、优化面部光影" },
  { id: "bokeh", label: "背景虚化", icon: Aperture, prompt: "将背景进行自然虚化处理，突出主体人物，营造专业人像摄影效果" },
];

type ViewMode = "home" | "edit" | "art";

export default function SilverLens() {
  const [, setLocation] = useLocation();
  const [viewMode, setViewMode] = useState<ViewMode>("home");
  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [prompt, setPrompt] = useState("");
  const [selectedStyle, setSelectedStyle] = useState("oil");
  const [processingText, setProcessingText] = useState("");

  const restoreMut = trpc.silverLens.restore.useMutation({
    onSuccess: (d) => { setResultUrl(d.imageUrl); setProcessingText(""); toast.success("处理完成！"); },
    onError: (e) => { setProcessingText(""); toast.error(e.message); },
  });
  const restoreOldMut = trpc.silverLens.restoreOld.useMutation({
    onSuccess: (d) => { setResultUrl(d.imageUrl); setProcessingText(""); toast.success("修复完成！"); },
    onError: (e) => { setProcessingText(""); toast.error(e.message); },
  });
  const artMut = trpc.silverLens.artTransform.useMutation({
    onSuccess: (d) => { setResultUrl(d.imageUrl); setProcessingText(""); toast.success("转换完成！"); },
    onError: (e) => { setProcessingText(""); toast.error(e.message); },
  });

  const isLoading = restoreMut.isPending || restoreOldMut.isPending || artMut.isPending;

  const handleReset = () => {
    setImageBase64(null);
    setResultUrl(null);
    setPrompt("");
    setProcessingText("");
  };

  const handleImageSelected = (b64: string) => {
    setImageBase64(b64);
    setResultUrl(null);
  };

  const handleQuickAction = (action: typeof QUICK_ACTIONS[0]) => {
    if (!imageBase64) return;
    setProcessingText(`正在${action.label}...`);
    restoreMut.mutate({ imageBase64, prompt: action.prompt });
  };

  const handleCustomEnhance = () => {
    if (!imageBase64) return;
    setProcessingText("正在处理照片...");
    restoreMut.mutate({ imageBase64, prompt });
  };

  const handleRestoreOld = () => {
    if (!imageBase64) return;
    setProcessingText("正在修复老照片...");
    restoreOldMut.mutate({ imageBase64 });
  };

  const handleArtTransform = () => {
    if (!imageBase64) return;
    const styleName = ART_STYLES.find(s => s.id === selectedStyle)?.label || "油画";
    setProcessingText(`正在转换为${styleName}...`);
    artMut.mutate({ imageBase64, style: styleName });
  };

  // ─── Home: Mode Selection ───
  if (viewMode === "home") {
    return (
      <div className="min-h-screen bg-background">
        <ModuleHeader title="老摄影大师" icon="📸" onBack={() => setLocation("/")} />
        <div className="container py-6 space-y-4">
          <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => setViewMode("edit")}>
            <CardContent className="pt-6 pb-6 flex items-center gap-4">
              <div className="w-16 h-16 rounded-2xl bg-amber-100 flex items-center justify-center text-3xl shrink-0">
                📷
              </div>
              <div>
                <h3 className="font-semibold text-lg">智能修图 & 美化</h3>
                <p className="text-sm text-muted-foreground mt-1">照片美化、老照片修复上色、一键去路人、人像精修等</p>
              </div>
            </CardContent>
          </Card>

          <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => setViewMode("art")}>
            <CardContent className="pt-6 pb-6 flex items-center gap-4">
              <div className="w-16 h-16 rounded-2xl bg-purple-100 flex items-center justify-center text-3xl shrink-0">
                🎨
              </div>
              <div>
                <h3 className="font-semibold text-lg">艺术画室</h3>
                <p className="text-sm text-muted-foreground mt-1">将照片转换为油画、水彩、素描、国画等艺术风格</p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  // ─── Edit Mode: Photo Enhancement ───
  if (viewMode === "edit") {
    return (
      <div className="min-h-screen bg-background">
        <ModuleHeader title="智能修图" icon="📷" onBack={() => { handleReset(); setViewMode("home"); }} />
        <div className="container py-6 space-y-4">
          {/* Upload Area */}
          <ImageUploader
            onImageSelected={handleImageSelected}
            currentImage={imageBase64}
            onClear={handleReset}
          />

          {/* Editing Panel - shows after upload */}
          {imageBase64 && !isLoading && !resultUrl && (
            <div className="space-y-4 animate-fade-in">
              {/* Quick Actions */}
              <Card>
                <CardContent className="pt-4">
                  <p className="text-sm font-medium mb-3">快捷操作</p>
                  <div className="grid grid-cols-3 gap-2">
                    {QUICK_ACTIONS.map(action => (
                      <Button
                        key={action.id}
                        variant="outline"
                        size="sm"
                        onClick={() => handleQuickAction(action)}
                        className="h-auto py-3 flex-col gap-1"
                      >
                        <action.icon className="w-5 h-5" />
                        <span className="text-xs">{action.label}</span>
                      </Button>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* Old Photo Restore */}
              <Button variant="outline" className="w-full h-12" onClick={handleRestoreOld}>
                <RotateCcw className="w-4 h-4 mr-2" /> 老照片修复上色
              </Button>

              {/* Custom Prompt */}
              <Card>
                <CardContent className="pt-4 space-y-3">
                  <p className="text-sm font-medium">自定义效果</p>
                  <div className="flex gap-2">
                    <Textarea
                      placeholder="描述您想要的效果，如：提亮肤色、增加暖色调、去除皱纹..."
                      value={prompt}
                      onChange={e => setPrompt(e.target.value)}
                      rows={2}
                      className="flex-1"
                    />
                    <VoiceButton onResult={text => setPrompt(prev => prev + text)} className="shrink-0" />
                  </div>
                  <Button className="w-full" onClick={handleCustomEnhance} disabled={!prompt.trim()}>
                    <Sparkles className="w-4 h-4 mr-2" /> 开始处理
                  </Button>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Loading State */}
          {isLoading && (
            <Card className="animate-fade-in">
              <CardContent className="py-8 text-center">
                <Loader2 className="w-10 h-10 animate-spin mx-auto mb-3 text-primary" />
                <p className="font-medium">{processingText || "AI正在处理您的照片..."}</p>
                <p className="text-xs text-muted-foreground mt-1">处理时间约10-20秒，请耐心等待</p>
              </CardContent>
            </Card>
          )}

          {/* Result */}
          {resultUrl && (
            <Card className="animate-slide-up">
              <CardContent className="pt-4 space-y-3">
                <p className="text-sm font-medium text-center">处理结果</p>
                <img src={resultUrl} alt="处理结果" className="w-full rounded-xl" />
                <div className="flex gap-2">
                  <Button variant="outline" className="flex-1" asChild>
                    <a href={resultUrl} download="lejoy-photo.png" target="_blank">
                      <Download className="w-4 h-4 mr-1" /> 保存图片
                    </a>
                  </Button>
                  <Button variant="outline" className="flex-1" onClick={() => setResultUrl(null)}>
                    继续编辑
                  </Button>
                  <Button variant="outline" className="flex-1" onClick={handleReset}>
                    换张照片
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    );
  }

  // ─── Art Mode: Style Transfer ───
  return (
    <div className="min-h-screen bg-background">
      <ModuleHeader title="艺术画室" icon="🎨" onBack={() => { handleReset(); setViewMode("home"); }} />
      <div className="container py-6 space-y-4">
        <ImageUploader
          onImageSelected={handleImageSelected}
          currentImage={imageBase64}
          onClear={handleReset}
        />

        {imageBase64 && !isLoading && !resultUrl && (
          <div className="space-y-4 animate-fade-in">
            <Card>
              <CardContent className="pt-4">
                <p className="text-sm font-medium mb-3">选择艺术风格</p>
                <div className="grid grid-cols-3 gap-2">
                  {ART_STYLES.map(s => (
                    <Button
                      key={s.id}
                      variant={selectedStyle === s.id ? "default" : "outline"}
                      size="sm"
                      onClick={() => setSelectedStyle(s.id)}
                      className="h-auto py-3 flex-col gap-1"
                    >
                      <span className="text-lg">{s.icon}</span>
                      <span className="text-xs">{s.label}</span>
                    </Button>
                  ))}
                </div>
              </CardContent>
            </Card>
            <Button className="w-full" onClick={handleArtTransform}>
              <Palette className="w-4 h-4 mr-2" /> 开始转换
            </Button>
          </div>
        )}

        {isLoading && (
          <Card className="animate-fade-in">
            <CardContent className="py-8 text-center">
              <Loader2 className="w-10 h-10 animate-spin mx-auto mb-3 text-primary" />
              <p className="font-medium">{processingText || "正在转换艺术风格..."}</p>
              <p className="text-xs text-muted-foreground mt-1">处理时间约10-20秒，请耐心等待</p>
            </CardContent>
          </Card>
        )}

        {resultUrl && (
          <Card className="animate-slide-up">
            <CardContent className="pt-4 space-y-3">
              <p className="text-sm font-medium text-center">艺术作品</p>
              <img src={resultUrl} alt="艺术作品" className="w-full rounded-xl" />
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" asChild>
                  <a href={resultUrl} download="lejoy-art.png" target="_blank">
                    <Download className="w-4 h-4 mr-1" /> 保存作品
                  </a>
                </Button>
                <Button variant="outline" className="flex-1" onClick={() => setResultUrl(null)}>
                  换个风格
                </Button>
                <Button variant="outline" className="flex-1" onClick={handleReset}>
                  换张照片
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
