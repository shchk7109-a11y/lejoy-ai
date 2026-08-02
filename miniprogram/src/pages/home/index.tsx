import { useState } from "react";
import { Text, View } from "@tarojs/components";
import Taro, { useDidShow } from "@tarojs/taro";
import { mpApi, type MpModule, type MpUser } from "../../services/api";
import { clearSession } from "../../store/auth";
import "./index.scss";

const MODULE_ROUTES: Record<string, string> = {
  "silver-lens": "/pages/silver-lens/index",
  "copy-writer": "/pages/copywriter/index",
  "story-time": "/pages/story-time/index",
  "life-assistant": "/pages/life-assistant/index",
  "ai-kaleidoscope": "/pages/ai-kaleidoscope/index",
};

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
    const route = MODULE_ROUTES[module.id];
    if (route) await Taro.navigateTo({ url: route });
  }

  async function logout() {
    clearSession();
    await Taro.reLaunch({ url: "/pages/login/index" });
  }

  return (
    <View className="home-page">
      <View className="home-nav">
        <View className="account-pill">
          <View className="account-pill__credits clickable" onClick={() => Taro.navigateTo({ url: "/pages/profile/index" })}>
            <View className="account-pill__coin"><Text>¥</Text></View>
            <Text className="account-pill__number">{user?.credits ?? "--"}</Text>
          </View>
          <View className="account-pill__divider" />
          <Text className="account-pill__logout clickable" onClick={logout}>退出</Text>
        </View>
      </View>
      <View className="home-page__content">
        <View className="brand-block">
          <View className="brand-block__logo"><Text>✨</Text></View>
          <Text className="brand-block__name">乐享AI</Text>
          <Text className="brand-block__subtitle">您的智能生活好帮手</Text>
        </View>

        {loading ? <Text className="home-page__loading">正在加载，请稍候…</Text> : null}
        {user?.credits === 0 ? (
          <View className="zero-credit-tip">
            <Text className="zero-credit-tip__title">积分暂时为 0</Text>
            <Text className="zero-credit-tip__body">部分 AI 功能需要积分，当前可先查看功能介绍。</Text>
            <Text className="zero-credit-tip__help">如何获取积分：TODO（运营配置积分获取方式）</Text>
          </View>
        ) : null}
        <View className="module-list">
          {modules.map((module) => (
            <View
              key={module.id}
              className={`module-card clickable ${module.enabled ? "" : "module-card--disabled"}`}
              style={{
                backgroundColor: module.theme?.bg,
                borderColor: module.theme?.border,
                color: module.theme?.title,
              }}
              onClick={() => openModule(module)}
            >
              <View className="module-card__icon"><Text>{module.icon}</Text></View>
              <View className="module-card__body">
                <View className="module-card__heading">
                  <Text className="module-card__name">{module.name}</Text>
                  {!module.enabled ? <Text className="module-card__soon">即将上线</Text> : null}
                </View>
                <Text className="module-card__description">{module.description}</Text>
              </View>
            </View>
          ))}
        </View>
        <Text className="home-footer">© 2026 乐享AI · 科技温暖生活</Text>
      </View>
    </View>
  );
}
