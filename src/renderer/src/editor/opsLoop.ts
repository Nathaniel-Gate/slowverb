import { MIN_CLIP, clipSpeed, srcSpan, type Clip, type Loop, type Project } from './model'
import { clamp, finite, lockedIds, placeAll, uid } from './clipmath'
import { stripLoop, syncLoops, withLoops } from './loopSync'

// Live loops (wave 4, agent E3). A Loop record expands into `count` repeat clips on ONE track: repeat i starts at
// start + i * (len - xfade), every repeat has fadeIn = fadeOut = xfade (equal power), so neighbours crossfade as legal
// same-track overlaps. Editing the numbers regenerates the clips. All pure: a NEW Project, or the SAME one when nothing
// changes. Locked tracks refuse.

export const LOOP_MAX = 200                 // most repeats one loop may have
export const LOOP_MIN_LEN = MIN_CLIP * 4    // shortest loop slice (source seconds)
export const LOOP_DEFAULT_COUNT = 4
export const LOOP_DEFAULT_XFADE = 0.05      // seconds, capped at LOOP_XFADE_FRAC of the slice
export const LOOP_XFADE_FRAC = 0.1
const NUDGE_GRID = 1e6                      // nudged points land on whole microseconds (no float drift over many nudges)
const FILL_EPS = 1e-9

export type LoopPatch = Partial<Pick<Loop, 'srcIn' | 'srcOut' | 'count' | 'xfade' | 'start' | 'gain'>>

export const loopLen = (l: Loop): number => l.srcOut - l.srcIn
export const loopSpan = (l: Loop): number => l.count * (loopLen(l) - l.xfade) + l.xfade

const findLoop = (p: Project, id: string) => p.loops?.find(l => l.id === id)

export function loopOfClip(p: Project, clipId: string): Loop | undefined {
  const c = p.clips.find(x => x.id === clipId)
  return c?.loop !== undefined ? findLoop(p, c.loop) : undefined
}

/** The repeat clips of a loop, in timeline order. */
export function loopClips(p: Project, loopId: string): Clip[] {
  return p.clips.filter(c => c.loop === loopId).sort((a, b) => a.start - b.start)
}

/** The clips a loop expands to, using `ids` in order; name/label come from `look`. */
function expand(l: Loop, ids: string[], look: Clip | undefined): Clip[] {
  const step = loopLen(l) - l.xfade, extra: Partial<Clip> = {}
  if (look?.name !== undefined) extra.name = look.name
  if (look?.label !== undefined) extra.label = look.label
  return ids.map((id, i) => ({
    id, src: l.src, track: l.track, start: l.start + i * step, srcIn: l.srcIn, srcOut: l.srcOut,
    gain: l.gain, fadeIn: l.xfade, fadeOut: l.xfade, ...extra, loop: l.id,
  }))
}

/** Store loop l and (re)place its repeats in place of `prev` (whose ids are reused), overwriting what lies under them. */
function place(p: Project, l: Loop, prev: Clip[]): Project {
  const taken = new Set(p.clips.map(c => c.id)), ids = prev.slice(0, l.count).map(c => c.id)
  while (ids.length < l.count) { const id = uid('c', taken); taken.add(id); ids.push(id) }
  const gone = new Set(prev.map(c => c.id)), loops = p.loops ?? []
  const nextLoops = loops.some(x => x.id === l.id) ? loops.map(x => (x.id === l.id ? l : x)) : [...loops, l]
  const clips = placeAll(p.clips.filter(c => !gone.has(c.id)), expand(l, ids, prev[0]))
  return syncLoops(p, withLoops({ ...p, clips }, nextLoops), l.id)
}

/** l with the patch applied and clamped into legal values, or null if the source is unknown / too short. */
function fit(l: Loop, patch: LoopPatch, dur: number): Loop | null {
  if (!finite(dur) || dur < LOOP_MIN_LEN) return null
  const num = (k: keyof LoopPatch) => (finite(patch[k]) ? patch[k] as number : undefined)
  const pin = num('srcIn'), pout = num('srcOut'), M = LOOP_MIN_LEN
  let srcIn = clamp(l.srcIn, 0, dur - M), srcOut = clamp(l.srcOut, srcIn + M, dur)
  if (pin !== undefined && pout !== undefined) { srcIn = clamp(pin, 0, dur - M); srcOut = clamp(pout, srcIn + M, dur) }
  else if (pin !== undefined) srcIn = clamp(pin, 0, srcOut - M)
  else if (pout !== undefined) srcOut = clamp(pout, srcIn + M, dur)
  const len = srcOut - srcIn
  return {
    ...l, srcIn, srcOut,
    xfade: clamp(num('xfade') ?? l.xfade, 0, len / 2),
    count: clamp(Math.round(num('count') ?? l.count), 1, LOOP_MAX),
    start: Math.max(0, num('start') ?? l.start),
    gain: Math.max(0, num('gain') ?? l.gain),
  }
}

const KEYS = ['srcIn', 'srcOut', 'count', 'xfade', 'start', 'gain'] as const

/** Change a loop's numbers (clamped) and regenerate its repeats. Same p if nothing changes or the track is locked. */
export function updateLoop(p: Project, loopId: string, patch: LoopPatch): Project {
  const l = findLoop(p, loopId), src = l && p.sources[l.src]
  if (!l || !src || !patch || lockedIds(p).has(l.track) || !p.tracks.some(t => t.id === l.track)) return p
  const next = fit(l, patch, src.duration)
  if (!next || KEYS.every(k => next[k] === l[k])) return p
  return place(p, next, loopClips(p, loopId))
}

/**
 * Turn a clip into a live Loop of `count` repeats (default 4) with crossfade `xfade` (default min(0.05, len * 0.1)).
 * Same track, start and source slice; gain and name kept. Refused for a sped-up clip, a loop member, a slice shorter
 * than LOOP_MIN_LEN or a locked track.
 */
export function makeLoop(p: Project, clipId: string, count: number = LOOP_DEFAULT_COUNT, xfade?: number): Project {
  const c = p.clips.find(x => x.id === clipId), src = c && p.sources[c.src]
  if (!c || !src || loopOfClip(p, clipId) || clipSpeed(c) !== 1 || lockedIds(p).has(c.track)) return p
  const len = srcSpan(c)
  if (len < LOOP_MIN_LEN - FILL_EPS) return p
  const x = finite(xfade) ? xfade : Math.min(LOOP_DEFAULT_XFADE, len * LOOP_XFADE_FRAC)
  const l: Loop = {
    id: uid('L', (p.loops ?? []).map(y => y.id)), track: c.track, src: c.src, srcIn: c.srcIn, srcOut: c.srcOut, start: c.start,
    count: clamp(Math.round(finite(count) ? count : LOOP_DEFAULT_COUNT), 1, LOOP_MAX), xfade: clamp(x, 0, len / 2), gain: Math.max(0, c.gain),
  }
  return place(p, l, [stripLoop(c)])
}

/** Pick the count so the loop reaches (or just passes) endTime. */
export function loopFill(p: Project, loopId: string, endTime: number): Project {
  const l = findLoop(p, loopId)
  if (!l || !finite(endTime)) return p
  const step = loopLen(l) - l.xfade
  if (!(step > 0)) return p
  return updateLoop(p, loopId, { count: Math.max(1, Math.ceil((endTime - l.start - l.xfade) / step - FILL_EPS)) })
}

/** Keep the repeat clips as plain clips and drop the Loop record. */
export function unloop(p: Project, loopId: string): Project {
  const l = findLoop(p, loopId)
  if (!l || lockedIds(p).has(l.track)) return p
  const q = { ...p, clips: p.clips.map(c => (c.loop === loopId ? stripLoop(c) : c)) }
  return withLoops(q, (p.loops ?? []).filter(x => x.id !== loopId))
}

/** Move the loop's start ('in') or end ('out') source point by dt seconds (result on whole microseconds), then updateLoop. */
export function nudgeLoopPoint(p: Project, loopId: string, which: 'in' | 'out', dt: number): Project {
  const l = findLoop(p, loopId)
  if (!l || !finite(dt) || dt === 0) return p
  const k = which === 'in' ? 'srcIn' : 'srcOut'
  return updateLoop(p, loopId, { [k]: Math.round((l[k] + dt) * NUDGE_GRID) / NUDGE_GRID })
}
