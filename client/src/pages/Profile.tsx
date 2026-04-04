import { ArrowLeft, Coins, Clock, User, LogOut, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";
import { Link } from "wouter";

const CREDIT_COSTS: Record<string, string> = {
  photo_restore: "智能修图",
  photo_art: "艺术创作",
  copywriter: "暖心文案",
  story_generate: "AI故事会",
  life_analyze: "生活助手",
  chat: "AI万花筒",
};

export default function Profile() {
  const { user, logout, isAuthenticated } = useAuth();
  const { data: creditsData } = trpc.credits.balance.useQuery(undefined, { enabled: isAuthenticated });
  const { data: historyData } = trpc.credits.history.useQuery(undefined, { enabled: isAuthenticated });

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-stone-50 flex flex-col items-center justify-center gap-6 p-6">
        <div className="w-20 h-20 bg-stone-200 rounded-full flex items-center justify-center">
          <User className="w-10 h-10 text-stone-400" />
        </div>
        <div className="text-center">
          <h2 className="text-xl font-bold text-stone-800 mb-2">请先登录</h2>
          <p className="text-stone-500 text-sm">登录后可查看积分余额和使用记录</p>
        </div>
        <Button asChild className="w-full max-w-xs rounded-xl py-3 text-base">
          <a href={getLoginUrl()}>立即登录</a>
        </Button>
        <button onClick={() => window.history.back()} className="text-stone-400 text-sm">返回首页</button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-stone-50 pb-20">
      <header className="bg-white px-4 py-4 flex items-center justify-between shadow-sm sticky top-0 z-10">
        <button onClick={() => window.history.back()} className="flex items-center gap-1 text-stone-600 font-medium">
          <ArrowLeft className="w-5 h-5" /> 返回
        </button>
        <h1 className="text-lg font-bold font-serif text-stone-800">👤 个人中心</h1>
        <div className="w-16" />
      </header>

      <div className="max-w-lg mx-auto px-4 py-5 space-y-4">
        {/* 用户信息卡片 */}
        <div className="bg-gradient-to-br from-stone-700 to-stone-800 rounded-2xl p-5 text-white">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-14 h-14 bg-white/20 rounded-full flex items-center justify-center text-2xl">
              {user?.name?.[0] || "👤"}
            </div>
            <div>
              <p className="font-bold text-lg">{user?.name || "用户"}</p>
              <p className="text-stone-300 text-sm">{user?.email || ""}</p>
            </div>
          </div>
          <div className="bg-white/10 rounded-xl p-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Coins className="w-6 h-6 text-amber-400" />
              <div>
                <p className="text-xs text-stone-300">当前积分</p>
              <p className="text-2xl font-bold text-amber-400">{creditsData?.credits ?? "--"}</p>
            </div>
          </div>
          <div className="text-right">
              <p className="text-xs text-stone-300">历史记录</p>
              <p className="text-lg font-bold">{historyData?.length ?? "--"} 条</p>
            </div>
          </div>
        </div>

        {/* 积分说明 */}
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4">
          <p className="font-semibold text-amber-800 mb-2">💡 如何获取更多积分？</p>
          <p className="text-amber-700 text-sm leading-relaxed">
            积分用完后，请联系管理员获取免费积分。添加管理员微信，发送您的账号，即可获得积分补充。
          </p>
          <button
            onClick={() => alert("请联系管理员微信获取积分")}
            className="mt-3 w-full bg-amber-500 text-white rounded-xl py-2.5 font-medium text-sm"
          >
            联系管理员获取积分
          </button>
        </div>

        {/* 积分消耗记录 */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Clock className="w-5 h-5 text-stone-500" />
            <p className="font-semibold text-stone-700">使用记录</p>
          </div>
          {historyData && historyData.length > 0 ? (
            <div className="space-y-2">
              {historyData.map((tx: { id: number; type: string; amount: number; description: string | null; createdAt: Date }) => (
                <div key={tx.id} className="bg-white border border-stone-100 rounded-xl px-4 py-3 flex items-center justify-between">
                  <div>
                    <p className="font-medium text-stone-700 text-sm">
                      {CREDIT_COSTS[tx.type] || tx.description || tx.type}
                    </p>
                    <p className="text-xs text-stone-400 mt-0.5">
                      {new Date(tx.createdAt).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                    </p>
                  </div>
                  <span className={`font-bold text-base ${tx.amount > 0 ? "text-green-600" : "text-red-500"}`}>
                    {tx.amount > 0 ? `+${tx.amount}` : tx.amount}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="bg-white border border-stone-100 rounded-2xl p-8 text-center text-stone-400">
              <Clock className="w-8 h-8 mx-auto mb-2 opacity-40" />
              <p className="text-sm">暂无使用记录</p>
            </div>
          )}
        </div>

        {/* 退出登录 */}
        <button
          onClick={logout}
          className="w-full bg-white border border-red-200 text-red-500 rounded-xl py-3 font-medium flex items-center justify-center gap-2"
        >
          <LogOut className="w-5 h-5" /> 退出登录
        </button>
      </div>
    </div>
  );
}
