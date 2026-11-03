/** pct = number: smooth determinate bar. pct = null: sliding indeterminate bar. Never frozen: both always animate. */
export function Progress({ pct }: { pct: number | null }) {
  return (
    <div className="bar" role="progressbar" aria-valuenow={pct ?? undefined}>
      {pct === null ? <div className="bar-ind" /> : <div className="bar-fill" style={{ transform: `scaleX(${Math.max(0.02, pct / 100)})` }} />}
    </div>
  )
}
