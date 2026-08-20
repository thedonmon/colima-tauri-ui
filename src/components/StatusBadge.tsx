import { Pill } from "./ui/Badge";

interface StatusBadgeProps {
  status: string;
  className?: string;
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const isRunning = status.toLowerCase() === "running";
  const isStopped = status.toLowerCase() === "stopped";

  return (
    <Pill
      tone={isRunning ? "emerald" : isStopped ? "neutral" : "amber"}
      dot
      pulse={!isRunning && !isStopped}
      className={className}
    >
      {status}
    </Pill>
  );
}
