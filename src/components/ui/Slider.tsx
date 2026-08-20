interface SliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit: string;
  onChange: (v: number) => void;
  /** Show min/max labels under the track. */
  bounds?: boolean;
}

export function Slider({ label, value, min, max, step = 1, unit, onChange, bounds }: SliderProps) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <label className="text-xs text-fg-muted font-medium uppercase tracking-wide">
          {label}
        </label>
        <span className="text-sm text-fg font-mono">
          {value} {unit}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full cursor-pointer"
      />
      {bounds && (
        <div className="flex justify-between text-xs text-fg-faint">
          <span>{min}</span>
          <span>{max}</span>
        </div>
      )}
    </div>
  );
}
