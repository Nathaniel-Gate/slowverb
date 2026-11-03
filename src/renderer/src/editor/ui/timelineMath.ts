import { clipDur, clipEnd, clipSpeed, type Clip, type Project, type Track } from '../model'
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

// ---- lane geometry (tracks can have their own height / be collapsed) ----
export type Layout = { tops: number[]; hs: number[]; total: number }
export const laneHeight = (t: Track, live?: number): number =>
  t.collapsed ? TL.collapsedH : clamp(live ?? t.height ?? TL.laneH, TL.laneMinH, TL.laneMaxH)

/** Top y and height of every lane. `live` overrides heights while a header handle is being dragged. */
export function layoutOf(tracks: Track[], live: Record<string, number> = {}): Layout {
  const tops: number[] = [], hs: number[] = []
  let y = 0
  for (const t of tracks) { const h = laneHeight(t, live[t.id]); tops.push(y); hs.push(h); y += h }
  return { tops, hs, total: y }
}

/** Lane index under content y: -1 above the first lane, tracks.length below the last. */
export function laneAt(l: Layout, y: number): number {
  if (y < 0) return -1
  for (let i = 0; i < l.tops.length; i++) if (y < l.tops[i] + l.hs[i]) return i
  return l.tops.length
}

/** Clip box inside lane i: y offset and height. */
export function clipBox(l: Layout, i: number): { y: number; h: number } {
  const pad = Math.max(1, Math.min(TL.clipPadY, (l.hs[i] - 10) / 2))
  return { y: l.tops[i] + pad, h: Math.max(8, l.hs[i] - 2 * pad) }
}

/** Clips whose body intersects the timeline range [t0, t1] and content-y range [y0, y1]. */
export function clipsInRect(p: Project, l: Layout, t0: number, t1: number, y0: number, y1: number): string[] {
  const lo = Math.min(t0, t1), hi = Math.max(t0, t1), top = Math.min(y0, y1), bot = Math.max(y0, y1)
  const ids: string[] = []
  for (const c of p.clips) {
    const i = p.tracks.findIndex(t => t.id === c.track)
    if (i < 0) continue
    const b = clipBox(l, i)
    if (c.start < hi && clipEnd(c) > lo && b.y < bot && b.y + b.h > top) ids.push(c.id)
  }
  return ids
}

// ---- gain rubber band: dB mapped onto the clip height ----
const gainSpan = (h: number) => { const top = Math.min(TL.gainPadTop, h * 0.4), bot = h - Math.min(TL.gainPadBottom, h * 0.2); return { top, bot } }
export function gainToY(gain: number, h: number): number {
  const { top, bot } = gainSpan(h)
  const db = gain > 0 ? clamp(20 * Math.log10(gain), TL.gainMinDb, TL.gainMaxDb) : TL.gainMinDb
  return bot - ((db - TL.gainMinDb) / (TL.gainMaxDb - TL.gainMinDb)) * (bot - top)
}
export function yToGain(y: number, h: number): number {
  const { top, bot } = gainSpan(h)
  const db = TL.gainMinDb + ((bot - y) / Math.max(1, bot - top)) * (TL.gainMaxDb - TL.gainMinDb)
  return db <= TL.gainMinDb + 0.05 ? 0 : 10 ** (clamp(db, TL.gainMinDb, TL.gainMaxDb) / 20)
}
export const gainDb = (g: number) => (g > 0 ? 20 * Math.log10(g) : -Infinity)
export const fmtDb = (g: number) => { const d = gainDb(g); return `${d > 0.05 ? '+' : ''}${isFinite(d) ? d.toFixed(1) : '-inf'} dB` }

// ---- cuts, gaps, crossfades ----
const ADJ = 1e-6
const onTrack = (p: Project, track: string) => p.clips.filter(c => c.track === track).sort((a, b) => a.start - b.start)

/** The cut between two touching clips on a track that lies within tolSec of t. */
export function findCut(p: Project, track: string, t: number, tolSec: number): { left: string; right: string; t: number } | null {
  const cs = onTrack(p, track)
  let best: { left: string; right: string; t: number } | null = null, bd = Infinity
  for (let i = 0; i + 1 < cs.length; i++) {
    const a = cs[i], b = cs[i + 1], cut = clipEnd(a)
    if (Math.abs(cut - b.start) > ADJ) continue
    const d = Math.abs(cut - t)
    if (d <= tolSec && d < bd) { best = { left: a.id, right: b.id, t: cut }; bd = d }
  }
  return best
}

/** The empty stretch of `track` that contains t (leading gap included, the open tail after the last clip excluded). */
export function gapAt(p: Project, track: string, t: number): { track: string; start: number; end: number } | null {
  const cs = onTrack(p, track)
  let prevEnd = 0
  for (const c of cs) {
    if (t >= prevEnd && t < c.start && c.start - prevEnd > ADJ) return { track, start: prevEnd, end: c.start }
    prevEnd = Math.max(prevEnd, clipEnd(c))
  }
  return null
}

export type Overlap = { id: string; track: string; start: number; end: number }
/** Same-track overlaps (crossfades): the later clip starts before the earlier one ends. */
export function overlaps(p: Project): Overlap[] {
  const out: Overlap[] = []
  for (const tr of p.tracks) {
    const cs = onTrack(p, tr.id)
    for (let i = 0; i + 1 < cs.length; i++) {
      const a = cs[i], b = cs[i + 1], end = Math.min(clipEnd(a), clipEnd(b))
      if (b.start < end - ADJ) out.push({ id: a.id + '>' + b.id, track: tr.id, start: b.start, end })
    }
  }
  return out
}

// ---- timecode text ----
/** m:ss.mmm (h:mm:ss.mmm from an hour up). */
export function formatTimecode(t: number): string {
  const ms = Math.round(Math.max(0, t) * 1000), h = Math.floor(ms / 3600000), m = Math.floor((ms % 3600000) / 60000)
  const s = Math.floor((ms % 60000) / 1000), f = String(ms % 1000).padStart(3, '0')
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${f}` : `${m}:${String(s).padStart(2, '0')}.${f}`
}

/** "1:23.456", "83.5", "1:02:03", "90" (seconds). Anything else is null. */
export function parseTime(text: string): number | null {
  const s = text.trim().replace(/[,;]/g, '.')
  if (!/^\d+(\.\d*)?$|^(\d+:){1,2}\d+(\.\d*)?$/.test(s)) return null
  const parts = s.split(':').map(Number)
  if (parts.some(n => !Number.isFinite(n))) return null
  if (parts.length > 1 && parts.slice(1).some(n => n >= 60)) return null
  return parts.reduce((acc, n) => acc * 60 + n, 0)
}

/** Source-seconds shift for a timeline drag of dt seconds (slip): dragging right moves the content right. */
export const slipDelta = (c: Clip, dt: number) => -dt * clipSpeed(c)

/** Smooth 0..1 ease used by every glide (scroll, zoom). */
export const easeOut = (k: number) => 1 - (1 - k) ** 3

/** Marker colour/label helper kept here so ruler and menus agree. */
export const clipTitle = (c: Clip) => c.name?.trim() || baseName(c.src)
export const clipLenText = (c: Clip) => `${clipDur(c).toFixed(3)}s`

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
