import { useState } from "react";
import { ArrowLeft, Search, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import VoiceInput from "@/components/VoiceInput";
import InsufficientCreditsModal from "@/components/InsufficientCreditsModal";

type Mode = "FOOD" | "HEALTH";

const MODES: { id: Mode; icon: string; label: string; desc: string; color: string; btnColor: string }[] = [
  { id: "FOOD", icon: "📊", label: "美食健康指数", desc: "输入菜名或抖音美食链接，AI分析营养成分、健康评分和注意事项", color: "bg-orange-50 border-orange-200", btnColor: "bg-orange-500 hover:bg-orange-600" },
  { id: "HEALTH", icon: "💊", label: "健康百科", desc: "查询健康知识，了解症状与保健", color: "bg-blue-50 border-blue-200", btnColor: "bg-blue-600 hover:bg-blue-700" },
];

interface AnalysisResult {
  title?: string;
  description?: string;
  ingredients?: string[];
  details?: string[];
  tags?: string[];
  healthyScore?: number;
  nutrition?: { calories?: string; protein?: string; fat?: string; carbs?: string; sodium?: string; sugar?: string };
  advice?: string;
  generatedImageUrl?: string;
}

// 检测是否为抖音/短视频链接
function isVideoLink(text: string): boolean {
  return /https?:\/\/(v\.douyin\.com|www\.douyin\.com|douyin\.com|vm\.tiktok\.com|www\.tiktok\.com)/i.test(text);
}

/**
 * 从抖音分享文本中智能提取菜名
 */
function extractFoodName(text: string): string {
  // 1. 优先提取【】括号内的内容（常见格式）
  const bracketMatch = text.match(/【([^】]+)】/);
  if (bracketMatch) {
    return bracketMatch[1]
      .replace(/的做法|怎么做|教程|食谱|做法|配方|秘方|家常做法/g, "")
      .trim();
  }

  // 2. 去掉开头的数字、英文乱码、链接和常见提示语，获取纯中文内容
  const cleanText = text
    .replace(/https?:\/\/\S+/g, "")
    .replace(/复制此链接.*/g, "")
    .replace(/复制打开Dou音.*/g, "")
    .replace(/复制打开抖音.*/g, "")
    .replace(/^[\d\.]+\s*/g, "")
    .replace(/^[A-Za-z@\.\/:0-9\s]+/g, "")
    .trim();

  // 3. 取第一个逗号前的内容作为菜名
  const firstPhrase = cleanText.split(/[，！？。,!?]/)[0].trim();
  if (firstPhrase.length >= 2 && firstPhrase.length <= 12) {
    return firstPhrase;
  }

  // 4. 提取 #标签 中的菜名
  const hashMatches = text.match(/#\s*([\u4e00-\u9fa5]{2,10})/g);
  if (hashMatches) {
    const skipWords = /美食|视频|推荐|分享|生活|日常|教程|厨房|烹饪|家常菜|谁懂|好吃|程度/;
    const foodTag = hashMatches
      .map(t => t.replace(/^#\s*/, ""))
      .find(t => !skipWords.test(t));
    if (foodTag) return foodTag;
  }

  if (cleanText.length >= 2) return cleanText.slice(0, 10);
  return "";
}

export default function LifeAssistant() {
  const [mode, setMode] = useState<Mode | null>(null);
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [showCreditsModal, setShowCreditsModal] = useState(false);
  const [showLinkHint, setShowLinkHint] = useState(false);

  const { data: creditsData } = trpc.credits.balance.useQuery();
  const analyzeMutation = trpc.lifeAssistant.analyze.useMutation({
    onSuccess: (data: AnalysisResult) => setResult(data),
    onError: (err: { message: string }) => {
      if (err.message.includes("积分不足")) {
        setShowCreditsModal(true);
      } else if (
        err.message.includes("繁忙") ||
        err.message.includes("429") ||
        err.message.includes("TOO_MANY_REQUESTS") ||
        err.message.includes("Rate limit")
      ) {
        toast.error("🙏 AI服务繁忙，请稍等1-2分钟后再试", { duration: 5000 });
      } else {
        toast.error(err.message || "AI分析失败，请稍后重试");
      }
    },
  });

  const handleQuery = (overrideQuery?: string) => {
    if (!mode) return;
    const q = overrideQuery ?? query;
    if (mode === "FOOD") {
      if (!q.trim()) return toast.error("请输入菜名或粘贴抖音链接");
      if (isVideoLink(q)) {
        const foodName = extractFoodName(q);
        if (foodName) {
          setQuery(foodName);
          toast.success(`检测到菜名「${foodName}」，正在分析...`, { duration: 3000 });
          analyzeMutation.mutate({ mode, textHint: foodName });
        } else {
          setShowLinkHint(true);
          toast("未能自动识别菜名，请手动输入菜名", { duration: 4000 });
        }
        return;
      }
    }
    if (mode === "HEALTH" && !q.trim()) return toast.error("请输入查询内容");
    analyzeMutation.mutate({ mode, textHint: q || undefined });
  };

  const reset = () => {
    setResult(null);
    setQuery("");
    setShowLinkHint(false);
  };

  const currentMode = MODES.find((m) => m.id === mode);

  return (
    <div className="min-h-screen bg-stone-50 pb-20">
      <InsufficientCreditsModal
        isOpen={showCreditsModal}
        onClose={() => setShowCreditsModal(false)}
        currentCredits={creditsData?.credits}
        requiredCredits={1}
      />

      <header className="bg-white px-4 py-4 flex items-center justify-between shadow-sm sticky top-0 z-10">
        <button
          onClick={() => { if (mode) { setMode(null); reset(); } else window.history.back(); }}
          className="flex items-center gap-1 text-stone-600 font-medium"
        >
          <ArrowLeft className="w-5 h-5" /> {mode ? "换个功能" : "返回"}
        </button>
        <h1 className="text-lg font-bold font-serif text-stone-800">🌿 生活助手</h1>
        <div className="w-16" />
      </header>

      <div className="max-w-lg mx-auto px-4 py-5 space-y-5">
        {/* 模式选择 */}
        {!mode && (
          <>
            <p className="text-stone-500 text-center text-sm">选择您需要的生活帮助</p>
            <div className="space-y-3">
              {MODES.map((m) => (
                <button
                  key={m.id}
                  onClick={() => setMode(m.id)}
                  className={`w-full border-2 rounded-2xl p-4 text-left flex items-center gap-4 hover:scale-[1.01] active:scale-[0.99] transition-all ${m.color}`}
                >
                  <span className="text-4xl">{m.icon}</span>
                  <div>
                    <p className="font-bold text-lg text-stone-800">{m.label}</p>
                    <p className="text-sm text-stone-500 mt-0.5">{m.desc}</p>
                    <p className="text-xs text-stone-400 mt-1">消耗 1 积分</p>
                  </div>
                </button>
              ))}
            </div>
          </>
        )}

        {/* 查询界面 */}
        {mode && !result && (
          <>
            <div className={`border rounded-2xl p-3 text-center ${currentMode?.color}`}>
              <p className="text-stone-600 text-sm">
                {mode === "FOOD" && "📊 输入菜名，AI分析营养成分、健康评分和中老年注意事项（在抖音看到的菜，粘贴链接后输入菜名即可）"}
                {mode === "HEALTH" && "💊 查询健康知识，了解症状与日常保健方法"}
              </p>
            </div>

            {/* 文字输入 */}
            <div>
              <p className="font-semibold text-stone-700 mb-2">
                {mode === "FOOD" ? "🍽️ 请输入菜名" : "请输入健康问题"}
              </p>
              <div className="flex gap-2">
                {mode === "HEALTH" ? (
                  <Textarea
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="例如：血压偏高怎么办？膝盖疼痛是什么原因？老年人如何补钙？"
                    className="flex-1 rounded-xl text-base resize-none"
                    rows={3}
                  />
                ) : (
                  <Input
                    value={query}
                    onChange={(e) => {
                      const val = e.target.value;
                      setQuery(val);
                      if (isVideoLink(val)) {
                        const foodName = extractFoodName(val);
                        if (foodName) {
                          setQuery(foodName);
                          setShowLinkHint(false);
                          toast.success(`检测到菜名「${foodName}」，正在分析...`, { duration: 3000 });
                          analyzeMutation.mutate({ mode: "FOOD", textHint: foodName });
                        } else {
                          setShowLinkHint(true);
                        }
                      } else {
                        setShowLinkHint(false);
                      }
                    }}
                    placeholder="输入菜名或粘贴抖音分享链接..."
                    className="flex-1 rounded-xl text-base"
                    onKeyDown={(e) => e.key === "Enter" && handleQuery()}
                  />
                )}
                <VoiceInput onResult={(t) => setQuery((q) => q + t)} />
              </div>
              {/* 抖音链接提示 */}
              {mode === "FOOD" && showLinkHint && (
                <div className="mt-2 bg-amber-50 border border-amber-200 rounded-xl p-3">
                  <p className="text-sm text-amber-700 font-medium">💡 检测到抖音链接</p>
                  <p className="text-xs text-amber-600 mt-1">请在下方输入您看到的菜名，例如"椒烧鲈鱼"，AI将直接分析该菜的营养和健康指数</p>
                  <Input
                    className="mt-2 rounded-xl text-base"
                    placeholder="输入您在抖音上看到的菜名..."
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && e.currentTarget.value.trim()) {
                        const foodName = e.currentTarget.value.trim();
                        setQuery(foodName);
                        setShowLinkHint(false);
                        analyzeMutation.mutate({ mode: "FOOD", textHint: foodName });
                      }
                    }}
                    onChange={(e) => {
                      if (e.target.value.trim()) setShowLinkHint(false);
                    }}
                  />
                  <p className="text-xs text-amber-500 mt-1">输入菜名后按回车即可分析</p>
                </div>
              )}
            </div>

            <Button
              onClick={() => handleQuery()}
              disabled={analyzeMutation.isPending || (mode === "FOOD" && !query.trim()) || (mode === "HEALTH" && !query.trim())}
              className={`w-full rounded-xl py-3 text-base gap-2 text-white ${currentMode?.btnColor}`}
            >
              {analyzeMutation.isPending ? (
                <><Loader2 className="w-5 h-5 animate-spin" /> 分析中...</>
              ) : (
                <><Search className="w-5 h-5" />
                  {mode === "FOOD" ? "分析美食健康指数" : "查询健康知识"}（消耗1积分）
                </>
              )}
            </Button>
          </>
        )}

        {/* 结果展示 */}
        {result && (
          <div className="space-y-4 animate-fade-in">
            <div className="flex items-center justify-between">
              <p className="font-semibold text-stone-700">✅ 分析结果</p>
              <button onClick={reset} className="text-sm text-stone-500 underline">重新查询</button>
            </div>

            {/* 生成的图片 */}
            {result.generatedImageUrl && (
              <img src={result.generatedImageUrl} className="w-full rounded-2xl shadow-sm" alt={result.title} />
            )}

            <div className="bg-white border border-stone-200 rounded-2xl p-4 space-y-3">
              {result.title && <h3 className="text-lg font-bold text-stone-800">{result.title}</h3>}
              {result.description && <p className="text-stone-600 text-sm leading-relaxed">{result.description}</p>}

              {/* 标签 */}
              {result.tags && result.tags.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {result.tags.map((tag, i) => (
                    <span key={i} className="bg-stone-100 text-stone-600 text-xs px-2 py-1 rounded-full">{tag}</span>
                  ))}
                </div>
              )}

              {/* 健康评分 */}
              {result.healthyScore !== undefined && (
                <div className="flex items-center gap-2">
                  <span className="text-sm text-stone-500">健康评分：</span>
                  <div className="flex gap-1">
                    {[1, 2, 3, 4, 5].map((s) => (
                      <div key={s} className={`w-4 h-4 rounded-full ${s <= Math.round(result.healthyScore! / 20) ? "bg-green-500" : "bg-stone-200"}`} />
                    ))}
                  </div>
                  <span className="text-sm font-bold text-green-600">{result.healthyScore}/100</span>
                </div>
              )}

              {/* 食材列表 */}
              {result.ingredients && result.ingredients.length > 0 && (
                <div>
                  <p className="font-semibold text-stone-700 mb-1.5 text-sm">{mode === "FOOD" ? "主要食材" : "所需食材"}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {result.ingredients.map((ing, i) => (
                      <span key={i} className="bg-orange-50 border border-orange-200 text-orange-700 text-xs px-2 py-1 rounded-full">{ing}</span>
                    ))}
                  </div>
                </div>
              )}

              {/* 详细信息 */}
              {result.details && result.details.length > 0 && (
                <div>
                  <p className="font-semibold text-stone-700 mb-2 text-sm">
                    {mode === "FOOD" ? "主要食材营养" : "详细信息"}
                  </p>
                  <ol className="space-y-2">
                    {result.details.map((step, i) => (
                      <li key={i} className="flex gap-2 text-sm text-stone-600">
                        {mode !== "FOOD" && <span className="w-5 h-5 bg-orange-100 text-orange-700 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5">{i + 1}</span>}
                        <span className="leading-relaxed">{step}</span>
                      </li>
                    ))}
                  </ol>
                </div>
              )}

              {/* 营养信息 */}
              {result.nutrition && (
                <div>
                  <p className="font-semibold text-stone-700 mb-2 text-sm">营养成分</p>
                  <div className="grid grid-cols-2 gap-2">
                    {Object.entries(result.nutrition).map(([key, val]) => (
                      <div key={key} className="bg-blue-50 rounded-xl p-2 text-center">
                        <p className="text-xs text-stone-500">{key === "calories" ? "热量" : key === "protein" ? "蛋白质" : key === "fat" ? "脂肪" : key === "carbs" ? "碳水" : key === "sodium" ? "钠含量" : key === "sugar" ? "糖分" : key}</p>
                        <p className="font-bold text-blue-700 text-sm">{val}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 健康建议 */}
              {result.advice && (
                <div className="bg-green-50 border border-green-200 rounded-xl p-3">
                  <p className="text-sm text-green-700 leading-relaxed">💡 {result.advice}</p>
                </div>
              )}
            </div>

            {mode === "HEALTH" && (
              <p className="text-xs text-stone-400 text-center">⚠️ 以上内容仅供参考，如有健康问题请及时就医</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
