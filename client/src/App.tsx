import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import Home from "./pages/Home";
import Features from "./pages/Features";
import Profile from "./pages/Profile";
import Settings from "./pages/Settings";
import SilverLens from "./pages/SilverLens";
import Copywriter from "./pages/Copywriter";
import StoryTime from "./pages/StoryTime";
import LifeAssistant from "./pages/LifeAssistant";
import AIChat from "./pages/AIChat";
import Admin from "./pages/Admin";

function Router() {
  return (
    <Switch>
      <Route path={"/"} component={Home} />
      <Route path={"/features"} component={Features} />
      <Route path={"/profile"} component={Profile} />
      <Route path={"/settings"} component={Settings} />
      <Route path={"/silver-lens"} component={SilverLens} />
      <Route path={"/copywriter"} component={Copywriter} />
      <Route path={"/story-time"} component={StoryTime} />
      <Route path={"/life-assistant"} component={LifeAssistant} />
      <Route path={"/ai-chat"} component={AIChat} />
      <Route path={"/admin"} component={Admin} />
      <Route path={"/404"} component={NotFound} />
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
