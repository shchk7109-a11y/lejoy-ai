import { Home, Grid3X3, User } from "lucide-react";
import { useLocation } from "wouter";

const tabs = [
  { path: "/", label: "首页", icon: Home },
  { path: "/features", label: "功能", icon: Grid3X3 },
  { path: "/profile", label: "我的", icon: User },
];

export function BottomNav() {
  const [location, setLocation] = useLocation();

  // Determine active tab
  const activeTab = location === "/" ? "/" : location === "/profile" ? "/profile" : "/features";

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-background/95 backdrop-blur border-t border-border safe-area-bottom">
      <div className="flex items-center justify-around h-14 max-w-lg mx-auto">
        {tabs.map((tab) => {
          const isActive = tab.path === activeTab;
          const Icon = tab.icon;
          return (
            <button
              key={tab.path}
              onClick={() => setLocation(tab.path)}
              className={`flex flex-col items-center justify-center gap-0.5 flex-1 h-full transition-colors ${
                isActive ? "text-primary" : "text-muted-foreground"
              }`}
            >
              <Icon className={`w-5 h-5 ${isActive ? "stroke-[2.5]" : ""}`} />
              <span className="text-[10px] font-medium">{tab.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
