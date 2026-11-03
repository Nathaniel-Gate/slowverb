import { clipDur, clipEnd, clipSpeed, type Project } from './model'

/** Source second -> timeline second, so the editor can open exactly where the player was. If several clips use that moment the
 *  one nearest `near` wins. null when the edit no longer contains that part of the song. */
export function sourceToTimeline(p: Project, src: string, s: number, near = 0): number | null {
  let best: number | null = null
  for (const c of p.clips) {
    if (c.src !== src || c.disabled || s < c.srcIn - 1e-6 || s > c.srcOut + 1e-6) continue
    const t = c.start + (s - c.srcIn) / clipSpeed(c)
    if (best === null || Math.abs(t - near) < Math.abs(best - near)) best = Math.min(t, clipEnd(c))
  }
  return best
}

/** Timeline second -> the song moment playing there (lowest track first), so the player can resume at the same point. */
export function timelineToSource(p: Project, t: number): { src: string; s: number } | null {
  const order = new Map(p.tracks.map((tr, i) => [tr.id, i]))
  const hits = p.clips.filter((c) => !c.disabled && c.start <= t + 1e-6 && t <= c.start + clipDur(c) + 1e-6)
    .sort((a, b) => (order.get(a.track) ?? 0) - (order.get(b.track) ?? 0))
  const c = hits[0]
  return c ? { src: c.src, s: Math.min(c.srcOut, c.srcIn + Math.max(0, t - c.start) * clipSpeed(c)) } : null
}
