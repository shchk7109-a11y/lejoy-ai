import { useState, useRef, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { ModuleHeader } from "@/components/ModuleHeader";
import { ImageUploader } from "@/components/ImageUploader";
import { VoiceButton } from "@/components/VoiceButton";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Send, ImagePlus, X, Loader2, MessageSquare, Trash2, Plus } from "lucide-react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { Streamdown } from "streamdown";

type Message = { role: "user" | "assistant"; content: string; imageUrl?: string };

export default function AIChat() {
  const [, setLocation] = useLocation();
  const [conversationId, setConversationId] = useState<number | undefined>();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const [showImagePicker, setShowImagePicker] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const { data: conversations, refetch: refetchConvs } = trpc.chat.conversations.useQuery();
  const sendMut = trpc.chat.send.useMutation({
    onSuccess: (d) => {
      setMessages(prev => [...prev, { role: "assistant", content: d.response }]);
      if (!conversationId) setConversationId(d.conversationId);
    },
    onError: (e) => toast.error(e.message),
  });
  const deleteMut = trpc.chat.deleteConversation.useMutation({
    onSuccess: () => { refetchConvs(); toast.success("已删除"); },
  });

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = () => {
    const text = input.trim();
    if (!text && !imageBase64) return;

    const userMsg: Message = { role: "user", content: text || "请分析这张图片" };
    if (imageBase64) userMsg.imageUrl = imageBase64;
    setMessages(prev => [...prev, userMsg]);

    sendMut.mutate({
      conversationId,
      message: text || "请分析这张图片",
      imageBase64: imageBase64 || undefined,
    });

    setInput("");
    setImageBase64(null);
    setShowImagePicker(false);
  };

  const utils = trpc.useUtils();

  const loadConversation = async (convId: number) => {
    setConversationId(convId);
    setShowHistory(false);
    try {
      const msgs = await utils.chat.messages.fetch({ conversationId: convId });
      setMessages(msgs.map((m: any) => ({ role: m.role as "user" | "assistant", content: m.content, imageUrl: m.imageUrl })));
    } catch {
      setMessages([]);
    }
  };

  const startNewChat = () => {
    setConversationId(undefined);
    setMessages([]);
    setShowHistory(false);
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <ModuleHeader title="AI 万花筒" icon="🔮" onBack={() => setLocation("/")} />

      {/* History Toggle */}
      <div className="container flex items-center justify-between py-2 border-b border-border">
        <Button variant="ghost" size="sm" onClick={() => setShowHistory(!showHistory)}>
          <MessageSquare className="w-4 h-4 mr-1" /> 历史对话
        </Button>
        <Button variant="ghost" size="sm" onClick={startNewChat}>
          <Plus className="w-4 h-4 mr-1" /> 新对话
        </Button>
      </div>

      {/* History Panel */}
      {showHistory && conversations && (
        <div className="container py-2 border-b border-border animate-fade-in">
          <ScrollArea className="max-h-48">
            {conversations.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">暂无历史对话</p>
            ) : (
              <div className="space-y-1">
                {conversations.map((conv: any) => (
                  <div
                    key={conv.id}
                    className={`flex items-center justify-between p-2 rounded-lg cursor-pointer hover:bg-muted ${conversationId === conv.id ? "bg-muted" : ""}`}
                    onClick={() => loadConversation(conv.id)}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm truncate">{conv.title}</p>
                      <p className="text-xs text-muted-foreground">{new Date(conv.updatedAt).toLocaleDateString("zh-CN")}</p>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="shrink-0 w-7 h-7"
                      onClick={(e) => { e.stopPropagation(); deleteMut.mutate({ id: conv.id }); }}
                    >
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
        </div>
      )}

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        <div className="container py-4 space-y-4">
          {messages.length === 0 && (
            <div className="text-center py-16">
              <p className="text-4xl mb-4">🔮</p>
              <p className="text-lg font-medium text-foreground mb-2">有什么想问的？</p>
              <p className="text-sm text-muted-foreground">支持文字和图片，我会尽力为您解答</p>
            </div>
          )}

          {messages.map((msg, i) => (
            <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[85%] rounded-2xl px-4 py-3 ${
                msg.role === "user"
                  ? "bg-primary text-primary-foreground rounded-br-md"
                  : "bg-card border border-border rounded-bl-md"
              }`}>
                {msg.imageUrl && (
                  <img src={msg.imageUrl} alt="" className="w-40 rounded-lg mb-2" />
                )}
                {msg.role === "assistant" ? (
                  <div className="text-sm leading-relaxed prose prose-sm max-w-none">
                    <Streamdown>{msg.content}</Streamdown>
                  </div>
                ) : (
                  <p className="text-sm">{msg.content}</p>
                )}
              </div>
            </div>
          ))}

          {sendMut.isPending && (
            <div className="flex justify-start">
              <div className="bg-card border border-border rounded-2xl rounded-bl-md px-4 py-3">
                <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Image Preview */}
      {imageBase64 && (
        <div className="container pb-2">
          <div className="relative inline-block">
            <img src={imageBase64} alt="" className="w-16 h-16 rounded-lg object-cover border border-border" />
            <button
              onClick={() => setImageBase64(null)}
              className="absolute -top-1 -right-1 bg-destructive text-destructive-foreground rounded-full p-0.5"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        </div>
      )}

      {/* Image Picker */}
      {showImagePicker && !imageBase64 && (
        <div className="container pb-2 animate-fade-in">
          <ImageUploader onImageSelected={(b64) => { setImageBase64(b64); setShowImagePicker(false); }} />
        </div>
      )}

      {/* Input Bar */}
      <div className="sticky bottom-0 bg-background border-t border-border">
        <div className="container flex items-center gap-2 py-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setShowImagePicker(!showImagePicker)}
            className="shrink-0"
          >
            <ImagePlus className="w-5 h-5" />
          </Button>
          <VoiceButton onResult={text => setInput(prev => prev + text)} className="shrink-0" />
          <Input
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
            placeholder="输入您的问题..."
            className="flex-1"
          />
          <Button
            size="icon"
            onClick={handleSend}
            disabled={sendMut.isPending || (!input.trim() && !imageBase64)}
          >
            <Send className="w-5 h-5" />
          </Button>
        </div>
      </div>
    </div>
  );
}
