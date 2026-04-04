import { useState, useRef, useEffect } from "react";
import { ArrowLeft, Send, Loader2, X, Image as ImageIcon, Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import VoiceInput from "@/components/VoiceInput";
import InsufficientCreditsModal from "@/components/InsufficientCreditsModal";
import { Streamdown } from "streamdown";

interface Message {
  role: "user" | "assistant";
  content: string;
  imageUrl?: string;
}

const QUICK_QUESTIONS = [
  "最近血压偏高，有什么注意事项？",
  "老年人每天应该喝多少水？",
  "膝盖疼痛怎么缓解？",
  "如何预防老年痴呆？",
  "睡眠不好怎么改善？",
  "适合老年人的运动有哪些？",
];

function CopyButton({ content }: { content: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      toast.success("已复制！可直接粘贴到小红书 📋");
      setTimeout(() => setCopied(false), 2500);
    } catch {
      toast.error("复制失败，请手动长按选择文字");
    }
  };

  return (
    <button
      onClick={handleCopy}
      className={`flex items-center gap-1 text-xs px-2.5 py-1 rounded-full transition-all ${
        copied
          ? "bg-green-100 text-green-600"
          : "bg-stone-100 text-stone-500 hover:bg-rose-50 hover:text-rose-500"
      }`}
    >
      {copied ? (
        <>
          <Check className="w-3 h-3" />
          <span>已复制</span>
        </>
      ) : (
        <>
          <Copy className="w-3 h-3" />
          <span>复制笔记</span>
        </>
      )}
    </button>
  );
}

export default function AIKaleidoscope() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [showCreditsModal, setShowCreditsModal] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: creditsData } = trpc.credits.balance.useQuery();
  const uploadMutation = trpc.upload.image.useMutation();
  const chatMutation = trpc.kaleidoscope.chat.useMutation({
    onSuccess: (data) => {
      setMessages((prev) => [...prev, { role: "assistant", content: data.reply }]);
    },
    onError: (err) => {
      if (err.message.includes("积分不足")) setShowCreditsModal(true);
      else toast.error(err.message);
      setMessages((prev) => prev.slice(0, -1));
    },
  });

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = () => {
    const text = input.trim();
    if (!text && !imageUrl) return;

    const userMsg: Message = { role: "user", content: text || "（发送了一张图片）", imageUrl: imageUrl || undefined };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setImageUrl(null);

    chatMutation.mutate({
      message: text || "请分析这张图片",
      imageUrl: imageUrl || undefined,
      history: messages.map((m) => ({ role: m.role, content: m.content })),
    });
  };

  const handleImageUpload = async (file: File) => {
    if (file.size > 10 * 1024 * 1024) return toast.error("图片不能超过10MB");
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onloadend = async () => {
      const base64 = (reader.result as string).split(",")[1];
      const { url } = await uploadMutation.mutateAsync({ base64, mimeType: file.type });
      setImageUrl(url);
    };
  };

  return (
    <div className="min-h-screen bg-stone-50 flex flex-col">
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
        <div className="text-center">
          <h1 className="text-lg font-bold font-serif text-stone-800">🩺 AI 万花筒</h1>
          <p className="text-xs text-stone-400">全科健康顾问 · 一键生成养生笔记</p>
        </div>
        <button onClick={() => setMessages([])} className="text-sm text-stone-400 hover:text-stone-600">清空</button>
      </header>

      {/* 对话区域 */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4 max-w-lg mx-auto w-full">
        {messages.length === 0 && (
          <div className="space-y-4 animate-fade-in">
            <div className="bg-white border border-stone-200 rounded-2xl p-4 flex gap-3">
              <div className="w-10 h-10 bg-rose-100 rounded-full flex items-center justify-center flex-shrink-0">
                <span className="text-xl">🩺</span>
              </div>
              <div>
                <p className="font-semibold text-stone-800 mb-1">您好！我是您的AI健康顾问</p>
                <p className="text-stone-500 text-sm leading-relaxed">
                  我会用<span className="text-rose-500 font-medium">小红书笔记风格</span>回答您的健康问题，回答后可以<span className="text-rose-500 font-medium">一键复制</span>发布到您的小红书，分享给家人朋友～
                </p>
              </div>
            </div>

            {/* 小红书风格提示 */}
            <div className="bg-gradient-to-r from-rose-50 to-orange-50 border border-rose-100 rounded-2xl p-3 flex items-center gap-2">
              <span className="text-lg">📱</span>
              <p className="text-sm text-rose-600">回答完成后，点击 <strong>「复制笔记」</strong> 按钮，即可粘贴到小红书发布！</p>
            </div>

            <div>
              <p className="text-sm text-stone-400 mb-2 text-center">常见问题快速提问</p>
              <div className="grid grid-cols-2 gap-2">
                {QUICK_QUESTIONS.map((q) => (
                  <button
                    key={q}
                    onClick={() => { setInput(q); }}
                    className="bg-white border border-stone-200 rounded-xl p-2.5 text-left text-sm text-stone-600 hover:bg-rose-50 hover:border-rose-200 transition-colors"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} className={`flex gap-3 ${msg.role === "user" ? "flex-row-reverse" : ""}`}>
            <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 text-lg ${msg.role === "user" ? "bg-stone-700" : "bg-rose-100"}`}>
              {msg.role === "user" ? "👤" : "🩺"}
            </div>
            <div className={`max-w-[82%] ${msg.role === "user" ? "items-end" : "items-start"} flex flex-col gap-1.5`}>
              {msg.imageUrl && (
                <img src={msg.imageUrl} className="rounded-xl max-w-[200px] mb-1" alt="用户上传的图片" />
              )}
              <div className={`rounded-2xl px-4 py-3 ${msg.role === "user" ? "bg-stone-700 text-white" : "bg-white border border-stone-200 text-stone-700"}`}>
                {msg.role === "assistant" ? (
                  <Streamdown className="prose prose-stone prose-sm max-w-none">{msg.content}</Streamdown>
                ) : (
                  <p className="text-sm leading-relaxed">{msg.content}</p>
                )}
              </div>
              {/* 复制按钮：仅在AI回答完成后显示 */}
              {msg.role === "assistant" && (
                <div className="flex items-center gap-2 px-1">
                  <CopyButton content={msg.content} />
                  <span className="text-xs text-stone-300">可直接发布到小红书</span>
                </div>
              )}
            </div>
          </div>
        ))}

        {chatMutation.isPending && (
          <div className="flex gap-3">
            <div className="w-9 h-9 bg-rose-100 rounded-full flex items-center justify-center text-lg">🩺</div>
            <div className="bg-white border border-stone-200 rounded-2xl px-4 py-3 flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin text-stone-400" />
              <span className="text-stone-400 text-sm">正在生成养生笔记...</span>
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* 输入区域 */}
      <div className="bg-white border-t border-stone-200 px-4 py-3 sticky bottom-0">
        <div className="max-w-lg mx-auto space-y-2">
          {imageUrl && (
            <div className="relative inline-block">
              <img src={imageUrl} className="h-16 rounded-xl" alt="待发送图片" />
              <button onClick={() => setImageUrl(null)} className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center">
                <X className="w-3 h-3" />
              </button>
            </div>
          )}
          <div className="flex gap-2 items-end">
            <input ref={fileInputRef} type="file" accept="image/*" className="hidden"
              onChange={(e) => e.target.files?.[0] && handleImageUpload(e.target.files[0])} />
            <button onClick={() => fileInputRef.current?.click()}
              className="w-10 h-10 rounded-full bg-stone-100 flex items-center justify-center text-stone-500 hover:bg-stone-200 flex-shrink-0">
              <ImageIcon className="w-5 h-5" />
            </button>
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="输入您的健康问题..."
              className="flex-1 rounded-2xl text-base resize-none min-h-[44px] max-h-32"
              rows={1}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
            />
            <VoiceInput onResult={(t) => setInput((p) => p + t)} className="flex-shrink-0" />
            <Button onClick={handleSend} disabled={chatMutation.isPending || (!input.trim() && !imageUrl)}
              className="w-10 h-10 rounded-full p-0 flex-shrink-0">
              <Send className="w-4 h-4" />
            </Button>
          </div>
          <p className="text-xs text-stone-400 text-center">每次提问消耗1积分 · 内容仅供参考 · 可一键复制发布小红书</p>
        </div>
      </div>
    </div>
  );
}
