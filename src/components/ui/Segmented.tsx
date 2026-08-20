import { cn } from "../../lib/utils";

export type SegmentedAccent = "neutral" | "primary" | "ai" | "serve";

const activeTones: Record<SegmentedAccent, string> = {
  neutral: "bg-white/15 text-fg shadow-sm",
  primary: "bg-blue-500/20 text-blue-300 shadow-sm",
  ai: "bg-purple-500/20 text-purple-300 shadow-sm",
  serve: "bg-emerald-500/20 text-emerald-300 shadow-sm",
};

interface SegmentedProps<T extends string> {
  options: { label: string; value: T; accent?: SegmentedAccent }[];
  value: T;
  onChange: (v: T) => void;
  accent?: SegmentedAccent;
  /** "md" fills the track evenly; "sm" sizes segments to their content. */
  size?: "sm" | "md";
  className?: string;
}

/** Segmented control: radius-10 track, radius-8 segments (concentric at 2px inset). */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  accent = "neutral",
  size = "md",
  className,
}: SegmentedProps<T>) {
  return (
    <div className={cn("flex rounded-ctl bg-surface border border-border p-0.5", className)}>
      {options.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          className={cn(
            "rounded-lg font-medium transition-all",
            size === "md" ? "flex-1 py-1.5 text-sm" : "px-3 py-1 text-xs",
            value === opt.value
              ? activeTones[opt.accent ?? accent]
              : "text-fg-muted hover:text-fg-secondary"
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
