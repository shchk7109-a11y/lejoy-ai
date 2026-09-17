import { useState } from "react";
import { Button, Input, Text, View } from "@tarojs/components";
import { useDidShow } from "@tarojs/taro";
import { PageHeader } from "../../components/PageHeader";
import { mpApi, type CreditTransaction, type MpUser } from "../../services/api";
import { normalizeApiError } from "../../services/request-policy";
import { formatCreditCode, normalizeCreditCode, redeemErrorMessage } from "./logic";
import "./index.scss";

function dateLabel(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export default function CreditsPage() {
  const [user, setUser] = useState<MpUser>();
  const [transactions, setTransactions] = useState<CreditTransaction[]>([]);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [success, setSuccess] = useState(false);

  useDidShow(() => { void load(); });

  async function load() {
    try {
      const [currentUser, history] = await Promise.all([mpApi.me(), mpApi.creditHistory()]);
      setUser(currentUser); setTransactions(history.transactions);
    } catch { setFeedback("余额暂时无法刷新，请检查网络后重试。"); }
  }

  async function redeem() {
    if (busy) return;
    const normalized = normalizeCreditCode(code);
    if (normalized.length !== 12) { setSuccess(false); setFeedback("请输入店长赠送的 12 位兑换码"); return; }
    setBusy(true); setFeedback("");
    try {
      const result = await mpApi.redeemCredits(normalized);
      // 服务端已提交事务；后续 GET 失败不能把已入账的积分误报为兑换失败。
      setUser(current => current ? { ...current, credits: result.balance } : current);
      setCode(""); setSuccess(true);
      setFeedback(`领取成功，获得 ${result.awardedCredits} 积分！当前余额 ${result.balance} 分。`);
      try {
        const [currentUser, history] = await Promise.all([mpApi.me(), mpApi.creditHistory()]);
        setUser(currentUser); setTransactions(history.transactions);
      } catch {
        setFeedback(`领取成功，获得 ${result.awardedCredits} 积分！当前余额 ${result.balance} 分。明细暂未刷新，可稍后点“刷新余额与明细”。`);
      }
    } catch (error) {
      const normalizedError = normalizeApiError(error);
      setSuccess(false); setFeedback(redeemErrorMessage(normalizedError.code));
    } finally { setBusy(false); }
  }

  return <View className="credits-page">
    <PageHeader title="积分中心" />
    <View className="credits-page__content">
      <View className="credits-balance"><Text className="credits-balance__label">当前积分</Text><Text className="credits-balance__number">{user?.credits ?? "--"}</Text><Text className="credits-balance__hint">使用 AI 功能时按页面提示扣分</Text></View>
      <View className="credits-redeem"><Text className="credits-page__title">兑换店长赠送的积分</Text><Text className="credits-page__body">把兑换码粘贴或输入下方，每 4 位会自动分组。</Text><Input className="credits-redeem__input" value={formatCreditCode(code)} onInput={event => setCode(event.detail.value)} placeholder="XXXX-XXXX-XXXX" maxlength={14} /><Button className="credits-redeem__button" disabled={busy} onClick={() => void redeem()}>{busy ? "正在兑换，请稍候…" : "领取积分"}</Button>{feedback ? <Text className={success ? "credits-redeem__success" : "credits-redeem__error"}>{feedback}</Text> : null}</View>
      <View className="credits-how"><Text className="credits-page__title">如何获得积分</Text><Text className="credits-page__body">新用户有初始赠分。</Text><Text className="credits-page__body">到店可向店长免费领取兑换码。</Text><Text className="credits-page__body">目前暂不支持在线充值；店长不会在小程序内向您收费。</Text></View>
      <View className="credits-history"><Text className="credits-page__title">最近积分明细</Text>{transactions.length === 0 ? <Text className="credits-page__body">暂时还没有积分记录</Text> : transactions.map(item => <View key={item.id} className="credits-history__row"><View><Text className="credits-history__description">{item.description || (item.type === "redeem" ? "门店兑换码赠分" : "积分变动")}</Text><Text className="credits-history__time">{dateLabel(item.createdAt)}</Text></View><View className="credits-history__right"><Text className={item.amount >= 0 ? "credits-history__positive" : "credits-history__negative"}>{item.amount > 0 ? "+" : ""}{item.amount}</Text><Text className="credits-history__time">余额 {item.balanceAfter}</Text></View></View>)}</View>
      <Button className="credits-page__refresh" onClick={() => void load()}>刷新余额与明细</Button>
    </View>
  </View>;
}
