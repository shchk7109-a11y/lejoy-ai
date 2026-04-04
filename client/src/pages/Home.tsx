import { useAuth } from "@/_core/hooks/useAuth";
import { Coins, LogIn, User, Settings, ChevronRight } from "lucide-react";
import { Link } from "wouter";
import { getLoginUrl } from "@/const";
import { trpc } from "@/lib/trpc";

const LOGO_URL = "https://d2xsxph8kpxj0f.cloudfront.net/310519663392433828/9S5GyeFYmWWPJwcFChhKPg/lejoy-icon_c0d7e1c3.png";

const MODULES = [
  { id: "silver-lens", icon: "📸", title: "老摄影大师", desc: "一键修图、人像美化与艺术创作", color: "bg-amber-50 border-amber-200", iconBg: "bg-amber-100", credits: "2积分/次" },
  { id: "copy-writer", icon: "✍️", title: "暖心文案", desc: "为您撰写节日祝福与朋友圈", color: "bg-orange-50 border-orange-200", iconBg: "bg-orange-100", credits: "1积分/次" },
  { id: "story-time", icon: "📖", title: "AI 故事会", desc: "给孙辈讲个专属的好故事", color: "bg-sky-50 border-sky-200", iconBg: "bg-sky-100", credits: "3积分/次" },
  { id: "life-assistant", icon: "🌿", title: "生活助手", desc: "美食营养分析、健康百科查询", color: "bg-green-50 border-green-200", iconBg: "bg-green-100", credits: "1积分/次" },
  { id: "ai-kaleidoscope", icon: "🩺", title: "AI 万花筒", desc: "健康顾问，解答您的问题", color: "bg-rose-50 border-rose-200", iconBg: "bg-rose-100", credits: "1积分/次" },
];

export default function Home() {
  const { user, isAuthenticated } = useAuth();
  const { data: creditsData } = trpc.credits.balance.useQuery(undefined, { enabled: isAuthenticated });

  return (
    <div className="min-h-screen bg-orange-50">
      <header className="bg-white shadow-sm sticky top-0 z-10 px-4 py-3">
        <div className="max-w-lg mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <img src={LOGO_URL} alt="乐享AI" className="w-9 h-9 rounded-xl object-cover" />
            <div>
              <h1 className="text-xl font-bold text-orange-600 font-serif">乐享 AI</h1>
              <p className="text-xs text-stone-400">让AI为生活添彩</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {isAuthenticated ? (
              <>
                <Link href="/profile">
                  <div className="flex items-center gap-1.5 bg-amber-50 border border-amber-200 rounded-full px-3 py-1.5 cursor-pointer hover:bg-amber-100 transition-colors">
                    <Coins className="w-4 h-4 text-amber-500" />
                    <span className="font-bold text-amber-700 text-sm">{creditsData?.credits ?? "--"}</span>
                  </div>
                </Link>
                <Link href="/profile">
                  <div className="w-9 h-9 bg-amber-500 text-white rounded-full flex items-center justify-center cursor-pointer hover:bg-amber-600 transition-colors font-bold">
                    {user?.name?.[0] || <User className="w-4 h-4" />}
                  </div>
                </Link>
              </>
            ) : (
              <a href={getLoginUrl()} className="flex items-center gap-1.5 bg-amber-500 text-white px-4 py-2 rounded-full text-sm font-medium hover:bg-amber-600 transition-colors">
                <LogIn className="w-4 h-4" /> 登录
              </a>
            )}
          </div>
        </div>
      </header>

      <div className="max-w-lg mx-auto px-4 py-5">
        <div className="bg-gradient-to-br from-amber-400 to-orange-500 rounded-2xl p-5 mb-6 text-white shadow-md">
          <div className="flex items-start justify-between">
            <div>
              {isAuthenticated ? (
                <>
                  <p className="text-orange-100 text-sm">欢迎回来</p>
                  <h2 className="text-xl font-bold mt-0.5">{user?.name || "用户"} 👋</h2>
                  <p className="text-orange-100 text-sm mt-1">当前积分：<span className="text-white font-bold text-lg">{creditsData?.credits ?? "--"}</span></p>
                </>
              ) : (
                <>
                  <p className="text-orange-100 text-sm">您好！</p>
                  <h2 className="text-xl font-bold mt-0.5">欢迎使用乐享AI 🎉</h2>
                  <p className="text-orange-100 text-sm mt-1">登录后获得 <span className="text-white font-bold">100</span> 初始积分</p>
                </>
              )}
            </div>
            <div className="text-4xl">✨</div>
          </div>
          {!isAuthenticated && (
            <a href={getLoginUrl()} className="mt-3 inline-flex items-center gap-1.5 bg-white text-orange-600 px-4 py-2 rounded-xl text-sm font-bold hover:bg-orange-50 transition-colors">
              <LogIn className="w-4 h-4" /> 立即登录体验
            </a>
          )}
        </div>

        <div className="mb-4">
          <h3 className="font-bold text-stone-700 mb-3">🌟 AI 功能</h3>
          <div className="space-y-3">
            {MODULES.map((m) => (
              <Link key={m.id} href={`/${m.id}`}>
                <div className={`border-2 rounded-2xl p-4 flex items-center gap-4 hover:scale-[1.01] active:scale-[0.99] transition-all cursor-pointer ${m.color}`}>
                  <div className={`w-14 h-14 ${m.iconBg} rounded-2xl flex items-center justify-center text-3xl flex-shrink-0`}>{m.icon}</div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-stone-800 text-lg">{m.title}</p>
                    <p className="text-stone-500 text-sm mt-0.5 truncate">{m.desc}</p>
                    <p className="text-stone-400 text-xs mt-1">{m.credits}</p>
                  </div>
                  <ChevronRight className="w-5 h-5 text-stone-400 flex-shrink-0" />
                </div>
              </Link>
            ))}
          </div>
        </div>

        {user?.role === "admin" && (
          <Link href="/admin">
            <div className="bg-amber-500 text-white rounded-2xl p-4 flex items-center gap-3 hover:bg-amber-600 transition-colors cursor-pointer mt-4">
              <Settings className="w-6 h-6" />
              <div>
                <p className="font-bold">管理员后台</p>
                <p className="text-amber-100 text-xs">会员管理 · 积分增送 · 模型配置</p>
              </div>
              <ChevronRight className="w-5 h-5 text-amber-100 ml-auto" />
            </div>
          </Link>
        )}

        <div className="mt-6 text-center">
          <p className="text-xs text-stone-400 leading-relaxed">
            积分不足时，请联系管理员获取免费积分<br />
            所有AI内容仅供参考，健康问题请咨询医生
          </p>
        </div>
      </div>
    </div>
  );
}
