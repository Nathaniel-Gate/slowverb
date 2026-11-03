import { clipDur, clipEnd, MIN_CLIP, type Clip, type Project } from './model'
import { EPS, clamp, clearRange, finite, fitFades, lockedIds } from './clipmath'

type Edge = 'in' | 'out'

function find(p: Project, id: string): { c: Clip; srcDur: number } | null {
  const c = p.clips.find(x => x.id === id), src = c && p.sources[c.src]
  return c && src && !lockedIds(p).has(c.track) ? { c, srcDur: src.duration } : null
}

/** New out edge: timeline end t, clamped to [MIN_CLIP, source end]. */
const withOut = (c: Clip, srcDur: number, t: number): Clip => {
  const dur = clamp(t - c.start, MIN_CLIP, srcDur - c.srcIn)
  return fitFades({ ...c, srcOut: Math.min(c.srcIn + dur, srcDur) })
}

/** Drag an edge to timeline time t. Clamps to source bounds, MIN_CLIP and timeline 0; overwrites neighbours it grows into. */
export function trimClip(p: Project, id: string, edge: Edge, t: number): Project {
  const f = find(p, id)
  if (!f || !finite(t)) return p
  const { c, srcDur } = f
  let next: Clip
  if (edge === 'in') {
    const d = clamp(t - c.start, Math.max(-c.srcIn, -c.start), clipDur(c) - MIN_CLIP)
    next = fitFades({ ...c, start: c.start + d, srcIn: c.srcIn + d })
  } else next = withOut(c, srcDur, t)
  if (next.start === c.start && next.srcIn === c.srcIn && next.srcOut === c.srcOut) return p
  const swapped = p.clips.map(x => (x.id === id ? next : x))
  return { ...p, clips: clearRange(swapped, c.track, next.start, clipEnd(next), new Set([id])) }
}

/**
 * Like trimClip, but later clips on the track shift by the length change instead of being overwritten.
 * Premiere behaviour for the 'in' edge: the clip keeps its timeline start, only srcIn moves (so t only sets HOW MUCH
 * is cut: delta = t - start), and everything after shifts by the opposite amount. Does not clamp to timeline 0.
 */
export function rippleTrim(p: Project, id: string, edge: Edge, t: number): Project {
  const f = find(p, id)
  if (!f || !finite(t)) return p
  const { c, srcDur } = f
  const next = edge === 'in'
    ? fitFades({ ...c, srcIn: c.srcIn + clamp(t - c.start, -c.srcIn, clipDur(c) - MIN_CLIP) })
    : withOut(c, srcDur, t)
  const delta = clipDur(next) - clipDur(c)
  if (delta === 0) return p
  const oldEnd = clipEnd(c)
  const clips = p.clips.map(x => {
    if (x.id === id) return next
    return x.track === c.track && x.start >= oldEnd - EPS ? { ...x, start: Math.max(0, x.start + delta) } : x
  })
  return { ...p, clips }
}
