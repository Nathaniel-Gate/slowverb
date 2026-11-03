import { clipEnd, type Project } from './model'
import { beatGrid } from './ops2'

export type SnapOpts = { enabled: boolean; playhead: number; pxPerSec: number; thresholdPx: number; exclude?: string[]; beats?: boolean }

/** All times worth snapping to: 0, playhead, markers, clip edges (clips in `exclude` ignored). */
export function snapTargets(p: Project, playhead: number, exclude: string[] = []): number[] {
  const skip = new Set(exclude)
  const ts = [0, playhead, ...p.markers.map(m => m.t)]
  for (const c of p.clips) if (!skip.has(c.id)) ts.push(c.start, clipEnd(c))
  return ts.filter(Number.isFinite)
}

/** Nearest target (plus beat lines when o.beats) within thresholdPx (converted to seconds); otherwise t unchanged. */
export function snapTime(p: Project, t: number, o: SnapOpts): number {
  if (!o.enabled || !Number.isFinite(t) || !(o.pxPerSec > 0) || !(o.thresholdPx > 0)) return t
  const reach = o.thresholdPx / o.pxPerSec
  let best = t, bestD = Infinity
  const beats = o.beats ? beatGrid(p, t - reach, t + reach) : []
  for (const c of [...snapTargets(p, o.playhead, o.exclude), ...beats]) {
    const d = Math.abs(c - t)
    if (d <= reach && d < bestD) { best = c; bestD = d }
  }
  return best
}
