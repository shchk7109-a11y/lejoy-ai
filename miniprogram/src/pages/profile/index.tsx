import { useState } from "react";
import { Text, View } from "@tarojs/components";
import Taro, { useDidShow } from "@tarojs/taro";
import { PageHeader } from "../../components/PageHeader";
import { mpApi, type CreditTransaction, type MpUser } from "../../services/api";
import "./index.scss";

function formatTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export default function ProfilePage() {
  const [user, setUser] = useState<MpUser>();
  const [transactions, setTransactions] = useState<CreditTransaction[]>([]);

  useDidShow(() => {
    void loadProfile();
  });

  async function loadProfile() {
    try {
      const [currentUser, history] = await Promise.all([mpApi.me(), mpApi.creditHistory()]);
      setUser(currentUser);
      setTransactions(history.transactions);
    } catch (error) {
      await Taro.showToast({ title: error instanceof Error ? error.message : "加载失败", icon: "none" });
    }
  }

  return (
    <View className="profile-page">
      <PageHeader title="我的" />
      <View className="profile-page__content">
        <View className="user-card">
          <View className="user-card__avatar">{user?.name?.slice(0, 1) || "乐"}</View>
          <View className="user-card__info">
            <Text className="user-card__name">{user?.name || "乐享用户"}</Text>
            <Text className="user-card__label">微信小程序用户</Text>
          </View>
          <View className="user-card__credits">
            <Text className="user-card__credits-number">{user?.credits ?? "--"}</Text>
            <Text>积分</Text>
          </View>
        </View>

        <Text className="profile-page__title">积分明细</Text>
        <View className="transaction-list">
          {transactions.length === 0 ? (
            <View className="transaction-empty"><Text>暂时还没有积分记录</Text></View>
          ) : transactions.map((transaction) => (
            <View key={transaction.id} className="transaction-item">
              <View className="transaction-item__main">
                <Text className="transaction-item__description">{transaction.description || "积分变动"}</Text>
                <Text className="transaction-item__time">{formatTime(transaction.createdAt)}</Text>
              </View>
              <View className="transaction-item__amount">
                <Text className={transaction.amount > 0 ? "transaction-item__positive" : "transaction-item__negative"}>
                  {transaction.amount > 0 ? "+" : ""}{transaction.amount}
                </Text>
                <Text className="transaction-item__balance">余额 {transaction.balanceAfter}</Text>
              </View>
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}
