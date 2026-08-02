import { useState } from "react";
import { Text, View } from "@tarojs/components";
import Taro, { useDidShow } from "@tarojs/taro";
import { PageHeader } from "../../components/PageHeader";
import { mpApi, type MpModule, type MpUser } from "../../services/api";
import "./index.scss";

export default function HomePage() {
  const [user, setUser] = useState<MpUser>();
  const [modules, setModules] = useState<MpModule[]>([]);
  const [loading, setLoading] = useState(true);

  useDidShow(() => {
    void loadHome();
  });

  async function loadHome() {
    setLoading(true);
    try {
      const [currentUser, moduleResult] = await Promise.all([mpApi.me(), mpApi.modules()]);
      setUser(currentUser);
      setModules(moduleResult.modules);
    } catch (error) {
      await Taro.showToast({ title: error instanceof Error ? error.message : "加载失败", icon: "none" });
    } finally {
      setLoading(false);
    }
  }

  async function openModule(module: MpModule) {
    if (!module.enabled) {
      await Taro.showToast({ title: "即将上线", icon: "none" });
      return;
    }
    if (module.id === "copy-writer") {
      await Taro.navigateTo({ url: "/pages/copywriter/index" });
    }
  }

  return (
    <View className="home-page">
      <PageHeader title="乐享 AI" showBack={false} />
      <View className="home-page__content">
        <View className="welcome-card">
          <View>
            <Text className="welcome-card__eyebrow">欢迎回来</Text>
            <Text className="welcome-card__name">{user?.name || "乐享用户"}，您好 👋</Text>
          </View>
          <View className="credits-pill clickable" onClick={() => Taro.navigateTo({ url: "/pages/profile/index" })}>
            <Text>积分</Text>
            <Text className="credits-pill__number">{user?.credits ?? "--"}</Text>
          </View>
        </View>

        <Text className="home-page__section-title">今天想用 AI 做什么？</Text>
        {loading ? <Text className="home-page__loading">正在加载，请稍候…</Text> : null}
        <View className="module-list">
          {modules.map((module) => (
            <View
              key={module.id}
              className={`module-card clickable ${module.enabled ? "" : "module-card--disabled"}`}
              onClick={() => openModule(module)}
            >
              <Text className="module-card__icon">{module.icon}</Text>
              <View className="module-card__body">
                <View className="module-card__heading">
                  <Text className="module-card__name">{module.name}</Text>
                  {!module.enabled ? <Text className="module-card__soon">即将上线</Text> : null}
                </View>
                <Text className="module-card__description">{module.description}</Text>
                <Text className="module-card__credits">{module.creditCost} 积分 / 次</Text>
              </View>
              <Text className="module-card__arrow">›</Text>
            </View>
          ))}
        </View>

        <View className="profile-entry clickable" onClick={() => Taro.navigateTo({ url: "/pages/profile/index" })}>
          <Text>👤 我的积分与记录</Text>
          <Text className="profile-entry__arrow">›</Text>
        </View>
      </View>
    </View>
  );
}
