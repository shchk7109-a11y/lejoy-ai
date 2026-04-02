import { useAuth } from "@/_core/hooks/useAuth";
import { canUseDevLogin, getLoginUrl, loginInDevMode, redirectToLogin } from "@/const";
import { toast } from "sonner";
import { usePoints } from "@/hooks/usePoints";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { BottomNav } from "@/components/BottomNav";
import { LogIn, Coins, Settings, Shield, ChevronRight } from "lucide-react";
import { useLocation } from "wouter";
import type { ModuleType } from "@shared/appTypes";

const APP_ICON = "https://d2xsxph8kpxj0f.cloudfront.net/310519663415439539/FL55Eub6nFftzszZA77BVq/lejoy-ai-icon_03785d39.png";

const modules: Array<{ id: ModuleType; title: string; desc: string; icon: string; color: string; path: string }> = [
  { id: "SILVER_LENS", title: "老摄影大师", desc: "一键修图、人像美化与艺术创作", icon: "📸", color: "from-amber-50 to-orange-50 border-amber-200", path: "/silver-lens" },
  { id: "COPYWRITER", title: "暖心文案", desc: "为您撰写节日祝福与朋友圈", icon: "✍️", color: "from-orange-50 to-red-50 border-orange-200", path: "/copywriter" },
  { id: "STORY_TIME", title: "AI 故事会", desc: "给孙辈讲个专属的好故事", icon: "📖", color: "from-sky-50 to-blue-50 border-sky-200", path: "/story-time" },
  { id: "LIFE_ASSISTANT", title: "生活助手", desc: "识花、查菜谱、健康百科", icon: "🌿", color: "from-green-50 to-emerald-50 border-green-200", path: "/life-assistant" },
  { id: "AI_KALEIDOSCOPE", title: "AI 万花筒", desc: "用AI解答你的各种问题", icon: "🔮", color: "from-purple-50 to-pink-50 border-purple-200", path: "/ai-chat" },
];

export default function Home() {
  const { user, isAuthenticated, refresh } = useAuth();
  const { points } = usePoints();
  const [, setLocation] = useLocation();

  const handleDevLogin = async (nextPath?: string) => {
    const ok = await loginInDevMode();
    if (!ok) return false;
    await refresh();
    if (nextPath) {
      setLocation(nextPath);
    }
    return true;
  };

  const handleModuleClick = async (path: string) => {
    if (!isAuthenticated) {
      if (canUseDevLogin() && !getLoginUrl()) {
        const loggedIn = await handleDevLogin(path);
        if (loggedIn) return;
      }

      const redirected = redirectToLogin();
      if (!redirected) {
        toast.info("当前以访客模式打开页面预览，涉及账户/积分/保存的接口可能提示未登录。", {
          id: "guest-preview-entry",
        });
        setLocation(path);
      }
      return;
    }
    setLocation(path);
  };

  return (
    <div className="min-h-screen bg-background flex flex-col pb-16">
      {/* Top Bar */}
      <div className="sticky top-0 z-50 bg-background/95 backdrop-blur border-b border-border">
        <div className="container flex items-center justify-between h-14">
          <div className="flex items-center gap-2">
            <img src={APP_ICON} alt="乐享AI" className="w-8 h-8 rounded-lg" />
            <span className="font-semibold text-foreground">乐享AI</span>
          </div>
          <div className="flex items-center gap-2">
            {isAuthenticated ? (
              <>
                <button
                  onClick={() => setLocation("/profile")}
                  className="flex items-center gap-1.5 bg-amber-50 text-amber-700 px-3 py-1.5 rounded-full text-sm font-medium border border-amber-200"
                >
                  <Coins className="w-4 h-4" />
                  <span>{points}</span>
                </button>
                {user?.role === "admin" && (
                  <Button variant="ghost" size="icon" onClick={() => setLocation("/admin")} className="text-muted-foreground">
                    <Shield className="w-5 h-5" />
                  </Button>
                )}
                <Button variant="ghost" size="icon" onClick={() => setLocation("/settings")} className="text-muted-foreground">
                  <Settings className="w-5 h-5" />
                </Button>
              </>
            ) : (
              <div className="flex items-center gap-2">
                {canUseDevLogin() && (
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      void handleDevLogin();
                    }}
                    className="rounded-full"
                  >
                    开发登录
                  </Button>
                )}
                <Button
                  size="sm"
                  onClick={() => {
                    redirectToLogin();
                  }}
                  className="rounded-full"
                >
                  <LogIn className="w-4 h-4 mr-1" /> 登录
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Hero */}
      <div className="container pt-8 pb-6 text-center animate-fade-in">
        <img
          src={APP_ICON}
          alt="乐享AI"
          className="w-20 h-20 rounded-2xl shadow-lg mx-auto mb-4 border border-white"
        />
        <h1 className="text-3xl font-bold text-foreground mb-2 tracking-wide">乐享AI</h1>
        <p className="text-muted-foreground text-lg">您的智能生活好帮手</p>
      </div>

      {/* Module Grid */}
      <div className="container flex-1 pb-4">
        <div className="grid grid-cols-1 gap-4">
          {modules.map((m, i) => (
            <Card
              key={m.id}
              onClick={() => handleModuleClick(m.path)}
              className={`p-5 border bg-gradient-to-br ${m.color} hover:shadow-lg hover:scale-[1.01] transition-all cursor-pointer animate-slide-up`}
              style={{ animationDelay: `${i * 80}ms`, animationFillMode: "both" }}
            >
              <div className="flex items-center gap-4">
                <div className="bg-white/70 p-3 rounded-xl text-3xl shadow-sm shrink-0">
                  {m.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <h2 className="text-xl font-bold text-foreground mb-1">{m.title}</h2>
                  <p className="text-sm text-muted-foreground">{m.desc}</p>
                </div>
                <ChevronRight className="w-5 h-5 text-muted-foreground shrink-0" />
              </div>
            </Card>
          ))}
        </div>
      </div>

      {/* Footer */}
      <footer className="container py-4 text-center text-muted-foreground text-xs">
        &copy; 2025 乐享AI &middot; 科技温暖生活
      </footer>

      {/* Bottom Navigation */}
      <BottomNav />
    </div>
  );
}
  