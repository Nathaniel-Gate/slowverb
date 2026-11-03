/** m:ss.mmm (h:mm:ss.mmm past an hour). */
export function fmtTime(t: number): string {
  if (!Number.isFinite(t)) return '0:00.000'
  const s = Math.max(0, t), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = (s % 60).toFixed(3).padStart(6, '0')
  return h ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`
}

/** Parses "83.5", "1:23.456", "1:02:03.5" (also "1m23s", "2:" = 2 minutes). Returns seconds or null when it is not a time. */
export function parseTime(raw: string): number | null {
  const s = raw.trim().toLowerCase().replace(/,/g, '.')
  if (!s) return null
  const hms = s.match(/^(?:(\d+(?:\.\d+)?)h)?\s*(?:(\d+(?:\.\d+)?)m)?\s*(?:(\d+(?:\.\d+)?)s)?$/)
  if (hms && /[hms]/.test(s)) return (+(hms[1] ?? 0)) * 3600 + (+(hms[2] ?? 0)) * 60 + +(hms[3] ?? 0)
  const parts = s.split(':')
  if (parts.length > 3 || parts.some((p) => p !== '' && !/^\d+(\.\d+)?$/.test(p))) return null
  if (parts.length === 1 && parts[0] === '') return null
  const n = parts.map((p) => (p === '' ? 0 : +p))
  return n.reduce((acc, v) => acc * 60 + v, 0)
}

/** Plain number with an optional unit suffix ("-6 dB", "125%", "1.5x"). */
export function parseNum(raw: string): number | null {
  const m = raw.trim().replace(/,/g, '.').match(/^(-?\d+(?:\.\d+)?|-?\.\d+)\s*(db|%|x|s|bpm)?$/i)
  return m ? +m[1] : null
}

export const dbOf = (gain: number) => (gain > 0 ? 20 * Math.log10(gain) : -Infinity)
export const gainOf = (db: number) => 10 ** (db / 20)
export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))
