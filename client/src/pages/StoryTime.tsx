import { useState, useRef, useEffect, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { ModuleHeader } from "@/components/ModuleHeader";
import { VoiceButton } from "@/components/VoiceButton";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { Loader2, BookOpen, ChevronLeft, ChevronRight, Volume2, VolumeX, Sparkles, Dice5, Download, Library, Trash2, Eye, Clock, CheckCircle2, Image as ImageIcon, Mic, FileText, RefreshCw, Play, Pause } from "lucide-react";
import { exportStoryToMp4, isExportSupported } from "@/lib/exportMp4";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { STORY_THEMES, STORY_IDEAS, VOICE_OPTIONS } from "@shared/appTypes";

type StoryPage = { pageNumber: number; text: string; imagePrompt: string; imageUrl?: string; audioUrl?: string };
type Story = { title: string; characterDescription: string; pages: StoryPage[] };
type ProgressStep = { label: string; status: "pending" | "active" | "done" | "error"; detail?: string };

export default function StoryTime() {
  const [, setLocation] = useLocation();
  // Steps: form → generating → confirm → producing → reading → library
  const [step, setStep] = useState<"form" | "generating" | "confirm" | "producing" | "reading" | "library">("form");
  const [childName, setChildName] = useState("");
  const [age, setAge] = useState("5");
  const [topic, setTopic] = useState("");
  const [theme, setTheme] = useState("adventure");
  const [pageCount, setPageCount] = useState(4);
  const [voiceType, setVoiceType] = useState("grandma");
  const [story, setStory] = useState<Story | null>(null);
  const [currentPage, setCurrentPage] = useState(0);
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const [isAutoPlaying, setIsAutoPlaying] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const [audioStatus, setAudioStatus] = useState("");
  const shouldAutoPlayOnReadyRef = useRef(false);
  const [audioError, setAudioError] = useState("");
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioStopResolverRef = useRef<(() => void) | null>(null);

  // Progress tracking
  const [progressSteps, setProgressSteps] = useState<ProgressStep[]>([]);
  const [progressPercent, setProgressPercent] = useState(0);
  const [startTime, setStartTime] = useState(0);
  const [elapsedTime, setElapsedTime] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const autoPlayRef = useRef(false);

  const generateMut = trpc.storyTime.generate.useMutation();
  const imageMut = trpc.storyTime.generatePageImage.useMutation();
  const audioMut = trpc.storyTime.generatePageAudio.useMutation();
  const deleteMut = trpc.storyTime.delete.useMutation({
    onSuccess: () => { toast.success("故事已删除"); savedStoriesQuery.refetch(); },
    onError: (e) => toast.error(e.message),
  });
  const savedStoriesQuery = trpc.storyTime.list.useQuery(undefined, { enabled: false });

  const randomIdea = () => {
    const themeIdeas = STORY_IDEAS[theme as keyof typeof STORY_IDEAS] || STORY_IDEAS.adventure;
    const idea = themeIdeas[Math.floor(Math.random() * themeIdeas.length)];
    setTopic(idea);
  };

  const formatTime = (ms: number) => {
    const s = Math.floor(ms / 1000);
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return m > 0 ? `${m}分${sec}秒` : `${sec}秒`;
  };

  const updateStep = (steps: ProgressStep[], idx: number, status: ProgressStep["status"], detail?: string) => {
    const updated = [...steps];
    updated[idx] = { ...updated[idx], status, detail: detail || updated[idx].detail };
    setProgressSteps(updated);
    return updated;
  };

  // Step 1: Generate story structure only (for confirmation)
  const handleGenerate = async () => {
    if (!topic.trim()) { toast.error("请输入或选择一个故事主题"); return; }

    setStep("generating");
    const t0 = Date.now();
    setStartTime(t0);
    setElapsedTime(0);
    timerRef.current = setInterval(() => setElapsedTime(Date.now() - t0), 1000);

    const steps: ProgressStep[] = [{ label: "创作故事结构", status: "active" }];
    setProgressSteps(steps);
    setProgressPercent(0);

    try {
      const effectiveName = childName.trim() || "小朋友";
      const result = await generateMut.mutateAsync({ childName: effectiveName, age, topic, theme, pageCount, voiceType });
      updateStep(steps, 0, "done", "故事结构创作完成");
      setProgressPercent(100);
      if (timerRef.current) clearInterval(timerRef.current);

      const newStory: Story = {
        title: result.title,
        characterDescription: result.characterDescription,
        pages: result.pages.map((p: any) => ({
          pageNumber: p.pageNumber, text: p.text, imagePrompt: p.imagePrompt,
        })),
      };
      setStory(newStory);
      // Go to confirmation step
      setStep("confirm");
    } catch (e: any) {
      if (timerRef.current) clearInterval(timerRef.current);
      toast.error(e.message || "故事生成失败");
      setStep("form");
    }
  };

  // Step 2: User confirmed story, now produce images + audio
  const handleConfirmStory = async () => {
    if (!story) return;
    setStep("producing");
    const t0 = Date.now();
    setStartTime(t0);
    setElapsedTime(0);
    timerRef.current = setInterval(() => setElapsedTime(Date.now() - t0), 1000);

    const totalSteps = story.pages.length * 2; // N images + N audios
    let steps: ProgressStep[] = [];
    for (let i = 0; i < story.pages.length; i++) {
      steps.push({ label: `\u7ed8\u5236\u7b2c${i + 1}\u9875\u63d2\u56fe`, status: "pending" });
    }
    for (let i = 0; i < story.pages.length; i++) {
      steps.push({ label: `\u751f\u6210\u7b2c${i + 1}\u9875\u8bed\u97f3`, status: "pending" });
    }
    setProgressSteps(steps);
    setProgressPercent(0);

    const updatedStory = { ...story };

    try {
      // Generate all images
      for (let i = 0; i < updatedStory.pages.length; i++) {
        steps = updateStep(steps, i, "active", "\u6b63\u5728\u7ed8\u5236...");
        setProgressSteps([...steps]);
        try {
          const imgResult = await imageMut.mutateAsync({ imagePrompt: updatedStory.pages[i].imagePrompt });
          updatedStory.pages[i].imageUrl = imgResult.imageUrl;
          steps = updateStep(steps, i, "done", "\u63d2\u56fe\u5b8c\u6210");
        } catch (e: any) {
          console.error(`Page ${i + 1} image failed:`, e);
          steps = updateStep(steps, i, "error", "\u63d2\u56fe\u751f\u6210\u5931\u8d25");
        }
        setProgressPercent(Math.round(((i + 1) / totalSteps) * 100));
      }

      // Generate ALL page audios
      const audioBaseIdx = story.pages.length;
      for (let i = 0; i < updatedStory.pages.length; i++) {
        const stepIdx = audioBaseIdx + i;
        steps = updateStep(steps, stepIdx, "active", "\u6b63\u5728\u5408\u6210\u8bed\u97f3...");
        setProgressSteps([...steps]);
        try {
          const audioResult = await audioMut.mutateAsync({ text: updatedStory.pages[i].text, voiceType });
          updatedStory.pages[i].audioUrl = audioResult.audioUrl;
          steps = updateStep(steps, stepIdx, "done", "\u8bed\u97f3\u5b8c\u6210");
        } catch (e) {
          console.error(`Page ${i + 1} audio failed:`, e);
          steps = updateStep(steps, stepIdx, "error", "\u8bed\u97f3\u5408\u6210\u5931\u8d25");
        }
        setProgressPercent(Math.round(((story.pages.length + i + 1) / totalSteps) * 100));
      }
      setProgressPercent(100);

      if (timerRef.current) clearInterval(timerRef.current);
      setStory(updatedStory);
      setCurrentPage(0);
      setAudioError("");
      setAudioStatus(updatedStory.pages[0].audioUrl ? "\u5373\u5c06\u5f00\u59cb\u81ea\u52a8\u6717\u8bfb..." : "\u6545\u4e8b\u5df2\u751f\u6210\uff0c\u82e5\u8bed\u97f3\u7f3a\u5931\u53ef\u5728\u9605\u8bfb\u9875\u91cd\u8bd5");
      shouldAutoPlayOnReadyRef.current = !!updatedStory.pages[0].audioUrl;
      setStep("reading");

      if (!updatedStory.pages[0].audioUrl) {
        toast.error("\u6545\u4e8b\u5df2\u751f\u6210\uff0c\u4f46\u9996\u6bb5\u8bed\u97f3\u672a\u51c6\u5907\u597d\uff0c\u53ef\u5728\u9605\u8bfb\u9875\u91cd\u8bd5");
      }
    } catch (e: any) {
      if (timerRef.current) clearInterval(timerRef.current);
      toast.error(e.message || "创作失败");
      setStep("confirm");
    }
  };

  // Regenerate story structure (user not satisfied)
  const handleRegenerate = async () => {
    setStory(null);
    handleGenerate();
  };

  const handleExportMp4 = async () => {
    if (!story || isExporting) return;
    if (!isExportSupported()) {
      toast.error("当前浏览器不支持视频导出，请使用最新版 Chrome 浏览器");
      return;
    }
    setIsExporting(true);
    setExportProgress(0);
    try {
      const blob = await exportStoryToMp4(story.pages, story.title, (p) => setExportProgress(p));
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${story.title}.mp4`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success("MP4导出成功！");
    } catch (e: any) {
      toast.error(e.message || "MP4导出失败");
    } finally {
      setIsExporting(false);
    }
  };

  const handleOpenLibrary = () => { savedStoriesQuery.refetch(); setStep("library"); };

  const handleLoadStory = (savedStory: any) => {
    const loadedStory: Story = {
      title: savedStory.title,
      characterDescription: savedStory.characterName,
      pages: (savedStory.pages as any[]).map((p: any) => ({
        pageNumber: p.pageNumber, text: p.text, imagePrompt: p.imagePrompt || "", imageUrl: p.imageUrl, audioUrl: p.audioUrl,
      })),
    };
    setStory(loadedStory);
    setCurrentPage(0);
    setAudioError("");
    setAudioStatus(loadedStory.pages[0]?.audioUrl ? "已加载已保存语音，可直接播放" : "已加载故事，本页语音将在首次播放时生成");
    setStep("reading");
  };

  const stopAudio = useCallback((clearStatus = true) => {
    if (audioRef.current) {
      audioRef.current.onended = null;
      audioRef.current.onerror = null;
      audioRef.current.onplaying = null;
      audioRef.current.pause();
      audioRef.current.src = "";
      audioRef.current = null;
    }
    if (audioStopResolverRef.current) {
      audioStopResolverRef.current();
      audioStopResolverRef.current = null;
    }
    setIsPlayingAudio(false);
    if (clearStatus) setAudioStatus("");
  }, []);

  const getAudioPlayErrorMessage = (error: unknown, trigger: "manual" | "auto") => {
    const err = error as { name?: string; message?: string } | undefined;
    if (err?.name === "NotAllowedError") {
      return trigger === "auto"
        ? "\u6d4f\u89c8\u5668\u963b\u6b62\u4e86\u81ea\u52a8\u64ad\u653e\uff0c\u8bf7\u70b9\u51fb\u300c\u81ea\u52a8\u64ad\u653e\u300d\u6216\u300c\u6717\u8bfb\u672c\u9875\u300d\u7ee7\u7eed"
        : "\u6d4f\u89c8\u5668\u963b\u6b62\u4e86\u97f3\u9891\u64ad\u653e\uff0c\u8bf7\u5148\u70b9\u51fb\u9875\u9762\u540e\u91cd\u8bd5";
    }
    if (err?.name === "NotSupportedError") {
      return "当前语音文件格式无法播放，请重新生成本页语音";
    }
    return err?.message ? `音频播放失败：${err.message}` : "音频播放失败，请稍后重试";
  };

  const ensurePageAudio = useCallback(async (pageIndex: number, forceRegenerate = false): Promise<string | null> => {
    if (!story) return null;
    const page = story.pages[pageIndex];
    if (!page) return null;
    if (page.audioUrl && !forceRegenerate) {
      return page.audioUrl;
    }

    setAudioError("");
    setAudioStatus(`正在生成第${pageIndex + 1}页语音...`);

    try {
      const result = await audioMut.mutateAsync({ text: page.text, voiceType });
      setStory(prev => prev ? {
        ...prev,
        pages: prev.pages.map((item, idx) => idx === pageIndex ? { ...item, audioUrl: result.audioUrl } : item),
      } : prev);
      setAudioStatus(`第${pageIndex + 1}页语音已生成，准备播放`);
      return result.audioUrl;
    } catch (e: any) {
      const message = e?.message || "语音生成失败，请稍后重试";
      setAudioError(message);
      setAudioStatus("");
      toast.error(message);
      return null;
    }
  }, [story, audioMut, voiceType]);

  // Play audio for a specific page, returns a promise that resolves when audio ends
  const playPageAudio = useCallback(async (
    pageIndex: number,
    options: { forceRegenerate?: boolean; trigger?: "manual" | "auto" } = {}
  ): Promise<boolean> => {
    if (!story) return false;
    const page = story.pages[pageIndex];
    if (!page) return false;

    const { forceRegenerate = false, trigger = "manual" } = options;
    const audioUrl = await ensurePageAudio(pageIndex, forceRegenerate);
    if (!audioUrl) return false;

    stopAudio(false);
    setAudioError("");

    return new Promise<boolean>((resolve) => {
      const audio = new Audio(audioUrl);
      const timeoutId = window.setTimeout(() => {
        finish(false, "音频加载超时，请稍后重试");
      }, 15000);
      let settled = false;

      const cleanup = () => {
        window.clearTimeout(timeoutId);
        if (audioStopResolverRef.current === stopPlaybackSilently) {
          audioStopResolverRef.current = null;
        }
        audio.onended = null;
        audio.onerror = null;
        audio.onplaying = null;
      };

      const finish = (success: boolean, errorMessage?: string, silent = false) => {
        if (settled) return;
        settled = true;
        cleanup();
        if (audioRef.current === audio) {
          audioRef.current = null;
        }
        setIsPlayingAudio(false);
        if (success) {
          setAudioStatus(`第${pageIndex + 1}页朗读完成`);
          setAudioError("");
        } else if (!silent) {
          if (errorMessage) {
            setAudioError(errorMessage);
            setAudioStatus("");
            toast.error(errorMessage);
          }
        }
        resolve(success);
      };

      const stopPlaybackSilently = () => finish(false, undefined, true);
      audioStopResolverRef.current = stopPlaybackSilently;
      audioRef.current = audio;
      audio.preload = "auto";
      setIsPlayingAudio(true);
      setAudioStatus(`正在朗读第${pageIndex + 1}页...`);

      audio.onplaying = () => {
        setIsPlayingAudio(true);
        setAudioStatus(`正在朗读第${pageIndex + 1}页...`);
      };
      audio.onended = () => finish(true);
      audio.onerror = () => finish(false, "音频加载失败，可能是语音文件已失效或格式不可播放");

      audio.play().catch((err) => {
        finish(false, getAudioPlayErrorMessage(err, trigger));
      });
    });
  }, [story, ensurePageAudio, stopAudio]);

  // Auto-play: play all pages sequentially from page 0
  const startAutoPlay = useCallback(async () => {
    if (!story || autoPlayRef.current) return;
    setAudioError("");
    setIsAutoPlaying(true);
    autoPlayRef.current = true;

    for (let pageIdx = 0; pageIdx < story.pages.length; pageIdx++) {
      if (!autoPlayRef.current) break;
      setCurrentPage(pageIdx);

      // Small delay to let UI update before playing
      await new Promise(r => setTimeout(r, 200));
      if (!autoPlayRef.current) break;

      const success = await playPageAudio(pageIdx, { trigger: "auto" });
      if (!autoPlayRef.current) break;
      if (!success) break;
    }

    setIsAutoPlaying(false);
    autoPlayRef.current = false;
    if (!autoPlayRef.current) {
      setAudioStatus("\u6545\u4e8b\u6717\u8bfb\u5b8c\u6210");
      toast.success("\u6545\u4e8b\u8bb2\u5b8c\u4e86\uff01");
    }
  }, [story, playPageAudio]);

  const stopAutoPlay = useCallback(() => {
    autoPlayRef.current = false;
    setIsAutoPlaying(false);
    stopAudio();
  }, [stopAudio]);

  // Single page play (manual)
  const playSinglePage = async () => {
    stopAutoPlay();
    await playPageAudio(currentPage, { trigger: "manual" });
  };

  const regenerateCurrentPageAudio = async () => {
    if (!story) return;
    stopAutoPlay();
    setStory(prev => prev ? {
      ...prev,
      pages: prev.pages.map((item, idx) => idx === currentPage ? { ...item, audioUrl: undefined } : item),
    } : prev);
    await playPageAudio(currentPage, { forceRegenerate: true, trigger: "manual" });
  };

  // Keep a stable ref to startAutoPlay to avoid useEffect dependency issues
  const startAutoPlayRef = useRef(startAutoPlay);
  startAutoPlayRef.current = startAutoPlay;

  // Auto-start playback when entering reading step after story generation
  useEffect(() => {
    if (step === "reading" && shouldAutoPlayOnReadyRef.current) {
      shouldAutoPlayOnReadyRef.current = false;
      const timer = setTimeout(() => {
        startAutoPlayRef.current();
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [step]);

  useEffect(() => {
    return () => {
      stopAudio();
      autoPlayRef.current = false;
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const goPage = (dir: number) => {
    stopAutoPlay();
    setCurrentPage(prev => Math.max(0, Math.min((story?.pages.length || 1) - 1, prev + dir)));
  };

  // ─── Library Step ───
  if (step === "library") {
    const stories = savedStoriesQuery.data || [];
    return (
      <div className="min-h-screen bg-background">
        <ModuleHeader title="我的故事库" icon="📚" onBack={() => setStep("form")} />
        <div className="container py-6 space-y-4">
          {savedStoriesQuery.isLoading ? (
            <div className="text-center py-12">
              <Loader2 className="w-8 h-8 animate-spin mx-auto mb-2 text-primary" />
              <p className="text-sm text-muted-foreground">加载中...</p>
            </div>
          ) : stories.length === 0 ? (
            <div className="text-center py-12">
              <BookOpen className="w-12 h-12 mx-auto mb-3 text-muted-foreground" />
              <p className="text-muted-foreground">还没有保存的故事</p>
              <Button className="mt-4" onClick={() => setStep("form")}>
                <Sparkles className="w-4 h-4 mr-2" /> 创作第一个故事
              </Button>
            </div>
          ) : (
            stories.map((s: any) => (
              <Card key={s.id} className="overflow-hidden">
                <CardContent className="pt-4">
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-base truncate">{s.title}</h3>
                      <p className="text-xs text-muted-foreground mt-1">
                        主角：{s.characterName} · {s.pageCount}页 · {new Date(s.createdAt).toLocaleDateString("zh-CN")}
                      </p>
                    </div>
                    <div className="flex gap-1 ml-2 shrink-0">
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleLoadStory(s)}>
                        <Eye className="w-4 h-4" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive"
                        onClick={() => { if (confirm("确定删除这个故事吗？")) deleteMut.mutate({ id: s.id }); }}>
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </div>
    );
  }

  // ─── Form Step ───
  if (step === "form") {
    return (
      <div className="min-h-screen bg-background">
        <ModuleHeader title="AI 故事会" icon="📖" onBack={() => setLocation("/")} />
        <div className="container py-6 space-y-4">
          <Button variant="outline" className="w-full" onClick={handleOpenLibrary}>
            <Library className="w-4 h-4 mr-2" /> 我的故事库
          </Button>

          <Card>
            <CardContent className="pt-6 space-y-4">
              {/* Child Info */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-sm">孩子的名字（可选）</Label>
                  <Input value={childName} onChange={e => setChildName(e.target.value)} placeholder="不填则用小朋友" className="mt-1" />
                </div>
                <div>
                  <Label className="text-sm">年龄</Label>
                  <Select value={age} onValueChange={setAge}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {["3", "4", "5", "6", "7", "8", "9", "10"].map(a => (
                        <SelectItem key={a} value={a}>{a}岁</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Voice Selection */}
              <div>
                <Label className="text-sm">朗读音色</Label>
                <div className="grid grid-cols-4 gap-2 mt-1">
                  {VOICE_OPTIONS.map(v => (
                    <Button
                      key={v.id}
                      variant={voiceType === v.id ? "default" : "outline"}
                      size="sm"
                      onClick={() => setVoiceType(v.id)}
                      className="text-xs h-9"
                    >
                      {v.label}
                    </Button>
                  ))}
                </div>
              </div>

              {/* Story Theme */}
              <div>
                <Label className="text-sm">故事风格</Label>
                <div className="grid grid-cols-3 gap-2 mt-1">
                  {STORY_THEMES.map(t => (
                    <Button
                      key={t.id}
                      variant={theme === t.id ? "default" : "outline"}
                      size="sm"
                      onClick={() => { setTheme(t.id); setTopic(""); }}
                      className="h-auto py-2 flex-col gap-0.5"
                    >
                      <span className="text-base">{t.icon}</span>
                      <span className="text-xs">{t.label}</span>
                    </Button>
                  ))}
                </div>
              </div>

              {/* Topic */}
              <div>
                <Label className="text-sm">故事主题</Label>
                <div className="flex gap-2 mt-1">
                  <Input value={topic} onChange={e => setTopic(e.target.value)} placeholder="输入或点击随机获取" className="flex-1" />
                  <Button variant="outline" size="icon" onClick={randomIdea} title="随机创意">
                    <Dice5 className="w-5 h-5" />
                  </Button>
                  <VoiceButton onResult={setTopic} />
                </div>
              </div>

              {/* Page Count */}
              <div>
                <Label className="text-sm">故事页数</Label>
                <div className="flex gap-2 mt-1">
                  {[4, 6, 8].map(n => (
                    <Button
                      key={n}
                      variant={pageCount === n ? "default" : "outline"}
                      size="sm"
                      onClick={() => setPageCount(n)}
                      className="flex-1"
                    >
                      {n}页
                    </Button>
                  ))}
                </div>
              </div>

              <Button className="w-full h-12 text-base" onClick={handleGenerate} disabled={generateMut.isPending}>
                <Sparkles className="w-5 h-5 mr-2" /> 开始创作故事
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  // ─── Generating Step (story structure only) ───
  if (step === "generating") {
    return (
      <div className="min-h-screen bg-background">
        <ModuleHeader title="AI 故事会" icon="📖" onBack={() => setStep("form")} />
        <div className="container py-6 space-y-6">
          <div className="text-center">
            <Loader2 className="w-10 h-10 animate-spin mx-auto mb-3 text-primary" />
            <h2 className="text-lg font-semibold mb-1">正在构思故事...</h2>
            <p className="text-sm text-muted-foreground flex items-center justify-center gap-1">
              <Clock className="w-4 h-4" /> 已用时 {formatTime(elapsedTime)}
            </p>
          </div>
          <Progress value={progressPercent} className="h-3" />
          <p className="text-center text-xs text-muted-foreground">
            正在为您创作故事结构，完成后可以预览和确认
          </p>
        </div>
      </div>
    );
  }

  // ─── Confirm Step (preview story text before generating images) ───
  if (step === "confirm" && story) {
    return (
      <div className="min-h-screen bg-background">
        <ModuleHeader title="确认故事内容" icon="📖" onBack={() => setStep("form")} />
        <div className="container py-6 space-y-4">
          {/* Story Title */}
          <Card className="border-primary/20 bg-primary/5">
            <CardContent className="pt-4">
              <h2 className="text-xl font-bold text-center">{story.title}</h2>
              <p className="text-sm text-muted-foreground text-center mt-1">
                共{story.pages.length}页 · 请确认故事内容是否满意
              </p>
            </CardContent>
          </Card>

          {/* Story Pages Preview */}
          <div className="space-y-3">
            {story.pages.map((page, i) => (
              <Card key={i}>
                <CardContent className="pt-3 pb-3">
                  <div className="flex items-start gap-3">
                    <span className="shrink-0 w-7 h-7 bg-primary/10 text-primary rounded-full flex items-center justify-center text-sm font-bold">
                      {page.pageNumber}
                    </span>
                    <p className="text-sm leading-relaxed flex-1">{page.text}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Action Buttons */}
          <div className="flex gap-3">
            <Button
              variant="outline"
              className="flex-1 h-12"
              onClick={handleRegenerate}
              disabled={generateMut.isPending}
            >
              {generateMut.isPending ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <RefreshCw className="w-4 h-4 mr-2" />
              )}
              不满意，重新生成
            </Button>
            <Button
              className="flex-1 h-12"
              onClick={handleConfirmStory}
            >
              <Sparkles className="w-4 h-4 mr-2" />
              满意，开始配图配音
            </Button>
          </div>

          <p className="text-center text-xs text-muted-foreground">
            确认后将为每页生成精美插图和语音朗读
          </p>
        </div>
      </div>
    );
  }

  // ─── Producing Step (images + audio with detailed progress) ───
  if (step === "producing") {
    const getStepIcon = (s: ProgressStep) => {
      if (s.status === "done") return <CheckCircle2 className="w-5 h-5 text-green-500 shrink-0" />;
      if (s.status === "active") return <Loader2 className="w-5 h-5 animate-spin text-primary shrink-0" />;
      if (s.status === "error") return <span className="w-5 h-5 rounded-full bg-red-100 text-red-500 flex items-center justify-center text-xs shrink-0">!</span>;
      return <span className="w-5 h-5 rounded-full bg-muted flex items-center justify-center text-xs text-muted-foreground shrink-0">·</span>;
    };

    const getStepTypeIcon = (label: string) => {
      if (label.includes("插图")) return <ImageIcon className="w-4 h-4 text-purple-500" />;
      if (label.includes("语音")) return <Mic className="w-4 h-4 text-orange-500" />;
      return null;
    };

    return (
      <div className="min-h-screen bg-background">
        <ModuleHeader title="AI 故事会" icon="📖" onBack={() => setStep("confirm")} />
        <div className="container py-6 space-y-6">
          <div className="text-center">
            <h2 className="text-lg font-semibold mb-1">正在为故事配图配音</h2>
            <div className="flex items-center justify-center gap-4 text-sm text-muted-foreground">
              <span className="flex items-center gap-1">
                <Clock className="w-4 h-4" /> 已用时 {formatTime(elapsedTime)}
              </span>
              <span>进度 {progressPercent}%</span>
            </div>
          </div>

          <Progress value={progressPercent} className="h-3" />

          <Card>
            <CardContent className="pt-4 space-y-3">
              {progressSteps.map((s, i) => (
                <div key={i} className={`flex items-center gap-3 py-2 px-3 rounded-lg transition-colors ${
                  s.status === "active" ? "bg-primary/5" : s.status === "done" ? "bg-green-50" : s.status === "error" ? "bg-red-50" : ""
                }`}>
                  {getStepIcon(s)}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      {getStepTypeIcon(s.label)}
                      <span className={`text-sm font-medium ${s.status === "pending" ? "text-muted-foreground" : ""}`}>
                        {s.label}
                      </span>
                    </div>
                    {s.detail && (
                      <p className={`text-xs mt-0.5 ${s.status === "error" ? "text-red-500" : "text-muted-foreground"}`}>
                        {s.detail}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          <p className="text-center text-xs text-muted-foreground">
            配图配音大约需要1-3分钟，请耐心等待
          </p>
        </div>
      </div>
    );
  }

  // ─── Reading Step ───
  if (!story) return null;
  const page = story.pages[currentPage];

  return (
    <div className="min-h-screen bg-background">
      <ModuleHeader title={story.title} icon="📖" onBack={() => { stopAutoPlay(); setStep("form"); }} />
      <div className="container py-4 space-y-4">
        {/* Page Image */}
        {page.imageUrl ? (
          <div className="rounded-2xl overflow-hidden shadow-lg animate-fade-in">
            <img src={page.imageUrl} alt={`第${page.pageNumber}页`} className="w-full aspect-[4/3] object-cover" />
          </div>
        ) : (
          <div className="rounded-2xl bg-muted aspect-[4/3] flex items-center justify-center">
            <div className="text-center">
              <ImageIcon className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
              <p className="text-xs text-muted-foreground">插图生成失败</p>
            </div>
          </div>
        )}

        {/* Page Text */}
        <Card>
          <CardContent className="pt-4">
            <p className="text-base leading-relaxed">{page.text}</p>
          </CardContent>
        </Card>

        <Card className={audioError ? "border-destructive/40 bg-destructive/5" : "border-primary/20 bg-primary/5"}>
          <CardContent className="pt-4">
            <div className="flex items-start gap-2">
              <Mic className={`w-4 h-4 mt-0.5 shrink-0 ${audioError ? "text-destructive" : "text-primary"}`} />
              <div className="space-y-1">
                <p className={`text-sm ${audioError ? "text-destructive" : "text-foreground"}`}>
                  {audioError || audioStatus || (page.audioUrl ? "本页语音已生成，可直接播放" : "本页语音将在首次播放时生成")}
                </p>
                <p className="text-xs text-muted-foreground">
                  {audioError ? "\u5982\u591a\u6b21\u5931\u8d25\uff0c\u53ef\u70b9\u51fb\u300c\u91cd\u751f\u6210\u8bed\u97f3\u300d\u91cd\u65b0\u62c9\u53d6\u5e76\u64ad\u653e\u3002" : "\u9996\u6b21\u64ad\u653e\u4f1a\u4f18\u5148\u68c0\u67e5\u5df2\u751f\u6210\u8bed\u97f3\uff0c\u6ca1\u6709\u5219\u81ea\u52a8\u8865\u751f\u6210\u3002"}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Controls */}
        <div className="flex items-center justify-between">
          <Button variant="outline" size="icon" onClick={() => goPage(-1)} disabled={currentPage === 0 || isAutoPlaying}>
            <ChevronLeft className="w-5 h-5" />
          </Button>
          <div className="flex items-center gap-2 flex-wrap justify-center">
            {/* Auto-play toggle */}
            <Button
              variant={isAutoPlaying ? "destructive" : "default"}
              size="sm"
              onClick={isAutoPlaying ? stopAutoPlay : startAutoPlay}
              disabled={audioMut.isPending}
              className="gap-1"
            >
              {audioMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> :
                isAutoPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
              {isAutoPlaying ? "暂停" : "自动播放"}
            </Button>
            {!isAutoPlaying && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={isPlayingAudio ? () => stopAudio() : playSinglePage}
                  disabled={audioMut.isPending}
                  className="gap-1"
                >
                  {isPlayingAudio ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                  {isPlayingAudio ? "停止" : "朗读本页"}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={regenerateCurrentPageAudio}
                  disabled={audioMut.isPending || isPlayingAudio}
                  className="gap-1"
                >
                  <RefreshCw className="w-4 h-4" /> 重生成语音
                </Button>
              </>
            )}
            <span className="text-sm text-muted-foreground">{currentPage + 1}/{story.pages.length}</span>
          </div>
          <Button variant="outline" size="icon" onClick={() => goPage(1)} disabled={currentPage === story.pages.length - 1 || isAutoPlaying}>
            <ChevronRight className="w-5 h-5" />
          </Button>
        </div>

        {/* Save & New Story */}
        <div className="flex gap-3">
          <Button variant="outline" className="flex-1" onClick={handleExportMp4} disabled={isExporting}>
            {isExporting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Download className="w-4 h-4 mr-2" />}
            {isExporting ? `导出中 ${exportProgress}%` : "下载MP4"}
          </Button>
          <Button variant="outline" className="flex-1" onClick={() => { stopAutoPlay(); setStep("form"); }}>
            <BookOpen className="w-4 h-4 mr-2" /> 创作新故事
          </Button>
        </div>
      </div>
    </div>
  );
}
