import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import Home from "./pages/Home";
import SilverLens from "./pages/SilverLens";
import CopyWriter from "./pages/CopyWriter";
import StoryTime from "./pages/StoryTime";
import LifeAssistant from "./pages/LifeAssistant";
import AIKaleidoscope from "./pages/AIKaleidoscope";
import Profile from "./pages/Profile";
import Hq from "./pages/Hq";

function LegacyAdminNotice() {
  return <main className="mx-auto max-w-xl p-8 text-stone-800"><h1 className="mb-4 text-2xl font-bold">旧管理入口已停用</h1><p>总部积分配码已迁移到独立后台，旧 H5 登录状态不会继承。</p><a className="mt-6 inline-block rounded-xl bg-amber-600 px-5 py-3 font-semibold text-white" href="/hq">前往总部后台登录</a></main>;
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/silver-lens" component={SilverLens} />
      <Route path="/copy-writer" component={CopyWriter} />
      <Route path="/story-time" component={StoryTime} />
      <Route path="/life-assistant" component={LifeAssistant} />
      <Route path="/ai-kaleidoscope" component={AIKaleidoscope} />
      <Route path="/profile" component={Profile} />
      <Route path="/admin" component={LegacyAdminNotice} />
      <Route path="/hq" component={Hq} />
      <Route path="/404" component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light">
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
