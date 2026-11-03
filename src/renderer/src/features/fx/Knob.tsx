type Props = { label: string; value: number; text: string; min: number; max: number; step: number; onChange(v: number): void }
export function Knob({ label, value, text, min, max, step, onChange }: Props) {
  return (
    <div className="knob">
      <div className="row"><span className="mono">{label}</span><b>{text}</b></div>
      <input type="range" min={min} max={max} step={step} value={value} style={{ '--p': `${((value - min) / (max - min)) * 100}%` } as React.CSSProperties} onChange={(e) => onChange(+e.target.value)} />
    </div>
  )
}
