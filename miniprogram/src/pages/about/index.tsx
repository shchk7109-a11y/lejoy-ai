import { Text, View } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { PageHeader } from "../../components/PageHeader";
import { MINIPROGRAM_VERSION } from "../../config/release";
import "./index.scss";

const documents = [
  { title: "用户协议", url: "/pages/user-agreement/index" },
  { title: "隐私政策", url: "/pages/privacy-policy/index" },
];

export default function AboutPage() {
  return (
    <View className="about-page">
      <PageHeader title="关于乐享AI" />
      <View className="about-page__content">
        <View className="about-page__brand">
          <View className="about-page__logo"><Text>乐</Text></View>
          <Text className="about-page__name">乐享AI</Text>
          <Text className="about-page__version">版本 {MINIPROGRAM_VERSION}</Text>
        </View>

        <View className="about-page__operator">
          <Text>运营主体名称：TODO（运营填写）</Text>
        </View>

        <View className="about-page__links">
          {documents.map((document) => (
            <View
              key={document.url}
              className="about-page__link clickable"
              onClick={() => Taro.navigateTo({ url: document.url })}
            >
              <Text>{document.title}</Text>
              <Text className="about-page__arrow">›</Text>
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}
