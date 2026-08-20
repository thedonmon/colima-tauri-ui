import { Server, Layers, Sparkles, Settings } from "lucide-react";
import { cn } from "../lib/utils";

export type AppTab = "instances" | "docker" | "ai" | "settings";

interface TabBarProps {
  activeTab: AppTab;
  onTabChange: (tab: AppTab) => void;
}

const tabs: { id: AppTab; icon: React.ReactNode; label: string; active: string }[] = [
  { id: "instances", icon: <Server size={16} />, label: "VMs", active: "bg-blue-500/[0.16] text-blue-300" },
  { id: "docker", icon: <Layers size={16} />, label: "Docker", active: "bg-cyan-500/[0.16] text-cyan-300" },
  { id: "ai", icon: <Sparkles size={16} />, label: "AI", active: "bg-purple-500/[0.16] text-purple-300" },
  { id: "settings", icon: <Settings size={16} />, label: "Settings", active: "bg-white/[0.12] text-fg" },
];

/** Floating bottom toolbar band: a glass capsule holding the section switches. */
export function TabBar({ activeTab, onTabChange }: TabBarProps) {
  return (
    <div className="absolute bottom-0 left-0 right-0 h-16 flex items-center justify-center z-20 pointer-events-none">
      <div className="flex gap-0.5 p-1 rounded-full bg-surface-raised border border-stroke backdrop-blur-xl shadow-[0_8px_24px_rgba(0,0,0,0.24)] pointer-events-auto">
        {tabs.map(({ id, icon, label, active }) => {
          const isActive = activeTab === id;
          return (
            <button
              key={id}
              onClick={() => onTabChange(id)}
              title={label}
              className={cn(
                "w-[60px] h-11 rounded-full flex flex-col items-center justify-center gap-0.5 transition-all",
                isActive ? active : "text-fg-faint hover:text-fg-muted hover:bg-surface"
              )}
            >
              {icon}
              <span className="text-[10px] font-medium">{label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
