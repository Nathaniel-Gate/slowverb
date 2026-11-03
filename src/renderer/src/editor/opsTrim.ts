import { clipDur, clipEnd, clipSpeed, type Clip, type Project } from './model'
import { EPS, clamp, clearRange, finite, fitFades, lockedIds, minDur, reEnv, settle, xfadePartners } from './clipmath'
import { rippleTracks, shiftTracks, type RippleOpts } from './opsRange'

type Edge = 'in' | 'out'

function find(p: Project, id: string): { c: Clip; srcDur: number } | null {
  const c = p.clips.find(x => x.id === id), src = c && p.sources[c.src]
  return c && src && !lockedIds(p).has(c.track) ? { c, srcDur: src.duration } : null
}

/** New out edge: timeline end t, clamped to [minDur, source end]. Timeline delta maps to source delta x speed. */
export const withOut = (c: Clip, srcDur: number, t: number): Clip => {
  const sp = clipSpeed(c)
  const dur = clamp(t - c.start, minDur(c), (srcDur - c.srcIn) / sp)
  return fitFades(reEnv(c, { ...c, srcOut: Math.min(c.srcIn + dur * sp, srcDur) }))
}

/** Drag an edge to timeline time t. Clamps to source bounds, minimum length and timeline 0; overwrites neighbours it grows into. */
export function trimClip(p: Project, id: string, edge: Edge, t: number): Project {
  const f = find(p, id)
  if (!f || !finite(t)) return p
  const { c, srcDur } = f
  const sp = clipSpeed(c)
  let next: Clip
  if (edge === 'in') {
    const d = clamp(t - c.start, Math.max(-c.srcIn / sp, -c.start), clipDur(c) - minDur(c))
    next = fitFades(reEnv(c, { ...c, start: c.start + d, srcIn: Math.max(0, c.srcIn + d * sp) }))
  } else next = withOut(c, srcDur, t)
  if (next.start === c.start && next.srcIn === c.srcIn && next.srcOut === c.srcOut) return p
  const swapped = p.clips.map(x => (x.id === id ? next : x))
  return { ...p, clips: settle(clearRange(swapped, c.track, next.start, clipEnd(next), xfadePartners(swapped, next))) }
}

/**
 * Replace clip c by `next` (same start, new length) and ripple: clips after c on its track shift by the length change;
 * other shifted tracks (sync lock) get a span removed or inserted at `at`.
 */
export function rippleResize(p: Project, c: Clip, next: Clip, at: number, opts?: RippleOpts): Project {
  const delta = clipDur(next) - clipDur(c)
  if (delta === 0 && next.srcIn === c.srcIn && next.srcOut === c.srcOut && next.speed === c.speed) return p
  const own = p.clips.map(x => {
    if (x.id === c.id) return next
    return x.track === c.track && x.start > c.start + EPS ? { ...x, start: Math.max(0, x.start + delta) } : x
  })
  const others = [...rippleTracks(p, [c.track], opts)].filter(t => t !== c.track)
  return { ...p, clips: settle(shiftTracks(own, others, at, delta)) }
}

/**
 * Like trimClip, but later clips shift by the length change instead of being overwritten (sync-lock aware).
 * Premiere behaviour for the 'in' edge: the clip keeps its timeline start, only srcIn moves (so t only sets HOW MUCH
 * is cut: delta = t - start), and everything after shifts by the opposite amount. Does not clamp to timeline 0.
 */
export function rippleTrim(p: Project, id: string, edge: Edge, t: number, opts?: RippleOpts): Project {
  const f = find(p, id)
  if (!f || !finite(t)) return p
  const { c, srcDur } = f
  const sp = clipSpeed(c)
  const next = edge === 'in'
    ? fitFades(reEnv(c, { ...c, srcIn: Math.max(0, c.srcIn + clamp(t - c.start, -c.srcIn / sp, clipDur(c) - minDur(c)) * sp) }))
    : withOut(c, srcDur, t)
  const delta = clipDur(next) - clipDur(c)
  if (delta === 0) return p
  const at = edge === 'in' ? c.start : Math.min(clipEnd(c), clipEnd(next))
  return rippleResize(p, c, next, at, opts)
}
