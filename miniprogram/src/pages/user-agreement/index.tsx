import { Text, View } from "@tarojs/components";
import { PageHeader } from "../../components/PageHeader";
import "../legal.scss";

const sections = [
  ["一、服务说明", "乐享AI提供照片处理、文字生成、故事生成、食物营养信息查询和合规生活问答等人工智能辅助服务。具体开放范围以小程序页面为准。"],
  ["二、使用规范", "请勿上传或输入违法违规、侵害他人权益、虚假欺诈或其他不适宜的内容。您应确保对所提交内容拥有合法使用权。"],
  ["三、积分与生成", "部分AI功能会消耗积分。生成前页面会展示所需积分；网络异常或生成失败时，以服务端最终记账结果为准。"],
  ["四、AI内容说明", "人工智能生成内容仅供参考，可能存在不准确或不完整之处，不构成医疗、法律、金融等专业建议。"],
  ["五、知识产权", "用户依法享有其原始内容的相关权利；平台软件、界面和标识的权利归相应权利人所有。"],
  ["六、服务变更与免责", "因维护、网络、第三方服务或不可抗力造成的中断，我们会在合理范围内处理，但法律另有规定的除外。"],
  ["七、联系我们", "联系渠道：TODO（运营填写）。"],
];

export default function UserAgreementPage() {
  return (
    <View className="legal-page">
      <PageHeader title="用户协议" />
      <View className="legal-page__content">
        <Text className="legal-page__status">TODO（法务定稿）</Text>
        <Text className="legal-page__intro">本模板用于提审准备，正式发布前须由运营主体和法务确认全部内容。</Text>
        {sections.map(([title, body]) => (
          <View key={title} className="legal-page__section">
            <Text className="legal-page__title">{title}</Text>
            <Text className="legal-page__body">{body}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}
