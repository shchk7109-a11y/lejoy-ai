import { Text, View } from "@tarojs/components";
import { PageHeader } from "../../components/PageHeader";
import "../legal.scss";

const thirdParties = [
  ["微信", "用于小程序登录、运行环境、相机、相册、录音及微信安全能力。"],
  ["月之暗面（Kimi）", "用于经安全处理后的文字理解与生成。"],
  ["火山引擎", "用于经安全处理后的人工智能图片或语音能力。"],
  ["阿里云", "用于经安全处理后的人工智能图片或语音能力。"],
];

export default function PrivacyPolicyPage() {
  return (
    <View className="legal-page">
      <PageHeader title="隐私政策" />
      <View className="legal-page__content">
        <Text className="legal-page__status">TODO（法务定稿）</Text>
        <Text className="legal-page__intro">本模板用于提审准备，实际收集范围和第三方信息须在发布前由运营、研发与法务共同核对。</Text>

        <View className="legal-page__section">
          <Text className="legal-page__title">一、信息收集清单</Text>
          <Text className="legal-page__body">微信用户标识、昵称等账号信息；您主动输入的文字；您主动选择或拍摄的图片；您主动录制的语音；功能使用和必要的安全日志。</Text>
        </View>
        <View className="legal-page__section">
          <Text className="legal-page__title">二、使用目的</Text>
          <Text className="legal-page__body">用于账号登录、提供AI功能、展示和保存处理结果、计算积分、排查故障与保障服务安全。相机、相册和麦克风仅在您主动使用对应功能时申请。</Text>
        </View>
        <View className="legal-page__section">
          <Text className="legal-page__title">三、第三方服务清单</Text>
          {thirdParties.map(([name, purpose]) => (
            <View key={name} className="legal-page__third-party">
              <Text className="legal-page__third-party-name">{name}</Text>
              <Text className="legal-page__body">{purpose}</Text>
            </View>
          ))}
        </View>
        <View className="legal-page__section">
          <Text className="legal-page__title">四、存储、保护与删除</Text>
          <Text className="legal-page__body">我们会采取合理措施保护信息，并按实现服务所需的最短期限保存。删除、更正或注销方式：TODO（运营与法务填写）。</Text>
        </View>
        <View className="legal-page__section">
          <Text className="legal-page__title">五、联系我们</Text>
          <Text className="legal-page__body">隐私问题联系渠道：TODO（运营填写）。</Text>
        </View>
      </View>
    </View>
  );
}
