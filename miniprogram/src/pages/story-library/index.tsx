import { useState } from "react";
import { Image, Text, View } from "@tarojs/components";
import Taro, { useDidShow } from "@tarojs/taro";
import { PageHeader } from "../../components/PageHeader";
import type { LocalStory } from "../../features/story-time/library";
import { storyStorage, writePlayingStory } from "../../features/story-time/taro-story-storage";
import "./index.scss";

export default function StoryLibraryPage() {
  const [stories, setStories] = useState<LocalStory[]>([]);

  useDidShow(() => setStories(storyStorage.list()));

  function playStory(story: LocalStory): void {
    writePlayingStory(story);
    void Taro.navigateTo({ url: "/pages/story-player/index" });
  }

  async function deleteStory(story: LocalStory): Promise<void> {
    const result = await Taro.showModal({
      title: "删除这个故事？",
      content: `删除《${story.title}》后，本机图片和朗读也会一起删除。`,
      confirmText: "确认删除",
      confirmColor: "#b91c1c",
      cancelText: "保留故事",
    });
    if (!result.confirm) return;
    await storyStorage.remove(story.id);
    setStories(storyStorage.list());
    await Taro.showToast({ title: "故事已删除", icon: "success" });
  }

  return (
    <View className="story-library">
      <PageHeader title="我的故事" />
      <View className="story-library__content">
        <View className="story-library__summary">
          <Text>最多保存 6 本</Text>
          <Text>{stories.length} / 6</Text>
        </View>
        {!stories.length ? (
          <View className="story-library__empty"><Text>还没有保存故事。生成故事并开始播放后，可以保存到当前手机。</Text></View>
        ) : (
          <View className="story-library__grid">
            {stories.map((story) => (
              <View key={story.id} className="story-book">
                <Image className="story-book__cover" src={story.pages[0]?.imageUrl || ""} mode="aspectFill" />
                <View className="story-book__body">
                  <Text className="story-book__title">{story.title}</Text>
                  <Text className="story-book__date">{new Date(story.createdAt).toLocaleDateString()}</Text>
                  <View className="story-book__actions">
                    <View className="story-book__action story-book__action--play clickable" onClick={() => playStory(story)}><Text>播放</Text></View>
                    <View className="story-book__action story-book__action--delete clickable" onClick={() => void deleteStory(story)}><Text>删除</Text></View>
                  </View>
                </View>
              </View>
            ))}
          </View>
        )}
      </View>
    </View>
  );
}
