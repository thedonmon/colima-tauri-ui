import { cn } from "../lib/utils";

interface StatusBadgeProps {
  status: string;
  className?: string;
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const isRunning = status.toLowerCase() === "running";
  const isStopped = status.toLowerCase() === "stopped";

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium",
        isRunning && "bg-green-500/15 text-green-400",
        isStopped && "bg-red-500/15 text-red-400",
        !isRunning && !isStopped && "bg-yellow-500/15 text-yellow-400",
        className
      )}
    >
      <span
        className={cn(
          "h-1.5 w-1.5 rounded-full",
          isRunning && "bg-green-400",
          isStopped && "bg-red-400",
          !isRunning && !isStopped && "bg-yellow-400 animate-pulse"
        )}
      />
      {status}
    </span>
  );
}
