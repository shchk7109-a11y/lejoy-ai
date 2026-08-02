import { useEffect, useState } from "react";
import { Text, View } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { Button } from "@nutui/nutui-react-taro";
import { PageHeader } from "../../components/PageHeader";
import { mpApi } from "../../services/api";
import { getToken, saveSession } from "../../store/auth";
import "./index.scss";

export default function LoginPage() {
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (getToken()) void Taro.reLaunch({ url: "/pages/home/index" });
  }, []);

  async function handleLogin() {
    if (loading) return;
    setLoading(true);
    try {
      const result = await Taro.login();
      if (!result.code) throw new Error("微信登录未返回 code");
      const session = await mpApi.login(result.code);
      saveSession(session.token, session.user);
      await Taro.reLaunch({ url: "/pages/home/index" });
    } catch (error) {
      await Taro.showToast({
        title: error instanceof Error ? error.message : "登录失败，请重试",
        icon: "none",
        duration: 3000,
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <View className="login-page">
      <PageHeader title="乐享 AI" showBack={false} />
      <View className="login-page__content">
        <View className="login-page__logo">✨</View>
        <Text className="login-page__title">让 AI 为生活添彩</Text>
        <Text className="login-page__description">简单、清楚、放心使用的 AI 助手</Text>
        <Button block size="xlarge" type="primary" loading={loading} onClick={handleLogin}>
          微信一键登录
        </Button>
        <Text className="login-page__tip">登录后即可领取初始积分并体验暖心文案</Text>
      </View>
    </View>
  );
}
