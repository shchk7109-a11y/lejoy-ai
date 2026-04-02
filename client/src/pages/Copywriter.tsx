import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { ModuleHeader } from "@/components/ModuleHeader";
import { VoiceButton } from "@/components/VoiceButton";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Copy, RefreshCw, PenLine } from "lucide-react";
import { useLocation } from "wouter";
import { toast } from "sonner";

const SCENARIOS = [
  { id: "BIRTHDAY", label: "生日祝福", icon: "🎂" },
  { id: "FESTIVAL", label: "节日问候", icon: "🎊" },
  { id: "MOMENTS", label: "发朋友圈", icon: "📱" },
  { id: "COMFORT", label: "日常关怀", icon: "💝" },
];

const FESTIVALS = [
  "春节", "元宵节", "清明节", "端午节", "中秋节", "重阳节",
  "元旦", "情人节", "母亲节", "父亲节", "教师节", "国庆节",
];

const RELATIONS = [
  { id: "FRIEND", label: "朋友" },
  { id: "FAMILY", label: "家人" },
  { id: "ELDER", label: "长辈" },
  { id: "JUNIOR", label: "晚辈" },
  { id: "PARTNER", label: "伴侣" },
];

const TONES = [
  { id: "WARM", label: "温馨" },
  { id: "HUMOROUS", label: "幽默" },
  { id: "LITERARY", label: "文艺" },
  { id: "FORMAL", label: "正式" },
  { id: "POETRY", label: "诗词" },
  { id: "PROSE", label: "散文" },
  { id: "SENTIMENT", label: "感性" },
];

export default function Copywriter() {
  const [, setLocation] = useLocation();
  const [scenario, setScenario] = useState("BIRTHDAY");
  const [relationship, setRelationship] = useState("FRIEND");
  const [recipientName, setRecipientName] = useState("");
  const [tone, setTone] = useState("WARM");
  const [specificHoliday, setSpecificHoliday] = useState("");
  const [customHoliday, setCustomHoliday] = useState("");
  const [customContext, setCustomContext] = useState("");
  const [results, setResults] = useState<string[]>([]);

  const generateMut = trpc.copywriter.generate.useMutation({
    onSuccess: (d) => {
      // wishes 已经是 string[] 数组
      setResults(d.wishes);
      toast.success("文案生成完成！");
    },
    onError: (e) => toast.error(e.message),
  });

  const handleGenerate = () => {
    const holiday = scenario === "FESTIVAL" ? (customHoliday || specificHoliday) : "";
    const scenarioLabel = SCENARIOS.find(s => s.id === scenario)?.label || scenario;
    const relationLabel = RELATIONS.find(r => r.id === relationship)?.label || relationship;
    const toneLabel = TONES.find(t => t.id === tone)?.label || tone;
    generateMut.mutate({
      scenario: scenarioLabel,
      relationship: relationLabel,
      recipientName: recipientName || "对方",
      tone: toneLabel,
      specificHoliday: holiday,
      customContext,
    });
  };

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("已复制到剪贴板");
  };

  return (
    <div className="min-h-screen bg-background">
      <ModuleHeader title="暖心文案" icon="💌" onBack={() => setLocation("/")} />
      <div className="container py-6 space-y-5">
        {/* Scenario Selection */}
        <div>
          <p className="text-sm font-medium mb-2">选择场景</p>
          <div className="grid grid-cols-4 gap-2">
            {SCENARIOS.map(s => (
              <Button
                key={s.id}
                variant={scenario === s.id ? "default" : "outline"}
                size="sm"
                onClick={() => setScenario(s.id)}
                className="h-auto py-3 flex-col gap-1"
              >
                <span className="text-lg">{s.icon}</span>
                <span className="text-xs">{s.label}</span>
              </Button>
            ))}
          </div>
        </div>

        {/* Festival Selection */}
        {scenario === "FESTIVAL" && (
          <div>
            <p className="text-sm font-medium mb-2">选择节日</p>
            <div className="flex flex-wrap gap-2 mb-2">
              {FESTIVALS.map(f => (
                <Button
                  key={f}
                  variant={specificHoliday === f ? "default" : "outline"}
                  size="sm"
                  onClick={() => { setSpecificHoliday(f); setCustomHoliday(""); }}
                >
                  {f}
                </Button>
              ))}
            </div>
            <div className="flex gap-2 items-center">
              <Input
                placeholder="或输入其他节日..."
                value={customHoliday}
                onChange={e => { setCustomHoliday(e.target.value); setSpecificHoliday(""); }}
                className="flex-1"
              />
              <VoiceButton onResult={text => { setCustomHoliday(text); setSpecificHoliday(""); }} />
            </div>
          </div>
        )}

        {/* Relationship - hide for MOMENTS */}
        {scenario !== "MOMENTS" && (
          <div>
            <p className="text-sm font-medium mb-2">发送对象</p>
            <div className="flex flex-wrap gap-2">
              {RELATIONS.map(r => (
                <Button
                  key={r.id}
                  variant={relationship === r.id ? "default" : "outline"}
                  size="sm"
                  onClick={() => setRelationship(r.id)}
                >
                  {r.label}
                </Button>
              ))}
            </div>
          </div>
        )}

        {/* Recipient Name */}
        {scenario !== "MOMENTS" && (
          <div>
            <p className="text-sm font-medium mb-2">对方称呼（可选）</p>
            <div className="flex gap-2">
              <Input
                placeholder="如：王阿姨、张叔叔..."
                value={recipientName}
                onChange={e => setRecipientName(e.target.value)}
                className="flex-1"
              />
              <VoiceButton onResult={setRecipientName} />
            </div>
          </div>
        )}

        {/* Tone */}
        <div>
          <p className="text-sm font-medium mb-2">文案风格</p>
          <div className="flex flex-wrap gap-2">
            {TONES.map(t => (
              <Button
                key={t.id}
                variant={tone === t.id ? "default" : "outline"}
                size="sm"
                onClick={() => setTone(t.id)}
              >
                {t.label}
              </Button>
            ))}
          </div>
        </div>

        {/* Custom Context */}
        <div>
          <p className="text-sm font-medium mb-2">补充说明（可选）</p>
          <div className="flex gap-2">
            <Textarea
              value={customContext}
              onChange={e => setCustomContext(e.target.value)}
              placeholder="如：对方刚退休、最近身体不好..."
              rows={2}
              className="flex-1"
            />
            <VoiceButton onResult={text => setCustomContext(prev => prev + text)} className="shrink-0" />
          </div>
        </div>

        {/* Generate Button */}
        <Button className="w-full h-12 text-base" onClick={handleGenerate} disabled={generateMut.isPending}>
          {generateMut.isPending ? (
            <><Loader2 className="w-5 h-5 mr-2 animate-spin" /> 正在创作文案...</>
          ) : (
            <><PenLine className="w-5 h-5 mr-2" /> 生成文案</>
          )}
        </Button>

        {/* Results */}
        {results.length > 0 && (
          <div className="space-y-3 animate-slide-up">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">为您创作了 {results.length} 条文案</p>
              <Button variant="ghost" size="sm" onClick={handleGenerate} disabled={generateMut.isPending}>
                <RefreshCw className="w-4 h-4 mr-1" /> 换一批
              </Button>
            </div>

            {results.map((text, i) => (
              <Card key={i} className="animate-fade-in" style={{ animationDelay: `${i * 100}ms` }}>
                <CardContent className="pt-4 pb-4">
                  <p className="text-base leading-relaxed whitespace-pre-wrap">{text.trim()}</p>
                  <div className="flex justify-end mt-3">
                    <Button variant="ghost" size="sm" onClick={() => handleCopy(text.trim())}>
                      <Copy className="w-4 h-4 mr-1" /> 复制文案
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
