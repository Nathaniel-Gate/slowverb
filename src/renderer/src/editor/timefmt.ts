/** m:ss.mmm for display. */
export function fmtTime(t: number): string {
  const ms = Math.round(Math.max(0, t) * 1000), m = Math.floor(ms / 60000), s = (ms % 60000) / 1000
  return `${m}:${s.toFixed(3).padStart(6, '0')}`
}
/** Short duration: "12.3s" or "1:05.2". */
export function fmtDur(t: number): string {
  const s = Math.max(0, t)
  return s < 60 ? `${s.toFixed(1)}s` : `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, '0')}`
}
/** "1:23.456", "83.4", "1:02:03" -> seconds, or null when it is not a time. */
export function parseTime(raw: string): number | null {
  const parts = raw.trim().split(':')
  if (parts.length > 3 || parts.some((p) => !/^(\d+\.?\d*|\.\d+)$/.test(p))) return null
  const total = parts.reduce((n, p) => n * 60 + parseFloat(p), 0)
  return Number.isFinite(total) ? total : null
}
