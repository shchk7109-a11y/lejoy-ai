import { Text, View } from "@tarojs/components";
import Taro from "@tarojs/taro";
import "./index.scss";

export function PageHeader({ title, showBack = true }: { title: string; showBack?: boolean }) {
  return (
    <>
      <View className="page-header">
        {showBack ? (
          <View className="page-header__back clickable" onClick={() => Taro.navigateBack()}>
            <Text className="page-header__back-icon">‹</Text>
            <Text>返回</Text>
          </View>
        ) : <View className="page-header__side" />}
        <Text className="page-header__title">{title}</Text>
        <View className="page-header__side" />
      </View>
      <View className="page-header__spacer" />
    </>
  );
}
