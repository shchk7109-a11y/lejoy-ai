import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ModuleHeaderProps {
  title: string;
  icon: string;
  onBack: () => void;
}

export function ModuleHeader({ title, icon, onBack }: ModuleHeaderProps) {
  return (
    <div className="sticky top-0 z-40 bg-background/95 backdrop-blur border-b border-border">
      <div className="container flex items-center gap-3 h-14">
        <Button variant="ghost" size="icon" onClick={onBack} className="shrink-0">
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <span className="text-2xl">{icon}</span>
        <h1 className="text-lg font-semibold truncate">{title}</h1>
      </div>
    </div>
  );
}
