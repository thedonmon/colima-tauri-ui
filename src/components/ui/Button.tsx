import { type ReactNode } from "react";
import { cn } from "../../lib/utils";

export type ButtonTone =
  | "primary"
  | "start"
  | "stop"
  | "warn"
  | "ai"
  | "serve"
  | "neutral"
  | "danger-ghost";

const tones: Record<ButtonTone, string> = {
  primary: "bg-blue-500/15 text-blue-400 hover:bg-blue-500/25",
  start: "bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25",
  stop: "bg-red-500/15 text-red-400 hover:bg-red-500/25",
  warn: "bg-amber-500/12 text-amber-400 hover:bg-amber-500/20",
  ai: "bg-purple-500/15 text-purple-300 hover:bg-purple-500/25",
  serve: "bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30",
  neutral: "bg-surface-raised text-fg-muted hover:bg-surface-hover hover:text-fg-secondary",
  "danger-ghost": "bg-transparent text-fg-faint hover:bg-red-500/15 hover:text-red-400",
};

interface ButtonProps {
  icon?: ReactNode;
  children?: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  /** Swaps the icon for a pulsing dot while a command runs. */
  busy?: boolean;
  tone?: ButtonTone;
  size?: "sm" | "md";
  title?: string;
  className?: string;
}

export function Button({
  icon,
  children,
  onClick,
  disabled,
  busy,
  tone = "neutral",
  size = "md",
  title,
  className,
}: ButtonProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={cn(
        "flex items-center gap-1.5 rounded-full font-medium transition-all",
        "disabled:opacity-35 disabled:cursor-not-allowed",
        size === "sm" ? "px-2.5 py-1 text-xs" : "px-3 py-1.5 text-xs",
        tones[tone],
        className
      )}
    >
      {busy ? <span className="h-1.5 w-1.5 rounded-full bg-current animate-pulse" /> : icon}
      {children && <span>{children}</span>}
    </button>
  );
}

interface IconButtonProps {
  icon: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  title?: string;
  danger?: boolean;
  className?: string;
}

/** 28px ghost icon button on the control radius. */
export function IconButton({ icon, onClick, disabled, title, danger, className }: IconButtonProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={cn(
        "w-7 h-7 rounded-ctl flex items-center justify-center transition-all",
        "disabled:opacity-35 disabled:cursor-not-allowed",
        danger
          ? "text-fg-faint hover:bg-red-500/15 hover:text-red-400"
          : "text-fg-faint hover:bg-surface-hover hover:text-fg-secondary",
        className
      )}
    >
      {icon}
    </button>
  );
}
