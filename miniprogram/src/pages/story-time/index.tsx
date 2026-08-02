import { useRef, useState } from "react";
import { Image, Input, Text, View } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { Button } from "@nutui/nutui-react-taro";
import { AigcBadge } from "../../components/AigcBadge";
import { PageHeader } from "../../components/PageHeader";
import { VoiceInput } from "../../components/VoiceInput";
import { mpApi, type StoryPage, type StoryTopic } from "../../services/api";
import "./index.scss";

const STORY_THEMES = [
  { name: "勇气成长", emoji: "🌱", tip: "学会勇敢和坚持" },
  { name: "奇幻冒险", emoji: "🏰", tip: "走进神奇的想象世界" },
  { name: "传统美德", emoji: "🏮", tip: "懂得善良、诚信与感恩" },
  { name: "科学探索", emoji: "🔭", tip: "发现自然和宇宙的奥秘" },
  { name: "动物朋友", emoji: "🐼", tip: "和可爱动物成为朋友" },
  { name: "睡前童话", emoji: "🌙", tip: "温柔安心地进入梦乡" },
] as const;

const STORY_VOICES = [
  { id: "lively", name: "活泼童声", emoji: "🧒" },
  { id: "gentle", name: "温柔女声", emoji: "👩" },
  { id: "steady", name: "沉稳讲述", emoji: "👨" },
  { id: "dialect_sichuan", name: "四川话", emoji: "🌶️" },
  { id: "dialect_cantonese", name: "粤语", emoji: "🌺" },
] as const;

type Step = "theme" | "child" | "topics" | "result";

export default function StoryTimePage() {
  const [step, setStep] = useState<Step>("theme");
  const [theme, setTheme] = useState("");
  const [childName, setChildName] = useState("");
  const [age, setAge] = useState("6");
  const [topics, setTopics] = useState<StoryTopic[]>([]);
  const [title, setTitle] = useState("");
  const [pages, setPages] = useState<StoryPage[]>([]);
  const [voiceType, setVoiceType] = useState("lively");
  const [busyMessage, setBusyMessage] = useState("");
  const [playingPage, setPlayingPage] = useState<number>();
  const audioRef = useRef<ReturnType<typeof Taro.createInnerAudioContext> | null>(null);

  async function loadTopics() {
    if (!theme || busyMessage) return;
    setBusyMessage("正在为孩子想故事题材…");
    try {
      const result = await mpApi.suggestStoryTopics({
        theme,
        childName: childName.trim() || undefined,
        age: Number(age) || 6,
      });
      setTopics(result.topics);
      setStep("topics");
    } catch (error) {
      await showError(error);
    } finally {
      setBusyMessage("");
    }
  }

  async function generateStory(topic: StoryTopic) {
    if (busyMessage) return;
    setBusyMessage("先写四页故事，请稍候…");
    try {
      const story = await mpApi.generateStoryStructure({
        theme,
        topic: topic.title,
        childName: childName.trim() || undefined,
        age: Number(age) || 6,
        protagonist: topic.protagonist,
      });
      setTitle(story.title);
      setPages(story.pages);
      setStep("result");
      setBusyMessage("故事写好了，正在逐页配图…");
      const illustrated = await Promise.all(story.pages.map(async (page) => {
        const image = await mpApi.generateStoryPageImage({ imagePrompt: page.imagePrompt, pageNumber: page.pageNumber });
        return { ...page, imageUrl: image.imageUrl };
      }));
      setPages(illustrated);
    } catch (error) {
      await showError(error);
    } finally {
      setBusyMessage("");
    }
  }

  async function prepareAndPlay() {
    if (!pages.length || busyMessage) return;
    setBusyMessage("正在准备四页朗读…");
    try {
      let readyPages = pages;
      if (pages.some((page) => !page.audioUrl)) {
        const speeches = await Promise.all(pages.map((page, index) => mpApi.generateStoryPageSpeech({
          pageNumber: page.pageNumber,
          text: page.text,
          voiceType,
          isFirstPage: index === 0,
          title: index === 0 ? title : undefined,
        })));
        readyPages = pages.map((page) => ({
          ...page,
          audioUrl: speeches.find((speech) => speech.pageNumber === page.pageNumber)?.audioUrl,
        }));
        setPages(readyPages);
      }
      playSequence(readyPages, 0);
    } catch (error) {
      await showError(error);
    } finally {
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

  function restart() {
    audioRef.current?.destroy();
    setStep("theme");
    setTheme("");
    setTopics([]);
    setTitle("");
    setPages([]);
    setPlayingPage(undefined);
  }

  return (
    <View className="story-page">
      <PageHeader title="AI 故事会" />
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
            <Button block size="xlarge" type="primary" loading={Boolean(busyMessage)} onClick={loadTopics}>继续选题材</Button>
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
          </View>
        ) : null}

        {step === "result" ? (
          <View className="story-result">
            <Text className="story-result__title">{title}</Text>
            <Text className="story-result__tip">共 4 页，图片会逐页补齐</Text>
            {pages.map((page) => (
              <View key={page.pageNumber} className={`story-card ${playingPage === page.pageNumber ? "story-card--playing" : ""}`}>
                <Text className="story-card__number">第 {page.pageNumber} 页</Text>
                {page.imageUrl ? <Image className="story-card__image" src={page.imageUrl} mode="aspectFill" /> : <View className="story-card__placeholder"><Text>正在配图…</Text></View>}
                <Text className="story-card__text">{page.text}</Text>
              </View>
            ))}
            <Text className="story-label">选择朗读声音</Text>
            <View className="voice-grid">
              {STORY_VOICES.map((voice) => (
                <View key={voice.id} className={`voice-card clickable ${voiceType === voice.id ? "voice-card--selected" : ""}`} onClick={() => setVoiceType(voice.id)}>
                  <Text>{voice.emoji}</Text><Text>{voice.name}</Text>
                </View>
              ))}
            </View>
            <Button block size="xlarge" type="primary" disabled={pages.some((page) => !page.imageUrl)} loading={Boolean(busyMessage)} onClick={prepareAndPlay}>
              {playingPage ? `正在朗读第 ${playingPage} 页` : "播放四页朗读"}
            </Button>
            <View className="story-restart clickable" onClick={restart}><Text>再讲一个故事</Text></View>
            <AigcBadge />
          </View>
        ) : null}
      </View>
      {busyMessage ? <View className="story-loading"><View className="story-loading__spinner" /><Text>{busyMessage}</Text><Text className="story-loading__tip">请不要重复点击</Text></View> : null}
    </View>
  );
}

async function showError(error: unknown) {
  await Taro.showToast({ title: error instanceof Error ? error.message : "操作失败，请重试", icon: "none", duration: 3000 });
}
