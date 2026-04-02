import { useAuth } from "@/_core/hooks/useAuth";
import { redirectToLogin } from "@/const";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { BottomNav } from "@/components/BottomNav";
import { ChevronRight } from "lucide-react";
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

export default function Features() {
  const { isAuthenticated } = useAuth();
  const [, setLocation] = useLocation();

  const handleModuleClick = (path: string) => {
    if (!isAuthenticated) {
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
      {/* Header */}
      <div className="sticky top-0 z-40 bg-background/95 backdrop-blur border-b border-border">
        <div className="container flex items-center h-14">
          <img src={APP_ICON} alt="乐享AI" className="w-7 h-7 rounded-lg mr-2" />
          <span className="font-semibold text-foreground">全部功能</span>
        </div>
      </div>

      <div className="container py-6 flex-1">
        <div className="grid grid-cols-1 gap-3">
          {modules.map((m, i) => (
            <Card
              key={m.id}
              onClick={() => handleModuleClick(m.path)}
              className={`p-4 border bg-gradient-to-br ${m.color} hover:shadow-lg hover:scale-[1.01] transition-all cursor-pointer animate-slide-up`}
              style={{ animationDelay: `${i * 60}ms`, animationFillMode: "both" }}
            >
              <div className="flex items-center gap-4">
                <div className="bg-white/70 p-3 rounded-xl text-2xl shadow-sm shrink-0">
                  {m.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <h2 className="text-lg font-bold text-foreground">{m.title}</h2>
                  <p className="text-xs text-muted-foreground mt-0.5">{m.desc}</p>
                </div>
                <ChevronRight className="w-5 h-5 text-muted-foreground shrink-0" />
              </div>
            </Card>
          ))}
        </div>
      </div>

      <BottomNav />
    </div>
  );
}
