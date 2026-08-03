import { useEffect, useRef, useState } from "react";
import { Image, Text, View } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { PageHeader } from "../../components/PageHeader";
import { nextStoryPage, previousStoryPage, type LocalStory } from "../../features/story-time/library";
import { readPlayingStory, storyStorage, writePlayingStory } from "../../features/story-time/taro-story-storage";
import { mpApi } from "../../services/api";
import "./index.scss";

export default function StoryPlayerPage() {
  const [story, setStory] = useState<LocalStory>();
  const [currentPageIndex, setCurrentPageIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [saving, setSaving] = useState(false);
  const audioRef = useRef<ReturnType<typeof Taro.createInnerAudioContext> | null>(null);

  const destroyAudio = () => {
    const audio = audioRef.current;
    if (audio) audio.destroy();
    audioRef.current = null;
    setIsPlaying(false);
  };

  const playPage = (index: number, source = story) => {
    if (!source) return;
    const pages = source.pages;
    const page = pages[index];
    destroyAudio();
    setCurrentPageIndex(index);
    if (!page?.audioUrl) return;
    const audio = Taro.createInnerAudioContext();
    audioRef.current = audio;
    audio.src = page.audioUrl;
    audio.onPlay(() => setIsPlaying(true));
    audio.onPause(() => setIsPlaying(false));
    audio.onStop(() => setIsPlaying(false));
    audio.onEnded(() => {
      const nextIndex = nextStoryPage(index, pages.length);
      if (nextIndex !== index) playPage(nextIndex, source);
      else setIsPlaying(false);
    });
    audio.onError(() => {
      setIsPlaying(false);
      void Taro.showToast({ title: "这一页朗读失败，请重试", icon: "none" });
    });
    audio.play();
  };

  useEffect(() => {
    const loaded = readPlayingStory();
    setStory(loaded);
    void Taro.setKeepScreenOn({ keepScreenOn: true }).catch(() => undefined);
    if (loaded) playPage(0, loaded);
    return () => {
      const audio = audioRef.current;
      if (audio) audio.destroy();
      void Taro.setKeepScreenOn({ keepScreenOn: false }).catch(() => undefined);
    };
  }, []);

  async function saveStory(): Promise<void> {
    if (!story || saving) return;
    setSaving(true);
    try {
      const result = await storyStorage.saveDraft(story);
      if (result.status === "full") {
        const choice = await Taro.showModal({ title: "书架已满", content: "最多保存 6 本故事，请先删除一本旧故事。", cancelText: "稍后再说", confirmText: "去删除" });
        if (choice.confirm) await Taro.navigateTo({ url: "/pages/story-library/index" });
        return;
      }
      if (result.story) {
        setStory(result.story);
        writePlayingStory(result.story);
      }
      storyStorage.queueRemoteAssets(result.remoteFileKeys);
      await storyStorage.flushRemoteAssets((fileKeys) => mpApi.releaseStoryAssets(fileKeys));
      await Taro.showToast({ title: "故事已保存到本机", icon: "success" });
    } catch {
      await Taro.showToast({ title: "保存失败，请检查手机存储空间", icon: "none", duration: 3000 });
    } finally {
      setSaving(false);
    }
  }

  function togglePlayback(): void {
    const audio = audioRef.current;
    if (!audio) {
      playPage(currentPageIndex);
      return;
    }
    if (isPlaying) audio.pause();
    else audio.play();
  }

  if (!story) {
    return <View className="story-player"><PageHeader title="故事播放" /><View className="story-player__empty"><Text>没有找到要播放的故事，请返回故事会重新选择。</Text></View></View>;
  }

  const pages = story.pages;
  const currentPage = pages[currentPageIndex];
  return (
    <View className="story-player">
      <PageHeader title={story.title || "正在讲故事"} />
      <View className="story-player__content">
        <View className="story-player__image-wrap">
          <Image className="story-player__image" src={currentPage.imageUrl || ""} mode="aspectFill" />
          <Text className="story-player__page">第 {currentPageIndex + 1} / {pages.length} 页</Text>
        </View>
        <Text className="story-player__text">{currentPage.text}</Text>
        <View className="story-player__controls">
          <View className="story-player__control clickable" onClick={() => playPage(previousStoryPage(currentPageIndex, pages.length))}><Text>上一页</Text></View>
          <View className="story-player__control story-player__control--main clickable" onClick={togglePlayback}><Text>{isPlaying ? "暂停" : "继续"}</Text></View>
          <View className="story-player__control clickable" onClick={() => playPage(nextStoryPage(currentPageIndex, pages.length))}><Text>下一页</Text></View>
        </View>
        <View className="story-player__actions">
          <View className="story-player__action story-player__action--primary clickable" onClick={() => void saveStory()}><Text>{saving ? "正在保存…" : "保存故事"}</Text></View>
          <View className="story-player__action clickable" onClick={() => void Taro.showToast({ title: "正在准备四页绘本", icon: "none" })}><Text>下载到相册</Text></View>
        </View>
        <View className="story-player__action clickable" onClick={() => void Taro.navigateTo({ url: "/pages/story-library/index" })}><Text>📚 我的故事</Text></View>
        <Text className="story-player__status">故事只保存在当前手机，最多保存 6 本</Text>
      </View>
    </View>
  );
}
