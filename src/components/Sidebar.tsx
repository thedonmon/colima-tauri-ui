import { Server, Layers, Sparkles } from "lucide-react";
import { cn } from "../lib/utils";

export type AppTab = "instances" | "docker" | "ai";

interface SidebarProps {
  activeTab: AppTab;
  onTabChange: (tab: AppTab) => void;
}

const tabs: { id: AppTab; icon: React.ReactNode; label: string; color: string }[] = [
  { id: "instances", icon: <Server size={16} />, label: "VMs", color: "text-blue-400" },
  { id: "docker", icon: <Layers size={16} />, label: "Docker", color: "text-cyan-400" },
  { id: "ai", icon: <Sparkles size={16} />, label: "AI", color: "text-purple-400" },
];

export function Sidebar({ activeTab, onTabChange }: SidebarProps) {
  return (
    <aside className="w-16 flex-shrink-0 border-r border-border bg-black/15 flex flex-col items-center pt-2 pb-3 gap-1">
      {tabs.map(({ id, icon, label, color }) => {
        const isActive = activeTab === id;
        return (
          <button
            key={id}
            onClick={() => onTabChange(id)}
            title={label}
            className={cn(
              "w-12 h-12 flex flex-col items-center justify-center gap-0.5 rounded-xl transition-all",
              isActive
                ? cn("bg-white/[0.09]", color)
                : "text-fg-faint hover:text-fg-muted hover:bg-white/[0.04]"
            )}
          >
            <span className={cn(isActive && color)}>{icon}</span>
            <span className={cn("text-[10px] font-medium", isActive ? color : "text-fg-faint")}>
              {label}
            </span>
          </button>
        );
      })}
    </aside>
  );
}
