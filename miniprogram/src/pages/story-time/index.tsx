import { useEffect, useRef, useState } from "react";
import { Image, Input, Text, Textarea, View } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { Button } from "@nutui/nutui-react-taro";
import { AigcBadge } from "../../components/AigcBadge";
import { ErrorState, useMpError } from "../../components/ErrorState";
import { GenerationProgress } from "../../components/GenerationProgress";
import { PageHeader } from "../../components/PageHeader";
import { VoiceInput } from "../../components/VoiceInput";
import {
  createCustomStoryTopic,
  remainingTopicRefreshSeconds,
  STORY_THEMES,
  TOPIC_REFRESH_COOLDOWN_MS,
} from "../../features/story-time/flow";
import { mpApi, type StoryPage, type StoryTopic } from "../../services/api";
import { createOperationId } from "../../services/request-policy";
import "./index.scss";

const STORY_VOICES = [
  { id: "lively", name: "活泼童声", emoji: "🧒" },
  { id: "gentle", name: "温柔女声", emoji: "👩" },
  { id: "steady", name: "沉稳讲述", emoji: "👨" },
  { id: "dialect_sichuan", name: "四川话", emoji: "🌶️" },
  { id: "dialect_cantonese", name: "粤语", emoji: "🌺" },
] as const;

type Step = "theme" | "child" | "topics" | "result";
type StoryImagePlan = { page: StoryPage; operationId: string };
type StorySpeechPlan = {
  pageNumber: number;
  operationId: string;
  text: string;
  voiceType: string;
  isFirstPage: boolean;
  title?: string;
};

export default function StoryTimePage() {
  const [step, setStep] = useState<Step>("theme");
  const [theme, setTheme] = useState("");
  const [childName, setChildName] = useState("");
  const [age, setAge] = useState("6");
  const [topics, setTopics] = useState<StoryTopic[]>([]);
  const [customTopic, setCustomTopic] = useState("");
  const [topicRefreshReadyAt, setTopicRefreshReadyAt] = useState(0);
  const [topicRefreshRemaining, setTopicRefreshRemaining] = useState(0);
  const [title, setTitle] = useState("");
  const [pages, setPages] = useState<StoryPage[]>([]);
  const [voiceType, setVoiceType] = useState("lively");
  const [busyMessage, setBusyMessage] = useState("");
  const [illustrating, setIllustrating] = useState(false);
  const [failedImagePages, setFailedImagePages] = useState<number[]>([]);
  const [playingPage, setPlayingPage] = useState<number>();
  const audioRef = useRef<ReturnType<typeof Taro.createInnerAudioContext> | null>(null);
  const operationLockRef = useRef(false);
  const pagesRef = useRef<StoryPage[]>([]);
  const speechGeneratingRef = useRef(false);
  const { errorState, showMpError, dismissError, retryError } = useMpError();

  useEffect(() => {
    if (!topicRefreshReadyAt) {
      setTopicRefreshRemaining(0);
      return undefined;
    }
    const updateRemaining = () => {
      const remaining = remainingTopicRefreshSeconds(Date.now(), topicRefreshReadyAt);
      setTopicRefreshRemaining(remaining);
      if (remaining === 0) setTopicRefreshReadyAt(0);
    };
    updateRemaining();
    const timer = setInterval(updateRemaining, 1000);
    return () => clearInterval(timer);
  }, [topicRefreshReadyAt]);

  useEffect(() => () => {
    audioRef.current?.destroy();
  }, []);

  function replacePages(nextPages: StoryPage[]): void {
    pagesRef.current = nextPages;
    setPages(nextPages);
  }

  function savePagePatch(pageNumber: number, patch: Partial<StoryPage>): StoryPage[] {
    const nextPages = pagesRef.current.map((page) => (
      page.pageNumber === pageNumber ? { ...page, ...patch } : page
    ));
    pagesRef.current = nextPages;
    setPages((current) => current.map((page) => (
      page.pageNumber === pageNumber ? { ...page, ...patch } : page
    )));
    return nextPages;
  }

  async function loadTopics(operationId = createOperationId("story-topics")) {
    if (!theme || busyMessage || operationLockRef.current) return;
    operationLockRef.current = true;
    setTopicRefreshReadyAt(Date.now() + TOPIC_REFRESH_COOLDOWN_MS);
    setBusyMessage("正在为孩子想故事题材…");
    try {
      const result = await mpApi.suggestStoryTopics({
        theme,
        childName: childName.trim() || undefined,
        age: Number(age) || 6,
      }, operationId);
      setTopics(result.topics);
      setStep("topics");
    } catch (error) {
      showMpError(error, () => loadTopics(operationId));
    } finally {
      operationLockRef.current = false;
      setBusyMessage("");
    }
  }

  async function refreshTopics() {
    const remaining = remainingTopicRefreshSeconds(Date.now(), topicRefreshReadyAt);
    if (remaining > 0) {
      await Taro.showToast({ title: `请等 ${remaining} 秒再换一批`, icon: "none", duration: 2500 });
      return;
    }
    await loadTopics();
  }

  function generateCustomStory() {
    const topic = createCustomStoryTopic(customTopic, childName);
    if (!topic) {
      void Taro.showToast({ title: "请先说说想听的主题", icon: "none", duration: 2500 });
      return;
    }
    void generateStory(topic);
  }

  async function generateStory(topic: StoryTopic, operationId = createOperationId("story-structure")) {
    if (busyMessage || illustrating || operationLockRef.current) return;
    operationLockRef.current = true;
    setBusyMessage("先写四页故事，请稍候…");
    try {
      const story = await mpApi.generateStoryStructure({
        theme,
        topic: topic.title,
        childName: childName.trim() || undefined,
        age: Number(age) || 6,
        protagonist: topic.protagonist,
      }, operationId);
      setTitle(story.title);
      replacePages(story.pages);
      setStep("result");
      setBusyMessage("");
      setFailedImagePages([]);
      await retryStoryImages(story.pages.map((page) => ({
        page,
        operationId: createOperationId(`story-image-${page.pageNumber}`),
      })));
    } catch (error) {
      showMpError(error, () => generateStory(topic, operationId));
    } finally {
      operationLockRef.current = false;
      setBusyMessage("");
    }
  }

  async function prepareAndPlay() {
    if (!pages.length || busyMessage || illustrating) return;
    const plans = pages
      .filter((page) => !page.audioUrl)
      .map((page) => ({
        pageNumber: page.pageNumber,
        operationId: createOperationId(`story-speech-${page.pageNumber}`),
        text: page.text,
        voiceType,
        isFirstPage: page.pageNumber === 1,
        title: page.pageNumber === 1 ? title : undefined,
      }));
    if (!plans.length) playSequence(pagesRef.current, 0);
    else await generateStorySpeeches(plans);
  }

  async function generateStorySpeeches(plans: StorySpeechPlan[]): Promise<void> {
    if (speechGeneratingRef.current) return;
    speechGeneratingRef.current = true;
    setBusyMessage("正在逐页准备朗读…");
    try {
      for (let index = 0; index < plans.length; index += 1) {
        const plan = plans[index];
        const page = pagesRef.current.find((item) => item.pageNumber === plan.pageNumber);
        if (!page || page.audioUrl) continue;
        try {
          const speech = await mpApi.generateStoryPageSpeech({
            pageNumber: plan.pageNumber,
            text: plan.text,
            voiceType: plan.voiceType,
            isFirstPage: plan.isFirstPage,
            title: plan.title,
          }, plan.operationId);
          savePagePatch(page.pageNumber, { audioUrl: speech.audioUrl });
        } catch (error) {
          const remainingPlans = plans.slice(index);
          showMpError(error, () => generateStorySpeeches(remainingPlans));
          return;
        }
      }
      playSequence(pagesRef.current, 0);
    } finally {
      speechGeneratingRef.current = false;
      setBusyMessage("");
    }
  }

  function playSequence(readyPages: StoryPage[], index: number) {
    const page = readyPages[index];
    if (!page?.audioUrl) {
      setPlayingPage(undefined);
      return;
    }
    audioRef.current?.destroy();
    const audio = Taro.createInnerAudioContext();
    audioRef.current = audio;
    audio.src = page.audioUrl;
    setPlayingPage(page.pageNumber);
    audio.onEnded(() => playSequence(readyPages, index + 1));
    audio.onError(() => {
      setPlayingPage(undefined);
      void Taro.showToast({ title: "朗读播放失败，请重试", icon: "none" });
    });
    audio.play();
  }

  async function retryStoryImages(plans: StoryImagePlan[]): Promise<void> {
    if (!plans.length) return;
    setIllustrating(true);
    const failures: Array<StoryImagePlan & { error: unknown }> = [];
    try {
      await Promise.all(plans.map(async (plan) => {
        try {
          const image = await mpApi.generateStoryPageImage({
            imagePrompt: plan.page.imagePrompt,
            pageNumber: plan.page.pageNumber,
          }, plan.operationId);
          savePagePatch(plan.page.pageNumber, { imageUrl: image.imageUrl });
        } catch (error) {
          failures.push({ ...plan, error });
        }
      }));
      setFailedImagePages(failures.map((failure) => failure.page.pageNumber));
      if (failures.length) {
        const retryPlans = failures.map(({ page, operationId }) => ({ page, operationId }));
        showMpError(failures[0].error, () => retryStoryImages(retryPlans));
        await Taro.showToast({ title: `有 ${failures.length} 页配图未完成，可手动重试`, icon: "none", duration: 3000 });
      }
    } finally {
      setIllustrating(false);
    }
  }

  function restart() {
    audioRef.current?.destroy();
    setStep("theme");
    setTheme("");
    setTopics([]);
    setCustomTopic("");
    setTopicRefreshReadyAt(0);
    setTopicRefreshRemaining(0);
    setTitle("");
    replacePages([]);
    setIllustrating(false);
    setFailedImagePages([]);
    setPlayingPage(undefined);
    dismissError();
  }

  return (
    <View className="story-page">
      <PageHeader title="AI 故事会" />
      {errorState ? <ErrorState error={errorState.error} onRetry={retryError} onDismiss={dismissError} /> : null}
      <View className="story-content">
        {step === "theme" ? (
          <View>
            <Text className="story-step">第 1 步，共 3 步</Text>
            <Text className="story-title">想听什么样的故事？</Text>
            <View className="story-option-grid">
              {STORY_THEMES.map((item) => (
                <View key={item.name} className="story-option clickable" onClick={() => { setTheme(item.name); setStep("child"); }}>
                  <Text className="story-option__emoji">{item.emoji}</Text>
                  <Text className="story-option__name">{item.name}</Text>
                  <Text className="story-option__tip">{item.tip}</Text>
                </View>
              ))}
            </View>
          </View>
        ) : null}

        {step === "child" ? (
          <View>
            <Text className="story-step">第 2 步，共 3 步（可跳过）</Text>
            <Text className="story-title">故事讲给哪位小朋友？</Text>
            <Text className="story-label">孩子姓名</Text>
            <Input className="story-input" value={childName} maxlength={20} placeholder="例如：乐乐" onInput={(event) => setChildName(event.detail.value)} />
            <Text className="story-label">年龄（1 至 12 岁）</Text>
            <Input className="story-input" value={age} type="number" maxlength={2} onInput={(event) => setAge(event.detail.value)} />
            <VoiceInput onResult={(text) => setChildName(text.slice(0, 20))} />
            <Button block size="xlarge" type="primary" loading={Boolean(busyMessage)} onClick={() => void loadTopics()}>继续选题材</Button>
          </View>
        ) : null}

        {step === "topics" ? (
          <View>
            <Text className="story-step">第 3 步，共 3 步</Text>
            <Text className="story-title">选一个喜欢的题材</Text>
            <View className="topic-list">
              {topics.map((topic) => (
                <View key={topic.title} className="topic-card clickable" onClick={() => void generateStory(topic)}>
                  <Text className="topic-card__title">{topic.title}</Text>
                  <Text className="topic-card__description">{topic.description}</Text>
                  <Text className="topic-card__protagonist">主角：{topic.protagonist}</Text>
                </View>
              ))}
            </View>
            <Button
              block
              size="xlarge"
              type="primary"
              fill="outline"
              disabled={topicRefreshRemaining > 0 || Boolean(busyMessage)}
              onClick={() => void refreshTopics()}
            >
              {topicRefreshRemaining > 0 ? `${topicRefreshRemaining} 秒后可换一批` : "换一批灵感"}
            </Button>
            <View className="custom-topic">
              <Text className="custom-topic__title">我来说主题</Text>
              <Text className="custom-topic__tip">也可以不选上面的卡片，直接说您想听什么</Text>
              <Textarea
                className="custom-topic__input"
                value={customTopic}
                maxlength={100}
                placeholder="例如：学会分享，或者一次去动物园的冒险…"
                onInput={(event) => setCustomTopic(event.detail.value)}
              />
              <VoiceInput
                onResult={(text) => setCustomTopic((current) => (
                  [current.trim(), text.trim()].filter(Boolean).join("，").slice(0, 100)
                ))}
              />
              <Button
                block
                size="xlarge"
                type="primary"
                disabled={!customTopic.trim()}
                onClick={generateCustomStory}
              >
                用这个主题讲故事
              </Button>
            </View>
          </View>
        ) : null}

        {step === "result" ? (
          <View className="story-result">
            <Text className="story-result__title">{title}</Text>
            <Text className="story-result__tip">
              {illustrating ? "四页文字已完成，正在逐页补图…" : failedImagePages.length ? `有 ${failedImagePages.length} 页配图未完成，请手动重试配图` : "共 4 页，文字和图片已准备好"}
            </Text>
            {pages.map((page) => (
              <View key={page.pageNumber} className={`story-card ${playingPage === page.pageNumber ? "story-card--playing" : ""}`}>
                <Text className="story-card__number">第 {page.pageNumber} 页</Text>
                {page.imageUrl ? <Image className="story-card__image" src={page.imageUrl} mode="aspectFill" /> : <View className="story-card__placeholder"><Text>{failedImagePages.includes(page.pageNumber) ? "配图未完成" : "正在配图…"}</Text></View>}
                <Text className="story-card__text">{page.text}</Text>
              </View>
            ))}
            <Text className="story-label">AI 合成语音 · 选择朗读声音</Text>
            <View className="voice-grid">
              {STORY_VOICES.map((voice) => (
                <View key={voice.id} className={`voice-card clickable ${voiceType === voice.id ? "voice-card--selected" : ""}`} onClick={() => setVoiceType(voice.id)}>
                  <Text>{voice.emoji}</Text><Text>{voice.name}</Text>
                </View>
              ))}
            </View>
            <Button block size="xlarge" type="primary" disabled={illustrating || pages.some((page) => !page.imageUrl)} loading={Boolean(busyMessage)} onClick={prepareAndPlay}>
              {playingPage ? `正在朗读第 ${playingPage} 页` : "播放四页朗读"}
            </Button>
            {!illustrating ? <View className="story-restart clickable" onClick={restart}><Text>再讲一个故事</Text></View> : null}
            <AigcBadge />
          </View>
        ) : null}
      </View>
      <GenerationProgress
        active={Boolean(busyMessage) || illustrating}
        label={illustrating ? "正在逐页生成故事配图" : busyMessage || "正在生成故事"}
        estimate={illustrating ? "约需1至2分钟" : busyMessage.includes("朗读") ? "约需1分钟" : "约需半分钟"}
      />
    </View>
  );
}
