import { cn } from "../../lib/utils";

interface SparklineProps {
  /** Sample history, oldest first. Needs at least 2 points to draw. */
  values: number[];
  /** Fixed scale ceiling (e.g. 100 for percent, total GiB for memory). Defaults to the series max. */
  max?: number;
  height?: number;
  className?: string;
}

/**
 * Single-hue area sparkline: 2px line over a 30%-opacity fill, both in
 * currentColor. Identity comes from the label next to it, not the color.
 */
export function Sparkline({ values, max, height = 28, className }: SparklineProps) {
  const W = 140;
  const H = 28;
  if (values.length === 0) {
    return <div style={{ height }} className={className} />;
  }
  // A single sample draws as a flat line instead of an empty strip.
  const series = values.length === 1 ? [values[0], values[0]] : values;
  // Auto mode adds 25% headroom so a flat series doesn't hug the top edge.
  const ceil = Math.max(max ?? Math.max(...series) * 1.25, 1e-6);
  const pts = series.map((v, i) => {
    const x = (i / (series.length - 1)) * W;
    const y = H - 2 - Math.min(Math.max(v / ceil, 0), 1) * (H - 6);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const line = `M${pts.join(" L")}`;
  const area = `${line} L${W},${H} L0,${H} Z`;
  return (
    <svg
      width="100%"
      height={height}
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      className={cn("block", className)}
      aria-hidden="true"
    >
      <path d={area} fill="currentColor" opacity="0.3" />
      <path
        d={line}
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
