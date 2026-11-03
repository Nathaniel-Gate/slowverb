import { clipEnd, type Clip, type Project } from '../model'
import { TICK_STEPS, TL } from '../../config/timeline'

// Pure helpers for the timeline view (no React, no store).

export const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), Math.max(lo, hi))

/** Smallest tick step (and its subdivisions) whose labelled ticks are at least minTickPx apart. */
export function pickStep(pxPerSec: number): { step: number; sub: number } {
  for (const [step, sub] of TICK_STEPS) if (step * pxPerSec >= TL.minTickPx) return { step, sub }
  const [step, sub] = TICK_STEPS[TICK_STEPS.length - 1]
  return { step, sub }
}

/** m:ss, with only as many decimals as the step needs (m:ss.m, m:ss.mm, m:ss.mmm). */
export function formatTick(t: number, step: number): string {
  const decimals = step >= 1 ? 0 : step >= 0.1 ? 1 : step >= 0.01 ? 2 : 3
  const ms = Math.round(Math.max(0, t) * 1000)
  const m = Math.floor(ms / 60000), s = Math.floor((ms % 60000) / 1000), frac = ms % 1000
  const base = `${m}:${String(s).padStart(2, '0')}`
  return decimals ? `${base}.${String(frac).padStart(3, '0').slice(0, decimals)}` : base
}

/** Furthest sensible horizontal scroll: the end of the project plus a fraction of a viewport. */
export function maxScroll(end: number, pxPerSec: number, viewW: number): number {
  return Math.max(0, end * pxPerSec + viewW * TL.scrollTailViewFrac - viewW)
}

export const clampScroll = (x: number, end: number, pxPerSec: number, viewW: number) =>
  clamp(x, 0, maxScroll(end, pxPerSec, viewW))

export const laneAt = (y: number) => Math.floor(y / TL.laneH)

/** Clips whose body intersects the timeline range [t0, t1] and lane range [y0, y1] (content y). */
export function clipsInRect(p: Project, t0: number, t1: number, y0: number, y1: number): string[] {
  const lo = Math.min(t0, t1), hi = Math.max(t0, t1), top = Math.min(y0, y1), bot = Math.max(y0, y1)
  const ids: string[] = []
  for (const c of p.clips) {
    const i = p.tracks.findIndex(t => t.id === c.track)
    if (i < 0) continue
    const cy0 = i * TL.laneH + TL.clipPadY, cy1 = (i + 1) * TL.laneH - TL.clipPadY
    if (c.start < hi && clipEnd(c) > lo && cy0 < bot && cy1 > top) ids.push(c.id)
  }
  return ids
}

/**
 * Slip: shift srcIn/srcOut of the given clips by the same amount (position and length stay), clamped
 * so every clip stays inside its source. Clips on locked tracks are left alone.
 */
export function slipClips(p: Project, ids: string[], dsrc: number): Project {
  const set = new Set(ids)
  const locked = new Set(p.tracks.filter(t => t.lock).map(t => t.id))
  const targets = p.clips.filter(c => set.has(c.id) && !locked.has(c.track))
  if (!targets.length) return p
  let lo = -Infinity, hi = Infinity
  for (const c of targets) {
    lo = Math.max(lo, -c.srcIn)
    hi = Math.min(hi, (p.sources[c.src]?.duration ?? c.srcOut) - c.srcOut)
  }
  const d = clamp(dsrc, lo, hi)
  if (!d) return p
  const hit = new Set(targets.map(c => c.id))
  return { ...p, clips: p.clips.map((c: Clip) => (hit.has(c.id) ? { ...c, srcIn: c.srcIn + d, srcOut: c.srcOut + d } : c)) }
}

/** File name without folder or extension, for the clip label. */
export function baseName(path: string): string {
  const f = path.split('/').pop() ?? path
  const i = f.lastIndexOf('.')
  return i > 0 ? f.slice(0, i) : f
}

/** Read CSS custom properties once (canvas drawing cannot use var()). */
export function readVars(el: Element, names: string[]): Record<string, string> {
  const cs = getComputedStyle(el)
  const out: Record<string, string> = {}
  for (const n of names) out[n] = cs.getPropertyValue(n).trim()
  return out
}

const varCache = new Map<string, { at: number; v: Record<string, string> }>()
/** readVars with a 1s cache so redrawing many canvases per frame does not force style recalcs; stays live for hot-reloaded css. */
export function cachedVars(el: Element, names: string[]): Record<string, string> {
  const key = names.join(), hit = varCache.get(key), now = performance.now()
  if (hit && now - hit.at < 1000) return hit.v
  const v = readVars(el, names)
  varCache.set(key, { at: now, v })
  return v
}
