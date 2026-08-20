import { type ReactNode } from "react";
import { cn } from "../../lib/utils";

export type PillTone = "emerald" | "red" | "amber" | "blue" | "purple" | "neutral";

const pillTones: Record<PillTone, string> = {
  emerald: "bg-emerald-500/[0.14] text-emerald-400",
  red: "bg-red-500/[0.14] text-red-400",
  amber: "bg-amber-500/[0.14] text-amber-300",
  blue: "bg-blue-500/[0.14] text-blue-400",
  purple: "bg-purple-500/[0.14] text-purple-300",
  neutral: "bg-white/[0.08] text-fg-muted",
};

interface PillProps {
  tone: PillTone;
  dot?: boolean;
  pulse?: boolean;
  children: ReactNode;
  className?: string;
}

/** Tinted capsule badge: ~14% tone fill behind bright tone text. */
export function Pill({ tone, dot, pulse, children, className }: PillProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium",
        pillTones[tone],
        className
      )}
    >
      {dot && (
        <span className={cn("h-1.5 w-1.5 rounded-full bg-current", pulse && "animate-pulse")} />
      )}
      {children}
    </span>
  );
}

/** Small count pill for accordion headers. */
export function CountPill({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "rounded-full bg-white/[0.08] px-2 py-0.5 text-xs text-fg-muted",
        className
      )}
    >
      {children}
    </span>
  );
}
