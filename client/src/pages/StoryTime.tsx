import React, { useState, useRef, useEffect, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import InsufficientCreditsModal from "@/components/InsufficientCreditsModal";
import VoiceInput from "@/components/VoiceInput";
import {
  BookOpen, ChevronLeft, ChevronRight, Play, Pause,
  SkipBack, SkipForward, Wand2, Loader2, Volume2, Home,
  Shuffle, Check, Edit3, Mic, Download, Video
} from "lucide-react";

interface StoryPage {
  pageNumber: number;
  text: string;
  imagePrompt: string;
  imageUrl?: string;
  audioBase64?: string; // 每页独立音频
  audioMime?: string; // 音频MIME类型（如audio/L16;rate=24000或audio/wav）
}

interface Story {
  id: string;
  title: string;
  pages: StoryPage[];
  theme: string;
  protagonist: string;
  createdAt: number;
}

interface TopicSuggestion {
  title: string;
  description: string;
  protagonist: string;
}

type View = "wizard" | "topics" | "preview" | "generating" | "player" | "library";

const THEMES = ["冒险", "童话", "科学", "动物", "成长", "奇幻"];
const VOICES = [
  { id: "sweet", name: "甜美姐姐", desc: "柔和女声，适合睡前故事" },
  { id: "lively", name: "活泼哥哥", desc: "清亮男声，适合冒险故事" },
  { id: "calm", name: "慈祥爷爷", desc: "深沉男声，适合寓言传说" },
];

interface GenProgress {
  step: "story" | "images" | "speech" | "done";
  message: string;
  percent: number;
  pageDetail?: string; // 第几页详细信息
  elapsedSec?: number; // 已用时间（秒）
}

function StoryWizard({ onSubmit }: {
  onSubmit: (params: { childName?: string; age: number; theme: string; voiceType: string; customProtagonist?: string }) => void;
}) {
  const [step, setStep] = useState(1);
  const [childName, setChildName] = useState("");
  const [age, setAge] = useState(6);
  const [theme, setTheme] = useState("冒险");
  const [voiceType, setVoiceType] = useState("lively");
  const [customProtagonist, setCustomProtagonist] = useState("");
  const PROTAGONIST_PRESETS = ["孙悟空", "钢铁侠", "超人", "蜘蛛侠", "哪吒", "白雪公主", "皮卡丘", "正义联盟"];

  return (
    <div className="w-full max-w-2xl mx-auto">
      <div className="bg-white rounded-3xl shadow-xl border border-orange-100 p-8">
        <div className="flex items-center justify-center gap-2 mb-8">
          {[1, 2, 3].map(s => (
            <div key={s} className="flex items-center gap-2">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-all ${s < step ? "bg-green-500 text-white" : s === step ? "bg-orange-500 text-white" : "bg-gray-200 text-gray-400"}`}>
                {s < step ? <Check className="w-4 h-4" /> : s}
              </div>
              {s < 3 && <div className={`w-12 h-0.5 ${s < step ? "bg-green-400" : "bg-gray-200"}`} />}
            </div>
          ))}
        </div>

        {step === 1 && (
          <div className="space-y-6">
            <div>
              <h2 className="text-2xl font-bold text-gray-800 mb-1">孩子信息</h2>
              <p className="text-gray-500 text-sm">名字选填，不填则由AI随机生成可爱的主角名字</p>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-base font-bold text-gray-700 mb-2">孩子名字（选填）</label>
                <div className="relative">
                  <input type="text" value={childName} onChange={e => setChildName(e.target.value)}
                    placeholder="不填则AI随机生成主角名字"
                    className="w-full p-4 pr-14 rounded-xl border-2 border-orange-200 focus:border-orange-500 outline-none text-lg bg-orange-50/30" />
                  <div className="absolute right-3 top-1/2 -translate-y-1/2">
                    <VoiceInput onResult={t => setChildName(prev => prev + t)} />
                  </div>
                </div>
              </div>
              <div>
                <label className="block text-base font-bold text-gray-700 mb-2">孩子年龄</label>
                <div className="flex gap-2 flex-wrap">
                  {[3, 4, 5, 6, 7, 8, 9, 10].map(a => (
                    <button key={a} onClick={() => setAge(a)}
                      className={`px-4 py-2 rounded-xl border-2 font-bold transition-all ${age === a ? "border-orange-500 bg-orange-100 text-orange-700" : "border-gray-200 bg-white text-gray-600 hover:border-orange-300"}`}>
                      {a}岁
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-base font-bold text-gray-700 mb-2">✨ 自定义主角（选填）</label>
                <p className="text-gray-400 text-sm mb-2">让孩子喜欢的超级英雄成为故事主角！</p>
                <div className="flex gap-2 flex-wrap mb-3">
                  {PROTAGONIST_PRESETS.map(p => (
                    <button key={p} onClick={() => setCustomProtagonist(customProtagonist === p ? "" : p)}
                      className={`px-3 py-1.5 rounded-xl border-2 text-sm font-bold transition-all ${customProtagonist === p ? "border-orange-500 bg-orange-100 text-orange-700" : "border-gray-200 bg-white text-gray-600 hover:border-orange-300 hover:bg-orange-50"}`}>
                      {p}
                    </button>
                  ))}
                </div>
                <div className="relative">
                  <input type="text" value={customProtagonist} onChange={e => setCustomProtagonist(e.target.value)}
                    placeholder="或输入任意主角，如：龙猫、小海龟..."
                    className="w-full p-3 pr-14 rounded-xl border-2 border-orange-200 focus:border-orange-500 outline-none text-base bg-orange-50/30" />
                  <div className="absolute right-3 top-1/2 -translate-y-1/2">
                    <VoiceInput onResult={t => setCustomProtagonist(prev => prev + t)} />
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-6">
            <div>
              <h2 className="text-2xl font-bold text-gray-800 mb-1">故事风格</h2>
              <p className="text-gray-500 text-sm">选择一个风格，AI将为您推荐精彩故事题材</p>
            </div>
            <div className="grid grid-cols-3 gap-3">
              {THEMES.map(t => (
                <button key={t} onClick={() => setTheme(t)}
                  className={`p-4 rounded-xl border-2 font-bold text-lg transition-all ${theme === t ? "border-orange-500 bg-orange-100 text-orange-700 shadow-md" : "border-gray-200 bg-white text-gray-600 hover:border-orange-300 hover:bg-orange-50"}`}>
                  {t}
                </button>
              ))}
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-6">
            <div>
              <h2 className="text-2xl font-bold text-gray-800 mb-1">讲述声音</h2>
              <p className="text-gray-500 text-sm">选择故事的讲述声音</p>
            </div>
            <div className="space-y-3">
              {VOICES.map(v => (
                <button key={v.id} onClick={() => setVoiceType(v.id)}
                  className={`w-full flex items-center p-4 rounded-xl border-2 transition-all ${voiceType === v.id ? "border-orange-500 bg-orange-50 ring-1 ring-orange-400" : "border-gray-200 bg-white hover:border-orange-300"}`}>
                  <div className={`w-12 h-12 rounded-full flex items-center justify-center mr-4 ${voiceType === v.id ? "bg-orange-500 text-white" : "bg-gray-100 text-gray-500"}`}>
                    <Volume2 className="w-6 h-6" />
                  </div>
                  <div className="text-left">
                    <div className="font-bold text-gray-900 text-lg">{v.name}</div>
                    <div className="text-sm text-gray-500">{v.desc}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="flex justify-between mt-8 pt-6 border-t border-orange-50">
          <Button variant="ghost" onClick={() => setStep(s => s - 1)} disabled={step === 1} className="text-gray-600">
            <ChevronLeft className="w-4 h-4 mr-1" /> 上一步
          </Button>
          <Button onClick={() => { if (step < 3) setStep(s => s + 1); else onSubmit({ childName: childName || undefined, age, theme, voiceType, customProtagonist: customProtagonist || undefined }); }}
            className="bg-orange-500 hover:bg-orange-600 text-white px-6">
            {step === 3 ? <><Wand2 className="w-4 h-4 mr-2" />获取故事题材</> : <>下一步 <ChevronRight className="w-4 h-4 ml-1" /></>}
          </Button>
        </div>
      </div>
    </div>
  );
}

function TopicSelector({ topics, isLoading, onSelect, onBack, onRefresh }: {
  topics: TopicSuggestion[];
  isLoading: boolean;
  onSelect: (topic: TopicSuggestion) => void;
  onBack: () => void;
  onRefresh: () => void;
}) {
  return (
    <div className="w-full max-w-2xl mx-auto">
      <div className="bg-white rounded-3xl shadow-xl border border-orange-100 p-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl font-bold text-gray-800">选择故事题材</h2>
            <p className="text-gray-500 text-sm mt-1">AI为您精心推荐了以下故事题材，点击选择</p>
          </div>
          <Button variant="outline" size="sm" onClick={onRefresh} disabled={isLoading} className="gap-1">
            <Shuffle className="w-4 h-4" /> 换一批
          </Button>
        </div>
        {isLoading ? (
          <div className="flex flex-col items-center py-16 gap-4">
            <Loader2 className="w-12 h-12 text-orange-500 animate-spin" />
            <p className="text-gray-500 font-medium">AI正在构思精彩题材...</p>
          </div>
        ) : (
          <div className="space-y-3">
            {topics.map((topic, i) => (
              <button key={i} onClick={() => onSelect(topic)}
                className="w-full text-left p-5 rounded-2xl border-2 border-gray-200 hover:border-orange-400 hover:bg-orange-50 transition-all group">
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-xl bg-orange-100 text-orange-600 flex items-center justify-center font-bold text-lg flex-shrink-0 group-hover:bg-orange-500 group-hover:text-white transition-colors">
                    {i + 1}
                  </div>
                  <div className="flex-1">
                    <div className="font-bold text-gray-900 text-lg">{topic.title}</div>
                    <div className="text-gray-500 text-sm mt-1">{topic.description}</div>
                    <div className="mt-2">
                      <Badge variant="secondary" className="text-xs bg-orange-100 text-orange-700">主角：{topic.protagonist}</Badge>
                    </div>
                  </div>
                  <ChevronRight className="w-5 h-5 text-gray-400 group-hover:text-orange-500 transition-colors flex-shrink-0 mt-2" />
                </div>
              </button>
            ))}
          </div>
        )}
        <div className="mt-6 pt-4 border-t border-gray-100">
          <Button variant="ghost" onClick={onBack} className="text-gray-500">
            <ChevronLeft className="w-4 h-4 mr-1" /> 返回修改
          </Button>
        </div>
      </div>
    </div>
  );
}

function StoryPreview({ title, pages, onConfirm, onCancel }: {
  title: string;
  pages: StoryPage[];
  onConfirm: (title: string, pages: StoryPage[]) => void;
  onCancel: () => void;
}) {
  const [editTitle, setEditTitle] = useState(title);
  const [editPages, setEditPages] = useState(pages);
  const [activePage, setActivePage] = useState(0);

  return (
    <div className="w-full max-w-4xl mx-auto">
      <div className="bg-white rounded-3xl shadow-xl border border-orange-100 p-8">
        <div className="mb-6">
          <h2 className="text-2xl font-bold text-orange-800">文案预览 &amp; 编辑</h2>
          <p className="text-sm text-gray-500 mt-1">AI已完成构思，您可以修改文字，满意后点击确认生成</p>
        </div>
        <div className="mb-6">
          <label className="block text-sm font-bold text-gray-600 mb-1">故事标题</label>
          <div className="relative">
            <input type="text" value={editTitle} onChange={e => setEditTitle(e.target.value)}
              className="w-full p-3 pl-4 pr-14 rounded-xl border-2 border-orange-100 focus:border-orange-400 outline-none font-bold text-xl text-gray-800 bg-orange-50/50" />
            <div className="absolute right-2 top-1.5">
              <VoiceInput onResult={t => setEditTitle(prev => prev + t)} />
            </div>
          </div>
        </div>
        <div className="flex flex-col md:flex-row gap-4" style={{ height: "380px" }}>
          <div className="md:w-1/4 flex md:flex-col gap-2 overflow-x-auto md:overflow-y-auto">
            {editPages.map((page, idx) => (
              <button key={idx} onClick={() => setActivePage(idx)}
                className={`p-3 rounded-xl text-left flex-shrink-0 transition-all ${activePage === idx ? "bg-orange-500 text-white shadow-md" : "bg-white border border-gray-200 text-gray-600 hover:bg-gray-50"}`}>
                <span className="font-bold text-sm block">第 {idx + 1} 页</span>
                <span className="text-xs opacity-80 truncate block max-w-[100px]">{page.text.slice(0, 20)}...</span>
              </button>
            ))}
          </div>
          <div className="md:w-3/4 flex flex-col bg-slate-50 rounded-2xl p-5 border border-gray-200 relative">
            <div className="absolute top-3 right-3 bg-white px-2 py-0.5 rounded-full text-xs font-medium text-orange-500 border border-orange-100">
              {activePage + 1} / {editPages.length}
            </div>
            <label className="text-sm font-bold text-gray-500 mb-2">本页故事内容</label>
            <div className="flex-1 relative">
              <textarea value={editPages[activePage]?.text ?? ""}
                onChange={e => {
                  const newPages = [...editPages];
                  newPages[activePage] = { ...newPages[activePage], text: e.target.value };
                  setEditPages(newPages);
                }}
                className="w-full h-full p-4 pr-14 rounded-xl border border-gray-200 focus:border-orange-400 outline-none text-lg leading-relaxed resize-none bg-white text-gray-800" />
              <div className="absolute right-3 bottom-3">
                <VoiceInput onResult={t => {
                  const newPages = [...editPages];
                  newPages[activePage] = { ...newPages[activePage], text: (editPages[activePage]?.text ?? "") + t };
                  setEditPages(newPages);
                }} />
              </div>
            </div>
          </div>
        </div>
        <div className="flex justify-between mt-6 pt-4 border-t border-orange-50">
          <Button variant="ghost" onClick={onCancel} className="text-gray-500">
            <ChevronLeft className="w-4 h-4 mr-1" /> 重新选题
          </Button>
          <Button onClick={() => onConfirm(editTitle, editPages)} className="bg-orange-500 hover:bg-orange-600 text-white px-8">
            <Wand2 className="w-4 h-4 mr-2" /> 确认，开始生成绘本
          </Button>
        </div>
      </div>
    </div>
  );
}

function CircularProgress({ percent }: { percent: number }) {
  const r = 54;
  const circ = 2 * Math.PI * r;
  const offset = circ - (percent / 100) * circ;
  return (
    <svg width="140" height="140" viewBox="0 0 140 140" className="-rotate-90">
      <circle cx="70" cy="70" r={r} fill="none" stroke="#f3e8d8" strokeWidth="12" />
      <circle cx="70" cy="70" r={r} fill="none" stroke="#f97316" strokeWidth="12"
        strokeDasharray={circ} strokeDashoffset={offset}
        strokeLinecap="round"
        style={{ transition: "stroke-dashoffset 0.6s ease" }} />
    </svg>
  );
}

function GenerationView({ progress }: { progress: GenProgress }) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (progress.step === "done") return;
    setElapsed(0);
    const t = setInterval(() => setElapsed(s => s + 1), 1000);
    return () => clearInterval(t);
  }, [progress.step]);
  const formatTime = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  };
  const steps = [
    { id: "story", label: "构思故事", icon: Edit3 },
    { id: "images", label: "绘制插画", icon: Wand2 },
    { id: "speech", label: "合成语音", icon: Mic },
    { id: "done", label: "制作完成", icon: BookOpen },
  ];
  const stepOrder = ["story", "images", "speech", "done"];
  const currentStepIdx = stepOrder.indexOf(progress.step);
  return (
    <div className="min-h-[80vh] flex items-center justify-center px-4">
      <div className="w-full max-w-sm mx-auto text-center">
        {/* 圆形进度条 */}
        <div className="relative inline-flex items-center justify-center mb-6">
          <CircularProgress percent={progress.percent} />
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-3xl font-bold text-orange-500">{Math.round(progress.percent)}%</span>
          </div>
        </div>
        {/* 主进度文字 */}
        <h2 className="text-xl font-bold text-gray-800 mb-1">{progress.message}</h2>
        {progress.pageDetail && (
          <p className="text-base text-gray-500 mb-1">{progress.pageDetail}</p>
        )}
        {progress.step !== "done" && (
          <p className="text-sm text-gray-400 mb-6">⏱ 已用时: {formatTime(elapsed)}</p>
        )}
        {/* 步骤列表 */}
        <div className="space-y-3 mt-4">
          {steps.map((s, i) => {
            const status = i < currentStepIdx ? "done" : i === currentStepIdx ? "active" : "pending";
            const Icon = s.icon;
            return (
              <div key={s.id} className={`flex items-center p-4 rounded-2xl border-2 transition-all duration-300 ${
                status === "active" ? "border-orange-400 bg-orange-50 shadow-md" :
                status === "done" ? "border-green-200 bg-green-50" :
                "border-gray-100 bg-white opacity-40"
              }`}>
                <div className={`w-10 h-10 rounded-full flex items-center justify-center mr-4 flex-shrink-0 ${
                  status === "active" ? "bg-orange-100" :
                  status === "done" ? "bg-green-100" : "bg-gray-100"
                }`}>
                  {status === "active" ? (
                    <Loader2 className="w-5 h-5 text-orange-500 animate-spin" />
                  ) : status === "done" ? (
                    <Check className="w-5 h-5 text-green-600" />
                  ) : (
                    <Icon className="w-5 h-5 text-gray-400" />
                  )}
                </div>
                <div className="text-left flex-1">
                  <div className={`font-bold text-base ${
                    status === "active" ? "text-gray-900" :
                    status === "done" ? "text-green-700" : "text-gray-400"
                  }`}>{s.label}</div>
                  <div className={`text-sm mt-0.5 ${
                    status === "active" ? "text-orange-500" :
                    status === "done" ? "text-green-600" : "text-gray-300"
                  }`}>
                    {status === "active" ? (
                      progress.pageDetail && (s.id === "images" || s.id === "speech")
                        ? progress.pageDetail
                        : "进行中..."
                    ) : status === "done" ? "完成 ✓" : "等待中"}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        <p className="text-xs text-gray-400 mt-6">🎨 绘本制作需要1-3分钟，请耐心等待</p>
      </div>
    </div>
  );
}
function StoryPlayer({ story, onExit, onDownloadVideo }: { story: Story; onExit: () => void; onDownloadVideo?: () => void; }) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isZoomed, setIsZoomed] = useState(false);
  const [volume, setVolume] = useState(0.8);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const currentPage = story.pages[currentIndex];

  // 用 ref 记录当前是否处于连续播放状态（即播放完一页后自动翻页续播）
  const autoPlayRef = useRef(false);

  // 将 base64 PCM L16 转换为 WAV ArrayBuffer
  const pcmToWav = useCallback((base64: string, mime: string): ArrayBuffer => {
    const byteChars = atob(base64);
    const byteArr = new Uint8Array(byteChars.length);
    for (let i = 0; i < byteChars.length; i++) byteArr[i] = byteChars.charCodeAt(i);
    if (mime.includes("L16") || mime.includes("pcm") || mime.includes("raw")) {
      const sampleRate = parseInt(mime.match(/rate=(\d+)/)?.[1] ?? "24000");
      const numChannels = 1;
      const bitsPerSample = 16;
      const dataLen = byteArr.length;
      const wavHeader = new ArrayBuffer(44);
      const view = new DataView(wavHeader);
      const writeStr = (offset: number, str: string) => { for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i)); };
      writeStr(0, "RIFF");
      view.setUint32(4, 36 + dataLen, true);
      writeStr(8, "WAVE");
      writeStr(12, "fmt ");
      view.setUint32(16, 16, true);
      view.setUint16(20, 1, true);
      view.setUint16(22, numChannels, true);
      view.setUint32(24, sampleRate, true);
      view.setUint32(28, sampleRate * numChannels * bitsPerSample / 8, true);
      view.setUint16(32, numChannels * bitsPerSample / 8, true);
      view.setUint16(34, bitsPerSample, true);
      writeStr(36, "data");
      view.setUint32(40, dataLen, true);
      const wavBytes = new Uint8Array(44 + dataLen);
      wavBytes.set(new Uint8Array(wavHeader), 0);
      wavBytes.set(byteArr, 44);
      return wavBytes.buffer;
    }
    return byteArr.buffer;
  }, []);

  // 使用浏览器 Web Speech API 朗读文本（fallback方案）
  const speakWithBrowser = useCallback((text: string, idx: number) => {
    if (!window.speechSynthesis) {
      toast.error("当前浏览器不支持语音朗读");
      setIsPlaying(false);
      autoPlayRef.current = false;
      return;
    }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "zh-CN";
    utterance.rate = 0.85;
    utterance.pitch = 1.1;
    utterance.volume = volume;
    // 优先选择中文女声
    const voices = window.speechSynthesis.getVoices();
    const zhVoice = voices.find(v => v.lang.startsWith("zh") && v.name.toLowerCase().includes("female"))
      || voices.find(v => v.lang.startsWith("zh"));
    if (zhVoice) utterance.voice = zhVoice;
    utteranceRef.current = utterance;
    utterance.onend = () => {
      setIsPlaying(false);
      if (autoPlayRef.current && idx < story.pages.length - 1) {
        const nextIdx = idx + 1;
        setCurrentIndex(nextIdx);
        setTimeout(() => {
          const nextPage = story.pages[nextIdx];
          if (nextPage?.audioBase64) {
            playPageAudio(nextIdx);
          } else {
            speakWithBrowser(nextPage?.text ?? "", nextIdx);
          }
        }, 500);
      } else {
        autoPlayRef.current = false;
      }
    };
    utterance.onerror = () => {
      setIsPlaying(false);
      autoPlayRef.current = false;
    };
    window.speechSynthesis.speak(utterance);
    setIsPlaying(true);
  }, [story.pages, volume]);

  // 播放指定页的音频，播放完成后如果 autoPlayRef=true 则自动翻页并续播
  const playPageAudio = useCallback((idx: number) => {
    const page = story.pages[idx];
    // 先停止当前音频
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    window.speechSynthesis?.cancel();

    // 如果有服务端生成的音频，优先使用
    if (page?.audioBase64) {
      try {
        const mime = page.audioMime ?? "audio/mp3";
        let audioBuffer: ArrayBuffer;
        if (mime.includes("L16") || mime.includes("pcm") || mime.includes("raw")) {
          // PCM格式需要转换为WAV
          audioBuffer = pcmToWav(page.audioBase64, mime);
        } else {
          // MP3/AAC等格式直接解码base64
          const byteChars = atob(page.audioBase64);
          const byteArr = new Uint8Array(byteChars.length);
          for (let i = 0; i < byteChars.length; i++) byteArr[i] = byteChars.charCodeAt(i);
          audioBuffer = byteArr.buffer;
        }
        const blobMime = mime.includes("L16") || mime.includes("pcm") ? "audio/wav" : mime.split(";")[0];
        const blob = new Blob([audioBuffer], { type: blobMime });
        const blobUrl = URL.createObjectURL(blob);
        const audio = new Audio(blobUrl);
        audioRef.current = audio;
        audio.volume = volume;
        audio.addEventListener("ended", () => {
          setIsPlaying(false);
          URL.revokeObjectURL(blobUrl);
          if (autoPlayRef.current && idx < story.pages.length - 1) {
            const nextIdx = idx + 1;
            setCurrentIndex(nextIdx);
            setTimeout(() => playPageAudio(nextIdx), 400);
          } else {
            autoPlayRef.current = false;
          }
        });
        audio.play().catch(() => {
          // 服务端音频播放失败，降级到浏览器TTS
          speakWithBrowser(page.text, idx);
        });
        setIsPlaying(true);
        return;
      } catch {
        // 解码失败，降级到浏览器TTS
      }
    }
    // 没有服务端音频，使用浏览器 Web Speech API
    if (page?.text) {
      speakWithBrowser(page.text, idx);
    }
  }, [story.pages, volume, pcmToWav, speakWithBrowser]);

  const stopAudio = useCallback(() => {
    autoPlayRef.current = false;
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      audioRef.current = null;
    }
    window.speechSynthesis?.cancel();
    utteranceRef.current = null;
    setIsPlaying(false);
  }, []);

  const changePage = useCallback((idx: number) => {
    if (idx < 0 || idx >= story.pages.length) return;
    stopAudio();
    setCurrentIndex(idx);
  }, [story.pages.length, stopAudio]);

  const togglePlay = useCallback(() => {
    const page = story.pages[currentIndex];
    if (isPlaying) {
      // 暂停：停止自动播放并暂停音频
      autoPlayRef.current = false;
      if (audioRef.current) {
        audioRef.current.pause();
        setIsPlaying(false);
      } else {
        window.speechSynthesis?.pause();
        setIsPlaying(false);
      }
    } else {
      // 开始播放：设置自动播放标志，从当前页开始连续播放
      autoPlayRef.current = true;
      playPageAudio(currentIndex);
    }
  }, [currentIndex, isPlaying, story.pages, playPageAudio]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") changePage(currentIndex - 1);
      if (e.key === "ArrowRight") changePage(currentIndex + 1);
      if (e.key === " ") { e.preventDefault(); togglePlay(); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [currentIndex, changePage, togglePlay]);

  return (
    <div className="fixed inset-0 bg-slate-900 text-white flex flex-col z-50">
      {isZoomed && currentPage?.imageUrl && (
        <div className="fixed inset-0 bg-black/90 z-[100] flex items-center justify-center cursor-zoom-out" onClick={() => setIsZoomed(false)}>
          <img src={currentPage.imageUrl} alt="" className="max-w-[90vw] max-h-[90vh] object-contain rounded-2xl" />
        </div>
      )}
      <div className="absolute top-0 left-0 right-0 p-4 flex justify-between items-center bg-gradient-to-b from-black/60 to-transparent z-10">
        <button onClick={onExit} className="p-2 rounded-full hover:bg-white/20 transition"><Home className="w-6 h-6" /></button>
        <h1 className="text-xl font-bold drop-shadow-md">{story.title}</h1>
        <div className="w-10" />
      </div>
      <button className="absolute left-4 top-1/2 -translate-y-1/2 p-4 text-white/50 hover:text-white disabled:opacity-10 transition-all hover:scale-110 z-[70]"
        onClick={() => changePage(currentIndex - 1)} disabled={currentIndex === 0}>
        <ChevronLeft className="w-12 h-12 md:w-16 md:h-16" />
      </button>
      <button className="absolute right-4 top-1/2 -translate-y-1/2 p-4 text-white/50 hover:text-white disabled:opacity-10 transition-all hover:scale-110 z-[70]"
        onClick={() => changePage(currentIndex + 1)} disabled={currentIndex === story.pages.length - 1}>
        <ChevronRight className="w-12 h-12 md:w-16 md:h-16" />
      </button>
      <div className="w-full max-w-4xl mx-auto flex-1 flex flex-col md:flex-row items-center justify-center p-4 gap-6 pt-20">
        <div className="relative w-full md:w-1/2 aspect-square max-h-[55vh] bg-slate-800 rounded-2xl overflow-hidden shadow-2xl border-4 border-orange-200/20 cursor-zoom-in group"
          onClick={() => currentPage?.imageUrl && setIsZoomed(true)}>
          {currentPage?.imageUrl ? (
            <>
              <img src={currentPage.imageUrl} alt={`第${currentIndex + 1}页`} className="w-full h-full object-cover transition-opacity duration-500" />
              <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                <span className="bg-black/50 px-3 py-1 rounded-full text-sm">点击放大</span>
              </div>
            </>
          ) : (
            <div className="w-full h-full flex items-center justify-center text-slate-500">
              <Loader2 className="w-8 h-8 animate-spin" />
            </div>
          )}
        </div>
        <div className="w-full md:w-1/2 flex flex-col justify-center items-center md:items-start text-center md:text-left space-y-4">
          <div className="bg-white/10 backdrop-blur-md p-6 rounded-2xl border border-white/10 shadow-lg w-full">
            <p className="text-base md:text-lg leading-relaxed font-medium">{currentPage?.text}</p>
          </div>
          <div className="text-sm text-slate-400">第 {currentIndex + 1} 页 / 共 {story.pages.length} 页</div>
        </div>
      </div>
      <div className="w-full bg-slate-950 p-5 pb-8 border-t border-white/10">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <div className="hidden md:flex items-center gap-2 w-32">
            <Volume2 className="w-5 h-5 text-gray-400 flex-shrink-0" />
            <input type="range" min="0" max="1" step="0.1" value={volume}
              onChange={e => setVolume(parseFloat(e.target.value))}
              className="w-full h-1 bg-gray-600 rounded-lg appearance-none cursor-pointer accent-orange-500" />
          </div>
          <div className="flex items-center gap-6">
            <button onClick={() => changePage(currentIndex - 1)} disabled={currentIndex === 0}
              className="p-3 rounded-full hover:bg-white/10 disabled:opacity-30 transition">
              <SkipBack className="w-8 h-8" />
            </button>
            <button onClick={togglePlay} disabled={!currentPage?.text}
              className="p-5 bg-orange-500 hover:bg-orange-600 disabled:bg-gray-600 text-white rounded-full shadow-lg shadow-orange-500/30 transition-transform hover:scale-105 active:scale-95">
              {isPlaying ? <Pause className="w-8 h-8 fill-current" /> : <Play className="w-8 h-8 fill-current ml-1" />}
            </button>
            <button onClick={() => changePage(currentIndex + 1)} disabled={currentIndex === story.pages.length - 1}
              className="p-3 rounded-full hover:bg-white/10 disabled:opacity-30 transition">
              <SkipForward className="w-8 h-8" />
            </button>
          </div>
          <div className="hidden md:flex w-32 justify-end">
            {onDownloadVideo && (
              <button onClick={onDownloadVideo}
                className="flex items-center gap-1.5 px-3 py-2 bg-green-600 hover:bg-green-700 text-white text-sm font-bold rounded-xl transition-all hover:scale-105 active:scale-95 shadow-lg">
                <Download className="w-4 h-4" />
                <span>下载视频</span>
              </button>
            )}
          </div>
        </div>
        {/* 移动端下载按钮 */}
        {onDownloadVideo && (
          <div className="md:hidden flex justify-center mt-4">
            <button onClick={onDownloadVideo}
              className="flex items-center gap-2 px-5 py-3 bg-green-600 hover:bg-green-700 text-white font-bold rounded-xl transition-all shadow-lg">
              <Download className="w-5 h-5" />
              <span>下载视频到相册</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function StoryLibrary({ stories, onSelect, onDelete, onCreateNew }: {
  stories: Story[];
  onSelect: (s: Story) => void;
  onDelete: (id: string) => void;
  onCreateNew: () => void;
}) {
  if (stories.length === 0) {
    return (
      <div className="text-center py-20">
        <div className="w-24 h-24 bg-orange-100 rounded-full flex items-center justify-center mx-auto mb-6">
          <BookOpen className="w-12 h-12 text-orange-400" />
        </div>
        <h3 className="text-2xl font-bold text-gray-700 mb-2">书架还是空的</h3>
        <p className="text-gray-400 mb-8">快去创作第一个专属故事吧！</p>
        <Button onClick={onCreateNew} className="bg-orange-500 hover:bg-orange-600 text-white px-8 py-3 text-lg">
          <Wand2 className="w-5 h-5 mr-2" /> 创作故事
        </Button>
      </div>
    );
  }
  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold text-gray-800">我的故事书架</h2>
        <Button onClick={onCreateNew} className="bg-orange-500 hover:bg-orange-600 text-white">
          <Wand2 className="w-4 h-4 mr-2" /> 创作新故事
        </Button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {stories.map(story => (
          <Card key={story.id} className="border-orange-100 hover:border-orange-300 hover:shadow-md transition-all cursor-pointer" onClick={() => onSelect(story)}>
            <CardContent className="p-5">
              <div className="flex gap-4">
                {story.pages[0]?.imageUrl ? (
                  <img src={story.pages[0].imageUrl} alt="" className="w-20 h-20 rounded-xl object-cover flex-shrink-0" />
                ) : (
                  <div className="w-20 h-20 rounded-xl bg-orange-100 flex items-center justify-center flex-shrink-0">
                    <BookOpen className="w-8 h-8 text-orange-400" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <h3 className="font-bold text-gray-900 text-lg truncate">{story.title}</h3>
                  <p className="text-sm text-gray-500 mt-1 line-clamp-2">{story.pages[0]?.text}</p>
                  <div className="flex items-center gap-2 mt-2">
                    <Badge variant="secondary" className="text-xs bg-orange-100 text-orange-700">{story.theme}</Badge>
                    <span className="text-xs text-gray-400">{new Date(story.createdAt).toLocaleDateString()}</span>
                  </div>
                </div>
              </div>
              <div className="flex justify-end mt-3">
                <button onClick={e => { e.stopPropagation(); if (confirm("确定删除这个故事吗？")) onDelete(story.id); }}
                  className="text-xs text-red-400 hover:text-red-600 px-2 py-1 rounded transition-colors">
                  删除
                </button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

export default function StoryTime() {
  const [view, setView] = useState<View>("wizard");
  const [wizardParams, setWizardParams] = useState<{ childName?: string; age: number; theme: string; voiceType: string; customProtagonist?: string } | null>(null);
  const [topics, setTopics] = useState<TopicSuggestion[]>([]);
  const [selectedTopic, setSelectedTopic] = useState<TopicSuggestion | null>(null);
  const [storyStructure, setStoryStructure] = useState<{ title: string; pages: StoryPage[] } | null>(null);
  const [genProgress, setGenProgress] = useState<GenProgress>({ step: "story", message: "", percent: 0 });
  const [activeStory, setActiveStory] = useState<Story | null>(null);
  const [stories, setStories] = useState<Story[]>([]);
  const [showCreditsModal, setShowCreditsModal] = useState(false);

  const [isGeneratingVideo, setIsGeneratingVideo] = useState(false);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);

  const suggestTopicsMut = trpc.storyTime.suggestTopics.useMutation();
  const generateStructureMut = trpc.storyTime.generateStoryStructure.useMutation();
  const generatePageImageMut = trpc.storyTime.generatePageImage.useMutation();
  const generatePageSpeechMut = trpc.storyTime.generatePageSpeech.useMutation();
  const generateVideoMut = trpc.storyTime.generateVideo.useMutation();
  const utils = trpc.useUtils();

  useEffect(() => {
    try {
      const saved = localStorage.getItem("lejoy_story_library");
      if (saved) setStories(JSON.parse(saved));
    } catch { /* ignore */ }
  }, []);

  const handleDownloadVideo = async () => {
    if (!activeStory) return;
    // 如果已有视频URL，直接下载
    if (videoUrl) {
      const a = document.createElement("a");
      a.href = videoUrl;
      a.download = `${activeStory.title}.mp4`;
      a.click();
      toast.success("视频已下载，请在相册中查看🎉");
      return;
    }
    // 检查是否所有页面都有图片和语音
    const pagesReady = activeStory.pages.filter(p => p.imageUrl && p.audioBase64);
    if (pagesReady.length < activeStory.pages.length) {
      toast.error("请先完成故事的所有页面生成（图片+语音）再下载视频");
      return;
    }
    setIsGeneratingVideo(true);
    toast.info("正在合成视频，需要等录20-60秒...", { duration: 60000, id: "video-gen" });
    try {
      const result = await generateVideoMut.mutateAsync({
        title: activeStory.title,
        pages: activeStory.pages
          .filter(p => p.imageUrl && p.audioBase64)
          .map(p => ({
            pageNumber: p.pageNumber,
            imageUrl: p.imageUrl!,
            audioBase64: p.audioBase64!,
            audioMime: p.audioMime ?? "audio/wav",
            text: p.text,
          })),
      });
      setVideoUrl(result.videoUrl);
      toast.dismiss("video-gen");
      toast.success("视频合成完成！点击下载保存到相册🎉");
      // 自动触发下载
      const a = document.createElement("a");
      a.href = result.videoUrl;
      a.download = `${activeStory.title}.mp4`;
      a.click();
      utils.credits.balance.invalidate();
    } catch (err: unknown) {
      toast.dismiss("video-gen");
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("积分")) {
        setShowCreditsModal(true);
      } else {
        toast.error("视频生成失败，请重试");
      }
    } finally {
      setIsGeneratingVideo(false);
    }
  };

  const saveStories = (updated: Story[]) => {
    setStories(updated);
    try {
      const safe = updated.map(s => ({ ...s, pages: s.pages.map(p => ({ ...p, audioBase64: undefined })) }));
      localStorage.setItem("lejoy_story_library", JSON.stringify(safe));
    } catch { /* ignore */ }
  };

  const handleWizardSubmit = async (params: typeof wizardParams) => {
    if (!params) return;
    setWizardParams(params);
    setView("topics");
    try {
      const result = await suggestTopicsMut.mutateAsync({ theme: params.theme, childName: params.childName, age: params.age, customProtagonist: params.customProtagonist });
      setTopics(result);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("积分")) { setShowCreditsModal(true); setView("wizard"); }
      else { toast.error("获取题材失败，请重试"); setView("wizard"); }
    }
  };

  const handleTopicSelect = async (topic: TopicSuggestion) => {
    if (!wizardParams) return;
    // 如果用户指定了自定义主角，覆盖AI推荐的主角
    const finalProtagonist = wizardParams.customProtagonist || topic.protagonist;
    const finalTopic = { ...topic, protagonist: finalProtagonist };
    setSelectedTopic(finalTopic);
    setView("generating");
    setGenProgress({ step: "story", message: "正在构思奇妙的故事...", percent: 10 });
    try {
      const structure = await generateStructureMut.mutateAsync({
        childName: wizardParams.childName,
        age: wizardParams.age,
        theme: wizardParams.theme,
        topic: topic.title,
        protagonist: finalProtagonist,
      });
      setStoryStructure(structure);
      setView("preview");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("积分")) { setShowCreditsModal(true); setView("topics"); }
      else { toast.error("故事构思失败，请重试"); setView("topics"); }
    }
  };

  const handleConfirmGeneration = async (title: string, confirmedPages: StoryPage[]) => {
    if (!wizardParams || !selectedTopic) return;
    setView("generating");
    const totalPages = confirmedPages.length;
    try {
      // ── 阶段1：串行生成4张配图（逐页显示进度）──────────────────────────────
      const pagesWithImages: StoryPage[] = [...confirmedPages];

      for (let i = 0; i < confirmedPages.length; i++) {
        const page = confirmedPages[i];
        setGenProgress({
          step: "images",
          message: `正在绘制第 ${page.pageNumber} 页插画...`,
          percent: 10 + (i / totalPages) * 50,
          pageDetail: `第 ${page.pageNumber} 页 / 共 ${totalPages} 页`,
        });
        try {
          const imgResult = await generatePageImageMut.mutateAsync({
            imagePrompt: page.imagePrompt,
            pageNumber: page.pageNumber,
          });
          pagesWithImages[i] = { ...pagesWithImages[i], imageUrl: imgResult.imageUrl };
        } catch (err) {
          console.warn(`第${page.pageNumber}页插画生成失败:`, err);
          // 单页失败不中断，继续下一页
        }
      }

      setGenProgress({
        step: "images",
        message: "插画绘制完成！",
        percent: 60,
        pageDetail: `全部 ${totalPages} 页插画完成`,
      });

      // ── 阶段2：逐页合成语音 ──────────────────────────────────────────────────────
      const pagesWithAudio: StoryPage[] = pagesWithImages.map(p => ({ ...p, audioBase64: undefined }));
      let speechApiAvailable = true; // 如果第一页就失败，跳过后续语音请求

      for (let i = 0; i < confirmedPages.length; i++) {
        const page = confirmedPages[i];
        if (!speechApiAvailable) {
          // 语音API不可用，直接跳过
          setGenProgress({
            step: "speech",
            message: "语音配音跳过（将使用浏览器朗读）",
            percent: 60 + ((i + 1) / totalPages) * 35,
          });
          continue;
        }
        setGenProgress({
          step: "speech",
          message: `正在为第 ${page.pageNumber} 页配音...`,
          percent: 60 + ((i + 1) / totalPages) * 35,
          pageDetail: `第 ${page.pageNumber} 页 / 共 ${totalPages} 页`,
        });
        try {
          const speechResult = await generatePageSpeechMut.mutateAsync({
            pageNumber: page.pageNumber,
            text: page.text,
            voiceType: wizardParams.voiceType,
            isFirstPage: i === 0,
            title: i === 0 ? title : undefined,
          });
          pagesWithAudio[i] = { ...pagesWithAudio[i], audioBase64: speechResult.audioBase64, audioMime: speechResult.audioMime };
        } catch (err) {
          console.warn(`第${page.pageNumber}页语音生成失败:`, err);
          if (i === 0) {
            // 第一页就失败，说明语音API不可用，跳过剩余所有语音请求
            speechApiAvailable = false;
          }
          // 单页失败不中断，继续下一页
        }
      }

      setGenProgress({ step: "done", message: "故事绘本制作完成！", percent: 100, pageDetail: "全部完成" });

      const newStory: Story = {
        id: Date.now().toString(),
        title,
        pages: pagesWithAudio,
        theme: wizardParams.theme,
        protagonist: selectedTopic.protagonist,
        createdAt: Date.now(),
      };

      const updated = [newStory, ...stories];
      saveStories(updated);
      setActiveStory(newStory);
      utils.credits.balance.invalidate();
      setTimeout(() => setView("player"), 800);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("积分")) { setShowCreditsModal(true); setView("library"); }
      else { toast.error("生成过程中出现错误，请重试"); setView("library"); }
    }
  };

  return (
    <div className="min-h-screen pb-20">
      {view !== "player" && (
        <header className="bg-white/80 backdrop-blur-sm sticky top-0 z-10 border-b border-orange-100">
          <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <a href="/" className="flex items-center gap-1 text-gray-600 hover:text-orange-600 transition-colors font-bold px-2 py-1 rounded-lg hover:bg-orange-50">
                <ChevronLeft className="w-5 h-5" /><span>首页</span>
              </a>
              <div className="h-6 w-px bg-gray-200 hidden sm:block" />
              <div className="flex items-center gap-2">
                <div className="bg-orange-500 p-2 rounded-lg text-white shadow-sm">
                  <BookOpen className="w-5 h-5" />
                </div>
                <h1 className="text-xl font-bold bg-gradient-to-r from-orange-600 to-red-500 bg-clip-text text-transparent hidden sm:block">AI故事会</h1>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {(view === "wizard" || view === "topics" || view === "preview") && (
                <Button variant="ghost" onClick={() => setView("library")} className="text-gray-600 font-bold">我的书架</Button>
              )}
              {view === "library" && (
                <Button onClick={() => setView("wizard")} className="bg-orange-500 hover:bg-orange-600 text-white">+ 创作故事</Button>
              )}
            </div>
          </div>
        </header>
      )}

      <main className="pt-8 px-4">
        {view === "wizard" && <StoryWizard onSubmit={handleWizardSubmit} />}
        {view === "topics" && (
          <TopicSelector topics={topics} isLoading={suggestTopicsMut.isPending}
            onSelect={handleTopicSelect} onBack={() => setView("wizard")}
            onRefresh={() => wizardParams && handleWizardSubmit(wizardParams)} />
        )}
        {view === "preview" && storyStructure && (
          <StoryPreview title={storyStructure.title} pages={storyStructure.pages}
            onConfirm={handleConfirmGeneration} onCancel={() => setView("topics")} />
        )}
        {view === "generating" && <GenerationView progress={genProgress} />}
        {view === "player" && activeStory && (
          <StoryPlayer
            story={activeStory}
            onExit={() => { setView("library"); setVideoUrl(null); }}
            onDownloadVideo={isGeneratingVideo ? undefined : handleDownloadVideo}
          />
        )}
        {view === "library" && (
          <StoryLibrary stories={stories}
            onSelect={s => { setActiveStory(s); setView("player"); }}
            onDelete={id => saveStories(stories.filter(s => s.id !== id))}
            onCreateNew={() => setView("wizard")} />
        )}
      </main>

      <InsufficientCreditsModal isOpen={showCreditsModal} onClose={() => setShowCreditsModal(false)} />
    </div>
  );
}
