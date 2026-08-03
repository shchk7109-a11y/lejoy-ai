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
import { runStoryImageQueue, type StoryImagePlan } from "../../features/story-time/image-queue";
import { createStoryId, writePlayingStory } from "../../features/story-time/taro-story-storage";
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
  const [storyId, setStoryId] = useState("");
  const [pages, setPages] = useState<StoryPage[]>([]);
  const [voiceType, setVoiceType] = useState("lively");
  const [busyMessage, setBusyMessage] = useState("");
  const [illustrating, setIllustrating] = useState(false);
  const [activeImagePage, setActiveImagePage] = useState<number>();
  const [failedImagePages, setFailedImagePages] = useState<number[]>([]);
  const operationLockRef = useRef(false);
  const pagesRef = useRef<StoryPage[]>([]);
  const speechGeneratingRef = useRef(false);
  const imageGeneratingRef = useRef(false);
  const storyImageOperationIdsRef = useRef<Record<number, string>>({});
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

  function getStoryImageOperationId(pageNumber: number): string {
    const existing = storyImageOperationIdsRef.current[pageNumber];
    if (existing) return existing;
    const operationId = createOperationId(`story-image-${pageNumber}`);
    storyImageOperationIdsRef.current[pageNumber] = operationId;
    return operationId;
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
      setStoryId(createStoryId());
      replacePages(story.pages);
      setStep("result");
      setBusyMessage("");
      setFailedImagePages([]);
      storyImageOperationIdsRef.current = {};
      await generateStoryImages(story.pages.map((page) => ({
        pageNumber: page.pageNumber,
        imagePrompt: page.imagePrompt,
        operationId: getStoryImageOperationId(page.pageNumber),
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
    if (!plans.length) openStoryPlayer();
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
          savePagePatch(page.pageNumber, { audioUrl: speech.audioUrl, audioFileKey: speech.fileKey });
        } catch (error) {
          const remainingPlans = plans.slice(index);
          showMpError(error, () => generateStorySpeeches(remainingPlans));
          return;
        }
      }
      openStoryPlayer();
    } finally {
      speechGeneratingRef.current = false;
      setBusyMessage("");
    }
  }

  function openStoryPlayer(): void {
    const readyPages = pagesRef.current;
    if (!storyId || readyPages.length !== 4) return;
    writePlayingStory({
      id: storyId,
      title,
      theme,
      createdAt: Date.now(),
      pages: readyPages,
    });
    void Taro.navigateTo({ url: "/pages/story-player/index" });
  }

  async function generateStoryImages(plans: StoryImagePlan[]): Promise<void> {
    if (!plans.length || imageGeneratingRef.current) return;
    imageGeneratingRef.current = true;
    setIllustrating(true);
    try {
      const failures = await runStoryImageQueue(plans, (plan) => mpApi.generateStoryPageImage({
        imagePrompt: plan.imagePrompt,
        pageNumber: plan.pageNumber,
      }, plan.operationId), {
        onStart: (plan) => setActiveImagePage(plan.pageNumber),
        onSuccess: (plan, image) => {
          savePagePatch(plan.pageNumber, { imageUrl: image.imageUrl, imageFileKey: image.fileKey });
          setFailedImagePages((current) => current.filter((pageNumber) => pageNumber !== plan.pageNumber));
        },
        onFailure: (plan) => setFailedImagePages((current) => (
          current.includes(plan.pageNumber) ? current : [...current, plan.pageNumber]
        )),
      });
      if (failures.length) {
        await Taro.showToast({ title: `有 ${failures.length} 页配图未完成，可手动重试`, icon: "none", duration: 3000 });
      }
    } finally {
      imageGeneratingRef.current = false;
      setIllustrating(false);
      setActiveImagePage(undefined);
    }
  }

  function retryStoryImagePage(page: StoryPage): void {
    void generateStoryImages([{
      pageNumber: page.pageNumber,
      imagePrompt: page.imagePrompt,
      operationId: getStoryImageOperationId(page.pageNumber),
    }]);
  }

  function restart() {
    setStep("theme");
    setTheme("");
    setTopics([]);
    setCustomTopic("");
    setTopicRefreshReadyAt(0);
    setTopicRefreshRemaining(0);
    setTitle("");
    setStoryId("");
    replacePages([]);
    storyImageOperationIdsRef.current = {};
    imageGeneratingRef.current = false;
    setIllustrating(false);
    setActiveImagePage(undefined);
    setFailedImagePages([]);
    dismissError();
  }

  const allImagesReady = pages.length === 4 && pages.every((page) => Boolean(page.imageUrl));

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
            <GenerationProgress
              active={illustrating}
              inline={true}
              label={activeImagePage ? `正在画第 ${activeImagePage} 页（共 4 页）` : "正在准备第 1 页配图"}
              estimate="每页约半分钟"
            />
            {pages.map((page) => (
              <View key={page.pageNumber} className="story-card">
                <Text className="story-card__number">第 {page.pageNumber} 页</Text>
                {page.imageUrl ? (
                  <Image className="story-card__image" src={page.imageUrl} mode="aspectFill" />
                ) : (
                  <View className="story-card__placeholder">
                    <Text>{failedImagePages.includes(page.pageNumber) ? "这一页配图未完成" : activeImagePage === page.pageNumber ? "正在画这一页…" : "等待生成…"}</Text>
                    {failedImagePages.includes(page.pageNumber) ? (
                      <Button
                        className="story-card__retry"
                        block
                        size="xlarge"
                        type="primary"
                        disabled={illustrating}
                        onClick={() => retryStoryImagePage(page)}
                      >
                        重试这一页
                      </Button>
                    ) : null}
                  </View>
                )}
                <Text className="story-card__text">{page.text}</Text>
              </View>
            ))}
            {allImagesReady ? (
              <>
                <Text className="story-label">AI 合成语音 · 选择朗读声音</Text>
                <View className="voice-grid">
                  {STORY_VOICES.map((voice) => (
                    <View key={voice.id} className={`voice-card clickable ${voiceType === voice.id ? "voice-card--selected" : ""}`} onClick={() => setVoiceType(voice.id)}>
                      <Text>{voice.emoji}</Text><Text>{voice.name}</Text>
                    </View>
                  ))}
                </View>
                <Button block size="xlarge" type="primary" loading={Boolean(busyMessage)} onClick={prepareAndPlay}>
                  播放四页朗读
                </Button>
              </>
            ) : null}
            {!illustrating ? <View className="story-restart clickable" onClick={restart}><Text>再讲一个故事</Text></View> : null}
            <AigcBadge />
          </View>
        ) : null}
      </View>
      <GenerationProgress
        active={Boolean(busyMessage)}
        label={busyMessage || "正在生成故事"}
        estimate={busyMessage.includes("朗读") ? "约需1分钟" : "约需半分钟"}
      />
    </View>
  );
}
