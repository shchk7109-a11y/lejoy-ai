import { useEffect, useRef, useState } from "react";
import { ScrollView, Text, Textarea, View } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { Button } from "@nutui/nutui-react-taro";
import { AigcBadge } from "../../components/AigcBadge";
import { PageHeader } from "../../components/PageHeader";
import { VoiceInput } from "../../components/VoiceInput";
import { mpApi, type ChatMessage } from "../../services/api";
import "./index.scss";

const NOTICE_KEY = "lejoy_m3_chat_notice_seen";

export default function KaleidoscopePage() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [speakingIndex, setSpeakingIndex] = useState<number>();
  const audioRef = useRef<ReturnType<typeof Taro.createInnerAudioContext> | null>(null);

  useEffect(() => {
    if (!Taro.getStorageSync(NOTICE_KEY)) {
      void Taro.showModal({
        title: "使用前请留意",
        content: "我是生活小帮手，健康问题请咨询医生",
        showCancel: false,
        confirmText: "我知道了",
      }).then(() => Taro.setStorageSync(NOTICE_KEY, true));
    }
    return () => audioRef.current?.destroy();
  }, []);

  async function sendMessage() {
    const message = input.trim();
    if (!message || busy) return;
    const history = messages.slice(-12);
    setMessages((current) => [...current, { role: "user", content: message }]);
    setInput("");
    setBusy(true);
    try {
      const result = await mpApi.chat(message, history);
      setMessages((current) => [...current, { role: "assistant", content: result.reply }]);
    } catch (error) {
      await Taro.showToast({ title: error instanceof Error ? error.message : "暂时无法回答，请重试", icon: "none", duration: 3000 });
    } finally {
      setBusy(false);
    }
  }

  async function speak(content: string, index: number) {
    if (speakingIndex === index) {
      audioRef.current?.stop();
      setSpeakingIndex(undefined);
      return;
    }
    try {
      const speech = await mpApi.generateStoryPageSpeech({
        pageNumber: 1,
        text: content,
        voiceType: "gentle",
        isFirstPage: false,
      });
      audioRef.current?.destroy();
      const audio = Taro.createInnerAudioContext();
      audioRef.current = audio;
      audio.src = speech.audioUrl;
      audio.onEnded(() => setSpeakingIndex(undefined));
      audio.onError(() => setSpeakingIndex(undefined));
      setSpeakingIndex(index);
      audio.play();
    } catch (error) {
      await Taro.showToast({ title: error instanceof Error ? error.message : "朗读失败，请重试", icon: "none" });
    }
  }

  return (
    <View className="chat-page">
      <PageHeader title="AI 万花筒" />
      <View className="chat-intro">
        <Text className="chat-intro__title">生活百科，陪您聊聊</Text>
        <Text className="chat-intro__tip">可以聊节气、饮食搭配、运动睡眠和传统文化</Text>
      </View>
      <ScrollView className="chat-list" scrollY scrollIntoView={messages.length ? `message-${messages.length - 1}` : undefined}>
        {messages.length === 0 ? (
          <View className="chat-empty"><Text>您好，我是生活百科小帮手。今天想聊点什么？</Text></View>
        ) : null}
        {messages.map((message, index) => (
          <View id={`message-${index}`} key={`${index}-${message.content.slice(0, 12)}`} className={`chat-row chat-row--${message.role}`}>
            <View className={`chat-bubble chat-bubble--${message.role}`}>
              <Text>{message.content}</Text>
              {message.role === "assistant" ? (
                <View className="chat-speak clickable" onClick={() => void speak(message.content, index)}>
                  <Text>{speakingIndex === index ? "⏹ 停止朗读" : "🔊 读给我听"}</Text>
                </View>
              ) : null}
            </View>
          </View>
        ))}
        {busy ? <View className="chat-row chat-row--assistant"><View className="chat-bubble chat-bubble--assistant"><Text>正在认真想一想…</Text></View></View> : null}
      </ScrollView>
      <View className="chat-compose">
        <Textarea className="chat-input" value={input} maxlength={500} autoHeight placeholder="输入想聊的生活常识…" onInput={(event) => setInput(event.detail.value)} />
        <VoiceInput onResult={(text) => setInput(text.slice(0, 500))} />
        <Button block size="xlarge" type="primary" disabled={!input.trim() || busy} loading={busy} onClick={sendMessage}>发送</Button>
      </View>
      <AigcBadge />
    </View>
  );
}
