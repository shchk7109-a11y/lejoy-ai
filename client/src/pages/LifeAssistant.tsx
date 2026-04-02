import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { ModuleHeader } from "@/components/ModuleHeader";
import { ImageUploader } from "@/components/ImageUploader";
import { VoiceButton } from "@/components/VoiceButton";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Loader2, Search, Flower2, AlertTriangle, Leaf } from "lucide-react";
import { useLocation } from "wouter";
import { toast } from "sonner";

type AnalysisResult = {
  title?: string;
  description?: string;
  scientificName?: string;
  family?: string;
  flowerLanguage?: string;
  culturalMeaning?: string;
  details?: string[];
  tags?: string[];
  healthyScore?: number;
  nutrition?: Record<string, string>;
  chronicDiseaseWarnings?: Array<{ disease: string; level: string; reason: string }>;
  advice?: string;
  ingredients?: string[];
  imageUrl?: string;
};

const TABS = [
  { id: "FOOD" as const, label: "查菜谱", icon: "\u{1F372}" },
  { id: "HEALTH" as const, label: "美食健康指数", icon: "\u{1F4CA}" },
  { id: "PLANT" as const, label: "识花草", icon: "\u{1F33F}" },
];

const NUTRITION_LABELS: Record<string, string> = {
  calories: "热量", protein: "蛋白质", fat: "脂肪",
  carbs: "碳水", sodium: "钠含量", sugar: "糖分",
  fiber: "膳食纤维", cholesterol: "胆固醇",
};

const NUTRITION_ICONS: Record<string, string> = {
  calories: "\u{1F525}", protein: "\u{1F95A}", fat: "\u{1F951}",
  carbs: "\u{1F35E}", sodium: "\u{1F9C2}", sugar: "\u{1F36C}",
  fiber: "\u{1F96C}", cholesterol: "\u{1FAC0}",
};

const NUTRITION_COLORS: Record<string, string> = {
  calories: "bg-red-50 border-red-100",
  protein: "bg-green-50 border-green-100",
  fat: "bg-yellow-50 border-yellow-100",
  carbs: "bg-orange-50 border-orange-100",
  sodium: "bg-blue-50 border-blue-100",
  sugar: "bg-pink-50 border-pink-100",
};

export default function LifeAssistant() {
  const [, setLocation] = useLocation();
  const [mode, setMode] = useState<"PLANT" | "FOOD" | "HEALTH">("FOOD");
  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const [textHint, setTextHint] = useState("");
  const [result, setResult] = useState<AnalysisResult | null>(null);

  const analyzeMut = trpc.lifeAssistant.analyze.useMutation({
    onSuccess: (d) => { setResult(d.result as AnalysisResult); toast.success("分析完成！"); },
    onError: (e) => toast.error(e.message),
  });

  const handleAnalyze = () => {
    if (!imageBase64 && !textHint.trim()) {
      toast.error(mode === "PLANT" ? "请上传花草照片或输入名称" : mode === "FOOD" ? "请输入菜名或上传菜品照片" : "请输入食品名称或上传照片");
      return;
    }
    analyzeMut.mutate({ mode, textHint: textHint || undefined, imageBase64: imageBase64 || undefined });
  };

  const handleReset = () => { setImageBase64(null); setTextHint(""); setResult(null); };

  const scoreColor = (score: number) => {
    if (score >= 80) return "text-green-600";
    if (score >= 60) return "text-amber-600";
    return "text-red-600";
  };

  const scoreBg = (score: number) => {
    if (score >= 80) return "from-green-50 to-green-100 border-green-200";
    if (score >= 60) return "from-amber-50 to-amber-100 border-amber-200";
    return "from-red-50 to-red-100 border-red-200";
  };

  const levelColor = (level: string) => {
    if (level.includes("推荐") || level.includes("可以")) return "bg-green-100 text-green-700 border-green-200";
    if (level.includes("适量")) return "bg-amber-100 text-amber-700 border-amber-200";
    return "bg-red-100 text-red-700 border-red-200";
  };

  // Render result based on mode
  const renderFoodResult = () => {
    if (!result) return null;
    return (
      <div className="space-y-4 animate-slide-up">
        {/* Image */}
        {(imageBase64 || result.imageUrl) && (
          <div className="rounded-2xl overflow-hidden shadow-md">
            <img
              src={imageBase64 || result.imageUrl}
              alt={result.title}
              className="w-full aspect-[16/10] object-cover"
              onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
            />
          </div>
        )}

        {/* Title */}
        <Card>
          <CardContent className="pt-4">
            <h2 className="text-xl font-bold">{result.title || "菜谱"}</h2>
            {result.tags && result.tags.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {result.tags.map((tag, i) => (
                  <Badge key={i} variant="secondary" className="text-xs">#{tag}</Badge>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Description */}
        {result.description && (
          <Card>
            <CardContent className="pt-4">
              <p className="text-sm font-semibold mb-2">{"\u{1F4DD}"} 菜品介绍</p>
              <p className="text-sm leading-relaxed text-muted-foreground">{result.description}</p>
            </CardContent>
          </Card>
        )}

        {/* Ingredients with quantities */}
        {result.ingredients && result.ingredients.length > 0 && (
          <Card>
            <CardContent className="pt-4">
              <p className="text-sm font-semibold mb-3">{"\u{1F9D1}\u200D\u{1F373}"} 所需原料</p>
              <div className="grid grid-cols-2 gap-2">
                {result.ingredients.map((ing, i) => (
                  <div key={i} className="flex items-center gap-2 p-2 rounded-lg bg-orange-50 border border-orange-100">
                    <span className="text-orange-500 text-sm">{"\u{2022}"}</span>
                    <span className="text-sm">{ing}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Cooking Steps */}
        {result.details && result.details.length > 0 && (
          <Card>
            <CardContent className="pt-4">
              <p className="text-sm font-semibold mb-3">{"\u{1F468}\u200D\u{1F373}"} 烹饪步骤</p>
              <ol className="space-y-3">
                {result.details.map((d, i) => (
                  <li key={i} className="flex gap-3">
                    <span className="shrink-0 w-6 h-6 bg-primary/10 text-primary rounded-full flex items-center justify-center text-xs font-bold">{i + 1}</span>
                    <span className="text-sm leading-relaxed">{d}</span>
                  </li>
                ))}
              </ol>
            </CardContent>
          </Card>
        )}

        {/* Cooking Tips */}
        {result.advice && (
          <Card className="border-green-200 bg-green-50/50">
            <CardContent className="pt-4">
              <p className="text-sm font-semibold text-green-700 mb-1">{"\u{1F4A1}"} 烹饪小贴士</p>
              <p className="text-sm text-green-600 leading-relaxed">{result.advice}</p>
            </CardContent>
          </Card>
        )}
      </div>
    );
  };

  const renderHealthResult = () => {
    if (!result) return null;
    return (
      <div className="space-y-4 animate-slide-up">
        {/* Image */}
        {(imageBase64 || result.imageUrl) && (
          <div className="rounded-2xl overflow-hidden shadow-md">
            <img
              src={imageBase64 || result.imageUrl}
              alt={result.title}
              className="w-full aspect-[16/10] object-cover"
              onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
            />
          </div>
        )}

        {/* Title + Score */}
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <h2 className="text-xl font-bold">{result.title || "分析结果"}</h2>
                {result.tags && result.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {result.tags.map((tag, i) => (
                      <Badge key={i} variant="secondary" className="text-xs">#{tag}</Badge>
                    ))}
                  </div>
                )}
              </div>
              {result.healthyScore !== undefined && (
                <div className={`text-center px-3 py-1 rounded-xl bg-gradient-to-b border ${scoreBg(result.healthyScore)}`}>
                  <p className={`text-3xl font-bold ${scoreColor(result.healthyScore)}`}>{result.healthyScore}</p>
                  <p className="text-xs text-muted-foreground">健康指数</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Description */}
        {result.description && (
          <Card>
            <CardContent className="pt-4">
              <p className="text-sm font-semibold mb-2">{"\u{1F4DD}"} 营养概述</p>
              <p className="text-sm leading-relaxed text-muted-foreground">{result.description}</p>
            </CardContent>
          </Card>
        )}

        {/* Nutrition Grid */}
        {result.nutrition && Object.keys(result.nutrition).length > 0 && (
          <div className="grid grid-cols-2 gap-2">
            {Object.entries(result.nutrition).map(([key, val]) => {
              const label = NUTRITION_LABELS[key] || key;
              const icon = NUTRITION_ICONS[key] || "\u{1F4CB}";
              const bg = NUTRITION_COLORS[key] || "bg-gray-50 border-gray-100";
              return (
                <div key={key} className={`text-center p-3 rounded-xl border ${bg}`}>
                  <p className="text-xs text-muted-foreground">{icon} {label}</p>
                  <p className="text-lg font-bold mt-1">{val}</p>
                </div>
              );
            })}
          </div>
        )}

        {/* Details */}
        {result.details && result.details.length > 0 && (
          <Card>
            <CardContent className="pt-4">
              <p className="text-sm font-semibold mb-3">{"\u{1F4CB}"} 详细分析</p>
              <ol className="space-y-3">
                {result.details.map((d, i) => (
                  <li key={i} className="flex gap-3">
                    <span className="shrink-0 w-6 h-6 bg-primary/10 text-primary rounded-full flex items-center justify-center text-xs font-bold">{i + 1}</span>
                    <span className="text-sm leading-relaxed">{d}</span>
                  </li>
                ))}
              </ol>
            </CardContent>
          </Card>
        )}

        {/* Chronic Disease Warnings */}
        {result.chronicDiseaseWarnings && result.chronicDiseaseWarnings.length > 0 && (
          <Card className="border-amber-200">
            <CardContent className="pt-4">
              <p className="text-sm font-semibold mb-3 flex items-center gap-1">
                <AlertTriangle className="w-4 h-4 text-amber-500" /> 慢病风险提示
              </p>
              <div className="space-y-2">
                {result.chronicDiseaseWarnings.map((w, i) => (
                  <div key={i} className="flex items-start gap-2 p-2.5 rounded-lg bg-muted/50">
                    <Badge variant="outline" className={`shrink-0 text-xs ${levelColor(w.level)}`}>
                      {w.level}
                    </Badge>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">{w.disease}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{w.reason}</p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Advice */}
        {result.advice && (
          <Card className="border-green-200 bg-green-50/50">
            <CardContent className="pt-4">
              <p className="text-sm font-semibold text-green-700 mb-1">{"\u{1F468}\u200D\u2695\uFE0F"} 专家健康建议</p>
              <p className="text-sm text-green-600 leading-relaxed">{result.advice}</p>
            </CardContent>
          </Card>
        )}
      </div>
    );
  };

  const renderPlantResult = () => {
    if (!result) return null;
    return (
      <div className="space-y-4 animate-slide-up">
        {/* Image */}
        {imageBase64 && (
          <div className="rounded-2xl overflow-hidden shadow-md">
            <img src={imageBase64} alt={result.title} className="w-full aspect-[16/10] object-cover" />
          </div>
        )}

        {/* Title */}
        <Card>
          <CardContent className="pt-4">
            <h2 className="text-xl font-bold">{result.title || "识别结果"}</h2>
            {result.scientificName && (
              <p className="text-sm text-muted-foreground mt-0.5">{result.scientificName}</p>
            )}
            {result.family && (
              <p className="text-xs text-muted-foreground">科属：{result.family}</p>
            )}
            {result.tags && result.tags.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {result.tags.map((tag, i) => (
                  <Badge key={i} variant="secondary" className="text-xs">#{tag}</Badge>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Description */}
        {result.description && (
          <Card>
            <CardContent className="pt-4">
              <p className="text-sm font-semibold mb-2">{"\u{1F4DD}"} 植物简介</p>
              <p className="text-sm leading-relaxed text-muted-foreground">{result.description}</p>
            </CardContent>
          </Card>
        )}

        {/* Flower Language */}
        {result.flowerLanguage && (
          <Card className="border-pink-200 bg-pink-50/50">
            <CardContent className="pt-4">
              <p className="text-sm font-semibold text-pink-700 mb-1 flex items-center gap-1">
                <Flower2 className="w-4 h-4" /> 花语与寓意
              </p>
              <p className="text-sm text-pink-600 leading-relaxed">{result.flowerLanguage}</p>
            </CardContent>
          </Card>
        )}

        {result.culturalMeaning && (
          <Card className="border-purple-200 bg-purple-50/50">
            <CardContent className="pt-4">
              <p className="text-sm font-semibold text-purple-700 mb-1 flex items-center gap-1">
                <Leaf className="w-4 h-4" /> 文化含义
              </p>
              <p className="text-sm text-purple-600 leading-relaxed">{result.culturalMeaning}</p>
            </CardContent>
          </Card>
        )}

        {/* Care Tips */}
        {result.details && result.details.length > 0 && (
          <Card>
            <CardContent className="pt-4">
              <p className="text-sm font-semibold mb-3">{"\u{1F331}"} 养护要点</p>
              <ol className="space-y-3">
                {result.details.map((d, i) => (
                  <li key={i} className="flex gap-3">
                    <span className="shrink-0 w-6 h-6 bg-primary/10 text-primary rounded-full flex items-center justify-center text-xs font-bold">{i + 1}</span>
                    <span className="text-sm leading-relaxed">{d}</span>
                  </li>
                ))}
              </ol>
            </CardContent>
          </Card>
        )}

        {/* Advice */}
        {result.advice && (
          <Card className="border-green-200 bg-green-50/50">
            <CardContent className="pt-4">
              <p className="text-sm font-semibold text-green-700 mb-1">{"\u{1F33F}"} 养护建议</p>
              <p className="text-sm text-green-600 leading-relaxed">{result.advice}</p>
            </CardContent>
          </Card>
        )}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-background">
      <ModuleHeader title="乐龄生活助手" icon={"\u{1F33F}"} onBack={() => setLocation("/")} />

      <div className="container py-6 space-y-4">
        {/* Tab Selection */}
        <div className="grid grid-cols-3 gap-2">
          {TABS.map(tab => (
            <Button
              key={tab.id}
              variant={mode === tab.id ? "default" : "outline"}
              size="sm"
              onClick={() => { setMode(tab.id); handleReset(); }}
              className="h-auto py-2.5 gap-1.5"
            >
              <span>{tab.icon}</span>
              <span className="text-xs">{tab.label}</span>
            </Button>
          ))}
        </div>

        {/* Image Upload */}
        <ImageUploader
          onImageSelected={(b64) => { setImageBase64(b64); setResult(null); }}
          currentImage={imageBase64}
          onClear={() => { setImageBase64(null); setResult(null); }}
        />

        {/* Text Input */}
        <div className="flex gap-2">
          <Input
            value={textHint}
            onChange={e => setTextHint(e.target.value)}
            placeholder={
              mode === "PLANT" ? "输入花名或描述特征..." :
              mode === "FOOD" ? "输入菜名，如：椒烧鲈鱼..." :
              "输入食品名称，如：红烧肉..."
            }
            className="flex-1"
            onKeyDown={e => { if (e.key === "Enter") handleAnalyze(); }}
          />
          <VoiceButton onResult={setTextHint} />
        </div>

        {/* Analyze Button */}
        <Button className="w-full h-12 text-base" onClick={handleAnalyze} disabled={analyzeMut.isPending}>
          {analyzeMut.isPending ? (
            <><Loader2 className="w-5 h-5 mr-2 animate-spin" /> 正在分析中...</>
          ) : (
            <><Search className="w-5 h-5 mr-2" />
              {mode === "PLANT" ? "开始识别" : mode === "FOOD" ? "查询菜谱" : "分析健康指数"}
            </>
          )}
        </Button>

        {/* Mode-specific Result Display */}
        {result && (
          <>
            {mode === "FOOD" && renderFoodResult()}
            {mode === "HEALTH" && renderHealthResult()}
            {mode === "PLANT" && renderPlantResult()}

            {/* Continue Button */}
            <Button variant="outline" className="w-full h-11" onClick={handleReset}>
              <Search className="w-4 h-4 mr-2" /> 查下一个
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
