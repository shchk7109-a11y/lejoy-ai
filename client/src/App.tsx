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
import Admin from "./pages/Admin";

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
      <Route path="/admin" component={Admin} />
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
