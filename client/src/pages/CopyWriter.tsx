import { useState } from "react";
import { ArrowLeft, Copy, RefreshCw, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import VoiceInput from "@/components/VoiceInput";
import InsufficientCreditsModal from "@/components/InsufficientCreditsModal";

const SCENARIOS = ["节日祝福", "生日寿辰", "发朋友圈", "日常关怀", "安慰鼓励", "感谢致意", "思念问候", "长辈祝寿"];
const RELATIONSHIPS = ["朋友", "家人", "长辈", "晚辈", "伴侣", "同事"];
const TONES = ["温暖亲切", "幽默调侃", "文采飞扬", "诗歌赋词", "散文随笔", "人生感悟", "庄重得体"];
const HOLIDAYS = ["元旦", "春节", "元宵节", "清明节", "劳动节", "端午节", "七夕", "中秋节", "重阳节", "国庆节", "冬至", "圣诞节"];

export default function CopyWriter() {
  const [scenario, setScenario] = useState("节日祝福");
  const [relationship, setRelationship] = useState("朋友");
  const [recipientName, setRecipientName] = useState("");
  const [tone, setTone] = useState("温暖亲切");
  const [specificHoliday, setSpecificHoliday] = useState("");
  const [customContext, setCustomContext] = useState("");
  const [wishes, setWishes] = useState<string[]>([]);
  const [showCreditsModal, setShowCreditsModal] = useState(false);

  const { data: creditsData } = trpc.credits.balance.useQuery();
  const generateMutation = trpc.copywriter.generate.useMutation({
    onSuccess: (data) => setWishes(data.wishes),
    onError: (err) => {
      if (err.message.includes("积分不足")) setShowCreditsModal(true);
      else if (err.message.includes("繁忙") || err.message.includes("429") || err.message.includes("TOO_MANY_REQUESTS"))
        toast.error("🙏 AI服务繁忙，请稍等1-2分钟后再试", { duration: 5000 });
      else toast.error(err.message || "AI生成失败，请稍后重试");
    },
  });

  const handleGenerate = () => {
    generateMutation.mutate({ scenario, relationship, recipientName, tone, specificHoliday, customContext });
  };

  const copyText = (text: string) => {
    navigator.clipboard.writeText(text).then(() => toast.success("已复制到剪贴板！"));
  };

  return (
    <div className="min-h-screen bg-stone-50 pb-20">
      <InsufficientCreditsModal
        isOpen={showCreditsModal}
        onClose={() => setShowCreditsModal(false)}
        currentCredits={creditsData?.credits}
        requiredCredits={1}
      />

      <header className="bg-white px-4 py-4 flex items-center justify-between shadow-sm sticky top-0 z-10">
        <button onClick={() => window.history.back()} className="flex items-center gap-1 text-stone-600 font-medium">
          <ArrowLeft className="w-5 h-5" /> 返回
        </button>
        <h1 className="text-lg font-bold font-serif text-stone-800">✍️ 暖心文案</h1>
        <div className="w-16" />
      </header>

      <div className="max-w-lg mx-auto px-4 py-5 space-y-5">
        {/* 场景选择 */}
        <div>
          <p className="font-semibold text-stone-700 mb-2">📌 选择场景</p>
          <div className="flex flex-wrap gap-2">
            {SCENARIOS.map((s) => (
              <button key={s} onClick={() => setScenario(s)}
                className={`px-3 py-1.5 rounded-full border text-sm font-medium transition-all ${scenario === s ? "bg-orange-500 border-orange-500 text-white" : "bg-white border-stone-200 text-stone-600 hover:border-orange-300"}`}>
                {s}
              </button>
            ))}
          </div>
        </div>

        {/* 对象关系 */}
        <div>
          <p className="font-semibold text-stone-700 mb-2">👥 送给谁</p>
          <div className="flex flex-wrap gap-2">
            {RELATIONSHIPS.map((r) => (
              <button key={r} onClick={() => setRelationship(r)}
                className={`px-3 py-1.5 rounded-full border text-sm font-medium transition-all ${relationship === r ? "bg-orange-500 border-orange-500 text-white" : "bg-white border-stone-200 text-stone-600 hover:border-orange-300"}`}>
                {r}
              </button>
            ))}
          </div>
        </div>

        {/* 收件人姓名 */}
        <div>
          <p className="font-semibold text-stone-700 mb-2">📝 收件人姓名（选填）</p>
          <div className="flex gap-2">
            <Input value={recipientName} onChange={(e) => setRecipientName(e.target.value)}
              placeholder="例如：妈妈、老王、小明..." className="rounded-xl text-base" />
            <VoiceInput onResult={(t) => setRecipientName(t)} />
          </div>
        </div>

        {/* 语气风格 */}
        <div>
          <p className="font-semibold text-stone-700 mb-2">🎭 语气风格</p>
          <div className="flex flex-wrap gap-2">
            {TONES.map((t) => (
              <button key={t} onClick={() => setTone(t)}
                className={`px-3 py-1.5 rounded-full border text-sm font-medium transition-all ${tone === t ? "bg-amber-500 border-amber-500 text-white" : "bg-white border-stone-200 text-stone-600 hover:border-amber-300"}`}>
                {t}
              </button>
            ))}
          </div>
        </div>

        {/* 具体节日（可选） */}
        <div>
          <p className="font-semibold text-stone-700 mb-2">🎉 具体节日（选填）</p>
          <div className="flex flex-wrap gap-2">
            {HOLIDAYS.map((h) => (
              <button key={h} onClick={() => setSpecificHoliday(specificHoliday === h ? "" : h)}
                className={`px-3 py-1.5 rounded-full border text-sm transition-all ${specificHoliday === h ? "bg-red-500 border-red-500 text-white" : "bg-white border-stone-200 text-stone-500 hover:border-red-300"}`}>
                {h}
              </button>
            ))}
          </div>
        </div>

        {/* 额外信息 */}
        <div>
          <p className="font-semibold text-stone-700 mb-2">💬 补充信息（选填）</p>
          <div className="flex gap-2">
            <Textarea value={customContext} onChange={(e) => setCustomContext(e.target.value)}
              placeholder="可以补充一些特别的信息，例如：对方刚刚退休，喜欢旅游..."
              className="flex-1 rounded-xl text-base resize-none" rows={2} />
            <VoiceInput onResult={(t) => setCustomContext((c) => c + t)} />
          </div>
        </div>

        {/* 生成按钮 */}
        <Button onClick={handleGenerate} disabled={generateMutation.isPending}
          className="w-full rounded-xl py-4 text-lg bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 gap-2">
          {generateMutation.isPending ? (
            <><div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" /> 生成中...</>
          ) : (
            <><Sparkles className="w-5 h-5" /> 生成暖心文案（消耗1积分）</>
          )}
        </Button>

        {/* 生成结果 */}
        {wishes.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="font-semibold text-stone-700">✨ 为您生成了 {wishes.length} 条文案</p>
              <button onClick={handleGenerate} className="text-sm text-orange-500 flex items-center gap-1">
                <RefreshCw className="w-4 h-4" /> 重新生成
              </button>
            </div>
            {wishes.map((wish, i) => (
              <div key={i} className="bg-white border border-stone-200 rounded-2xl p-4 relative group">
                <p className="text-stone-700 leading-relaxed text-base pr-8">{wish}</p>
                <button onClick={() => copyText(wish)}
                  className="absolute top-3 right-3 text-stone-300 hover:text-orange-500 transition-colors">
                  <Copy className="w-5 h-5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
